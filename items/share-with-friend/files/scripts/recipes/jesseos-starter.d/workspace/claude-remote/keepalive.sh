#!/bin/bash
# Every 5 min (LaunchAgent com.jesse.claude-remote): make sure Remote Control is running and logged in.
# Opens it in Terminal if not; alerts through notify.py (throttled) if it can't be brought back.
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
W="$HOME/JesseOS/workspace"; D="$W/claude-remote"; mkdir -p "$W/logs"
LOG="$W/logs/claude-remote.log"; SCREEN="$W/logs/claude-remote.screen"; STATE="$D/.keepalive-fails"
HEALTH="$HOME/.claude/skills/auth-framework/scripts/claude_auth_health.py"   # optional: the auth-framework skill
ts(){ date '+%F %T'; }
alert(){
  echo "[$(ts)] ALERT $1" >> "$LOG"
  local f="$D/.last-alert"
  # throttle: same alert at most every 6h
  if [ -f "$f" ] && [ "$(cat "$f")" = "$1" ] && [ $(( $(date +%s) - $(stat -f %m "$f") )) -lt 21600 ]; then return; fi
  python3 "$W/notify/notify.py" send --subject "Remote Control needs you" --body "$1" --level urgent \
    --source claude-remote >/dev/null 2>&1 && echo "$1" > "$f"
}
invalidate_heartbeat(){ mkdir -p "$HOME/.qc-heartbeats"; printf '0 3600 claude-remote\n' > "$HOME/.qc-heartbeats/claude-remote"; }
# keep the screen recording small (script appends; truncating is safe)
[ -f "$SCREEN" ] && [ "$(stat -f %z "$SCREEN")" -gt 2000000 ] && : > "$SCREEN"
if pgrep -f "claude remote-control --name" >/dev/null; then
  # The parent can say Connected while child sessions have expired credentials.
  # Read the credential's expiry directly; process presence is not auth health.
  if [ -f "$HEALTH" ]; then
    info="$(python3 "$HEALTH" --tsv 2>/dev/null)"
    case "${info%%|*}" in
      OK) ;;
      EXPIRING) alert "Claude login expires within 48 hours. Renew it with 'claude auth login' on the Mac before phone access stops." ;;
      EXPIRED|MISSING|NO_REFRESH)
        invalidate_heartbeat
        alert "Claude login has expired or is missing. Phone tasks cannot authenticate. Run 'claude auth login' on the Mac."
        exit 1 ;;
      *)
        invalidate_heartbeat
        alert "Cannot check Claude login health. Check Keychain access and 'claude auth status' on the Mac."
        exit 1 ;;
    esac
  fi
  if tail -c 20000 "$SCREEN" 2>/dev/null | grep -aqiE 'not logged in|login required|please run /login|failed to authenticate|oauth session expired|subscription required'; then
    invalidate_heartbeat
    alert "Remote Control reports a login error. Run 'claude auth login' on the Mac."
    exit 1
  fi
  rm -f "$STATE"; mkdir -p "$HOME/.qc-heartbeats"; echo "$(date +%s) 3600 claude-remote" > "$HOME/.qc-heartbeats/claude-remote"
  exit 0
fi

n=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 )); echo $n > "$STATE"
# The launcher is already up (e.g. Terminal still starting after a reboot): don't open another window.
if pgrep -f "claude-remote/claude-remote.command" >/dev/null && [ "$n" -lt 3 ]; then
  echo "[$(ts)] launcher already running, waiting for it (attempt $n)" >> "$LOG"; exit 0
fi
echo "[$(ts)] not running - opening in Terminal (attempt $n)" >> "$LOG"
open -g -a Terminal "$D/claude-remote.command"
[ "$n" -ge 3 ] && alert "Remote Control has been down for ~$(( (n-1)*5 )) min and won't restart. Phone access to the Mac is OFF. See $LOG"
exit 0
