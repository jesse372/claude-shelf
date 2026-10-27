#!/bin/bash
# =============================================================================
# derive-voice.sh — analyse the real transcripts in reference/transcripts/ and
# write templates/voice-playbook.md: the style rules the script stage writes to.
#
# Run this after fetch-transcripts.sh, and again whenever you add videos.
# The playbook is DERIVED style guidance (rhythm, structure, habits, vocabulary
# register) — not stored transcript text.
# =============================================================================
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

REF="$SKILL_DIR/reference/transcripts"
PLAYBOOK="$SKILL_DIR/templates/voice-playbook.md"

compgen -G "$REF/*.txt" >/dev/null 2>&1 || die "no transcripts in $REF — run fetch-transcripts.sh first"

words=$(cat "$REF"/*.txt | wc -w | tr -d '[:space:]')
files=$(ls -1 "$REF"/*.txt | wc -l | tr -d '[:space:]')
log "deriving voice playbook from $files transcripts / $words words"
[ "${words:-0}" -ge 2000 ] || log "WARN: thin corpus (<2000 words) — playbook will be a rough guess"

PROMPT="$(mktemp /tmp/derive-voice.XXXXXX)"
trap 'rm -f "$PROMPT"' EXIT

{
  cat <<'EOF'
You are building a VOICE PLAYBOOK for a YouTube creator, from transcripts of his
own videos. It will be used to write future scripts that sound like him.

Write the playbook to this exact path (overwrite it):
  PLAYBOOK_PATH_PLACEHOLDER

Read every transcript in:
  REF_PATH_PLACEHOLDER
(and titles.tsv there for the kinds of videos he makes)

Produce DERIVED STYLE RULES — not transcript text. Do not paste passages. Short
illustrative fragments (a few words) are fine only where a rule needs one.

Cover, in Markdown with these headings:

## Who he is / what the channel is
Two or three lines: subject matter, format, typical length, who he's talking to.

## Structure
How he opens (his actual pattern, not a generic one), how the middle flows, how he
closes. Note whether videos are scripted or loose.

## Sentence rhythm and speech habits
Sentence length and variety. Recurring connectives and sentence-openers. Filler and
verbal tics that are part of his voice and should be KEPT. Contractions. Tense.

## Vocabulary and register
Formality level. Regional/Australian usage. Slang he actually uses. Technical terms
he uses and whether he explains them.

## Humour and attitude
How he handles things going wrong (this matters — note the self-deprecating pattern
if present), how he talks about failure, his relationship with the audience.

## What he never does
Concrete prohibitions inferred from the transcripts — registers, phrasings, and
intro/outro clichés absent from his actual speech.

## Writing for him: hard rules
A short checklist a script must satisfy to sound like him.

Be specific and evidence-based. If the corpus is too thin to support a claim, say so
rather than inventing it. Base every rule on what is actually in the transcripts.
EOF
} | sed -e "s#PLAYBOOK_PATH_PLACEHOLDER#$PLAYBOOK#" -e "s#REF_PATH_PLACEHOLDER#$REF#" >"$PROMPT"

claude_run "$PROMPT" "${VIDEO_VOICE_MODEL:-claude-opus-5}" "Read,Write,Glob,Grep,Bash" \
  >"$SKILL_DIR/reference/derive-voice.log" 2>&1
log "claude exited rc=$?"

[ -s "$PLAYBOOK" ] || die "playbook not written — see $SKILL_DIR/reference/derive-voice.log"
pw=$(wc -w <"$PLAYBOOK" | tr -d '[:space:]')
[ "${pw:-0}" -ge 150 ] || die "playbook suspiciously short ($pw words) — check the log"

for h in "## Structure" "## Sentence rhythm" "## What he never does"; do
  grep -q "$h" "$PLAYBOOK" || log "WARN: playbook missing section: $h"
done
log "voice playbook OK ($pw words) -> $PLAYBOOK"
