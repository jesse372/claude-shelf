#!/usr/bin/env bash
# Assemble the shareable "JesseOS starter kit" from the live system into $1 (a fresh dir),
# then publish with:  shelf.py publish --source "$1" --slug jesseos-starter ...
set -euo pipefail
OUT="${1:?usage: jesseos-starter.sh OUTDIR}"; W="$HOME/JesseOS/workspace"; A="$W/reels/.agent-collaboration"
rm -rf "$OUT"; mkdir -p "$OUT"/{workspace/{skills/_TEMPLATE,backup,update,security,launchagents,agent-collaboration},vault/{00-context,50-memory}}
cp "$W/skills/sync-skills.sh" "$W/skills/CONVENTIONS.md" "$OUT/workspace/skills/"
cp "$W/skills/_TEMPLATE/SKILL.md" "$OUT/workspace/skills/_TEMPLATE/"
cp "$W/backup/backup.sh" "$W/backup/connect-github.sh" "$OUT/workspace/backup/"
cp "$W/update/update.sh" "$OUT/workspace/update/"
cp "$W/security/README.md" "$W/security/auth-watchdog.sh" "$W/security/session-watch.sh" "$W/security/tcc-watch.sh" "$OUT/workspace/security/"
for p in appupdate authwatchdog backup skillsync; do
  sed "s#/Users/$(whoami)#/Users/YOU#g" "$W/launchagents/com.jesse.$p.plist" > "$OUT/workspace/launchagents/com.jesse.$p.plist"
done
cp "$A/delegate.py" "$A/google_read_guard.py" "$A/ROUTING_POLICY.md" "$OUT/workspace/agent-collaboration/"
for f in about-me working-style agents; do cp "$HOME/JesseOS/vault/00-context/$f.md" "$OUT/vault/00-context/"; done
printf '# Decisions\nLong-term memory. Agents append notable decisions here (see the memory skill).\n' > "$OUT/vault/50-memory/decisions.md"
cat > "$OUT/workspace/CLAUDE.md" <<'MD'
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
MD
sed 's/Claude Code (this machine)/Codex (this machine)/' "$OUT/workspace/CLAUDE.md" > "$OUT/workspace/AGENTS.md"
cat > "$OUT/install.sh" <<'SH'
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
SH
chmod +x "$OUT/install.sh"
cat > "$OUT/README.md" <<'MD'
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
MD
echo "built $OUT"
