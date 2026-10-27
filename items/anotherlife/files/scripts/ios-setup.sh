#!/usr/bin/env bash
# Prepare the iOS project. Run this AFTER installing Xcode — everything here
# needs Xcode's toolchain, including CocoaPods, which builds native extensions.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d /Applications/Xcode.app ]; then
  echo "Xcode is not installed."
  echo "  1. Install Xcode from the App Store (~15GB, needs an Apple ID)"
  echo "  2. Open it once and accept the licence"
  echo "  3. sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  echo "  4. Re-run this script"
  exit 1
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "Installing CocoaPods…"
  brew install cocoapods || sudo gem install cocoapods
fi

npm install
[ -d ios ] || npx cap add ios
npx cap sync ios
( cd ios/App && pod install )

echo
echo "Done. Open the workspace and build:"
echo "  open ios/App/App.xcworkspace"
echo
echo "In Xcode: select your team under Signing & Capabilities, then add the"
echo "In-App Purchase capability, or the store packs will not work."
