#!/bin/bash
# =============================================================================
# media-inbox-qc.sh — self-healing QC for the media-inbox pipeline.
# Run: media-inbox-qc.sh [--deep]
# Scheduled by com.jesse.mediainbox-qc.plist (light 2x/day, deep 1x/day).
# =============================================================================
set -uo pipefail
export HOME="~"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

source "$HOME/.claude/skills/pipeline-qc/scripts/qc-lib.sh"

SKILL="~/.claude/skills/media-inbox"
PROC="$SKILL/scripts/process-inbox.sh"
INBOX="$HOME/Library/Mobile Documents/com~apple~CloudDocs/AI-Inbox"
OUT="$HOME/JesseOS/vault/60-inbox/media"
STATE="$OUT/state"
FAILED="$OUT/failed"

# --- 1) the iCloud inbox must be genuinely LISTABLE (critical) ----------------
# Do NOT use `[ -r ]`/`[ -d ]` here: on a TCC-protected path both return true for
# a process without Full Disk Access, while `ls` fails EPERM and globs come back
# empty. Only an actual listing distinguishes "empty" from "forbidden". This is
# also why QC must be judged from its launchd run, not a manual one -- an
# interactive shell inherits the terminal's FDA grant and passes misleadingly.
probe_inbox() {
  local err
  [ -d "$INBOX" ] || { QC_DETAIL="inbox missing: $INBOX"; return 1; }
  err="$(ls "$INBOX" 2>&1 >/dev/null)"
  if [ -n "$err" ]; then
    QC_DETAIL="inbox NOT readable by this process (needs Full Disk Access): $err"
    return 1
  fi
  [ -w "$INBOX" ] || { QC_DETAIL="inbox not writable: $INBOX"; return 1; }
  QC_DETAIL="inbox present + listable"; return 0
}
repair_inbox() { mkdir -p "$INBOX" "$HOME/Library/Mobile Documents/com~apple~CloudDocs/AI-Transcripts" 2>/dev/null; }

# --- 2) iCloud sync daemon actually running (critical, else nothing arrives) --
probe_icloud() {
  if pgrep -qx bird || pgrep -q fileproviderd; then QC_DETAIL="iCloud daemon up"; return 0; fi
  QC_DETAIL="iCloud file provider not running"; return 1
}
repair_icloud() { launchctl kickstart -k "gui/$(id -u)/com.apple.bird" 2>/dev/null || true; sleep 5; }

# --- 3) CORE tooling: without these the phone->transcript path cannot work ----
probe_tools() {
  local missing=""
  for t in ffmpeg ffprobe whisper brctl; do
    command -v "$t" >/dev/null 2>&1 || missing="$missing $t"
  done
  QC_DETAIL="${missing:-all present}"
  [ -z "$missing" ]
}
repair_tools() {
  command -v ffmpeg  >/dev/null 2>&1 || brew install ffmpeg  >/dev/null 2>&1
  command -v whisper >/dev/null 2>&1 || brew install openai-whisper >/dev/null 2>&1
}

# --- 3b) OPTIONAL tooling: yt-dlp only powers the `--url` convenience path.
# Deliberately NOT critical -- a missing downloader must never block the main
# iCloud->transcript pipeline (it did, once; that's why this is split out).
probe_opt_tools() {
  if command -v yt-dlp >/dev/null 2>&1; then QC_DETAIL="yt-dlp present"; return 0; fi
  QC_DETAIL="yt-dlp missing — URL transcription unavailable (iCloud path unaffected)"
  return 1
}
repair_opt_tools() {
  # Prefer a self-contained binary in ~/.local/bin: Homebrew linking on this box
  # needs root for /usr/local/share/man, so avoid brew for this optional tool.
  local d="$HOME/.local/bin"
  mkdir -p "$d"
  curl -fsSL -o "$d/yt-dlp" \
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos" 2>/dev/null \
    && chmod +x "$d/yt-dlp"
}

# --- 4) whisper model weights cached (offline runs must not need network) -----
probe_model() {
  local m="${MEDIA_INBOX_MODEL:-base}"
  if [ -s "$HOME/.cache/whisper/$m.pt" ]; then QC_DETAIL="$m.pt cached"; return 0; fi
  QC_DETAIL="$m.pt missing from ~/.cache/whisper"; return 1
}
repair_model() {
  # Any transcribe call forces the weights to download; a tone is fine here since
  # we only care that the .pt lands, not what it says. Uses its own temp dir.
  local m="${MEDIA_INBOX_MODEL:-base}" d t
  d="$(mktemp -d /tmp/mediainbox-model.XXXXXX)"; t="$d/probe.wav"
  ffmpeg -nostdin -y -loglevel error -f lavfi -i "sine=frequency=440:duration=1" -ar 16000 -ac 1 "$t" 2>/dev/null
  whisper "$t" --model "$m" --device cpu --fp16 False --output_dir "$d" >/dev/null 2>&1
  rm -rf "$d" 2>/dev/null
}

