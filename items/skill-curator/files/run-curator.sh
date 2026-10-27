#!/bin/zsh
# Runner for the weekly skill-curator (launchd has a minimal env). Resolves claude + python3,
# then runs curate.py. Logs to the machine-local state dir.
TOOL="~/.claude/skills/skill-curator"
STATE_DIR="$HOME/.local/state/jesseos-skills"
mkdir -p "$STATE_DIR"
LOG="$STATE_DIR/runner.log"
ts() { date "+%Y-%m-%d %H:%M:%S %Z"; }

export PATH="/usr/local/bin:$HOME/.omnara/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"
CLAUDE_BIN="$(/bin/zsh -lc 'command -v claude' 2>/dev/null)"
[ -x "$CLAUDE_BIN" ] || CLAUDE_BIN="/usr/local/bin/claude"
PY="$(/bin/zsh -lc 'command -v python3' 2>/dev/null)"
[ -x "$PY" ] || PY="/usr/bin/python3"

echo "$(ts) start (claude=$CLAUDE_BIN py=$PY)" >> "$LOG"
CLAUDE_BIN="$CLAUDE_BIN" "$PY" "$TOOL/curate.py" "$@" >> "$LOG" 2>&1
echo "$(ts) done exit=$?" >> "$LOG"
