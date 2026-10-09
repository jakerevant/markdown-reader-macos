import AppKit
import WebKit

// MARK: - Helpers

enum Resources {
    static func text(_ name: String, _ ext: String) -> String {
        guard let url = Bundle.main.url(forResource: name, withExtension: ext),
              let s = try? String(contentsOf: url, encoding: .utf8) else { return "" }
        return s
    }
    static let script = text("render", "js")
    static let style = text("style", "css")
}

let markdownExtensions: Set<String> = ["md", "markdown", "mdown", "mkd", "mkdn", "mdwn", "mdtxt", "mdtext", "txt"]

func isMarkdown(_ url: URL) -> Bool {
    markdownExtensions.contains(url.pathExtension.lowercased())
}

func readText(_ url: URL) -> String? {
    guard let data = try? Data(contentsOf: url) else { return nil }
    return String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1)
}

func htmlAttr(_ s: String) -> String {
    s.replacingOccurrences(of: "&", with: "&amp;")
        .replacingOccurrences(of: "\"", with: "&quot;")
        .replacingOccurrences(of: "<", with: "&lt;")
}

// MARK: - Document window

final class DocumentWindowController: NSWindowController, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    let fileURL: URL
    private let webView: WKWebView
    private let pageURL: URL
    private var pageLoaded = false
    private var pendingFragment: String?
    private var stamp: (Date?, Int)?
    private var timer: Timer?
    var onClose: ((DocumentWindowController) -> Void)?

    init(url: URL, fragment: String?) {
        fileURL = url
        pendingFragment = fragment

        let config = WKWebViewConfiguration()
        let content = WKUserContentController()
        content.addUserScript(WKUserScript(source: Resources.script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        config.userContentController = content
        config.preferences.isElementFullscreenEnabled = false
        webView = WKWebView(frame: .zero, configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsMagnification = true
        webView.pageZoom = CGFloat(UserDefaults.standard.double(forKey: "zoom").nonZero ?? 1)

        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("MarkdownReader", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        pageURL = dir.appendingPathComponent(UUID().uuidString + ".html")

        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 920, height: 1040),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable],
                              backing: .buffered, defer: false)
        window.minSize = NSSize(width: 380, height: 300)
        window.tabbingMode = .preferred
        window.tabbingIdentifier = "MarkdownReader"
        window.contentView = webView
        window.title = url.lastPathComponent
        window.representedURL = url
        super.init(window: window)

        window.delegate = self
        webView.navigationDelegate = self
        content.add(self, name: "copy")
        loadPage()
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.checkForChanges() }
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    private func loadPage() {
        let base = fileURL.deletingLastPathComponent().absoluteString
        let csp = "default-src 'none'; img-src file: data: https: http:; style-src 'unsafe-inline'; script-src 'none'"
        let html = """
        <!doctype html><html><head><meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="\(csp)">
        <base href="\(htmlAttr(base))">
        <title>\(htmlAttr(fileURL.lastPathComponent))</title>
        <style>\(Resources.style)</style></head>
        <body><article id="content"></article></body></html>
        """
        try? html.write(to: pageURL, atomically: true, encoding: .utf8)
        webView.loadFileURL(pageURL, allowingReadAccessTo: URL(fileURLWithPath: "/"))
    }

    private func currentStamp() -> (Date?, Int)? {
        guard let a = try? FileManager.default.attributesOfItem(atPath: fileURL.path) else { return nil }
        return (a[.modificationDate] as? Date, (a[.size] as? NSNumber)?.intValue ?? -1)
    }

    func render(fragment: String? = nil) {
        guard pageLoaded else { return }
        stamp = currentStamp()
        let text = readText(fileURL)
        window?.title = fileURL.lastPathComponent + (text == nil ? " (not found)" : "")
        let md = text ?? "> [!CAUTION]\n> This file could not be read: `\(fileURL.path)`"
        webView.callAsyncJavaScript("return render(md, frag)", arguments: ["md": md, "frag": fragment ?? ""],
                                    in: nil, in: .page) { _ in }
    }

    private func checkForChanges() {
        guard pageLoaded else { return }
        let now = currentStamp()
        if now?.0 != stamp?.0 || now?.1 != stamp?.1 { render() }
    }

    func reveal(fragment: String?) {
        showWindow(nil)
        if let f = fragment, !f.isEmpty { render(fragment: f) }
    }

    // Navigation: the page itself loads; every link click goes out to the right place.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        if url.isFileURL && url.standardizedFileURL.path == pageURL.standardizedFileURL.path && action.navigationType != .linkActivated {
            return decisionHandler(.allow)
        }
        decisionHandler(.cancel)
        if action.navigationType == .linkActivated { follow(url) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        render(fragment: pendingFragment)
        pendingFragment = nil
    }

    private func follow(_ url: URL) {
        guard url.isFileURL else { NSWorkspace.shared.open(url); return }
        let fm = FileManager.default
        var path = url.path
        if !fm.fileExists(atPath: path), let r = path.range(of: #":\d+(:\d+)?$"#, options: .regularExpression) {
            path.removeSubrange(r) // "file.ts:42" style links
        }
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: path, isDirectory: &isDir) else {
            let alert = NSAlert()
            alert.messageText = "File not found"
            alert.informativeText = path
            alert.beginSheetModal(for: window!)
            return
        }
        let target = URL(fileURLWithPath: path)
        if isDir.boolValue {
            NSWorkspace.shared.activateFileViewerSelecting([target])
        } else if isMarkdown(target) {
            AppDelegate.shared.open(target, fragment: url.fragment)
        } else {
            NSWorkspace.shared.open(target)
        }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "copy", let s = message.body as? String {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(s, forType: .string)
        }
    }

    func windowWillClose(_ notification: Notification) {
        timer?.invalidate()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "copy")
        try? FileManager.default.removeItem(at: pageURL)
        onClose?(self)
    }

    // MARK: Menu actions (reached through the responder chain)

    private func js(_ code: String) { webView.evaluateJavaScript(code, completionHandler: nil) }

    @objc func reloadDocument(_ sender: Any?) { render() }
    @objc func findInPage(_ sender: Any?) { window?.makeFirstResponder(webView); js("showFind()") }
    @objc func findNextMatch(_ sender: Any?) { js("findNext(false)") }
    @objc func findPreviousMatch(_ sender: Any?) { js("findNext(true)") }
    @objc func revealInFinder(_ sender: Any?) { NSWorkspace.shared.activateFileViewerSelecting([fileURL]) }

    @objc func copyFilePath(_ sender: Any?) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(fileURL.path, forType: .string)
    }

    @objc func openInEditor(_ sender: Any?) {
        let ids = ["com.microsoft.VSCode", "com.todesktop.230313mzl4w4u92", "dev.zed.Zed", "com.sublimetext.4", "com.apple.TextEdit"]
        guard let app = ids.lazy.compactMap({ NSWorkspace.shared.urlForApplication(withBundleIdentifier: $0) }).first else { return }
        NSWorkspace.shared.open([fileURL], withApplicationAt: app, configuration: NSWorkspace.OpenConfiguration())
    }

    @objc func zoomIn(_ sender: Any?) { setZoom(webView.pageZoom * 1.1) }
    @objc func zoomOut(_ sender: Any?) { setZoom(webView.pageZoom / 1.1) }
    @objc func actualSize(_ sender: Any?) { setZoom(1) }

    private func setZoom(_ z: CGFloat) {
        let v = min(max(z, 0.5), 3)
        webView.pageZoom = v
        UserDefaults.standard.set(Double(v), forKey: "zoom")
    }
}

