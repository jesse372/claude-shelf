#!/usr/bin/env bash
# Start (or restart) headless Chrome with the debugging port open.
set -euo pipefail
NAME="${1:-probe}"
PORT="${2:-9222}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME" >&2; exit 1; }
pkill -f "remote-debugging-port=$PORT" 2>/dev/null || true
DIR="/tmp/chrome-probe-$NAME"
rm -rf "$DIR" 2>/dev/null || true
"$CHROME" --headless=new --disable-gpu --hide-scrollbars \
  --remote-debugging-port="$PORT" --user-data-dir="$DIR" about:blank >/tmp/chrome-probe-$NAME.log 2>&1 &
for _ in $(seq 1 30); do
  curl -sf "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1 && { echo "chrome ready on :$PORT"; exit 0; }
  sleep 0.3
done
echo "chrome did not come up — see /tmp/chrome-probe-$NAME.log" >&2; exit 1
