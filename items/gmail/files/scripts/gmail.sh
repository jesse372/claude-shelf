#!/bin/bash
# gmail.sh — entrypoint for the gmail skill (shared by Claude Code and Codex).
#
# Thin wrapper over gmail.py. Exists so that (a) launchd/cron get a sane PATH and can
# actually find `uv`, and (b) callers have one stable path to memorize.
#
# Usage:
#   gmail.sh install-client ~/Downloads/client_secret_*.json
#   gmail.sh auth
#   gmail.sh whoami
#   gmail.sh search "from:stripe newer_than:7d" -n 20
#   gmail.sh read <message-id>
#   gmail.sh draft --to a@b.com --subject "Hi" --body -   < body.txt
#   gmail.sh show-draft <draft-id>
#   gmail.sh send <draft-id> --confirm
#   gmail.sh token-status

set -uo pipefail

# launchd hands us a bare PATH; uv lives in a Homebrew/local bin.
case ":$PATH:" in
  *":/opt/homebrew/bin:"*) ;;
  *) export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH";;
esac

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v uv >/dev/null 2>&1; then
  echo "gmail.sh: 'uv' not found on PATH. Install it: brew install uv" >&2
  exit 127
fi

exec uv run --quiet --script "$SELF_DIR/gmail.py" "$@"
