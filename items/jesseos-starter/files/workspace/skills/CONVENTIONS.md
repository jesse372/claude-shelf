# Skill conventions
- One folder per skill under `~/JesseOS/workspace/skills/<name>/` with a `SKILL.md`.
- `SKILL.md` starts with YAML frontmatter: `name` + a trigger-rich `description`. Put logic in `scripts/`.
- Run `~/JesseOS/workspace/skills/sync-skills.sh` (or just add the folder — a LaunchAgent watches this dir)
  to mirror the skill into BOTH `~/.claude/skills/` and `~/.codex/skills/` so Claude and Codex both see it.
- Start from `_TEMPLATE/`.
