#!/bin/bash
# authlib.sh — generic headless credential accessor.
#
# A tiny abstraction so any automation can fetch a secret non-interactively, the same way
# everywhere, without hard-coding which secret store you use. Out of the box it reads from:
#   1. an environment variable                (fastest; good for CI / launchd EnvironmentVariables)
#   2. the macOS Keychain                      (`security find-generic-password`, no GUI prompt)
#   3. a 0600 file under the credential dir    (last-resort fallback)
#
# WIRE YOUR OWN SECRET STORE: if you use a password manager / vault CLI (1Password `op`,
# Bitwarden `bw`, `pass`, Vault, AWS/GCP secrets, etc.), implement it inside `cred_fetch` below
# at the marked spot — everything else (timeouts, locking, the keepalive engine) stays the same.
#
# Provides:
#   cred_ensure_session            -> hook to (re)establish your store's session; no-op by default
#   cred_get  <name> [field]       -> prints a secret value to stdout (empty + nonzero if missing)
#
# Install to:  ~/.claude/skills/auth-framework/scripts/authlib.sh
# Source it:   source ~/.claude/skills/auth-framework/scripts/authlib.sh

AF_DIR="${AF_DIR:-$HOME/.authframework}"
AF_LOCK="$AF_DIR/.session.lock"
AF_FILE_DIR="${AF_FILE_DIR:-$AF_DIR/secrets}"   # optional 0600 file fallback: $AF_FILE_DIR/<name>
CRED_TIMEOUT="${CRED_TIMEOUT:-30}"
mkdir -p "$AF_DIR" 2>/dev/null

# launchd runs with a bare PATH. Defensively add common bin dirs so consumers work under launchd.
case ":$PATH:" in
  *":/usr/local/bin:"*) ;;
  *) export PATH="/usr/local/bin:$HOME/.local/bin:/opt/homebrew/bin:$PATH";;
esac

# ---- env-var name mangling (NAME[/FIELD] -> AUTHFRAMEWORK_<NAME>_<FIELD>) -------------------
_cred_envname() {
  # NOTE: these MUST be separate statements. `local n="$1" key="$n"` leaves key
  # EMPTY in both bash and zsh — a variable can't be self-referenced within one
  # `local`. That bug made this return a bare "AUTHFRAMEWORK_", which killed the
  # env-var override path entirely and threw `bad substitution` under zsh
  # (aborting cred_get before it ever reached the Keychain).
  local n="$1"
  local f="${2:-}"
  local key="$n"
  [ -n "$f" ] && key="${n}_${f}"
  # uppercase, non-alnum -> underscore
  key="$(printf '%s' "$key" | tr '[:lower:]' '[:upper:]' | tr -c 'A-Z0-9' '_')"
  printf 'AUTHFRAMEWORK_%s' "$key"
}

# ---- session hook --------------------------------------------------------------------------
# Default: no session to maintain (Keychain/env need none). If your vault CLI must "unlock" or
# "sign in" headlessly (e.g. via a stored token), do it here and return 0 on success.
cred_ensure_session() {
  # --- WIRE YOUR OWN STORE HERE (optional) -------------------------------------------------
  # Example (1Password):  op signin --account my.1password.com --raw >/dev/null 2>&1 || return 1
  # Example (Bitwarden):  bw unlock --passwordenv BW_PASSWORD --raw >/dev/null 2>&1 || return 1
  # ----------------------------------------------------------------------------------------
  return 0
}

# ---- the accessor --------------------------------------------------------------------------
# cred_get <name> [field]
#   1) $AUTHFRAMEWORK_<NAME>[_<FIELD>]  env var
#   2) macOS Keychain generic password: service=<name> [account=<field>]
#   3) 0600 file  $AF_FILE_DIR/<name>[.<field>]
# `timeout` is GNU coreutils and is NOT present on stock macOS (nor is `gtimeout`
# unless coreutils is brewed). Calling it directly made every Keychain lookup
# below return EMPTY for keys that exist — a silent auth failure that looks
# identical to "credential not configured". Shim it: use a real timeout binary
# when one exists, otherwise run the command unwrapped.
_cred_timeout() {
  local secs="$1"; shift
  if command -v timeout  >/dev/null 2>&1; then timeout  "$secs" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then gtimeout "$secs" "$@"
  else "$@"; fi
}

cred_get() {
  local name="$1" field="${2:-}"

  # 1) environment variable
  local ev; ev="$(_cred_envname "$name" "$field")"
  # Read $ev indirectly. `${!ev}` is a bash-ism that zsh does not support (and
  # zsh's `${(P)ev}` is a parse error in bash), so neither literal form can live
  # here if this file is ever sourced from zsh -- which it can be, since the
  # login shell on this box is zsh. `eval` is the portable middle ground and is
  # safe because _cred_envname has already sanitised $ev down to [A-Z0-9_].
  local ev_val; ev_val="$(eval "printf '%s' \"\${${ev}:-}\"" 2>/dev/null)"
  if [ -n "$ev_val" ]; then printf '%s' "$ev_val"; return 0; fi

  cred_ensure_session || true

  # 2) macOS Keychain (non-interactive; -w prints just the secret)
  if command -v security >/dev/null 2>&1; then
    local v
    if [ -n "$field" ]; then
      v="$(_cred_timeout 10 security find-generic-password -s "$name" -a "$field" -w 2>/dev/null)"
    else
      v="$(_cred_timeout 10 security find-generic-password -s "$name" -w 2>/dev/null)"
    fi
    [ -n "$v" ] && { printf '%s' "$v"; return 0; }
  fi

  # --- WIRE YOUR OWN STORE HERE (optional) -------------------------------------------------
  # Example (pass):     v="$(pass show "$name" 2>/dev/null | head -1)"; [ -n "$v" ] && { printf '%s' "$v"; return 0; }
  # Example (1Password):v="$(op read "op://Vault/$name/${field:-password}" 2>/dev/null)"; [ -n "$v" ] && { printf '%s' "$v"; return 0; }
  # ----------------------------------------------------------------------------------------

  # 3) 0600 file fallback
  local ff="$AF_FILE_DIR/$name"; [ -n "$field" ] && ff="$AF_FILE_DIR/$name.$field"
  [ -s "$ff" ] && { cat "$ff"; return 0; }

  echo "authlib: secret not found: $name${field:+/$field}" >&2
  return 1
}

# Allow CLI use:  authlib.sh get <name> [field]   |   authlib.sh ensure
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
    ensure) cred_ensure_session && echo "session: ok" || echo "session: FAILED";;
    get)    shift; cred_get "$@";;
    *) echo "usage: authlib.sh {ensure | get <name> [field]}";;
  esac
fi
