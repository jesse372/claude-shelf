#!/usr/bin/env bash
# Keep agent tooling current: Claude Code CLI, Codex CLI, Omnara. `--check` = dry report only.
#
# SAFETY: npm `@latest` has shipped builds that do not run on this box (Intel/macOS 14).
# On 2026-09-19, 2.1.277 broke every new session for hours. So we now:
#   1. track the `stable` dist-tag, not `latest`
#   2. VERIFY the CLI still starts after updating
#   3. roll back to the previous known-good version automatically if it does not
set -u
export PATH="/usr/local/bin:$HOME/.omnara/bin:$PATH"
cd /tmp || exit 1          # launchd can hand us a cwd that no longer exists -> npm EPERM uv_cwd
CHECK=false; [ "${1:-}" = "--check" ] && CHECK=true
log(){ echo "[update $(date '+%H:%M')] $*"; }
alert(){ log "!! $*"; command -v terminal-notifier >/dev/null 2>&1 && \
         terminal-notifier -title "JesseOS update" -message "$*" >/dev/null 2>&1; }

# --- generic: update a global npm CLI, verify it runs, roll back if not -------
update_cli(){                       # $1=label  $2=npm pkg  $3=binary  $4=dist-tag
  local label="$1" pkg="$2" bin="$3" tag="${4:-stable}" before after
  ver(){ "$1" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1; }
  before=$(ver "$bin")
  if ! npm i -g "${pkg}@${tag}" >/dev/null 2>&1; then
    alert "$label: npm install failed — left at ${before:-unknown}"; return 1
  fi
  after=$(ver "$bin")
  if [ -z "$after" ]; then
    alert "$label: ${tag} build does NOT run — rolling back to ${before:-none}"
    if [ -n "$before" ] && npm i -g "${pkg}@${before}" >/dev/null 2>&1 \
       && "$bin" --version >/dev/null 2>&1; then
      alert "$label: rolled back to $before OK"
    else
      alert "$label: ROLLBACK FAILED — $label is broken, needs a human"
    fi
    return 1
  fi
  [ "$before" = "$after" ] && log "$label: already $after" || log "$label updated $before -> $after"
}

if $CHECK; then
  log "claude-code: $(claude --version 2>/dev/null || echo not-installed)"
  log "codex: $(codex --version 2>/dev/null || echo '?')"
else
  update_cli "claude-code" "@anthropic-ai/claude-code" "claude" "stable"
  # 2026-10-22: an update left a broken binary ("unknown error (Unexpected)") and every new Omnara session
  # crashed on launch. Verify, and reinstall once if it doesn't run.
  if ! claude --version >/dev/null 2>&1; then
    log "claude-code BROKEN after update - reinstalling"
    npm install -g @anthropic-ai/claude-code@latest >/dev/null 2>&1
    claude --version >/dev/null 2>&1 && log "claude-code repaired: $(claude --version)" \
      || osascript -e 'display notification "Claude Code is broken after an update - new sessions will fail" with title "Updater" sound name "Basso"'
  fi
  command -v codex >/dev/null 2>&1 \
    && update_cli "codex" "@openai/codex" "codex" "latest" \
    || log "codex CLI not installed"
fi

# Omnara — never interrupt an active session
if $CHECK; then log "omnara: $($HOME/.omnara/bin/omnara --version 2>/dev/null || echo '?')"; else
  if pgrep -f "omnara daemon run-session" >/dev/null 2>&1; then log "omnara: active session — skipped"
  else log "omnara: self-updates via app/daemon"; fi
fi
log "done"