extension Double {
    var nonZero: Double? { self == 0 ? nil : self }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate {
    static var shared: AppDelegate!
    private var controllers: [DocumentWindowController] = []
    private var openedSomething = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.mainMenu = buildMenu()
        let args = CommandLine.arguments.dropFirst().filter { !$0.hasPrefix("-") }
        for a in args { open(URL(fileURLWithPath: a)) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            if let self, !self.openedSomething { self.openDocument(nil) }
        }
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for u in urls { open(u) }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { openDocument(nil) }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func open(_ url: URL, fragment: String? = nil) {
        openedSomething = true
        let target = url.standardizedFileURL.resolvingSymlinksInPath()
        if let existing = controllers.first(where: { $0.fileURL == target }) {
            existing.reveal(fragment: fragment)
            return
        }
        let c = DocumentWindowController(url: target, fragment: fragment)
        c.onClose = { [weak self] closed in self?.controllers.removeAll { $0 === closed } }
        controllers.append(c)
        if let key = NSApp.keyWindow, let w = c.window, key.tabbingIdentifier == w.tabbingIdentifier {
            w.setFrame(key.frame, display: false)
            w.setFrameTopLeftPoint(NSPoint(x: key.frame.minX + 24, y: key.frame.maxY - 24))
        } else {
            c.window?.center()
        }
        c.showWindow(nil)
        NSDocumentController.shared.noteNewRecentDocumentURL(target)
    }

    @objc func openDocument(_ sender: Any?) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.message = "Choose Markdown files to read"
        NSApp.activate(ignoringOtherApps: true)
        if panel.runModal() == .OK { panel.urls.forEach { open($0) } }
    }

