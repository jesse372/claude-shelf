#!/bin/bash
# ads.sh — entrypoint for the meta-ads skill.
# Pulls the Meta token + ad account id via the shared auth-framework accessor,
# then hands off to metaads.py. Reads are free; writes only ever produce a plan.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTHLIB="~/.claude/skills/auth-framework/scripts/authlib.sh"

# launchd/cron get a bare PATH; make sure python3 is reachable.
case ":$PATH:" in
  *":/usr/local/bin:"*) ;;
  *) export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:$PATH";;
esac

if [ -f "$AUTHLIB" ]; then
  # shellcheck disable=SC1090
  source "$AUTHLIB"
  [ -z "${META_ACCESS_TOKEN:-}" ] && META_ACCESS_TOKEN="$(cred_get meta-ads token 2>/dev/null || true)"
  [ -z "${META_AD_ACCOUNT:-}"  ] && META_AD_ACCOUNT="$(cred_get meta-ads account 2>/dev/null || true)"
fi
export META_ACCESS_TOKEN="${META_ACCESS_TOKEN:-}"
export META_AD_ACCOUNT="${META_AD_ACCOUNT:-}"

exec python3 "$HERE/metaads.py" "$@"
