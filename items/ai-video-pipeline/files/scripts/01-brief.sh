#!/bin/bash
# =============================================================================
# Stage 1b — SHOOT BRIEF (the ad-lib path, and the default for this channel)
#
#   01-brief.sh <slug> "<spot / topic / what you're doing>"
#
# Produces research + a verified fact sheet + a BEAT SHEET you ad-lib from.
# Deliberately NOT a script: his voice is unscripted live commentary, so writing
# his sentences for him is what would break it. Beats are fragments and prompts,
# never lines to read aloud.
#
# Needs no third-party API key — the `claude` CLI here is already authenticated.
# =============================================================================
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

# Plain validation rather than ${1:?message}. An apostrophe inside a :? message
# (e.g. "what you're filming") starts a single-quoted string as far as bash is
# concerned, so it hunts for the closing quote and then reports a missing `}`
# dozens of lines later — a parse error that points nowhere near the real cause.
SLUG="${1:-}"
TOPIC="${2:-}"
if [ -z "$SLUG" ] || [ -z "$TOPIC" ]; then
  echo "usage: 01-brief.sh <slug> \"<spot / topic / what you are filming>\"" >&2
  exit 2
fi

proj_init "$SLUG"
log "=== shoot brief (project=$SLUG)"

PLAYBOOK="$SKILL_DIR/templates/voice-playbook.md"
[ -s "$PLAYBOOK" ] || die "voice playbook missing — run derive-voice.sh first"

printf '%s\n' "$TOPIC" >"$PROJ/00-source/topic.txt"
OUT="$PROJ/01-script"

PROMPT="$PROJ/state/01b-prompt.txt"
cat >"$PROMPT" <<EOF
You are preparing a SHOOT BRIEF for Jesse's fishing channel. He films unscripted,
on the beach, talking to camera while his hands are busy. Work autonomously and
write the files directly — do not ask questions.

WHAT HE'S FILMING:
$TOPIC

CRITICAL CONSTRAINT — THIS IS NOT A SCRIPT.
Do not write sentences for him to read. If he reads your words aloud he will sound
scripted, which is the one thing that would break this. Every beat must be a
FRAGMENT or a PROMPT — a reminder of what to cover, not the words to cover it with.
Aim for 4-8 words per beat. Never a full sentence he could recite.

His voice playbook (follow its structure and prohibitions exactly):

$(cat "$PLAYBOOK")

STEP 1 — RESEARCH. Search for what's genuinely checkable and useful on the beach:
current WA rules for any species named (legal size, bag limit, closed season),
tides/swell/wind for the spot and date if given, gear/rig facts, anything he might
state on camera and get wrong. Prefer primary sources (WA Fisheries, BOM).

STEP 2 — FACT SHEET. Write $OUT/facts.md as a table: claim | exact figure | source
URL | VERIFIED/UNVERIFIED. Cut unverified items from the brief entirely.

STEP 3 — BRIEF. Write $OUT/brief.md, short enough to glance at on a phone between
drops. Use exactly these sections:

# <spot / session>

## Open (his 4 beats — prompts only)
- greeting
- where exactly (name the beach + a locating detail)
- plan + why (who told you / why this reef)
- your hedge, then launch line

## Numbers you can say on camera
Short bullets, each a bare fact with the figure. These are the ONLY places a
specific number should appear. Keep to 6 max.

## Middle beats
- drop 1 / drop 2 / drop 3 as the spine (what to note on each retrieve)
- 2-3 gear tangent options (fragments)
- 2-3 digression options if it's slow

## Close (his 3 beats)
- call it
- tally the damage, then the consolation
- sign-off

## Don't
The handful of his own prohibitions most at risk in THIS video, as short reminders.

## Title options
4 options in his actual title style.

STEP 4 — VERIFY before finishing:
  - facts.md exists; nothing UNVERIFIED survives into brief.md
  - no line in brief.md is a readable full sentence (check for lines over 12 words)
  - all required sections present
Fix anything failing, then print a one-line summary.
EOF

log "researching + writing brief (headless Claude)"
claude_run "$PROMPT" "${VIDEO_BRIEF_MODEL:-claude-opus-5}" \
  "Read,Write,Edit,Bash,Glob,Grep,WebSearch,WebFetch" >"$PROJ/state/01b-claude.log" 2>&1
log "claude exited rc=$?"

# ---- deterministic verification --------------------------------------------
fail=0
[ -s "$OUT/brief.md" ] || { log "ERROR: brief.md missing/empty"; fail=1; }
[ -s "$OUT/facts.md" ] || { log "ERROR: facts.md missing/empty"; fail=1; }

if [ "$fail" -eq 0 ]; then
  for h in "## Open" "## Numbers you can say" "## Middle beats" "## Close" "## Don't" "## Title options"; do
    grep -q "$h" "$OUT/brief.md" || { log "WARN: brief missing section: $h"; }
  done

  # The whole point is that it's NOT recitable prose. Flag long bullet lines,
  # which are the failure mode that would make him sound scripted.
  longlines=$(awk '/^[-*] /{ n=NF-1; if (n>12) c++ } END { print c+0 }' "$OUT/brief.md")
  total=$(grep -c '^[-*] ' "$OUT/brief.md" || true)
  log "brief: $total beats, $longlines over 12 words"
  [ "${longlines:-0}" -gt 0 ] && log "WARN: $longlines beat(s) read like sentences — he may recite them"

  if grep -qiE '^\|.*\bUNVERIFIED\b' "$OUT/facts.md"; then
    log "WARN: facts.md still lists UNVERIFIED rows — check none leaked into the brief"
  fi

  stage_mark 01
  log "brief OK -> $OUT/brief.md"
else
  log "brief FAILED — see $PROJ/state/01b-claude.log"; exit 1
fi
