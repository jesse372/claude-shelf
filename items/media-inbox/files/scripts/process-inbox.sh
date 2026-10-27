#!/bin/bash
# =============================================================================
# media-inbox / process-inbox.sh
#
# Watches an iCloud Drive folder ("AI-Inbox") that your iPhone can save into via
# the share sheet, then for every video/audio file that lands there:
#   1. materializes it locally (iCloud files arrive "dataless" on a headless Mac)
#   2. extracts 16kHz mono audio with ffmpeg
#   3. transcribes it offline with local Whisper
#   4. writes the transcript to the vault AND back into iCloud (so it's readable
#      on the phone), then archives the original out of iCloud to free space
#
# Usage:
#   process-inbox.sh                 # drain the inbox (what launchd runs)
#   process-inbox.sh --once <file>   # transcribe one arbitrary local file
#   process-inbox.sh --url <link>    # download + transcribe a URL
#
# Env overrides:
#   MEDIA_INBOX_MODEL=base|small|tiny   (default base — this box is a 4-core Intel i3)
#   MEDIA_INBOX_KEEP_IN_ICLOUD=1        keep originals in iCloud instead of archiving
# =============================================================================
set -uo pipefail
export HOME="${HOME:-~}"
# ~/.local/bin holds the standalone yt-dlp (Homebrew linking needs root on this box)
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

INBOX="$HOME/Library/Mobile Documents/com~apple~CloudDocs/AI-Inbox"
# Phone-readable transcripts live OUTSIDE the watched inbox on purpose: writing
# them inside it made every success retrigger the launchd WatchPaths watcher.
ICLOUD_TX="$HOME/Library/Mobile Documents/com~apple~CloudDocs/AI-Transcripts"
OUT="$HOME/JesseOS/vault/60-inbox/media"
TX="$OUT/transcripts"
ORIG="$OUT/originals"
WORK="$OUT/work"
STATE="$OUT/state"
FAILED="$OUT/failed"
LOG="$OUT/media-inbox.log"
LOCKDIR="$OUT/.inbox.lockd"

MODEL="${MEDIA_INBOX_MODEL:-base}"
MAX_FAILS=3
STABLE_AGE=20          # a file must be this many seconds old before we touch it
MATERIALIZE_TRIES=180  # x5s = up to 15 min for a big video to come down from iCloud

MEDIA_EXT="mov mp4 m4v avi mkv webm mpg mpeg 3gp mp3 m4a wav aac flac aiff aif caf ogg opus wma"
LINK_EXT="txt url webloc"

mkdir -p "$INBOX" "$ICLOUD_TX" "$TX" "$ORIG" "$WORK" "$STATE" "$FAILED" "$(dirname "$LOG")" 2>/dev/null

# NOTE: logs go to STDERR on purpose. transcribe() returns the transcript path on
# stdout via command substitution, so anything chatty on stdout would corrupt it.
log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LOG"; printf '%s\n' "$*" >&2; }

notify() {  # best-effort desktop/phone-visible ping; the log is the source of truth
  osascript -e "display notification \"$(printf '%s' "$2" | head -c 180 | tr '\n' ' ' | sed 's/"/\\"/g')\" with title \"media-inbox: $1\"" >/dev/null 2>&1 || true
}

# ---------------------------------------------------------------- locking -----
# mkdir is atomic. A stale lock (dead PID) is reclaimed so a crash can't wedge us.
acquire_lock() {
  local i
  for i in 1 2 3; do
    if mkdir "$LOCKDIR" 2>/dev/null; then echo $$ >"$LOCKDIR/pid"; return 0; fi
    local pid; pid="$(cat "$LOCKDIR/pid" 2>/dev/null)"
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
      log "reclaiming stale lock from dead pid $pid"; rm -rf "$LOCKDIR"; continue
    fi
    return 1
  done
  return 1
}
release_lock() { rm -rf "$LOCKDIR" 2>/dev/null; }

# ------------------------------------------------------- iCloud materializing -
# A dataless (cloud-only) file reports its full logical size via `stat %z` but
# almost no allocated blocks via `stat %b`. That's how we tell it's not here yet.
is_materialized() {
  local f="$1" logical physical
  [ -f "$f" ] || return 1
  logical=$(stat -f %z "$f" 2>/dev/null || echo 0)
  physical=$(( $(stat -f %b "$f" 2>/dev/null || echo 0) * 512 ))
  [ "$logical" -le 0 ] && return 1
  [ "$physical" -ge $(( logical / 2 )) ]
}

