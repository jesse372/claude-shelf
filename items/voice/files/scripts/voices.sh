#!/usr/bin/env bash
# List available edge-tts neural voices (filter with an arg, e.g. voices.sh en-GB).
set -u
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"
command -v edge-tts >/dev/null 2>&1 || { echo "edge-tts not installed"; exit 1; }
if [ -n "${1:-}" ]; then edge-tts --list-voices | grep -i "$1"; else edge-tts --list-voices; fi
