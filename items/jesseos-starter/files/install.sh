#!/usr/bin/env bash
# Install the JesseOS starter into ~/JesseOS (won't overwrite existing files) and wire it up.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/JesseOS" "$HOME/.claude" "$HOME/.codex" "$HOME/Library/LaunchAgents"
rsync -a --ignore-existing --exclude install.sh --exclude README.md "$HERE/" "$HOME/JesseOS/"
for pair in "CLAUDE.md:.claude/CLAUDE.md" "AGENTS.md:.codex/AGENTS.md"; do
  src="$HOME/JesseOS/workspace/${pair%%:*}"; dst="$HOME/${pair#*:}"
  [ -e "$dst" ] && echo "kept your existing $dst (merge $src into it by hand)" || ln -s "$src" "$dst"
done
for p in "$HOME"/JesseOS/workspace/launchagents/*.plist; do
  sed -i '' "s#/Users/YOU#$HOME#g" "$p"
done
chmod +x "$HOME"/JesseOS/workspace/*/*.sh "$HOME/JesseOS/workspace/agent-collaboration/delegate.py"
"~/.claude/skills/sync-skills.sh"
echo "Installed. LaunchAgents are NOT loaded yet. Review them, then for each one you want:"
echo "  cp ~/JesseOS/workspace/launchagents/<name>.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/<name>.plist"
