#!/bin/bash
# auth-keepalive.sh — proactive auth keepalive across all expiring flows.
#
# WHAT: walks a registry of auth "targets". For each it computes time-to-expiry (where knowable),
# probes health, and acts: refresh if possible+expiring, else alert (capped). Runs unattended via
# launchd (~every 6h).
#
# WHY: expiring OAuth tokens / sessions / cookies break automations with NO warning. This makes
# expiry PROACTIVE (<48h) and self-healing where it can, instead of failing silently.
#
# Usage:
#   auth-keepalive.sh            # check + act (refresh/alert)
#   auth-keepalive.sh --dry-run  # print the table only; no refresh, no alert
#
# Targets (see functions below): claude-code, codex, omnara  (+ a t_template you copy to add more)
# Exit: always 0 (urgency is carried by alerts, not exit code) unless a hard internal error.
#
# Notifier: macOS notification + a log line. Hook a richer channel (Slack/Telegram/email/ntfy) at
# the marked spot in af_alert if you want push notifications.
#
# Complements (does NOT replace) ~/JesseOS/workspace/security/auth-watchdog.sh: that watchdog does
# live health probes of Claude/Codex/Omnara; this engine adds the FORWARD-LOOKING expiry window and
# the per-target refresh-or-alert ladder. Keep the two in sync — if you add a target here that the
# watchdog already probes, let this one own the <48h expiry alert and let the watchdog own "is it
# up right now".

set -uo pipefail

AF_DIR="${AF_DIR:-$HOME/.authframework}"
STATE="$AF_DIR/keepalive-state"; mkdir -p "$STATE"
LOG_DIR="${LOG_DIR:-~/.claude/logs}"; mkdir -p "$LOG_DIR" 2>/dev/null
LOG="$LOG_DIR/auth-framework.log"
DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
THRESH_H=48                       # default proactive window (hours)
ALERT_QUEUE="$AF_DIR/alert-queue"; mkdir -p "$ALERT_QUEUE"

ts(){ date '+%F %T'; }
log(){ echo "$(ts) $*" >>"$LOG"; }

# Source the credential accessor (cred_get / cred_ensure_session) if present.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$SELF_DIR/authlib.sh" ] && source "$SELF_DIR/authlib.sh"

# ---- generic alert (macOS notification + log), with per-key daily de-dupe ------------------
af_alert(){  # af_alert <cap-key> <subject> <body>   (cap = 1 alert / key / 24h)
  local key="$1" subj="$2" body="$3"
  local capf="$STATE/alert.$key.epoch"; local now; now=$(date +%s)
  local last; last=$(cat "$capf" 2>/dev/null || echo 0)
  [ $(( now - last )) -lt 86400 ] && { log "alert suppressed (capped <24h): $key"; return 0; }
  [ "$DRY" = 1 ] && { echo "    would-alert[$key]: $subj"; return 0; }

  log "ALERT [$key] $subj — $body"
  # Persist first so an unavailable desktop cannot swallow the warning.
  echo "$now" >"$capf"
  { printf '%s\n' "$subj"; printf '%s\n' "$body"; } >"$ALERT_QUEUE/$(date +%s)_${key}.alert" 2>/dev/null
  # Existing Remote Control monitor supplies phone warnings for Claude expiry.
  # Bound the optional desktop notification, including in headless launchd.
  python3 - "$subj" "$body" <<'PYNOTIFY' >/dev/null 2>&1
import subprocess, sys
try:
    subprocess.run(["osascript", "-e",
        "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run",
        sys.argv[1], sys.argv[2]], timeout=10, capture_output=True)
except (OSError, subprocess.TimeoutExpired):
    pass
PYNOTIFY

}