# --- 5) end-to-end smoke test: synth audio -> real transcript (deep only) -----
# This is the stage that proves the whole chain works, not just that files exist.
probe_e2e() {
  # Keep the smoke file OUT of $OUT/work: the pipeline clears its own scratch dir
  # by slug, which previously deleted this very input before ffmpeg could read it.
  local d t res; d="$(mktemp -d /tmp/mediainbox-qc.XXXXXX)"; t="$d/qc_smoke.aiff"
  # Real synthesized SPEECH, not a tone: Whisper correctly returns no text for a
  # sine wave, which would make this probe false-fail forever.
  say -o "$t" "quick check that transcription still works" 2>/dev/null \
    || { QC_DETAIL="say(1) synth failed"; rm -rf "$d"; return 1; }
  res="$(bash "$PROC" --once "$t" 2>/dev/null | tail -1)"
  rm -rf "$d" 2>/dev/null
  if [ -n "$res" ] && [ -s "$res" ] && grep -qi 'transcription' "$res" 2>/dev/null; then
    QC_DETAIL="end-to-end OK (words verified)"; rm -f "$res" 2>/dev/null; return 0
  fi
  [ -n "$res" ] && rm -f "$res" 2>/dev/null
  QC_DETAIL="end-to-end transcribe produced no usable text"; return 1
}

# --- 6) the launchd watcher is loaded (critical: no agent = no processing) ----
# Exact-label lookup. Must NOT be `launchctl list | grep -q`: qc-lib runs with
# `set -o pipefail`, so grep -q's early exit gives launchctl a SIGPIPE and the
# pipeline returns 141 -- a false RED that would repair-loop forever. Exact match
# also matters because this label is a prefix of the two -qc labels.
launchctl_has() {
  local want="$1" pid st lbl
  while IFS=$'\t' read -r pid st lbl; do
    [ "$lbl" = "$want" ] && return 0
  done <<<"$(launchctl list 2>/dev/null)"
  return 1
}
probe_agent() {
  if launchctl_has com.jesse.mediainbox; then QC_DETAIL="watcher loaded"; return 0; fi
  QC_DETAIL="com.jesse.mediainbox not loaded"; return 1
}
repair_agent() {
  launchctl load -w "$HOME/Library/LaunchAgents/com.jesse.mediainbox.plist" 2>/dev/null || true
}

# --- 7) backlog: media sitting in the inbox too long => kick the processor ----
probe_backlog() {
  local n=0 now f mt
  now=$(date +%s)
  shopt -s nullglob
  for f in "$INBOX"/*; do
    [ -f "$f" ] || continue
    case "$(basename "$f")" in .DS_Store|*.md) continue;; esac
    mt=$(stat -f %m "$f" 2>/dev/null || echo "$now")
    [ $(( now - mt )) -gt 1800 ] && n=$((n+1))
  done
  QC_DETAIL="$n file(s) older than 30min still unprocessed"
  [ "$n" -eq 0 ]
}
repair_backlog() { nohup bash "$PROC" >>"$OUT/media-inbox.log" 2>&1 & }

# --- 8) anything parked in failed/ needs a human ------------------------------
probe_failed() {
  # NB: `grep -c .` exits 1 on zero matches, so a `|| echo 0` fallback emits a
  # SECOND "0" and $n becomes "0\n0", which blows up [ -eq ]. wc always exits 0.
  local n; n=$(ls -1 "$FAILED" 2>/dev/null | wc -l | tr -d '[:space:]')
  QC_DETAIL="${n:-0} permanently-failed file(s)"
  [ "${n:-0}" -eq 0 ]
}

# --- 9) disk hygiene: archived originals are big; prune >60d (soft) -----------
probe_disk() {
  local n; n=$(find "$OUT/originals" -type f -mtime +60 2>/dev/null | wc -l | tr -d '[:space:]')
  QC_DETAIL="${n:-0} archived original(s) older than 60d"
  [ "${n:-0}" -eq 0 ]
}
repair_disk() { find "$OUT/originals" -type f -mtime +60 -delete 2>/dev/null || true; }

# ============================== wire it up ===================================
qc_init --name "media-inbox" \
        --lockdir "$OUT/.qc.lockd" --logfile "$OUT/qc.log" \
        --heartbeat-maxgap 108000

# The iCloud drop folder is an OPTIONAL transport (see install.sh). Only grade it
# when it's actually switched on, otherwise these stages would sit red forever on
# a box that legitimately uses Google Drive links instead.
if [ -f "$STATE/icloud-enabled" ]; then
  qc_stage --name "Inbox folder"  --probe probe_inbox  --repair repair_inbox  --critical
  qc_stage --name "iCloud daemon" --probe probe_icloud --repair repair_icloud --critical
  qc_stage --name "Watcher agent" --probe probe_agent  --repair repair_agent
  qc_stage --name "Backlog"       --probe probe_backlog --repair repair_backlog --soft
fi
qc_stage --name "Core tooling"   --probe probe_tools     --repair repair_tools     --critical
qc_stage --name "URL tooling"    --probe probe_opt_tools --repair repair_opt_tools --soft
qc_stage --name "Whisper model"  --probe probe_model     --repair repair_model
qc_stage --name "End-to-end"     --probe probe_e2e     --deep
qc_stage --name "Failed items"   --probe probe_failed  --human-gate
qc_stage --name "Disk hygiene"   --probe probe_disk    --repair repair_disk    --soft

qc_run "$@"
