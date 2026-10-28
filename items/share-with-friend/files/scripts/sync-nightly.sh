#!/bin/bash
# Nightly: republish anything on the Claude Shelf whose source changed. Run by com.jesse.shelf-sync.
# Alerts (desktop + phone via ntfy) come from shelf.py itself on blocked/failed items; heartbeat for
# pipeline-qc's watchdog is written on every completed run, so a job that stops running gets noticed.
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="${HOME:-/Users/$(whoami)}"
cd /tmp || exit 1
LOG="~/.claude/logs/shelf-sync.log"; mkdir -p "$(dirname "$LOG")"
{ echo "=== $(date '+%F %T') shelf sync"; "~/.claude/skills/share-with-friend/scripts/shelf.py" sync; rc=$?; echo "exit $rc"; } >>"$LOG" 2>&1
# keep the log small
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
exit ${rc:-0}
