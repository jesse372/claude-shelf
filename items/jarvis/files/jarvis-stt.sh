#!/bin/bash
# JARVIS STT: audio file -> text via whisper.cpp (fast + accurate on this Intel Mini).
# Usage: jarvis-stt.sh <audiofile>
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
DIR="$(cd "$(dirname "$0")" && pwd)"
BIN="$DIR/whisper.cpp/build/bin/whisper-cli"
MODEL="$DIR/models/ggml-base.en.bin"
[ -x "$BIN" ] && [ -f "$MODEL" ] || { echo "whisper.cpp not ready" >&2; exit 2; }
WAV="$(mktemp -t jarvisstt).wav"
trap 'rm -f "$WAV"' EXIT
# speechnorm: normalize quiet/distant speech so whisper hears it clearly
ffmpeg -y -i "$1" -ar 16000 -ac 1 -af "highpass=f=80,speechnorm=e=12.5:r=0.0001:l=1" -c:a pcm_s16le "$WAV" >/dev/null 2>&1
# -ng: CPU only — Metal on this Intel iGPU produces garbage output
"$BIN" -m "$MODEL" -f "$WAV" -nt -np -ng -t 4 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | tr '\n' ' ' || true
