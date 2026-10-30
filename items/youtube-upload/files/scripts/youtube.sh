#!/bin/bash
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Cheap local planning/inspection works without downloading dependencies or network access.
COMMAND="${1:---help}"
if [ "$COMMAND" = --profile ]; then COMMAND="${3:---help}"; fi
case "$COMMAND" in
  --help|-h|plan|install-client) exec python3 "$SELF_DIR/youtube.py" "$@" ;;
  health|status)
    case " $* " in *' --live '*) ;; *) exec python3 "$SELF_DIR/youtube.py" "$@" ;; esac ;;
esac
if [ -d /Volumes/LaCie ]; then
  export UV_CACHE_DIR="${UV_CACHE_DIR:-/Volumes/LaCie/VideoEdits/cache/uv-youtube}"
  export UV_PYTHON_INSTALL_DIR="${UV_PYTHON_INSTALL_DIR:-/Volumes/LaCie/VideoEdits/cache/uv-python}"
  export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/Volumes/LaCie/VideoEdits/cache}"
  export TMPDIR="/Volumes/LaCie/VideoEdits/tmp"
  mkdir -p "$TMPDIR"
elif [ -z "${UV_CACHE_DIR:-}" ] || [ -z "${UV_PYTHON_INSTALL_DIR:-}" ] || [ -z "${TMPDIR:-}" ]; then
  echo 'youtube: Mount LaCie, or explicitly set UV_CACHE_DIR, UV_PYTHON_INSTALL_DIR and TMPDIR to an external drive before live use.' >&2
  exit 1
fi
if [ -n "${YOUTUBE_PYTHON:-}" ]; then
  exec "$YOUTUBE_PYTHON" "$SELF_DIR/youtube.py" "$@"
elif [ -x /Volumes/LaCie/VideoEdits/cache/youtube-runtime/bin/python ]; then
  exec /Volumes/LaCie/VideoEdits/cache/youtube-runtime/bin/python "$SELF_DIR/youtube.py" "$@"
fi
# Do not silently compile a large toolchain if a wheel is unavailable on this Mac.
exec uv run --quiet --no-build --script "$SELF_DIR/youtube.py" "$@"
