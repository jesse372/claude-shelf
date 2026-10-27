#!/bin/bash
# =============================================================================
# fetch-transcripts.sh — pull auto-captions from Jesse's own YouTube channel and
# store them as plain-text voice samples for the script stage.
#
#   fetch-transcripts.sh                     # default channel, 12 most recent
#   fetch-transcripts.sh <channel-url> [N]
#
# Output: reference/transcripts/<id>.txt  (+ titles.tsv for context)
# Re-runnable: already-downloaded videos are skipped.
# =============================================================================
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

CHANNEL="${1:-https://www.youtube.com/@caughtfkall/videos}"
COUNT="${2:-12}"
OUT="$SKILL_DIR/reference/transcripts"
WORK="$(mktemp -d /tmp/yt-subs.XXXXXX)"
mkdir -p "$OUT"
trap 'rm -rf "$WORK"' EXIT

command -v yt-dlp >/dev/null 2>&1 || die "yt-dlp not installed"

log "listing $COUNT most recent videos from $CHANNEL"
# NB: yt-dlp --print does NOT interpret escape sequences — "%(id)s\t%(title)s"
# emits a LITERAL backslash-t, so IFS=$'\t' never splits and $id ends up holding
# the whole line (producing a malformed watch URL and "no captions" for every
# video). Use a literal delimiter string instead; those pass through fine.
yt-dlp --flat-playlist --no-warnings --print "%(id)s@@@%(title)s" \
       "$CHANNEL" -I "1:$COUNT" >"$WORK/list.raw" 2>"$WORK/list.err" \
  || die "could not list channel — see $WORK/list.err"
# normalise to a real TSV
awk -F'@@@' 'NF>=1 && $1!="" { id=$1; t=$0; sub(/^[^@]*@@@/,"",t); printf "%s\t%s\n", id, t }' \
  "$WORK/list.raw" >"$WORK/list.tsv"

n=$(wc -l <"$WORK/list.tsv" | tr -d '[:space:]')
[ "${n:-0}" -ge 1 ] || die "no videos found for $CHANNEL"
log "found $n videos"
cp "$WORK/list.tsv" "$OUT/titles.tsv"

got=0; skipped=0; failed=0
while IFS=$'\t' read -r id title; do
  [ -n "$id" ] || continue
  if [ -s "$OUT/$id.txt" ]; then skipped=$((skipped+1)); continue; fi

  # Auto-captions only (no media download). YouTube auto-generates captions in
  # ~every language for these videos; we want the ORIGINAL English track, not a
  # machine translation of it, so prefer en-orig and fall back to plain en.
  yt-dlp --skip-download --write-auto-subs --sub-langs "en-orig,en" --convert-subs srt \
         --no-warnings -o "$WORK/%(id)s.%(ext)s" \
         "https://www.youtube.com/watch?v=$id" >>"$WORK/dl.log" 2>&1

  srt=""
  for cand in "$WORK/$id.en-orig.srt" "$WORK/$id.en.srt"; do
    [ -s "$cand" ] && { srt="$cand"; break; }
  done
  [ -z "$srt" ] && srt="$(ls -1 "$WORK/$id".*.srt 2>/dev/null | head -1)"
  if [ -z "$srt" ] || [ ! -s "$srt" ]; then
    log "  no captions: $id ($title)"; failed=$((failed+1)); continue
  fi

  # SRT -> prose: drop index lines, timestamps, tags; collapse the duplicate
  # rolling lines auto-captions emit; keep it as flowing speech.
  awk '
    /^[0-9]+$/            { next }
    /-->/                 { next }
    /^[[:space:]]*$/      { next }
    { gsub(/<[^>]*>/, ""); gsub(/\r/, "");
      if ($0 != prev) { printf "%s ", $0; prev = $0 } }
  ' "$srt" | tr -s ' ' > "$OUT/$id.txt"

  if [ -s "$OUT/$id.txt" ]; then
    log "  got $(wc -w <"$OUT/$id.txt" | tr -d '[:space:]') words: $title"
    got=$((got+1))
  else
    rm -f "$OUT/$id.txt"; failed=$((failed+1))
  fi
done <"$WORK/list.tsv"

total=$(cat "$OUT"/*.txt 2>/dev/null | wc -w | tr -d '[:space:]')
log "transcripts: $got new, $skipped already had, $failed without captions"
log "corpus now: ${total:-0} words in $OUT"
[ "${got:-0}" -gt 0 ] || [ "${skipped:-0}" -gt 0 ] || die "no transcripts obtained"
