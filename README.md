# Markdown Reader for macOS

A tiny native macOS app that shows Markdown files as rendered pages, so you can read them and click or copy their links without opening a code editor.

It is one Swift file plus a small renderer, built with the Xcode command-line tools. It has no third-party dependencies and makes no network requests of its own.

## Features

- **GitHub-flavoured Markdown:** headings, emphasis, links (inline, reference and bare URLs), images, code spans and fenced code, nested and task lists, tables with alignment, blockquotes, GitHub alerts (`> [!NOTE]`, `> [!WARNING]`, …), horizontal rules, `<details>` blocks and YAML front matter (shown folded).
- **Links go where you expect:** web links open in your browser; links to other Markdown files open in the reader, including `file.md#heading`; links to other files open in their default app; `path/to/file.ts:42` style links work; folders open in Finder. Right-click any link and choose **Copy Link**.
- **Live reload:** the page re-renders when the file changes on disk, keeping your scroll position.
- **Copy buttons** on code blocks.
- **Find in page** with ⌘F, ⌘G and ⇧⌘G.
- Light and dark mode follow the system.
- Native window tabs, Open Recent, zoom (⌘+, ⌘−, ⌘0, remembered).
- **File menu:** Reveal in Finder (⇧⌘R), Copy File Path (⌥⌘C), Open in Text Editor (⌘E; uses VS Code, Cursor, Zed or Sublime Text if installed, otherwise TextEdit).

## Safety

Markdown files are treated as documents, not programs:

- Raw HTML is shown as text, except a small allow-list of harmless inline tags (`<kbd>`, `<sub>`, `<sup>`, `<br>`, …) and `<details>`/`<summary>`.
- `<script>` and event attributes never run. The page has a Content Security Policy with `script-src 'none'`; the renderer is injected by the app itself.
- `javascript:` and non-image `data:` links are neutralised.
- Remote images (`https:`) are loaded when a document references them.

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
| `Resources/render.js` | The Markdown → HTML renderer (also usable in Node: `require('./Resources/render.js'); markdownToHtml(text)`) |
| `Resources/style.css` | Page styles for light and dark mode |
| `Info.plist` | Bundle metadata and the Markdown document types |
| `tools/icon.swift` | Draws the app icon at build time |
| `build.sh` | Build, sign and install |

## Limitations

- No syntax highlighting in code blocks.
- No footnotes, math or Mermaid diagrams.
- The renderer covers everyday GitHub-flavoured Markdown, not every CommonMark edge case.

## Contributing

This repository does not accept outside pull requests. Issues and suggestions are welcome where enabled.
