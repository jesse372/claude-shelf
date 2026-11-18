#!/bin/bash
# Double-click this ON THE MAC (screen unlocked) to give Terminal, which hosts Claude Remote Control, the macOS
# permissions agents need. Each step makes macOS show its own Allow prompt; click Allow/OK.
# Screen Recording can't be prompted, so its Settings pane opens for you to switch Terminal on (asks your password).
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
step(){ printf '\n\033[1m%s\033[0m\n' "$*"; }

step "1/4 Automation -> System Events  (click OK)"
osascript -e 'tell application "System Events" to get name of first process' >/dev/null && echo "  done"

step "2/4 Automation -> Safari  (click OK)"
osascript -e 'tell application "Safari" to get name' >/dev/null && echo "  done"
osascript -e 'tell application "Safari" to quit' >/dev/null 2>&1

step "3/4 Microphone  (click OK; records 1 silent second)"
ffmpeg -nostdin -hide_banner -loglevel error -f avfoundation -i ":0" -t 1 -y /tmp/mic-permission-test.wav && echo "  done"
rm -f /tmp/mic-permission-test.wav

step "4/4 Screen Recording: switch ON 'Terminal' in the window that opens, enter your password, choose 'Quit & Reopen' if asked"
screencapture -x /tmp/screen-permission-test.png 2>/dev/null; rm -f /tmp/screen-permission-test.png
open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"

step "Finished. If Terminal reopens, Claude Remote Control restarts itself within 5 minutes."
read -r -p "Press Return to close." _
