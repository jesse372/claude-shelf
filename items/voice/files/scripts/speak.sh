#!/usr/bin/env bash
# TTS: speak text aloud. Primary edge-tts (free MS neural voices), fallback macOS `say`.
set -u
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"
TEXT="${1:-}"; VOICE="${2:-en-US-AriaNeural}"
[ -z "$TEXT" ] && { echo "usage: speak.sh \"text\" [voice]"; exit 1; }
OUT="$(mktemp -t voice).mp3"
if command -v edge-tts >/dev/null 2>&1; then
  if edge-tts --voice "$VOICE" --text "$TEXT" --write-media "$OUT" >/dev/null 2>&1 && [ -s "$OUT" ]; then
    afplay "$OUT"; rm -f "$OUT"; exit 0
  fi
fi
echo "(edge-tts unavailable/offline — using macOS say)" >&2
say "$TEXT"; rm -f "$OUT" 2>/dev/null; exit 0
