#!/usr/bin/env bash
# Build a DEVELOPMENT APK whose WebView loads www/ from a live server instead
# of the copy bundled inside the APK. Edit a file, pull-to-refresh on the
# phone, see the change — no rebuild, no reinstall.
#
#   ./scripts/dev-apk.sh                      # LAN address of this Mac
#   ./scripts/dev-apk.sh https://x.trycloudflare.com   # a tunnel, works anywhere
#
# This config is NEVER left in place: the script restores capacitor.config.json
# on exit, including on failure. A release build must always ship bundled
# assets — a store build that pulls its code from a URL breaks offline play and
# is a policy problem on both stores.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

LAN=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
URL="${1:-http://${LAN}:8777}"
[ -z "$LAN" ] && [ -z "${1:-}" ] && { echo "No LAN address found — pass a URL explicitly."; exit 1; }

CFG=capacitor.config.json
BACKUP=$(mktemp)
cp "$CFG" "$BACKUP"
restore() { cp "$BACKUP" "$CFG"; rm -f "$BACKUP"; echo "restored $CFG"; }
trap restore EXIT

echo "dev build will load from: $URL"

python3 - "$URL" <<'PY'
import json, sys
url = sys.argv[1]
cfg = json.load(open('capacitor.config.json'))
cfg['server'] = {'url': url, 'cleartext': url.startswith('http://')}
json.dump(cfg, open('capacitor.config.json', 'w'), indent=2)
open('capacitor.config.json', 'a').write('\n')
print('injected server.url')
PY

npx cap sync android >/dev/null
( cd android && ./gradlew assembleDebug -q )

mkdir -p dist
OUT=dist/AnotherLife-dev.apk
cp android/app/build/outputs/apk/debug/app-debug.apk "$OUT"
echo "built $OUT ($(du -h "$OUT" | cut -f1))"
echo
echo "Install it, then edit anything under www/ and pull down to refresh on the phone."
echo "Point it somewhere else later with: ./scripts/dev-apk.sh <url>"