# ---- helpers --------------------------------------------------------------------------------
iso_hours_left(){  # echo whole hours until ISO-8601 ts in $1 (negative if past); "n/a" if unparseable
  python3 - "$1" <<'PY' 2>/dev/null || echo "n/a"
import sys,datetime as dt
s=sys.argv[1].strip().replace('Z','+00:00')
try:
    t=dt.datetime.fromisoformat(s)
    if t.tzinfo is None: t=t.replace(tzinfo=dt.timezone.utc)
    print(int((t-dt.datetime.now(dt.timezone.utc)).total_seconds()//3600))
except Exception: print("n/a")
PY
}
mtime_plus_days_hours_left(){  # hours left until (mtime($1) + $2 days)
  python3 - "$1" "$2" <<'PY' 2>/dev/null || echo "n/a"
import sys,os,time
try:
    exp=os.path.getmtime(sys.argv[1])+int(sys.argv[2])*86400
    print(int((exp-time.time())//3600))
except Exception: print("n/a")
PY
}
row(){ printf '  %-15s %-8s %-5s  %s\n' "$1" "$2" "$3" "$4"; }   # name state hoursLeft detail

# =================================== TARGETS =================================================
# Each prints one row and (unless --dry-run) performs refresh/alert.
# These are EXAMPLE targets — adapt the probes to where your tokens actually live, and add your
# own with t_template below.

t_claude_code(){
  # One shared, bounded probe. Raw credentials never enter shell variables or argv.
  local info state hl det
  info="$(python3 "$SELF_DIR/claude_auth_health.py" --tsv 2>/dev/null)"
  IFS='|' read -r state hl det <<< "$info"
  state="${state:-UNKNOWN}"; hl="${hl:-n/a}"; det="${det:-Claude auth probe unavailable}"
  row claude-code "$state" "$hl" "$det"
  [ "$DRY" = 1 ] && return 0
  case "$state" in
    OK) ;;
    EXPIRING) af_alert claude_code_expiring "Claude login expires within 48h" \
      "Renew the Mac login with claude auth login --claudeai before phone sessions stop working." ;;
    EXPIRED|MISSING|NO_REFRESH) af_alert claude_code_expired "Claude login needs renewal" \
      "Claude Remote Control cannot start authenticated work. Run claude auth login --claudeai on the Mac and finish its browser sign-in." ;;
    *) af_alert claude_code_unknown "Claude login could not be checked" \
      "The bounded Claude credential probe failed. Inspect Keychain access and run claude auth status; do not assume phone sessions work." ;;
  esac
}

