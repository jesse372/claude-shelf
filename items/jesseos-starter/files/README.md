# JesseOS starter kit

The setup Jesse runs on an always-on Mac: **Claude Code (and Codex) share one brain** of skills, memory and
standing instructions, scheduled jobs are watched and repaired automatically, the Mac messages you only when
it needs you, and you can reach it from your phone.

```
~/JesseOS/
  vault/00-context/      who you are, how agents should work, every job and its rules (blank: Claude interviews you)
  vault/50-memory/       long-term memory (decisions.md)
  workspace/CLAUDE.md    standing instructions (symlinked to ~/.claude/CLAUDE.md)
  workspace/AGENTS.md    same for Codex (symlinked to ~/.codex/AGENTS.md)
  workspace/skills/      your skills. sync-skills.sh mirrors them into ~/.claude/skills AND ~/.codex/skills
  workspace/guardian/    checks every scheduled job each 10 min; restarts it, has Claude fix it, or alerts you once
  workspace/notify/      alerts by Telegram: urgent ones now, everything else in one evening summary
  workspace/claude-remote/  phone access through the Claude app (Remote Control), kept alive
  workspace/backup/      nightly git commit + push to a PRIVATE GitHub repo
  workspace/update/      keeps Claude Code / Codex CLIs current, verifies they start, rolls back if not
  workspace/security/    auth watchdog: warns before logins/tokens expire
  workspace/launchagents/ macOS schedules for the above + load.sh (nothing is loaded until you choose to)
  workspace/setup/       finish-setup.command: the sign-ins only a person can do
  workspace/agent-collaboration/  delegate.py: bounded, read-only Claude <-> Codex handoffs + routing policy
```

**Install:** give this folder to Claude Code and say "follow ONBOARD.md". Or by hand: run `./install.sh`
(it never overwrites existing files and also downloads the companion skills from the shelf), then
double-click `~/JesseOS/workspace/setup/finish-setup.command`.

**Needs:** macOS, Claude Code signed in to your own Claude plan, git, GitHub CLI (`gh`), python3. Telegram for
alerts. Codex is optional. The update script expects npm-installed CLIs.

**Private by design:** nothing in here reports back to anyone. Your context, memory and backups stay on your
Mac and in your own private GitHub repo.
