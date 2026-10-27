#!/usr/bin/env bash
# Record default mic for N seconds, then transcribe. Needs macOS mic permission for the terminal/Omnara.
set -u
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"
SECS="${1:-6}"; MODEL="${2:-base}"
WAV="$(mktemp -t dictate).wav"
echo "(recording ${SECS}s from default mic...)" >&2
ffmpeg -nostdin -hide_banner -loglevel error -f avfoundation -i ":0" -t "$SECS" -ar 16000 -ac 1 "$WAV" 2>/dev/null \
  || { echo "mic capture failed — check Microphone permission (System Settings > Privacy & Security > Microphone)" >&2; rm -f "$WAV"; exit 1; }
"$(dirname "$0")/transcribe.sh" "$WAV" "$MODEL"
rm -f "$WAV"
