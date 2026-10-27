---
name: skill-curator
description: "The weekly self-building + self-improving loop for your own skills: mines recent sessions for NEW reusable skills, validates + improves existing ones, archives dead ones, and posts a digest. Use when managing/auditing your skill library, or to run the curation pass manually. TRIGGERS: 'curate skills', 'audit skills', 'why was a skill changed', 'skill curator', 'run the skill loop', 'build a skill from recent work'."
version: 1.0.0
pinned: true
metadata:
  tags: [Meta, Skills, Automation]
  related: [memory-capture]
---

# Skill: skill-curator

The full-auto loop that keeps your skill library growing and healthy. It mines recent work for
**new** reusable skills, **validates + improves** existing ones, **archives** dead ones (recoverable),
re-syncs your skill links (Claude + Codex), and writes a weekly digest plus a desktop notification.
It *authors new skills from actual session work*, not just consolidates.
This skill is **pinned** (it must not auto-edit itself).

## When to use
- Automatic: weekly (LaunchAgent `com.jesse.skillcurator`, Sun 04:00).
- Manual: to force a curation pass, preview changes, or understand a digest.
- NOT for authoring a single skill by hand — for that, follow `../CONVENTIONS.md` directly.

## Prerequisites
- `claude` CLI on PATH.
- Skills live in `~/.claude/skills/`, mirrored to `~/.claude/skills/` and `~/.codex/skills/`
  by `~/.claude/skills/sync-skills.sh`.
- (Optional) Your own Telegram/email notifier — see the placeholder in `curate.py` `send_digest()`.

## Quick reference
```bash
SK=~/.claude/skills/skill-curator
# preview (no writes, no edits) — reports what it WOULD do + writes a (dry-run) digest
zsh $SK/run-curator.sh --dry-run
# run it for real
zsh $SK/run-curator.sh
# inspect
cat ~/.local/state/jesseos-skills/state.json        # last run + summary
ls  ~/.local/state/jesseos-skills/backups/          # pre-run snapshots (last 5)
cat ~/.claude/logs/skill-curator-digest.md # latest digest
launchctl list | grep skillcurator                  # schedule loaded?
```
| Action | How |
|---|---|
| Protect a skill from the curator | set `pinned: true` in its SKILL.md frontmatter |
| Roll back a run | `tar xzf ~/.local/state/jesseos-skills/backups/skills-<ts>.tar.gz -C /tmp` then diff/restore |
| Recover an archived skill | `mv ~/.claude/skills/.archive/<name> ~/.claude/skills/` then re-run (re-syncs) |

## Procedure
`run-curator.sh` → `curate.py`: snapshot skills → drive headless `claude -p` (sonnet, budget-capped,
scoped to the skills dir, `bypassPermissions`) to discover/author + improve + archive → re-sync
skill links (via `sync-skills.sh`) → validate frontmatter → write state → write the digest to
`~/.claude/logs/skill-curator-digest.md` and fire a desktop notification.

## Pitfalls
- Full-auto + `bypassPermissions`: the snapshot + your version control are the safety net. `pinned: true`
  is the per-skill guard — set it on anything the curator must never touch.
- The model is told "0 changes is fine" to avoid junk-skill churn; if it still over-creates, tighten the
  evidence threshold in `build_prompt()`.
- The digest is written to a local file + a desktop notification. To also push it to Telegram/email,
  fill in the clearly-marked placeholder in `send_digest()`.

## Verification
```bash
zsh ~/.claude/skills/skill-curator/run-curator.sh --dry-run   # expect a (dry-run) digest file + notification
tail -30 ~/.local/state/jesseos-skills/curator.log
```
