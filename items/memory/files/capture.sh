#!/usr/bin/env bash
# Capture: append a timestamped note to shared memory.
note="${*:-}"
[ -z "$note" ] && { echo "usage: capture.sh <note>"; exit 1; }
f="$HOME/JesseOS/vault/50-memory/decisions.md"
printf -- "- [%s] %s\n" "$(date '+%Y-%m-%d %H:%M')" "$note" >> "$f"
echo "captured -> $f"
