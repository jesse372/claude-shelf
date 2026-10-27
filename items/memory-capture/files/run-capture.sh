#!/bin/zsh
# Runner for JesseOS memory auto-capture. Resolves claude + node (launchd has a
# minimal env), then runs summarize.js. Logs to the machine-local state dir and
# to ~/.claude/logs/memory-capture.log; pops a desktop notification on failure.
TOOL="~/.claude/skills/memory-capture"
STATE_DIR="$HOME/.local/state/jesseos-memory"
WORKLOG_DIR="~/.claude/logs"
mkdir -p "$STATE_DIR" "$WORKLOG_DIR"
LOG="$STATE_DIR/runner.log"
WORKLOG="$WORKLOG_DIR/memory-capture.log"
ts() { date "+%Y-%m-%d %H:%M:%S %Z"; }
notify() { /usr/bin/osascript -e "display notification \"$1\" with title \"memory-capture\"" 2>/dev/null; }

# --- single-instance lock ---
# A capture pass can take >2h (it summarizes every idle session via haiku). Two overlapping
# runs would race the shared decisions.md + state.json and write duplicate entries. mkdir is
# atomic, so it makes a reliable lock on macOS (no flock). Stale locks (dead holder) are reclaimed.
LOCK="$STATE_DIR/capture.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  holder="$(cat "$LOCK/pid" 2>/dev/null)"
  if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then
    echo "$(ts) skip — capture already running (pid $holder)" >> "$LOG"
    exit 0
  fi
  echo "$(ts) reclaiming stale lock (holder ${holder:-?} gone)" >> "$LOG"
  rm -rf "$LOCK"; mkdir "$LOCK" 2>/dev/null || { echo "$(ts) could not acquire lock" >> "$LOG"; exit 0; }
fi
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT INT TERM

# Generic PATH covering common install locations (Omnara/Homebrew/system).
export PATH="/usr/local/bin:$HOME/.omnara/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
CLAUDE_BIN="$(/bin/zsh -lc 'command -v claude' 2>/dev/null)"
NODE_BIN="$(/bin/zsh -lc 'command -v node' 2>/dev/null)"
[ -x "$CLAUDE_BIN" ] || CLAUDE_BIN="$(command -v claude 2>/dev/null)"
[ -x "$NODE_BIN" ] || NODE_BIN="$(command -v node 2>/dev/null)"

if [ ! -x "$CLAUDE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  msg="could not resolve claude/node (claude=$CLAUDE_BIN node=$NODE_BIN)"
  echo "$(ts) ERROR $msg" | tee -a "$LOG" >> "$WORKLOG"
  notify "capture failed: $msg"
  exit 1
fi

echo "$(ts) start (node=$NODE_BIN claude=$CLAUDE_BIN)" | tee -a "$LOG" >> "$WORKLOG"
CLAUDE_BIN="$CLAUDE_BIN" "$NODE_BIN" "$TOOL/summarize.js" >> "$LOG" 2>&1
rc=$?
echo "$(ts) done exit=$rc" | tee -a "$LOG" >> "$WORKLOG"
[ "$rc" -eq 0 ] || notify "capture exited non-zero ($rc) — see $WORKLOG"
exit "$rc"