    @objc func openRecent(_ sender: NSMenuItem) {
        if let url = sender.representedObject as? URL { open(url) }
    }

    @objc func clearRecent(_ sender: Any?) {
        NSDocumentController.shared.clearRecentDocuments(nil)
    }

    private func buildMenu() -> NSMenu {
        let main = NSMenu()
        func submenu(_ title: String, _ items: [NSMenuItem]) -> NSMenu {
            let m = NSMenu(title: title)
            items.forEach { m.addItem($0) }
            let holder = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            holder.submenu = m
            main.addItem(holder)
            return m
        }
        func item(_ title: String, _ action: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
            let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
            i.keyEquivalentModifierMask = mods
            return i
        }
        let name = "Markdown Reader"

        _ = submenu(name, [
            item("About \(name)", #selector(NSApplication.orderFrontStandardAboutPanel(_:))),
            .separator(),
            item("Hide \(name)", #selector(NSApplication.hide(_:)), "h"),
            item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
            item("Show All", #selector(NSApplication.unhideAllApplications(_:))),
            .separator(),
            item("Quit \(name)", #selector(NSApplication.terminate(_:)), "q"),
        ])

        let recent = NSMenu(title: "Open Recent")
        recent.delegate = self
        let recentItem = item("Open Recent", nil)
        recentItem.submenu = recent

        _ = submenu("File", [
            item("Open…", #selector(openDocument(_:)), "o"),
            recentItem,
            .separator(),
            item("Close", #selector(NSWindow.performClose(_:)), "w"),
            item("Reload", #selector(DocumentWindowController.reloadDocument(_:)), "r"),
            .separator(),
            item("Reveal in Finder", #selector(DocumentWindowController.revealInFinder(_:)), "r", [.command, .shift]),
            item("Open in Text Editor", #selector(DocumentWindowController.openInEditor(_:)), "e"),
            item("Copy File Path", #selector(DocumentWindowController.copyFilePath(_:)), "c", [.command, .option]),
        ])

        _ = submenu("Edit", [
            item("Copy", #selector(NSText.copy(_:)), "c"),
            item("Select All", #selector(NSText.selectAll(_:)), "a"),
            .separator(),
            item("Find…", #selector(DocumentWindowController.findInPage(_:)), "f"),
            item("Find Next", #selector(DocumentWindowController.findNextMatch(_:)), "g"),
            item("Find Previous", #selector(DocumentWindowController.findPreviousMatch(_:)), "g", [.command, .shift]),
        ])

        _ = submenu("View", [
            item("Actual Size", #selector(DocumentWindowController.actualSize(_:)), "0"),
            item("Zoom In", #selector(DocumentWindowController.zoomIn(_:)), "+"),
            item("Zoom Out", #selector(DocumentWindowController.zoomOut(_:)), "-"),
            .separator(),
            item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]),
        ])

        let window = submenu("Window", [
            item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
            item("Zoom", #selector(NSWindow.performZoom(_:))),
            .separator(),
            item("Show Previous Tab", #selector(NSWindow.selectPreviousTab(_:)), "{", [.command]),
            item("Show Next Tab", #selector(NSWindow.selectNextTab(_:)), "}", [.command]),
            item("Bring All to Front", #selector(NSApplication.arrangeInFront(_:))),
        ])
        NSApp.windowsMenu = window
        return main
    }
}

extension AppDelegate: NSMenuDelegate {
    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let urls = NSDocumentController.shared.recentDocumentURLs
        for u in urls {
            let i = NSMenuItem(title: u.lastPathComponent, action: #selector(openRecent(_:)), keyEquivalent: "")
            i.representedObject = u
            i.target = self
            i.toolTip = u.path
            menu.addItem(i)
        }
        if !urls.isEmpty { menu.addItem(.separator()) }
        let clear = NSMenuItem(title: "Clear Menu", action: urls.isEmpty ? nil : #selector(clearRecent(_:)), keyEquivalent: "")
        clear.target = self
        menu.addItem(clear)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
AppDelegate.shared = delegate
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
