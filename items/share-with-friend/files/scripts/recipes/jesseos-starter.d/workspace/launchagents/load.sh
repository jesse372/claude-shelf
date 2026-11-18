#!/bin/bash
# load.sh <name>... | all    Install and start the kit's LaunchAgents (name = backup, guardian, claude-remote, ...).
# load.sh --off <name>       Stop one and remove it.
# Safe to re-run. Nothing is loaded until you run this.
A="$HOME/JesseOS/workspace/launchagents"; L="$HOME/Library/LaunchAgents"; U="gui/$(id -u)"
mkdir -p "$L" "$HOME/.claude/logs" "$HOME/JesseOS/workspace/guardian/state" "$HOME/JesseOS/workspace/notify/state"
if [ "$1" = "--off" ]; then
  launchctl bootout "$U/com.jesse.$2" 2>/dev/null; rm -f "$L/com.jesse.$2.plist"; echo "off: $2"; exit 0
fi
[ $# -eq 0 ] && { echo "usage: load.sh all | <name>...   available:"; ls "$A" | sed -n 's/^com\.jesse\.\(.*\)\.plist$/  \1/p'; exit 1; }
[ "$1" = "all" ] && set -- $(ls "$A" | sed -n 's/^com\.jesse\.\(.*\)\.plist$/\1/p')
for n in "$@"; do
  p="$A/com.jesse.$n.plist"; [ -f "$p" ] || { echo "no such agent: $n"; continue; }
  sed "s#/Users/YOU#$HOME#g" "$p" > "$L/com.jesse.$n.plist"
  launchctl bootout "$U/com.jesse.$n" 2>/dev/null
  launchctl bootstrap "$U" "$L/com.jesse.$n.plist" && echo "loaded: $n" || echo "FAILED to load: $n"
done
