#!/bin/bash
# wrap-up auditor — inventories standing automation infra + scans a project dir for
# silent-failure risks. Gives a head-start for the wrap-up protocol (see SKILL.md).
# Usage: audit.sh [project_dir]   (defaults to $PWD)
set -uo pipefail
DIR="${1:-$PWD}"

hr(){ printf '\n──────── %s ────────\n' "$1"; }

hr "Scheduled jobs — LaunchAgents (loaded + schedule)"
for p in ~/Library/LaunchAgents/com.jesse.*.plist; do
  [ -e "$p" ] || continue
  lbl=$(basename "$p" .plist)
  st=$(launchctl list 2>/dev/null | awk -v l="$lbl" '$3==l{print "loaded(last_exit="$2")"}')
  sched=$(grep -oE "<key>(Hour|Minute|Weekday|StartInterval)</key>[[:space:]]*<integer>[0-9]+</integer>" "$p" 2>/dev/null | grep -oE "[A-Za-z]+|[0-9]+" | paste - - | tr '\n' ' ')
  printf "  %-34s %-26s %s\n" "$lbl" "${st:-NOT LOADED}" "$sched"
done

hr "Scheduled jobs — user crontab"
crontab -l 2>/dev/null | grep -vE '^\s*#' | grep -vE '^\s*$' || echo "  (no user crontab / none set)"

hr "Standing health"
echo "  - Secret manager: confirm your own secret manager is unlocked/authed so automations"
echo "    that pull credentials don't fail silently. See ~/JesseOS/workspace/security/README.md"

hr "Project scripts in $DIR (and whether scheduled ones ALERT on failure)"
found=0
while IFS= read -r f; do
  found=1
  base=$(basename "$f")
  alerts=$(grep -lE "osascript|display notification|notify-send|wrap-up.log|logger|mail |sendmail|curl.*(slack|webhook|ntfy)" "$f" >/dev/null 2>&1 && echo "alerts✓" || echo "NO-ALERT?")
  watchdog=$(grep -liE "stale|heartbeat|watchdog|age.*-ge|days" "$f" >/dev/null 2>&1 && echo "staleness-aware" || echo "")
  printf "  %-34s %-12s %s\n" "$base" "$alerts" "$watchdog"
done < <(find "$DIR" -maxdepth 2 -type f \( -name "*.sh" -o -name "*.py" \) -mtime -30 2>/dev/null | sort)
[ "$found" = 0 ] && echo "  (no recently-modified scripts found)"

hr "Credentials / tokens this project may depend on (check expiry yourself)"
echo "  - API tokens: check the provider's verify endpoint -> expiry field (null/none = never)"
echo "  - Login SESSIONS that expire silently (site logins, proxies, app sessions) — add a heartbeat"
echo "  - Secret-manager session, MCP server auth — confirm they load in launchd/cron context"

hr "WRAP-UP CHECKLIST (complete the rest by hand — see SKILL.md)"
cat <<'EOF'
  [ ] Every unattended job ALERTS on failure (notification + log line, or your own channel), not silently
  [ ] STALENESS/HEARTBEAT watchdog for anything that could silently stop producing output
  [ ] Credential/session expiry has a fallback or an alert (tokens, logins, proxies, secret manager)
  [ ] Tested the headless/launchd path actually works (env, MCP, auth differ from interactive)
  [ ] QC: re-read for edge cases (word-splitting, empty inputs, race conditions) and fixed
  [ ] Reusable skills EXTRACTED (one-shot this for similar future tasks? sync-skills.sh)
  [ ] Decisions + gotchas recorded to ~/JesseOS/vault/50-memory/ (via the memory skill, capture.sh)
  [ ] Final report: what runs, schedule, failure/escalation paths, known limits — truly hands-off?
EOF
