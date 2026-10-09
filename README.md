# Markdown Reader for macOS

A tiny native macOS app that shows Markdown files as rendered pages, so you can read them and click or copy their links without opening a code editor.

It is one Swift file, a small renderer and a few bundled open-source libraries (see [third-party libraries](#third-party-libraries)). It builds with the Xcode command-line tools, needs no package manager and makes no network requests of its own: everything ships inside the app.

## Features

- **Full CommonMark plus GitHub-flavoured Markdown,** parsed by markdown-it: tables with alignment, strikethrough, autolinked URLs, task lists, GitHub alerts (`> [!NOTE]`, `> [!WARNING]`, …), heading anchors, `<details>` blocks and YAML front matter (shown folded).
- **Syntax highlighting:** 36 common languages via highlight.js (Bash, C, C++, C#, CSS, Go, Java, JavaScript, JSON, Kotlin, PHP, Python, Ruby, Rust, SQL, Swift, TypeScript, YAML, XML/HTML and more), with GitHub's colours in light and dark mode.
- **Footnotes:** `text[^1]` and `[^1]: note`, with links back and forth.
- **Math:** `$inline$`, `$$display$$` and fenced `math` blocks are rendered with KaTeX. Prices like "$5 and $10" stay plain text.
- **Mermaid diagrams:** fenced `mermaid` blocks become diagrams (flowcharts, sequence, class, state, Gantt, pie, …). Diagram colours follow light and dark mode.
- **Links go where you expect:** web links open in your browser; links to other Markdown files open in the reader, including `file.md#heading`; links to other files open in their default app; `path/to/file.ts:42` style links work; folders open in Finder. Right-click any link and choose **Copy Link**.
- **Live reload:** the page re-renders when the file changes on disk, keeping your scroll position.
- **Copy buttons** on code blocks.
- **Find in page** with ⌘F, ⌘G and ⇧⌘G.
- Light and dark mode follow the system.
- Native window tabs, Open Recent, zoom (⌘+, ⌘−, ⌘0, remembered).
- **File menu:** Reveal in Finder (⇧⌘R), Copy File Path (⌥⌘C), Open in Text Editor (⌘E; uses VS Code, Cursor, Zed or Sublime Text if installed, otherwise TextEdit).

## Safety

Markdown files are treated as documents, not programs:

- **Raw HTML:** it is allowed, as in GitHub, but every page is sanitised with DOMPurify before it is shown. Scripts, event handlers (`onerror`, `onclick`, …), forms, `<style>` and `javascript:` links are removed.
- **Content Security Policy:** the page has `script-src 'none'`. Only the libraries and the renderer that the app itself injects can run; nothing from a document can.
- **Mermaid:** it runs in its `strict` security level, so diagram labels cannot carry HTML or clickable scripts.
- **Math:** KaTeX runs with `trust` off, so `\href` and similar commands are inert.
- **Images:** remote images (`https:`) are loaded when a document references them. Nothing else goes to the network.

## Requirements

- macOS 13 Ventura or later (built and tested on Apple silicon)
- Xcode or the Xcode Command Line Tools (`xcode-select --install`) to build

## Build and install

```bash
git clone https://github.com/jakerevant/markdown-reader-macos.git
cd markdown-reader-macos
./build.sh
```

`build.sh` compiles the app, draws its icon, signs it ad hoc and copies it to `~/Applications/Markdown Reader.app`. The build itself lands in `build/`.

## Use

- **Make it the default for Markdown:** select any `.md` file in Finder, press ⌘I, choose **Markdown Reader** under "Open with" and click **Change All**.
- **Other ways to open files:** drag files onto the Dock icon, use File → Open (⌘O), or run:

```bash
open -a "Markdown Reader" README.md
```

## Project layout

| Path | What it is |
|---|---|
| `Sources/main.swift` | The app: windows, menus, link handling, live reload |
| `Resources/render.js` | The renderer: markdown-it setup, the alert, task-list, anchor and math plugins, sanitising, math, highlighting and diagrams, find in page |
| `Resources/vendor/` | The bundled libraries, their fonts and licenses |
| `Resources/style.css` | Page styles for light and dark mode |
| `Info.plist` | Bundle metadata and the Markdown document types |
| `tools/icon.swift` | Draws the app icon at build time |
| `build.sh` | Build, sign and install |

## Third-party libraries

Bundled, unmodified, in `Resources/vendor/` (versions and licenses in [`Resources/vendor/README.md`](Resources/vendor/README.md)):

- markdown-it (MIT)
- markdown-it-footnote (MIT)
- highlight.js (BSD-3-Clause)
- KaTeX (MIT)
- Mermaid (MIT)
- DOMPurify (Apache-2.0 or MPL-2.0)

They make the app about 4 MB.

## License

Markdown Reader's own code is source-available under the **MIT License with the Commons Clause** (see [LICENSE](LICENSE)). The bundled libraries keep their own licenses. In short:

- **Allowed:** using the app privately and at work, in any company; reading, changing and sharing the code free of charge.
- **Not allowed:** selling the software, or any product or service whose value comes entirely or substantially from it. That includes paid hosting, support or consulting around it.

Because of the Commons Clause this is not an OSI-approved open-source license. For other terms, ask the author through GitHub.

## Contributing

This repository does not accept outside pull requests. Issues and suggestions are welcome where enabled.
