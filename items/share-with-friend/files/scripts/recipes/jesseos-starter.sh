#!/usr/bin/env bash
# Assemble the shareable "JesseOS starter kit" from the live system into $1 (a fresh dir),
# then publish with:  shelf.py publish --source "$1" --slug jesseos-starter ...
# Generic files (blank context, notify, remote control, plists, onboarding) live in jesseos-starter.d/ and are
# copied over as they are. Scripts that are already generic are taken from the live system. The marker
# .shelf-keep-layout tells shelf.py not to rewrite ~/JesseOS/workspace paths: this kit IS that layout.
set -euo pipefail
OUT="${1:?usage: jesseos-starter.sh OUTDIR}"; W="$HOME/JesseOS/workspace"; A="$W/reels/.agent-collaboration"
T="$(cd "$(dirname "$0")" && pwd)/jesseos-starter.d"
rm -rf "$OUT"; mkdir -p "$OUT"/{workspace/{skills/_TEMPLATE,backup,update,security,launchagents,agent-collaboration,guardian},vault/50-memory}
cp "$W/skills/sync-skills.sh" "$W/skills/CONVENTIONS.md" "$OUT/workspace/skills/"
cp "$W/skills/_TEMPLATE/SKILL.md" "$OUT/workspace/skills/_TEMPLATE/"
cp "$W/backup/backup.sh" "$W/backup/connect-github.sh" "$OUT/workspace/backup/"
cp "$W/update/update.sh" "$OUT/workspace/update/"
cp "$W/security/README.md" "$W/security/auth-watchdog.sh" "$W/security/session-watch.sh" "$W/security/tcc-watch.sh" "$OUT/workspace/security/"
for p in appupdate authwatchdog backup skillsync; do
  sed "s#/Users/$(whoami)#/Users/YOU#g" "$W/launchagents/com.jesse.$p.plist" > "$OUT/workspace/launchagents/com.jesse.$p.plist"
done
cp "$A/delegate.py" "$A/google_read_guard.py" "$A/ROUTING_POLICY.md" "$OUT/workspace/agent-collaboration/"
printf '# Decisions\nLong-term memory. Agents append notable decisions here (see the memory skill).\n' > "$OUT/vault/50-memory/decisions.md"

# Guardian: the live engine, with the owner-specific alert channels swapped for notify.py. Every anchor is
# asserted, so a change to the live script fails this build loudly instead of publishing a half-patched copy.
cp "$W/guardian/guardian.py" "$OUT/workspace/guardian/guardian.py"
python3 - "$W/guardian/guardian-qc.sh" "$OUT/workspace/guardian/guardian-qc.sh" "$OUT/workspace/guardian/guardian.py" <<'PY'
import re, sys
src, dst, gpy = sys.argv[1:4]
s = open(src).read()
def cut(s, start, end, new, keep_end=True):
    i = s.index(start); j = s.index(end, i)
    return s[:i] + new + s[j if keep_end else j + len(end):]
def sub(s, old, new):
    assert old in s, f"anchor missing in guardian-qc.sh: {old[:60]}"
    return s.replace(old, new)
s = sub(s, 'export HOME="~"\n', '')
s = cut(s, 'NTFY="$(tr -d', 'GMAIL=', '')
s = cut(s, 'GMAIL=', '\n', 'NOTIFY="$HOME/JesseOS/workspace/notify/notify.py"   # the one place alerts go (Telegram)', True)
s = cut(s, '  local rc=0\n  if [ -n "$NTFY" ]', '  if [ $rc = 0 ]; then',
        '  local rc=0\n  "$PY" "$NOTIFY" send --subject "$subj" --body "$body" --level urgent --source guardian >/dev/null 2>&1 || rc=1\n')
s = cut(s, '  if [ -n "$back" ] && [ -z "${GUARDIAN_SILENT:-}" ] && [ -n "$NTFY" ]; then', '  _qc_summarize_base',
        '  if [ -n "$back" ] && [ -z "${GUARDIAN_SILENT:-}" ]; then\n'
        '    "$PY" "$NOTIFY" send --subject "back to normal:$back" --body "Fixed itself or was fixed:$back" --source guardian >/dev/null 2>&1 || true\n  fi\n')
s = sub(s, "Jesse's Mac mini", "this Mac")
s = sub(s, "Tier 3: phone (ntfy) + email to Jesse, throttled", "Tier 3: alert through notify.py, throttled")
s = sub(s, "alerts: phone + email, de-duplicated", "alerts: de-duplicated")
s = re.sub(r" \(Jesse \d{4}-\d\d-\d\d: \"[^\"]*\"\)", "", s)
s = re.sub(r"\bpage Jesse\b", "page the owner", s)
assert "NTFY" not in s and "GMAIL" not in s and "essechance" not in s, "owner-specific leftovers in guardian-qc.sh"
open(dst, "w").write(s)
g = open(gpy).read().replace("paging Jesse", "paging the owner")
assert "Jesse" not in g; open(gpy, "w").write(g)
PY
bash -n "$OUT/workspace/guardian/guardian-qc.sh"; python3 -m py_compile "$OUT/workspace/guardian/guardian.py"
rm -rf "$OUT/workspace/guardian/__pycache__"; chmod +x "$OUT/workspace/guardian/guardian-qc.sh"

rsync -a --exclude __pycache__ --exclude .DS_Store "$T/" "$OUT/"
sed 's/Claude Code (this machine)/Codex (this machine)/' "$OUT/workspace/CLAUDE.md" > "$OUT/workspace/AGENTS.md"

cat > "$OUT/install.sh" <<'SH'
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
SH
chmod +x "$OUT/install.sh"
cat > "$OUT/README.md" <<'MD'
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
MD
echo "built $OUT"
