#!/bin/bash
# =============================================================================
# qc-heartbeat-watchdog.sh — the dead-man's-switch for self-healing pipelines.
#
# Every pipeline-qc run drops a heartbeat at ~/.qc-heartbeats/<label> ("epoch maxgap label").
# This watchdog runs INDEPENDENTLY (its own LaunchAgent) and pages you if any
# heartbeat is older than that pipeline's max tolerable gap — i.e. if a QC loop has
# silently STOPPED running (launchd unloaded it, the box was asleep, it errors before it
# can alert). It answers the "who watches the watchman" gap: the self-healers heal the
# pipelines; this heals the self-healers. Throttled: one alert per stale episode.
# =============================================================================
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
HB_DIR="$HOME/.qc-heartbeats"
NOTIFY_LOG="${QC_NOTIFY_LOG:-~/.claude/logs/pipeline-qc.log}"
now=$(date +%s)

# =============================================================================
# notify <subject> <body> — the GENERIC notifier (mirrors _qc_notify in qc-lib.sh).
# Posts a macOS desktop notification + appends to $NOTIFY_LOG.
#
# >>> WIRE YOUR OWN CHANNEL HERE <<< (Telegram / ntfy / email — see qc-lib.sh
#     header for ready-to-paste snippets; keep any token in your secret manager,
#     ~/JesseOS/workspace/security/README.md).
# =============================================================================
notify() {  # subject, body
  osascript -e "display notification \"$(printf '%s' "$2" | head -c 200 | tr '\n' ' ' | sed 's/\"/\\\\\"/g')\" with title \"pipeline-qc: $1\"" >/dev/null 2>&1 || true
  mkdir -p "$(dirname "$NOTIFY_LOG")" 2>/dev/null
  { printf '%s [watchdog] %s\n' "$(date '+%F %T')" "$1"; printf '%s\n' "$2" | sed 's/^/    /'; } >>"$NOTIFY_LOG" 2>/dev/null
  # >>> ADD YOUR OWN DELIVERY CHANNEL HERE <<<
}

[ -d "$HB_DIR" ] || { echo "no heartbeats yet ($HB_DIR)"; exit 0; }

for hb in "$HB_DIR"/*; do
  [ -f "$hb" ] || continue
  case "$hb" in *.alerted) continue;; esac
  label="$(basename "$hb")"
  read -r epoch maxgap _ < "$hb" 2>/dev/null
  [ -z "${epoch:-}" ] && continue
  [ -z "${maxgap:-}" ] && maxgap=108000
  age=$(( now - epoch ))
  if [ "$age" -gt "$maxgap" ]; then
    if [ ! -f "$hb.alerted" ]; then
      hrs=$(( age / 3600 ))
      notify "${label} QC has gone DARK" \
         "No ${label} self-healing QC run has completed in ~${hrs}h (limit $(( maxgap/3600 ))h). The watchman itself may be dead — check: launchctl list | grep ${label}; tail the pipeline's qc.log. The pipeline could be failing with nobody watching."
      : > "$hb.alerted"
      echo "ALERTED: $label stale ${hrs}h"
    else
      echo "still stale (already alerted): $label"
    fi
  else
    # healthy again — clear any prior stale alert so it can fire next time
    rm -f "$hb.alerted" 2>/dev/null
    echo "ok: $label ($(( age/3600 ))h since last run)"
  fi
done
exit 0
