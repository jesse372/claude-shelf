#!/bin/bash
# =============================================================================
# ai-video-pipeline / lib/common.sh — shared paths, logging, credentials, gating.
# Sourced by every stage script. Never run directly.
# =============================================================================
export HOME="${HOME:-~}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SKILL_DIR="~/.claude/skills/ai-video-pipeline"
PROJECTS_DIR="$HOME/JesseOS/workspace/video-projects"

# Credential accessor: env var -> macOS Keychain. Keys never live in this repo.
# shellcheck source=/dev/null
[ -f "$HOME/.claude/skills/auth-framework/scripts/authlib.sh" ] \
  && source "$HOME/.claude/skills/auth-framework/scripts/authlib.sh"

# Logs go to STDERR on purpose: stage functions return paths/values on stdout,
# so anything chatty on stdout would be captured as part of the return value.
# (Learned the hard way in media-inbox — see that skill's Gotchas.)
log()  { printf '%s %s\n' "$(date '+%F %T')" "$*" >&2; [ -n "${PROJ_LOG:-}" ] && printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$PROJ_LOG"; }
die()  { log "FATAL: $*"; exit 1; }

# --- project layout ----------------------------------------------------------
# Every stage reads the previous stage's directory and writes only its own, so a
# stage can be re-run in isolation without redoing the expensive ones.
proj_init() {
  local slug="$1"
  PROJ="$PROJECTS_DIR/$slug"
  mkdir -p "$PROJ"/{00-source,01-script/chunks,02-audio,03-avatar,04-graphics,05-final,state}
  PROJ_LOG="$PROJ/pipeline.log"
  export PROJ PROJ_LOG
}

stage_done()    { [ -f "$PROJ/state/$1.done" ]; }
stage_mark()    { : >"$PROJ/state/$1.done"; }
stage_clear()   { rm -f "$PROJ/state/$1.done"; }

# --- credential gating -------------------------------------------------------
# A stage that needs a key it doesn't have must fail LOUDLY and say exactly how
# to fix it — never silently produce an empty artifact that later stages consume.
require_cred() {
  local name="$1" human="$2" v
  v="$(cred_get "$name" 2>/dev/null || true)"
  if [ -z "$v" ]; then
    log "MISSING CREDENTIAL: $name ($human)"
    log "  Add it once with:  security add-generic-password -s '$name' -a api -w"
    # NB: ${name^^} is bash 4+; /bin/bash here is 3.2.57, so uppercase via tr.
    log "  (or export AUTHFRAMEWORK_$(printf '%s' "$name" | tr '[:lower:]-' '[:upper:]_') in the environment)"
    return 1
  fi
  printf '%s' "$v"
}

# --- headless Claude --------------------------------------------------------
# The orchestrator brain. `claude -p` is already authenticated on this box, so
# no ANTHROPIC_API_KEY is required. Model default is claude-opus-5; the script
# stage overrides to a higher tier where writing quality actually shows.
claude_run() {
  local prompt_file="$1" model="${2:-claude-opus-5}" tools="${3:-Read,Write,Edit,Bash,Glob,Grep,WebSearch,WebFetch}"
  claude -p "$(cat "$prompt_file")" \
    --model "$model" \
    --allowedTools "$tools" \
    --output-format text 2>&1
}

# words-per-minute used to size TTS chunks. The single most important trick in
# the whole pipeline: ElevenLabs voice clones drift on long generations, so the
# script is cut into sub-minute pieces and each is generated separately.
WPM=150
CHUNK_SECONDS=55
CHUNK_WORDS=$(( WPM * CHUNK_SECONDS / 60 ))   # ~137 words