# iCloud placeholders can appear as ".Name.mov.icloud"; resolve to the real path.
real_path_of() {
  local f="$1" d b
  d="$(dirname "$f")"; b="$(basename "$f")"
  case "$b" in
    .*.icloud) b="${b#.}"; b="${b%.icloud}"; printf '%s/%s\n' "$d" "$b" ;;
    *)         printf '%s\n' "$f" ;;
  esac
}

materialize() {
  local f="$1" target i
  target="$(real_path_of "$f")"
  is_materialized "$target" && { printf '%s\n' "$target"; return 0; }
  log "  pulling down from iCloud: $(basename "$target")"
  brctl download "$f" >/dev/null 2>&1 || true
  for i in $(seq 1 "$MATERIALIZE_TRIES"); do
    sleep 5
    is_materialized "$target" && { printf '%s\n' "$target"; return 0; }
    # re-poke every ~minute; the file provider sometimes drops the first request
    [ $(( i % 12 )) -eq 0 ] && { brctl download "$f" >/dev/null 2>&1 || true; }
  done
  return 1
}

# ------------------------------------------------------------------ helpers ---
has_ext() {  # has_ext <file> <space-separated-ext-list>
  local e; e="$(printf '%s' "${1##*.}" | tr '[:upper:]' '[:lower:]')"
  case " $2 " in *" $e "*) return 0;; *) return 1;; esac
}

slug() { printf '%s' "$1" | tr -cs '[:alnum:]._-' '-' | sed 's/^-*//; s/-*$//' | cut -c1-80; }

# A file is "settled" if it's older than STABLE_AGE and its size didn't change
# across a short sample — otherwise iCloud may still be writing it.
is_settled() {
  local f="$1" now mt s1 s2
  now=$(date +%s); mt=$(stat -f %m "$f" 2>/dev/null || echo "$now")
  [ $(( now - mt )) -lt "$STABLE_AGE" ] && return 1
  s1=$(stat -f %z "$f" 2>/dev/null || echo 0)
  sleep 4
  s2=$(stat -f %z "$f" 2>/dev/null || echo 0)
  [ "$s1" = "$s2" ]
}

fail_count() { cat "$STATE/fails.$(slug "$1")" 2>/dev/null || echo 0; }
bump_fail()  { local k; k="$STATE/fails.$(slug "$1")"; echo $(( $(cat "$k" 2>/dev/null || echo 0) + 1 )) >"$k"; }
clear_fail() { rm -f "$STATE/fails.$(slug "$1")" 2>/dev/null; }

duration_of() {
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1" 2>/dev/null \
    | awk '{printf "%d:%02d", int($1/60), int($1%60)}'
}

# ---------------------------------------------------------------- transcribe --
# Emits the transcript path on stdout, or returns non-zero.
transcribe() {
  local src="$1" label="$2" s wav dur stamp txt out
  s="$(slug "${label%.*}")"; [ -z "$s" ] && s="media"
  wav="$WORK/$s.wav"

  # Clear stale scratch from a previous attempt -- but NEVER the source file, which
  # can legitimately live inside $WORK (e.g. the QC smoke test writes there).
  local old
  for old in "$WORK/$s".*; do
    [ -e "$old" ] || continue
    [ "$old" = "$src" ] && continue
    rm -f "$old" 2>/dev/null
  done
  if ! ffmpeg -nostdin -y -loglevel error -i "$src" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$wav" 2>>"$LOG"; then
    log "  ERROR: ffmpeg could not extract audio from $label"; return 1
  fi
  [ -s "$wav" ] || { log "  ERROR: extracted audio is empty for $label"; return 1; }

  dur="$(duration_of "$wav")"
  log "  transcribing ($dur, whisper=$MODEL) — this runs about real-time on this box"
  if ! whisper "$wav" --model "$MODEL" --device cpu --fp16 False \
        --output_format all --output_dir "$WORK" --verbose False >>"$LOG" 2>&1; then
    log "  ERROR: whisper failed on $label"; return 1
  fi
  txt="$WORK/$s.txt"
  [ -s "$txt" ] || { log "  ERROR: whisper produced no text for $label"; return 1; }

  stamp="$(date '+%Y-%m-%d_%H%M')"
  out="$TX/${stamp}_${s}.md"
  {
    printf '# %s\n\n' "$label"
    printf -- '- transcribed: %s\n' "$(date '+%F %T')"
    printf -- '- duration: %s\n' "$dur"
    printf -- '- whisper model: %s\n' "$MODEL"
    printf -- '- source: %s\n\n' "$src"
    printf -- '---\n\n'
    cat "$txt"
  } >"$out"

  # timestamped version alongside, for "what did it say at 3:20"
  [ -s "$WORK/$s.srt" ] && cp "$WORK/$s.srt" "$TX/${stamp}_${s}.srt" 2>/dev/null

  cp "$out" "$TX/LATEST.md" 2>/dev/null                 # easy handle for agents
  cp "$out" "$ICLOUD_TX/${stamp}_${s}.md" 2>/dev/null   # readable on the phone
  for old in "$WORK/$s".*; do
    [ -e "$old" ] || continue
    [ "$old" = "$src" ] && continue
    rm -f "$old" 2>/dev/null
  done
  printf '%s\n' "$out"
}

