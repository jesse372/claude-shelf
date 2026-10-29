#!/usr/bin/env bash
# Check Claude Code / Codex / Omnara auth health. Writes status JSON; notifies on problems.
# NOTE: runs in the GUI login session (via LaunchAgent) where the login keychain is unlocked.
set -u
: "${USER:=$(id -un)}"  # launchd may not set USER; guard set -u
export PATH="$HOME/.local/bin:/usr/local/bin:$HOME/.omnara/bin:$PATH"
STATUS="$HOME/JesseOS/workspace/security/auth-status.json"
problems=()
# Credential presence alone is insufficient: expired/cleared tokens remain in Keychain.
if python3 "~/.claude/skills/auth-framework/scripts/claude_auth_health.py" >/dev/null 2>&1; then
  claude_ok=true; else claude_ok=false; problems+=("Claude Code: check auth; renew with claude auth login --claudeai"); fi
# Codex (auth file)
if [ -f "$HOME/.codex/auth.json" ] || codex login status >/dev/null 2>&1; then
  codex_ok=true; else codex_ok=false; problems+=("Codex: sign in"); fi
# Omnara (PAT) — skipped once Omnara is retired (service ends 2026-11-10; Claude Remote Control replaces it)
if [ ! -f "$HOME/Library/LaunchAgents/com.omnara.daemon.plist" ]; then omnara_ok='"retired"'
elif "$HOME/.omnara/bin/omnara" auth status 2>/dev/null | grep -qi "stored\|PAT"; then
  omnara_ok=true; else omnara_ok=false; problems+=("Omnara: omnara auth login"); fi
# GitHub (gh CLI token — powers nightly off-machine backup)
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  github_ok=true; else github_ok=false; problems+=("GitHub: gh auth login (enables nightly backup)"); fi
printf '{"checked":"%s","claude":%s,"codex":%s,"omnara":%s,"github":%s,"problems":"%s"}\n' \
  "$(date '+%Y-%m-%d %H:%M')" "$claude_ok" "$codex_ok" "$omnara_ok" "$github_ok" "${problems[*]:-none}" > "$STATUS"
cat "$STATUS"
if [ "${#problems[@]}" -gt 0 ]; then
  osascript -e "display notification \"${problems[*]}\" with title \"JesseOS auth-watchdog\"" 2>/dev/null || true
fi
