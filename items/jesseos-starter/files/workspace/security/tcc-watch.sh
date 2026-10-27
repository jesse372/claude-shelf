#!/usr/bin/env bash
# Daily TCC health check.
#
# WHY FUNCTIONAL, NOT DB-BASED: on 2026-09-19 TCC.db still listed
# kTCCServiceSystemPolicyDocumentsFolder = 2 (allowed) for com.anthropic.claude-code
# while every access was actually denied — the grant had gone stale after npm
# replaced the claude binary. Reading the DB would have reported "healthy" all day.
# So we do the only thing that can't lie: try to use it.
set -u
export PATH="/usr/local/bin:$HOME/.omnara/bin:$PATH"
cd /tmp || exit 1
STATE="$HOME/JesseOS/workspace/security/tcc-status.json"
LOG="~/.claude/logs/tcc-watch.log"
mkdir -p "$(dirname "$LOG")" "$(dirname "$STATE")"
ts(){ date '+%Y-%m-%d %H:%M'; }
# macOS ships no `timeout`. Under launchd (no TTY) a TCC-denied `claude` BLOCKS
# forever instead of erroring, so every external call here must be time-boxed or
# the watchdog silently hangs and never reports.
run_t(){ local secs="$1"; shift; "$@" >/dev/null 2>&1 & local p=$! i=0
  while kill -0 "$p" 2>/dev/null; do
    [ "$i" -ge "$secs" ] && { kill -9 "$p" 2>/dev/null; wait "$p" 2>/dev/null; return 124; }
    sleep 1; i=$((i+1))
  done; wait "$p" 2>/dev/null; return $?; }
say(){ printf '%s  %s\n' "$(ts)" "$*" >> "$LOG"; }
alert(){
  say "ALERT: $*"
  run_t 10 osascript -e "display notification \"$*\" with title \"TCC permission problem\"" || say "(notification timed out)"
}

problems=""
# NOTE: do NOT wrap these in $(...) — a subshell cannot append to $problems.
check_dir(){                       # $1 = path, $2 = label -> sets RESULT
  if ls "$1" >/dev/null 2>&1; then RESULT="ok"; else RESULT="DENIED"; problems="$problems $2"; fi
}
# CONTEXT CAVEAT: under launchd this process has its OWN TCC identity, which by
# default holds no folder grants — so Desktop/Downloads read as DENIED here even
# when they work fine for Terminal/Omnara. Checking them would be pure false
# positives, so we track only ~/Documents (the folder that actually broke) and
# compare against the previous run, alerting on CHANGE rather than on state.
check_dir "$HOME/Documents" Documents; doc="$RESULT"
dsk="not-checked"; dwn="not-checked"

prev=""
[ -f "$STATE" ] && prev=$(sed -n 's/.*"documents":"\([^"]*\)".*/\1/p' "$STATE")

# NOTE: we deliberately do NOT probe `claude --version` here.
# Under launchd (no TTY) a TCC-denied claude blocks in a way that survives even
# SIGKILL-after-timeout, which hung this very watchdog. The directory read below
# is the real signal anyway: if ~/Documents is readable, sessions start fine there.
cli="not-probed"

printf '{"checked":"%s","documents":"%s","desktop":"%s","downloads":"%s","cli_in_workdir":"%s","problems":"%s"}\n' \
  "$(ts)" "$doc" "$dsk" "$dwn" "$cli" "$(echo $problems)" > "$STATE"

if [ -n "$problems" ] && [ "$doc" != "$prev" ]; then
  alert "TCC changed ->$problems — grant Full Disk Access to Omnara.app + Terminal in System Settings, then restart the omnara daemon."
  exit 1
fi
[ "$doc" = "ok" ] && [ "$prev" = "DENIED" ] && alert "TCC RECOVERED: ~/Documents readable again"
say "documents=$doc (prev=${prev:-none})"
