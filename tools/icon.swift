import AppKit
// Draws the 1024px app icon: a paper page with "M↓" on a soft blue tile.
let size: CGFloat = 1024
let img = NSImage(size: NSSize(width: size, height: size))
img.lockFocus()
let tile = NSBezierPath(roundedRect: NSRect(x: 100, y: 100, width: 824, height: 824), xRadius: 185, yRadius: 185)
NSGradient(starting: NSColor(calibratedRed: 0.20, green: 0.42, blue: 0.86, alpha: 1),
           ending: NSColor(calibratedRed: 0.10, green: 0.22, blue: 0.55, alpha: 1))!.draw(in: tile, angle: -90)
let page = NSBezierPath(roundedRect: NSRect(x: 262, y: 200, width: 500, height: 624), xRadius: 40, yRadius: 40)
NSColor(calibratedWhite: 0.99, alpha: 1).setFill(); page.fill()
let para = NSMutableParagraphStyle(); para.alignment = .center
let attrs: [NSAttributedString.Key: Any] = [
  .font: NSFont.systemFont(ofSize: 230, weight: .heavy),
  .foregroundColor: NSColor(calibratedRed: 0.12, green: 0.25, blue: 0.58, alpha: 1),
  .paragraphStyle: para]
("M↓" as NSString).draw(in: NSRect(x: 262, y: 400, width: 500, height: 300), withAttributes: attrs)
NSColor(calibratedWhite: 0.80, alpha: 1).setFill()
for (k, w) in [(0, 340.0), (1, 280.0)] { NSBezierPath(roundedRect: NSRect(x: 342, y: 330 - CGFloat(k) * 60, width: CGFloat(w), height: 22), xRadius: 11, yRadius: 11).fill() }
img.unlockFocus()
let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
