#!/bin/bash
# =============================================================================
# <PIPELINE>-qc.sh — self-healing QC for the <PIPELINE> workflow.
# Copy this to your project, rename, fill in the probes/repairs, schedule it
# (templates/com.jesse.<pipeline>-qc.plist). Run: <pipeline>-qc.sh [--deep]
#
# THE CONTRACT (read this):
#   * A PROBE returns 0=healthy, non-0=broken. It runs in the current shell, so it
#     may set globals later stages reuse. Set $QC_DETAIL to a one-line status that
#     shows up in the log/alert (e.g. "14/14 in output dir").
#   * A REPAIR is a deterministic fix. The engine re-runs the probe after it.
#   * A SELF-HEAL stage hands a drifted FILE to headless Claude; the engine keeps
#     the edit ONLY IF your probe goes green again (else it reverts + escalates).
# =============================================================================
set -uo pipefail
# Include wherever `claude`/`node` live on this box (dirname "$(command -v claude)").
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="~"

source "$HOME/.claude/skills/pipeline-qc/scripts/qc-lib.sh"

# ---- project paths/config -------------------------------------------------
DIR="$HOME/<pipeline-dir>"
PORT="http://127.0.0.1:9999"     # example: a local service this pipeline needs

# ===========================================================================
# 1) PROBE + REPAIR functions (your domain logic). Each probe: 0=OK / non-0=RED,
#    set $QC_DETAIL for a nice message.
# ===========================================================================

# --- a critical service: probe + mechanical restart ------------------------
probe_service() {
  if curl -s --max-time 8 "$PORT/health" | grep -q '"ok"'; then QC_DETAIL="up"; return 0; fi
  QC_DETAIL="not responding"; return 1
}
repair_service() {
  launchctl kickstart -k "gui/$(id -u)/com.jesse.<service>" 2>/dev/null || true
  for i in 1 2 3 4 5 6; do sleep 5; probe_service && break; done
}

# --- a parser/selector that drifts when an upstream site changes (SELF-HEAL) -
PARSER="$DIR/parse_items.js"
probe_parser() {
  local n; n=$(node "$PARSER" 2>/dev/null | grep -c .)
  QC_DETAIL="$n items"
  [ "$n" -ge 1 ]            # define "healthy" for your case (e.g. >= a known count)
}
context_parser() {          # gather what Claude needs to fix it (optional)
  curl -s "https://example.com/listing" > /tmp/<pipeline>_page.html
}
prompt_parser() {           # a FUNCTION so it can embed fresh state at heal-time
  cat <<EOF
The parser at $PARSER returned too few items, but its upstream service is UP, so the
page format likely changed. The current page is saved at /tmp/<pipeline>_page.html.
Fix ONLY $PARSER so it extracts every item. VERIFY by running: node $PARSER — it must
print >= 1 line and match the known-good shape. If you can't, leave the file unchanged
and exit non-zero.
EOF
}

# --- a "completeness" stage: behind => kick a job (SOFT, never a hard fail) --
probe_complete() {
  local want have
  want=$(node "$PARSER" 2>/dev/null | grep -c .)
  have=$(ls "$DIR/out" 2>/dev/null | grep -c .)
  QC_DETAIL="$have/$want done"
  [ "$have" -ge "$want" ]
}
repair_complete() { nohup bash "$DIR/process.sh" >>"$DIR/run.log" 2>&1 & }

# --- a logged-in session you can't auto-fix (HUMAN-GATE, deep only) ---------
probe_session() {
  if node "$DIR/capture.js" >/dev/null 2>&1; then QC_DETAIL="session live"; return 0; fi
  QC_DETAIL="login expired — re-auth needed"; return 1
}

# ===========================================================================
# 2) WIRE IT UP — order matters; --critical stages gate everything after them.
# ===========================================================================
qc_init --name "<pipeline>" \
        --lockdir "$DIR/.qc.lockd" --logfile "$DIR/qc.log" --repo "$DIR"

qc_stage --name "Service"      --probe probe_service  --repair repair_service --critical
qc_stage --name "Parser"       --probe probe_parser   --selfheal-file "$PARSER" \
         --selfheal-context context_parser --selfheal-prompt prompt_parser --commit
qc_stage --name "Session"      --probe probe_session  --deep --human-gate
qc_stage --name "Completeness" --probe probe_complete --repair repair_complete --soft

qc_run "$@"
