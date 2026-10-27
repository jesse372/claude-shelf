#!/bin/bash
# Double-click me (Finder) to launch Sculpt.
cd "$(dirname "$0")"
PORT="${SCULPT_PORT:-8765}"
URL="http://127.0.0.1:$PORT/"

pause_exit() { echo; read -r -p "Press Enter to close" _; exit 1; }

# Already running? Just open it.
if curl -fs -o /dev/null "$URL"; then open "$URL"; exit 0; fi

# A fresh Mac has no python3 until Apple's free Command Line Tools are installed.
if ! python3 -c 'pass' >/dev/null 2>&1; then
  echo "Sculpt needs Apple's free 'Command Line Tools' (one-time install)."
  echo "A window should pop up: click Install, wait for it to finish, then double-click Sculpt again."
  xcode-select --install >/dev/null 2>&1
  pause_exit
fi

./setup.sh || { echo "Setup failed — check your internet connection (only needed on first run)."; pause_exit; }

python3 server.py "$PORT" &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT INT TERM
for _ in $(seq 1 50); do curl -fs -o /dev/null "$URL" && break; sleep 0.1; done
if ! curl -fs -o /dev/null "$URL"; then echo "Sculpt's server didn't start (is port $PORT in use?)."; pause_exit; fi
open "$URL"
echo "Sculpt is open in your browser. Leave this window open while you work; close it to quit."
wait $PID
