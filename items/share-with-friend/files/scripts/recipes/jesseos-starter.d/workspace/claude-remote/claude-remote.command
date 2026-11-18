#!/bin/bash
# Claude Code Remote Control, always on: reach this Mac from the Claude app (Code tab) on your phone.
# keepalive.sh (LaunchAgent com.jesse.claude-remote) opens this in Terminal and reopens it if it dies.
# Starts in ~/JesseOS so spawning a session does not depend on the Documents privacy grant.
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
W="$HOME/JesseOS/workspace"
NAME="$(cat "$W/claude-remote/name" 2>/dev/null || echo "Office Mac")"
# Permission mode for phone sessions. "default" asks before risky actions (the prompt shows in the app).
# "bypassPermissions" never asks: only switch to it once you trust the setup and its standing rules.
MODE="$(cat "$W/claude-remote/mode" 2>/dev/null || echo default)"
mkdir -p "$W/logs"
LOG="$W/logs/claude-remote.log"; SCREEN="$W/logs/claude-remote.screen"
# single instance, atomic: mkdir succeeds for exactly one of several windows opened at once
LOCKD="$W/claude-remote/.loop.pid.d"
if ! mkdir "$LOCKD" 2>/dev/null; then
  o="$(cat "$LOCKD/pid" 2>/dev/null)"
  if [ -n "$o" ] && kill -0 "$o" 2>/dev/null && ps -p "$o" -o command= 2>/dev/null | grep -q 'claude-remote.command'; then echo "already running (pid $o)"; exit 0; fi
  sleep 1; o="$(cat "$LOCKD/pid" 2>/dev/null)"   # a sibling may have just taken it
  if [ -n "$o" ] && kill -0 "$o" 2>/dev/null; then echo "already running (pid $o)"; exit 0; fi
  rm -rf "$LOCKD"; mkdir "$LOCKD" 2>/dev/null || { echo "lost lock race"; exit 0; }
fi
echo $$ > "$LOCKD/pid"
printf '\033]0;Claude Remote Control (keep open)\007'
cd "$HOME/JesseOS" || { echo "[$(date '+%F %T')] cannot cd to ~/JesseOS" >> "$LOG"; exit 1; }
args=(remote-control --name "$NAME" --spawn same-dir)
[ "$MODE" != "default" ] && args+=(--permission-mode "$MODE")
while true; do
  echo "[$(date '+%F %T')] starting remote-control ($MODE)" >> "$LOG"
  : > "$SCREEN"
  # `script` keeps a real terminal for Claude AND records the screen so keepalive.sh can see login errors
  script -q -a "$SCREEN" claude "${args[@]}"
  echo "[$(date '+%F %T')] remote-control exited ($?), restarting in 15s" >> "$LOG"
  sleep 15
done