# ------------------------------------------------------------------ one file --
process_file() {
  local f="$1" label real out
  label="$(basename "$(real_path_of "$f")")"
  log "processing: $label"

  if ! real="$(materialize "$f")"; then
    bump_fail "$label"
    log "  iCloud never delivered $label (attempt $(fail_count "$label")/$MAX_FAILS)"
    [ "$(fail_count "$label")" -ge "$MAX_FAILS" ] && {
      notify "stuck" "$label never downloaded from iCloud"
      log "  ESCALATE: giving up on $label"; }
    return 1
  fi

  is_settled "$real" || { log "  still settling, will retry next run"; return 0; }

  if out="$(transcribe "$real" "$label")"; then
    log "  OK -> $out"
    if [ "${MEDIA_INBOX_KEEP_IN_ICLOUD:-0}" = "1" ]; then
      : # leave the original where it is
    else
      mv -f "$real" "$ORIG/$label" 2>/dev/null && log "  archived original -> $ORIG/$label"
    fi
    clear_fail "$label"
    notify "transcribed" "$label ($(wc -w <"$out" | tr -d ' ') words)"
    return 0
  fi

  bump_fail "$label"
  if [ "$(fail_count "$label")" -ge "$MAX_FAILS" ]; then
    mv -f "$real" "$FAILED/$label" 2>/dev/null
    log "  ESCALATE: $label failed ${MAX_FAILS}x -> $FAILED/"
    notify "failed" "$label could not be transcribed after $MAX_FAILS tries"
  fi
  return 1
}

looks_like_html() { head -c 1024 "$1" 2>/dev/null | grep -qi '<!doctype html\|<html'; }

