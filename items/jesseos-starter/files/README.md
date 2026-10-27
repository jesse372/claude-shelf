# JesseOS starter kit

The setup Jesse uses so **Claude Code and Codex share one brain**: the same skills, memory and
standing instructions. It also keeps itself backed up and up to date.

```
~/JesseOS/
  vault/00-context/      who you are and how you like agents to work (fill these in)
  vault/50-memory/       long-term memory (decisions.md)
  workspace/CLAUDE.md    standing instructions (symlinked to ~/.claude/CLAUDE.md)
  workspace/AGENTS.md    same for Codex (symlinked to ~/.codex/AGENTS.md)
  workspace/skills/      your skills. sync-skills.sh mirrors them into ~/.claude/skills AND ~/.codex/skills
  workspace/backup/      nightly git commit + push to a PRIVATE GitHub repo (connect-github.sh sets it up)
  workspace/update/      keeps Claude Code / Codex CLIs current, verifies they start, rolls back if not
  workspace/security/    auth watchdog: warns before logins/tokens expire
  workspace/launchagents/ macOS schedules for the above (not loaded until you choose to)
  workspace/agent-collaboration/  delegate.py: bounded, read-only Claude <-> Codex handoffs + routing policy
```

**Install:** run `./install.sh`. It never overwrites existing files. Then fill in
`vault/00-context/*.md`, run `workspace/backup/connect-github.sh` once, and load the LaunchAgents you want.
Add skills from the shelf into `~/.claude/skills/` and run `sync-skills.sh`.

macOS only. The update script expects npm-installed Claude Code/Codex CLIs. Omnara references
are optional and harmless if you don't use it.
