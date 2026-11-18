#!/usr/bin/env bash
# Install the starter kit into ~/JesseOS (never overwrites existing files) and wire it up.
#   ./install.sh              kit + companion skills from the shelf
#   ./install.sh --no-skills  kit only
# Loads NO background jobs: workspace/setup/finish-setup.command (or launchagents/load.sh) does that.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; J="$HOME/JesseOS"; W="$J/workspace"
SHELF="https://jesse372.github.io/claude-shelf/items"
SKILLS="pipeline-qc loop-contract wrap-up project-backup auth-framework mac-headless-setup memory memory-capture skill-curator scout llm-council browser-probe web-essentials media-inbox voice"
mkdir -p "$J" "$HOME/.claude" "$HOME/.codex" "$HOME/Library/LaunchAgents"
rsync -a --ignore-existing --exclude install.sh --exclude README.md --exclude .shelf-keep-layout "$HERE/" "$J/"
mkdir -p "$W/logs" "$W/guardian/state" "$W/notify/state"
for pair in "CLAUDE.md:.claude/CLAUDE.md" "AGENTS.md:.codex/AGENTS.md"; do
  src="$W/${pair%%:*}"; dst="$HOME/${pair#*:}"
  if [ -e "$dst" ] || [ -L "$dst" ]; then echo "kept your existing $dst (merge $src into it by hand)"; else ln -s "$src" "$dst"; fi
done
chmod +x "$W"/*/*.sh "$W"/*/*.command "$W"/*/*.py 2>/dev/null || true
if [ "${1:-}" != "--no-skills" ]; then
  tmp="$(mktemp -d)"
  for s in $SKILLS; do
    [ -e "$W/skills/$s" ] && continue
    if curl -fsSL --max-time 60 -o "$tmp/$s.zip" "$SHELF/$s/$s.zip" && unzip -q -o "$tmp/$s.zip" -d "$tmp/x" && [ -f "$tmp/x/$s/SKILL.md" ]; then
      mv "$tmp/x/$s" "$W/skills/$s"; echo "skill installed: $s"
    else echo "skill NOT installed (download failed): $s"; fi
  done
  rm -rf "$tmp"
  chmod +x "$W"/skills/*/*.sh "$W"/skills/*/scripts/* 2>/dev/null || true
fi
"$W/skills"/sync-skills.sh
[ -d "$J/.git" ] || git -C "$J" init -q 2>/dev/null || true
echo
echo "Installed into ~/JesseOS. No background jobs are running yet."
echo "Next: double-click ~/JesseOS/workspace/setup/finish-setup.command (sign-ins, alerts, start the jobs)."
