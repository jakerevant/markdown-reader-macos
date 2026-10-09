#!/bin/zsh
# Builds "Markdown Reader.app" and copies it to ~/Applications.
set -euo pipefail
cd "${0:A:h}"
APP="build/Markdown Reader.app"
rm -rf build && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" build/AppIcon.iconset
swiftc -O -swift-version 5 -target arm64-apple-macos13.0 -framework AppKit -framework WebKit \
  Sources/main.swift -o "$APP/Contents/MacOS/MarkdownReader"
cp Info.plist "$APP/Contents/Info.plist"
cp Resources/render.js Resources/style.css "$APP/Contents/Resources/"
cp -R Resources/vendor "$APP/Contents/Resources/vendor"
swift tools/icon.swift build/icon-1024.png
for s in 16 32 128 256 512; do
  sips -z $s $s build/icon-1024.png --out build/AppIcon.iconset/icon_${s}x${s}.png >/dev/null
  sips -z $((s*2)) $((s*2)) build/icon-1024.png --out build/AppIcon.iconset/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns build/AppIcon.iconset -o "$APP/Contents/Resources/AppIcon.icns"
codesign --force --sign - "$APP"
mkdir -p ~/Applications
rm -rf ~/Applications/"Markdown Reader.app"
cp -R "$APP" ~/Applications/
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f ~/Applications/"Markdown Reader.app"
echo "Installed: ~/Applications/Markdown Reader.app"
