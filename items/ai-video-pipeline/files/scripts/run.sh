#!/bin/bash
# =============================================================================
# ai-video-pipeline / run.sh — orchestrator. Resumable: each stage records a
# .done marker, so a re-run skips completed stages unless you --redo them.
#
#   run.sh <slug> "<topic or source URL>"     # run everything that's possible
#   run.sh <slug> --redo 01                   # force one stage to re-run
#   run.sh <slug> --status                    # what's done, what's blocked
# =============================================================================
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

SLUG="${1:?usage: run.sh <slug> \"<topic or source URL>\" | --status | --redo NN}"
shift
proj_init "$SLUG"

case "${1:-}" in
  --status)
    echo "project: $PROJ"
    for s in 01 02 03 04 05; do
      if stage_done "$s"; then echo "  $s  DONE"; else echo "  $s  pending"; fi
    done
    echo
    echo "credential status:"
    for pair in "elevenlabs:voice synthesis (stage 02)" "heygen:avatar render (stage 03)"; do
      n="${pair%%:*}"; h="${pair#*:}"
      if [ -n "$(cred_get "$n" 2>/dev/null)" ]; then echo "  $n: present"; else echo "  $n: MISSING — blocks $h"; fi
    done
    exit 0 ;;
  --redo) stage_clear "${2:?which stage?}"; log "cleared stage ${2} — will re-run"; shift 2 ;;
esac

SOURCE="${1:-}"

# ---- stage 01 ---------------------------------------------------------------
# Two mutually exclusive paths:
#   brief  (DEFAULT) research + facts + beats he ad-libs from. Fits this channel:
#          his voice is unscripted live commentary, so writing his sentences for
#          him is the one thing that would break it. Needs no third-party keys.
#   script  word-perfect script + sub-minute TTS chunks, for the avatar route.
MODE="${VIDEO_MODE:-brief}"
if stage_done 01; then
  log "stage 01 already done (use --redo 01 to force)"
else
  [ -n "$SOURCE" ] || die "stage 01 needs a spot/topic"
  case "$MODE" in
    brief)  bash "$SKILL_DIR/scripts/01-brief.sh"  "$SLUG" "$SOURCE" || die "brief failed" ;;
    script) bash "$SKILL_DIR/scripts/01-script.sh" "$SLUG" "$SOURCE" || die "script failed" ;;
    *) die "unknown VIDEO_MODE '$MODE' (brief|script)" ;;
  esac
fi

# The brief path is complete in itself — he shoots and voices it himself, so there
# is no TTS, no avatar, and nothing downstream to gate on credentials.
if [ "$MODE" = "brief" ]; then
  cat >&2 <<EOF

--------------------------------------------------------------------------
Shoot brief ready:
  brief : $PROJ/01-script/brief.md
  facts : $PROJ/01-script/facts.md
Nothing is blocked — you film and voice it yourself.
--------------------------------------------------------------------------
EOF
  exit 0
fi

# ---- stages 02-05: gated on third-party credentials --------------------------
# These are deliberately NOT stubbed with fake success. A pipeline that reports
# "done" without producing audio or video is worse than one that stops and says
# exactly what it needs.
blocked=0
for pair in "elevenlabs:02:voice synthesis" "heygen:03:avatar render"; do
  n="${pair%%:*}"; rest="${pair#*:}"; st="${rest%%:*}"; h="${rest#*:}"
  if [ -z "$(cred_get "$n" 2>/dev/null)" ]; then
    log "stage $st BLOCKED — no '$n' credential ($h)"
    log "  add it:  security add-generic-password -s '$n' -a api -w"
    blocked=1
  fi
done

if [ "$blocked" -eq 1 ]; then
  cat >&2 <<EOF

--------------------------------------------------------------------------
Stage 1 is complete and verified:
  script  : $PROJ/01-script/script.md
  facts   : $PROJ/01-script/facts.md
  chunks  : $PROJ/01-script/chunks/   (sub-minute, TTS-ready, lossless)

Stages 2-5 need API credentials before they can be built and tested against
the real services. Add the keys above, then re-run this script.
--------------------------------------------------------------------------
EOF
  exit 0
fi

log "all credentials present — stages 02-05 ready to implement against live APIs"
