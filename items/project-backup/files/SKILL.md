---
name: project-backup
description: "STANDING DEFAULT — every project gets a private GitHub git repo + automatic daily backup. Run init_project.sh at the START of any new project (and on existing un-backed-up ones) to git-init, write a sensible .gitignore (keeps secrets/large binaries out), create a PRIVATE GitHub repo via gh, and register it for nightly auto-commit/push. USE WHENEVER starting/scaffolding a new project, or when a project's scripts aren't version-controlled yet. TRIGGERS: 'new project', 'start a project', 'scaffold', 'back up this project', 'git backup', 'version control', 'is this in git', 'init repo', 'set up a repo'."
version: 1.0.0
metadata:
  tags: [Process, Backup, Git, Conventions]
  pinned: true
---

# project-backup — every project is git-backed by default

**Standing rule: no project lives only on this machine's disk.** At the start of any
new project (or the moment you notice an existing one isn't in git), give it a **private GitHub
repo + nightly auto-backup** — one command.

## Prerequisite (one-time): authenticate gh
The mechanism creates repos under **your own** GitHub account via the `gh` CLI. Before first use:
```bash
gh auth status   # should show you logged in
# if not: gh auth login   (choose GitHub.com, HTTPS, authenticate in browser/device)
```
Repos are created as `<your-gh-account>/<name>` using whichever account `gh` is logged in as —
nothing is hardcoded.

## New project (or back up an un-tracked one)
```bash
~/.claude/skills/project-backup/scripts/init_project.sh <project_dir> [repo_name]
```
This: `git init` → writes a default `.gitignore` (excludes `.env`/`.secrets.sh`/`.cf_token`/`*.bin`/
`*.mp4`/logs) → commits → **creates a PRIVATE repo under your own `gh` account** → pushes →
registers the dir in `~/.project-repos` for nightly backup. Idempotent (safe to re-run).

## How the backup runs
- `~/.project-repos` — registry, one project dir per line.
- `scripts/backup_projects.sh` — for each registered repo, commits + pushes only if there are
  changes. Driven by **LaunchAgent `com.jesse.project-backup`** (daily). Log: `~/.project-backup.log`.
- A failed run also pings via the generic notifier (see `scripts/backup_projects.sh`), so a silent
  push failure surfaces instead of going unnoticed.

## Secrets discipline (so backups never leak credentials)
- **Never commit live tokens.** Keep them in your own secret manager (see
  `~/JesseOS/workspace/security/README.md`); at runtime either pull from it or `source` a gitignored
  `.secrets.sh` (whose header documents which entries to regenerate from).
- The default `.gitignore` already excludes `.env`, `.secrets.sh`, `.cf_token`, `*token*.txt`.
- Before the first push, grep the to-be-committed files for token patterns (long hex strings, etc.).
- Large models / media (`*.bin`, `*.mp4`) are excluded — store those outside git.

## Pitfalls
- `gh` must be authenticated (`gh auth status` → logged in). If not, `gh auth login`.
- A private repo is still not a vault — scrub secrets anyway (a leaked PAT or a later public-flip
  exposes everything).
- `git push -q` needs a working credential helper (gh sets this up). On failure the daily run logs
  `PUSH FAILED` — check `~/.project-backup.log`.

## Verify
```bash
cat ~/.project-repos                      # registered projects
launchctl list | grep project-backup      # agent loaded
tail ~/.project-backup.log                 # recent pushes
```

## Install the LaunchAgent (one-time)
A ready-to-load plist ships in `launchagents/com.jesse.project-backup.plist`. To activate daily
backups:
```bash
cp ~/.claude/skills/project-backup/launchagents/com.jesse.project-backup.plist \
   ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.jesse.project-backup.plist
```
