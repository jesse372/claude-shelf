# Standing context: Claude Code (this machine)

This Mac runs a shared agent setup. **Claude Code and Codex share the SAME skills, memory and
context**, all under `~/JesseOS/`. One brain, not two.

## On every session
- Load standing context from `~/JesseOS/vault/00-context/` (about-me.md, working-style.md, agents.md).
- Long-term memory lives in `~/JesseOS/vault/50-memory/`.
- Reusable skills live in `~/.claude/skills/` (mirrored into `~/.claude/skills` and `~/.codex/skills`).

## The 5 systems on this box
- **system**   : `~/.claude/skills/` (+ `sync-skills.sh`, kept live by a LaunchAgent)
- **memory**   : `~/JesseOS/vault/50-memory/` (+ the `memory` skill from the shelf)
- **security** : `~/JesseOS/workspace/security/` (auth-watchdog; secrets live in your own manager)
- **update**   : `~/JesseOS/workspace/update/update.sh` (Claude Code CLI / Codex CLI)
- **backup**   : `~/JesseOS/workspace/backup/backup.sh` (nightly git push to your private repo)