# Pull the file id out of every Google Drive link shape people actually paste.
gdrive_id() {
  local u="$1" id=""
  case "$u" in
    *drive.google.com/file/d/*)   id="${u#*/file/d/}"; id="${id%%/*}" ;;
    *drive.google.com/*id=*|*drive.usercontent.google.com/*id=*)
                                  id="${u#*id=}";     id="${id%%&*}" ;;
  esac
  id="${id%%\?*}"
  printf '%s' "$id"
}

# Download a *link-shared* Drive file. Anything non-trivial in size gets an HTML
# "can't scan for viruses" interstitial instead of the bytes, so we detect that
# and resubmit the form's uuid token rather than silently saving the HTML page.
download_gdrive() {
  local id="$1" out="$2" cj hdr uuid base
  cj="$(mktemp /tmp/gdcookie.XXXXXX)"; hdr="$(mktemp /tmp/gdhdr.XXXXXX)"
  base="https://drive.usercontent.google.com/download?id=$id&export=download"

  curl -sL --retry 3 --retry-delay 2 --max-time 7200 \
       -c "$cj" -b "$cj" -D "$hdr" -o "$out" "$base&confirm=t" 2>/dev/null

  if looks_like_html "$out"; then
    uuid="$(sed -n 's/.*name="uuid" value="\([^"]*\)".*/\1/p' "$out" | head -1)"
    if [ -n "$uuid" ]; then
      log "  clearing Drive scan interstitial"
      curl -sL --retry 3 --retry-delay 2 --max-time 7200 \
           -c "$cj" -b "$cj" -D "$hdr" -o "$out" "$base&confirm=t&uuid=$uuid" 2>/dev/null
    fi
  fi

  # Recover the real filename from Content-Disposition for a nicer transcript title.
  GDRIVE_NAME="$(sed -n 's/.*filename="\([^"]*\)".*/\1/p' "$hdr" | tail -1)"
  rm -f "$cj" "$hdr" 2>/dev/null

  if [ ! -s "$out" ] || looks_like_html "$out"; then return 1; fi
  return 0
}

process_url() {
  local url="$1" d dl id label rc
  d="$(mktemp -d /tmp/mediainbox-url.XXXXXX)"
  log "downloading: $url"

  case "$url" in
    *drive.google.com/drive/folders/*)
      log "  ERROR: that's a Drive FOLDER link — please share the single video file"
      rm -rf "$d"; return 1 ;;
  esac

  id="$(gdrive_id "$url")"
  if [ -n "$id" ]; then
    dl="$d/gdrive.bin"; GDRIVE_NAME=""
    if ! download_gdrive "$id" "$dl"; then
      log "  ERROR: Drive download failed. Is the link set to 'Anyone with the link'?"
      rm -rf "$d"; return 1
    fi
    label="${GDRIVE_NAME:-gdrive-$id}"
  else
    if ! yt-dlp -q --no-playlist -f 'ba/b' -o "$d/dl.%(ext)s" "$url" >>"$LOG" 2>&1; then
      log "  ERROR: yt-dlp failed for $url"; rm -rf "$d"; return 1
    fi
    dl="$(ls -t "$d"/dl.* 2>/dev/null | head -1)"
    [ -n "$dl" ] || { log "  ERROR: nothing downloaded"; rm -rf "$d"; return 1; }
    label="$(basename "$dl")"
  fi

  # Confirm we actually got media before spending CPU on it.
  if ! ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$dl" >/dev/null 2>&1; then
    log "  ERROR: downloaded file is not playable media ($(du -h "$dl" | cut -f1))"
    rm -rf "$d"; return 1
  fi

  log "  got: $label ($(du -h "$dl" | cut -f1))"
  transcribe "$dl" "$label"; rc=$?
  rm -rf "$d" 2>/dev/null
  return $rc
}

# --------------------------------------------------------------------- main ---
case "${1:-}" in
  --once) [ -f "${2:-}" ] || { echo "usage: $0 --once <file>" >&2; exit 2; }
          transcribe "$2" "$(basename "$2")"; exit $? ;;
  --url)  [ -n "${2:-}" ] || { echo "usage: $0 --url <link>" >&2; exit 2; }
          process_url "$2"; exit $? ;;
esac

acquire_lock || { log "another run is active — exiting"; exit 0; }
trap release_lock EXIT INT TERM

# --- TCC guard: this MUST come before the glob ------------------------------
# ~/Library/Mobile Documents is a TCC-protected path. A plain LaunchAgent has no
# Full Disk Access, so `ls` fails with EPERM while `[ -r ]` still reports true and
# the glob quietly yields ZERO entries -- i.e. the pipeline would log "inbox empty"
# forever and look perfectly healthy while never processing a thing. Fail loudly.
lserr="$(ls "$INBOX" 2>&1 >/dev/null)"
if [ -n "$lserr" ]; then
  printf 'blocked\n' >"$STATE/tcc-blocked"
  log "FATAL: cannot read the inbox — $lserr"
  log "       This process lacks Full Disk Access. See SKILL.md 'Full Disk Access'."
  notify "blocked" "Cannot read AI-Inbox: needs Full Disk Access"
  exit 1
fi
rm -f "$STATE/tcc-blocked" 2>/dev/null

shopt -s nullglob dotglob
found=0; failures=0
for f in "$INBOX"/*; do
  [ -f "$f" ] || continue
  base="$(basename "$f")"
  # README.txt is ours and .txt is a link-handler extension, so skip it explicitly.
  case "$base" in .DS_Store|README.txt|LATEST.md|.*.md) continue;; esac

  if has_ext "$(real_path_of "$f")" "$MEDIA_EXT"; then
    found=$((found+1)); process_file "$f" || failures=$((failures+1))
  elif has_ext "$base" "$LINK_EXT"; then
    # a text file whose contents are a link (share sheet -> "Save to Files")
    url="$(grep -oE 'https?://[^[:space:]"<>]+' "$f" 2>/dev/null | head -1)"
    if [ -n "$url" ]; then
      found=$((found+1))
      if process_url "$url"; then mv -f "$f" "$ORIG/$base" 2>/dev/null
      else failures=$((failures+1)); fi
    fi
  fi
done

[ "$found" -eq 0 ] && log "inbox empty — nothing to do"
printf '%s\n' "$(date +%s)" >"$STATE/last-run"
exit 0
