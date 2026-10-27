#!/bin/bash
# square.sh — entrypoint for the `square` skill.
# Pulls the Square access token via the shared auth-framework accessor, then hands off
# to squarecat.py. Reads are free; writes only ever produce a plan.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTHLIB="~/.claude/skills/auth-framework/scripts/authlib.sh"

# launchd/cron get a bare PATH; make sure python3 is reachable.
case ":$PATH:" in
  *":/usr/local/bin:"*) ;;
  *) export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH";;
esac

# --- one-time token install ------------------------------------------------------------
# Stored in the macOS Keychain (no GUI prompt on read), which authlib checks after env vars.
if [ "${1:-}" = "install-token" ]; then
  TOK="${2:-}"
  if [ -z "$TOK" ]; then echo "usage: square.sh install-token '<ACCESS_TOKEN>'" >&2; exit 2; fi
  security add-generic-password -U -s square -a token -w "$TOK"
  echo "Stored in Keychain as service 'square', account 'token'."
  echo "Verify with: square.sh doctor"
  exit 0
fi

if [ -f "$AUTHLIB" ]; then
  # shellcheck disable=SC1090
  source "$AUTHLIB"
  [ -z "${SQUARE_ACCESS_TOKEN:-}" ] && SQUARE_ACCESS_TOKEN="$(cred_get square token 2>/dev/null || true)"
fi
export SQUARE_ACCESS_TOKEN="${SQUARE_ACCESS_TOKEN:-}"

exec python3 "$HERE/squarecat.py" "$@"