t_codex(){
  # OpenAI Codex CLI stores auth under ~/.codex/auth.json (access + refresh token; auto-refreshed
  # on use). Read the token expiry if present, report-only unless it's both expiring AND has no
  # refresh token to self-heal with.
  local f="$HOME/.codex/auth.json"
  [ -f "$f" ] || { row codex N/A "-" "no ~/.codex/auth.json"; return; }
  local info; info="$(python3 - "$f" <<'PY' 2>/dev/null
import sys,json,time
try:
    d=json.load(open(sys.argv[1]))
    t=d.get("tokens") or d
    exp=t.get("expires_at") or t.get("expiry") or ""
    has_rt='y' if (t.get("refresh_token")) else 'n'
    hl="n/a"
    if exp:
        try:
            import datetime as dt
            x=dt.datetime.fromisoformat(str(exp).replace('Z','+00:00'))
            if x.tzinfo is None: x=x.replace(tzinfo=dt.timezone.utc)
            hl=str(int((x-dt.datetime.now(dt.timezone.utc)).total_seconds()//3600))
        except Exception:
            try: hl=str(int((float(exp)-time.time())//3600))
            except Exception: hl="n/a"
    print(f"{hl}|{has_rt}")
except Exception: print("n/a|n")
PY
)"
  local hl="${info%%|*}" hasrt="${info##*|}"
  if [ "$hasrt" = "y" ]; then
    row codex OK "${hl}" "access token auto-refreshes (refresh_token present)"
  elif [ "$hl" != "n/a" ] && [ "$hl" -lt "$THRESH_H" ]; then
    row codex WARN "${hl}" "expiring <48h and no refresh_token — re-auth may be needed"
    [ "$DRY" = 1 ] || af_alert codex "Codex auth expiring (<48h)" \
"~/.codex/auth.json token is within 48h of expiry with no refresh_token. Run \`codex login\` to re-authenticate."
  else
    row codex OK "${hl}" "token present"
  fi
}

t_omnara(){
  # Omnara daemon holds this machine's session. There's no single expiry file to read, so PROBE
  # that the daemon is alive (the thing that actually matters) and alert only if it's down.
  # Omnara shuts down 2026-11-10; replaced by Claude Code Remote Control (~/JesseOS/workspace/claude-remote,
  # watched by its own keepalive.sh). Once Omnara's LaunchAgent is gone, skip instead of alerting.
  if [ ! -f "$HOME/Library/LaunchAgents/com.omnara.daemon.plist" ]; then
    row omnara OK "retired" "Omnara retired; Claude Remote Control replaces it"; return
  fi
  local pid
  pid=$(launchctl list 2>/dev/null | awk '/com\.omnara\.daemon/{print $1}')
  if [ -n "$pid" ] && [ "$pid" != "-" ]; then
    row omnara OK "daemon" "omnara daemon up (pid $pid)"
  else
    row omnara DOWN "daemon" "omnara daemon NOT running"
    [ "$DRY" = 1 ] || af_alert omnara "Omnara daemon DOWN" \
"com.omnara.daemon is not running — remote control / this session's responsible app is down. Restart: \`launchctl kickstart -k gui/\$(id -u)/com.omnara.daemon\`."
  fi
}

# ---- TEMPLATE: copy this to register a new auth target -------------------------------------
# 1) Figure out where the token/cookie/session for your flow lives and how to read its expiry.
# 2) Print exactly one `row <name> <STATE> <hrs> <detail>`.
# 3) Unless $DRY=1, refresh if you can, else call af_alert with a stable cap-key.
# 4) Add `t_<name>` to the RUN block at the bottom.
# Reuse helpers: iso_hours_left, mtime_plus_days_hours_left, cred_get (from authlib.sh).
# Keep alerts evidence-based — prefer a real probe (read the actual expiry / ping the daemon) over
# fragile heuristics.
t_gmail(){
  # Gmail API (skills/gmail). The google-auth client refreshes the short-lived access token
  # automatically ON USE, so a stale `expiry` in the token file is NORMAL and not an alert.
  # What actually matters is whether a refresh_token is still present AND still accepted:
  #   - no token file at all            -> MISSING (never authorized, or wiped)
  #   - token file but no refresh_token -> BROKEN  (will die at next access-token expiry)
  #   - refresh_token present           -> probe it for real (a revoked token still LOOKS fine
  #                                        on disk; only an API call proves it)
  # The real-world killer here is a Google Cloud project left in "Testing" mode: those refresh
  # tokens are revoked by Google after 7 days. The probe catches that as a refresh failure.
  local GM="~/.claude/skills/gmail/scripts/gmail.sh"
  [ -x "$GM" ] || return 0                      # skill not installed; stay silent

  local js hl has_ref present
  js="$("$GM" token-status 2>/dev/null)"
  present="$(printf '%s' "$js" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("present",False))' 2>/dev/null || echo False)"
  has_ref="$(printf '%s' "$js" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("has_refresh",False))' 2>/dev/null || echo False)"
  hl="$(printf '%s'  "$js" | python3 -c 'import sys,json;v=json.load(sys.stdin).get("hours_left");print(v if v is not None else "n/a")' 2>/dev/null || echo n/a)"

  if [ "$present" != "True" ]; then
    row gmail MISSING "n/a" "no token — run: gmail.sh auth"
    [ "$DRY" = 1 ] || af_alert gmail "Gmail not authorized" "No token at ~/.authframework/secrets/gmail.token. Run: gmail.sh auth"
    return 0
  fi
  if [ "$has_ref" != "True" ]; then
    row gmail BROKEN "$hl" "token has no refresh_token — will not survive expiry"
    [ "$DRY" = 1 ] || af_alert gmail "Gmail token cannot refresh" "gmail.token has no refresh_token. Re-run: gmail.sh auth"
    return 0
  fi

  # Evidence-based probe: force a real refresh+API call. Cheap (getProfile) and it is the only
  # thing that distinguishes "revoked upstream" from "looks fine on disk".
  if [ "$DRY" = 1 ]; then
    row gmail OK "$hl" "refresh_token present (dry-run: not probed)"
    return 0
  fi
  if "$GM" whoami >/dev/null 2>&1; then
    row gmail OK "$hl" "refresh ok"
  else
    row gmail FAIL "$hl" "refresh_token rejected by Google"
    af_alert gmail "Gmail auth is dead" \
      "gmail.sh whoami failed — the refresh token was rejected (revoked, or the Cloud project is still in Testing mode, which expires tokens after 7 days). Fix: gmail.sh auth"
  fi
}

t_square(){
  # Square catalogue token (skills/square). A Square *personal/production access token* has no
  # expiry timer, so there are no hours-left to report — the only failure modes are "never
  # installed", "rotated in the developer dashboard", and "revoked". All three look identical
  # on disk and only an API call tells them apart, so probe for real.
  local SQ="~/.claude/skills/square/scripts/square.sh"
  [ -x "$SQ" ] || return 0                      # skill not installed; stay silent

  local js present valid
  js="$("$SQ" token-status 2>/dev/null)"
  present="$(printf '%s' "$js" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("present",False))' 2>/dev/null || echo False)"
  valid="$(printf '%s'   "$js" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("valid"))' 2>/dev/null || echo None)"

  if [ "$present" != "True" ]; then
    row square MISSING "n/a" "no token — run: square.sh install-token '<TOKEN>'"
    [ "$DRY" = 1 ] || af_alert square "Square not authorized" \
      "No Square token in the Keychain. See SETUP.md in skills/square. Prices cannot be synced."
    return 0
  fi
  if [ "$valid" = "True" ]; then
    row square OK "n/a" "token accepted by Square"
  else
    row square FAIL "n/a" "token rejected by Square"
    [ "$DRY" = 1 ] || af_alert square "Square token is dead" \
      "square.sh token-status says the token was rejected (rotated or revoked). Re-mint it in the Square developer dashboard, then: square.sh install-token '<TOKEN>'"
  fi
}

t_youtube(){
  local yt="~/.claude/skills/youtube-upload/scripts/youtube.sh"
  [ -x "$yt" ] || return 0
  # Do not nag about a setup that has never been connected.
  if [ ! -f "${YOUTUBE_HOME:-$HOME/.youtube-upload}/channel.json" ] && ! compgen -G "${YOUTUBE_HOME:-$HOME/.youtube-upload}/profiles/*/channel.json" >/dev/null; then
    row youtube N/A "-" "connection not completed; no upload access claimed"
    return 0
  fi
  local state
  state="$(python3 - "$yt" "$DRY" <<'PYYT'
import json, subprocess, sys
cmd = [sys.argv[1], 'health', '--all']
if sys.argv[2] != '1':
    cmd.append('--live')
try:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
    value = json.loads(result.stdout)
    print('OK' if result.returncode == 0 and value.get('state') == 'OK' else
          'UNVERIFIED' if sys.argv[2] == '1' and value.get('has_refresh_token') else 'FAIL')
except (OSError, ValueError, subprocess.TimeoutExpired):
    print('FAIL')
PYYT
)"
  if [ "$state" = OK ]; then
    row youtube OK "-" "live refresh and saved channel verified"
  elif [ "$state" = UNVERIFIED ]; then
    row youtube CHECK "-" "refresh token present; dry-run did not contact Google"
  else
    row youtube FAIL "-" "access check failed (auth, connectivity, or runtime)"
    [ "$DRY" = 1 ] || af_alert youtube "YouTube access needs attention" \
      "youtube.sh health --live failed or timed out. Check connectivity and the saved channel; reconnect with youtube.sh auth if Google consent expired. No video was uploaded."
  fi
}

t_template(){
  [ "${ENABLE_TEMPLATE:-0}" = 1 ] || return 0   # disabled by default; set ENABLE_TEMPLATE=1 to try
  local exp_iso="2030-01-01T00:00:00Z"          # <- read this from your token file in real use
  local hl; hl=$(iso_hours_left "$exp_iso")
  if [ "$hl" != "n/a" ] && [ "$hl" -lt "$THRESH_H" ]; then
    row example WARN "${hl}" "example target expiring <48h"
    [ "$DRY" = 1 ] || af_alert example "Example target expiring (<48h)" "Replace t_template with a real probe."
  else
    row example OK "${hl}" "example target healthy"
  fi
}

# =================================== RUN =====================================================
echo "===== auth-keepalive $( [ "$DRY" = 1 ] && echo '(dry-run)') ====="
log  "===== run (dry=$DRY) ====="
printf '  %-15s %-8s %-5s  %s\n' NAME STATE HRS DETAIL
t_claude_code
t_codex
t_omnara
t_gmail
t_square
t_youtube
t_template
log "===== done ====="
exit 0
