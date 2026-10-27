#!/usr/bin/env bash
# Mirror every JesseOS skill into BOTH ~/.claude/skills and ~/.codex/skills, so Claude Code and Codex
# always see the exact same skills. Idempotent + self-pruning (only touches symlinks it owns).
set -euo pipefail
SRC="$HOME/JesseOS/workspace/skills"
TARGETS=("$HOME/.claude/skills" "$HOME/.codex/skills")
for T in "${TARGETS[@]}"; do
  mkdir -p "$T"
  for d in "$SRC"/*/; do
    name="$(basename "$d")"
    case "$name" in _TEMPLATE|dist|.archive) continue;; esac
    [ -f "$d/SKILL.md" ] || continue
    ln -sfn "$SRC/$name" "$T/$name"
  done
  # prune ONLY symlinks that point into SRC but whose source is gone (never touch foreign entries)
  for l in "$T"/*; do
    [ -L "$l" ] || continue
    tgt="$(readlink "$l")"
    case "$tgt" in
      "$SRC"/*) [ -f "$tgt/SKILL.md" ] || { rm -f "$l"; echo "pruned: $l"; } ;;
    esac
  done
done
echo "skills synced -> ~/.claude/skills + ~/.codex/skills ($(date '+%Y-%m-%d %H:%M'))"
