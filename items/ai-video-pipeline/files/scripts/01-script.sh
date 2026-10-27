#!/bin/bash
# =============================================================================
# Stage 1 — research -> fact-check -> script in Jesse's voice -> sub-minute chunks
#
# Usage: 01-script.sh <slug> "<topic or source URL>"
#
# This is the only stage that needs no third-party API key: the `claude` CLI on
# this box is already authenticated, so it does the research, the fact-check, and
# the writing. Output is a script plus one file per TTS chunk.
# =============================================================================
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

SLUG="${1:?usage: 01-script.sh <slug> \"<topic or source URL>\"}"
SOURCE="${2:?need a topic or source URL}"

proj_init "$SLUG"
log "=== stage 1: script  (project=$SLUG)"

PLAYBOOK="$SKILL_DIR/templates/voice-playbook.md"
[ -f "$PLAYBOOK" ] || die "voice playbook missing: $PLAYBOOK"

# Extra real transcripts sharpen the voice match; optional.
REFS=""
if compgen -G "$SKILL_DIR/reference/transcripts/*" >/dev/null 2>&1; then
  REFS="$(cat "$SKILL_DIR"/reference/transcripts/* 2>/dev/null | head -c 40000)"
fi

printf '%s\n' "$SOURCE" >"$PROJ/00-source/source.txt"

PROMPT="$PROJ/state/01-prompt.txt"
cat >"$PROMPT" <<EOF
You are writing a YouTube video script in Jesse's voice. Work autonomously and
write files directly — do not ask questions.

SOURCE / TOPIC:
$SOURCE

STEP 1 — RESEARCH. If the source is a URL, fetch it. Search for corroborating
primary sources. Gather the specific figures, names, and claims. Prefer primary
announcements and official docs over commentary.

STEP 2 — FACT-CHECK. Write $PROJ/01-script/facts.md as a table: every factual
claim you intend to use, the exact figure, the source URL, and VERIFIED or
UNVERIFIED. Cut every UNVERIFIED claim from the script — do not soften and keep it.

STEP 3 — WRITE. Follow this voice playbook exactly:

$(cat "$PLAYBOOK")

$( [ -n "$REFS" ] && printf 'Real transcript samples for voice reference:\n%s\n' "$REFS" )

Write $PROJ/01-script/script.md — a spoken script, 500-700 words, no headings, no
stage directions, no speaker labels. Just the words to be spoken. It must read like
speech, not an essay.

STEP 4 — CHUNK. Split the script into consecutive chunks of about $CHUNK_WORDS words
(~$CHUNK_SECONDS seconds of speech). Split only at sentence boundaries — never
mid-sentence. Write each chunk to $PROJ/01-script/chunks/NN.txt using zero-padded
two-digit numbering starting at 01. The chunks concatenated must exactly reproduce
script.md. This chunking is required because voice cloning drifts on long
generations, so each chunk is synthesized separately.

STEP 5 — VERIFY your own work before finishing:
  - facts.md exists and every script claim appears there as VERIFIED
  - script.md word count is 500-700
  - every chunk is <= $(( CHUNK_WORDS + 30 )) words
  - concatenating the chunks reproduces script.md
Fix anything that fails, then print a one-line summary.
EOF

log "running headless Claude (research + fact-check + write). This takes a few minutes."
claude_run "$PROMPT" "${VIDEO_SCRIPT_MODEL:-claude-opus-5}" \
  "Read,Write,Edit,Bash,Glob,Grep,WebSearch,WebFetch" >"$PROJ/state/01-claude.log" 2>&1
rc=$?
log "claude exited rc=$rc"

# ---- deterministic verification (never trust the agent's self-report) --------
fail=0
[ -s "$PROJ/01-script/script.md" ] || { log "ERROR: script.md missing/empty"; fail=1; }
[ -s "$PROJ/01-script/facts.md" ]  || { log "ERROR: facts.md missing/empty"; fail=1; }

nchunks=$(ls -1 "$PROJ/01-script/chunks/"*.txt 2>/dev/null | wc -l | tr -d '[:space:]')
[ "${nchunks:-0}" -ge 1 ] || { log "ERROR: no chunks produced"; fail=1; }

if [ "$fail" -eq 0 ]; then
  # --- merge a runt tail chunk -------------------------------------------------
  # The splitter often leaves a very short final chunk (e.g. the sign-off). That
  # costs a whole TTS request for a few words and tends to sound clipped, so fold
  # it into the previous chunk whenever the result still fits under the drift cap.
  # /bin/bash on macOS is 3.2 — no `mapfile`, no negative array subscripts.
  # Collect with a glob loop and index from the front instead.
  CH=()
  for f in "$PROJ/01-script/chunks/"*.txt; do [ -e "$f" ] && CH=("${CH[@]}" "$f"); done
  if [ "${#CH[@]}" -ge 2 ]; then
    n=${#CH[@]}
    last="${CH[$((n-1))]}"; prev="${CH[$((n-2))]}"
    lw=$(wc -w <"$last" | tr -d '[:space:]'); pw=$(wc -w <"$prev" | tr -d '[:space:]')
    if [ "$lw" -lt 40 ] && [ $(( lw + pw )) -le $(( CHUNK_WORDS + 30 )) ]; then
      printf '%s %s' "$(cat "$prev")" "$(cat "$last")" >"$prev.merged" \
        && mv -f "$prev.merged" "$prev" && rm -f "$last"
      log "merged $lw-word tail chunk into $(basename "$prev") (now $(( lw + pw )) words)"
      nchunks=$(ls -1 "$PROJ/01-script/chunks/"*.txt | wc -l | tr -d '[:space:]')
    fi
  fi

  words=$(wc -w <"$PROJ/01-script/script.md" | tr -d '[:space:]')
  log "script: $words words, $nchunks chunks"
  for f in "$PROJ/01-script/chunks/"*.txt; do
    w=$(wc -w <"$f" | tr -d '[:space:]')
    [ "$w" -gt $(( CHUNK_WORDS + 30 )) ] && log "WARN: $(basename "$f") is $w words — may drift during TTS"
  done

  # Chunks must losslessly reproduce the script — otherwise the rendered video
  # silently says something different from what was fact-checked.
  if ! diff -q \
      <(cat "$PROJ/01-script/chunks/"*.txt | tr -s '[:space:]' ' ' | sed 's/^ //;s/ $//') \
      <(tr -s '[:space:]' ' ' <"$PROJ/01-script/script.md" | sed 's/^ //;s/ $//') >/dev/null; then
    log "ERROR: chunks do not reproduce script.md — refusing to mark stage complete"
    exit 1
  fi
  log "chunk/script equivalence verified"

  # Only a real table row counts as an unverified claim. Matching the bare word
  # also hits the "claims CUT (unverified...)" heading, which means the opposite.
  if grep -qiE '^\|.*\bUNVERIFIED\b' "$PROJ/01-script/facts.md"; then
    log "WARN: facts.md still lists UNVERIFIED claims in the table — review before rendering"
  fi
  stage_mark 01
  log "stage 1 OK -> $PROJ/01-script/"
else
  log "stage 1 FAILED — see $PROJ/state/01-claude.log"
  exit 1
fi
