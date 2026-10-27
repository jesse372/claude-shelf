#!/usr/bin/env bash
# STT: transcribe an audio file to text with local Whisper. Prints transcript to stdout.
set -u
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"
F="${1:-}"; MODEL="${2:-base}"
[ -z "$F" ] && { echo "usage: transcribe.sh <audio-file> [tiny|base|small]"; exit 1; }
[ -f "$F" ] || { echo "no such file: $F" >&2; exit 1; }
TMP="$(mktemp -d)"
whisper "$F" --model "$MODEL" --output_format txt --output_dir "$TMP" --language en >/dev/null 2>&1
cat "$TMP"/*.txt 2>/dev/null
rm -rf "$TMP"
