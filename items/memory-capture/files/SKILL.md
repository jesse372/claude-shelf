---
name: memory-capture
description: "Long-term memory for Claude Code AND Codex: auto-captures idle session transcripts from both agents into durable decisions, plus on-demand recall. Use when you need to remember or look up a past decision, prior work, or 'what did we do about X'. TRIGGERS: 'recall', 'what did we decide', 'look it up', 'have we done this before', 'search memory', 'past sessions'."
version: 1.0.0
pinned: true
metadata:
  tags: [Memory, Productivity]
---

# Skill: memory-capture

Automatic long-term memory for Claude Code **and Codex** sessions, plus on-demand retrieval.
This is the **capture / curation layer**: it auto-summarizes idle sessions into the same
`~/JesseOS/vault/50-memory/` store that the basic `memory` skill reads and writes by hand.

## What it does
- **Capture** (`summarize.js`, run by `run-capture.sh` via LaunchAgent `com.jesse.memcapture`, daily 03:30):
  scans both **Claude** (`~/.claude/projects/**`) and **Codex** (`~/.codex/sessions/**` rollout JSONL)
  transcripts, and for each session idle >2h, summarizes it with headless `claude -p` (haiku) into durable
  bullets. Writes to `~/JesseOS/vault/50-memory/decisions.md` (newest first; overflow rotates to `archive.md`)
  and a full note in `~/JesseOS/vault/50-memory/sessions/`. Codex entries are tagged `codex · <cwd>` /
  `_codex session …_`. Skips chit-chat and any content the model declines to summarize. Both sources share one
  state file and log; each source is baselined on first sight (no backfill).
  Debug a source read-only: `MEMCAP_DEBUG=codex node summarize.js`.
- **Search** (`search.js`): on-demand lexical retrieval over the memory store (decisions, archive, and
  `sessions/`); `--transcripts` also scans raw Claude session logs.

## Usage
```
# recall prior work (search the captured memory)
node ~/.claude/skills/memory-capture/search.js "tailscale screen sharing"
node ~/.claude/skills/memory-capture/search.js --transcripts --limit 5 "ssh config"

# run a capture pass manually (normally automatic)
zsh ~/.claude/skills/memory-capture/run-capture.sh
```

## Layout
- knowledge → `~/JesseOS/vault/50-memory/` (committed, backed up; shared with the basic `memory` skill)
- tooling   → here (`~/.claude/skills/memory-capture/`)
- state/log → `~/.local/state/jesseos-memory/` (machine-local, not in repo)

## Complements the `memory` skill
The basic `memory` skill (`capture.sh` / `search.sh`) is for **manual** notes you write yourself.
This `memory-capture` skill adds the **automatic** layer on top of the *same* vault location, so
auto-captured session decisions and hand-written notes live together and are recalled together.
It uses different filenames (`summarize.js`, `search.js`, `run-capture.sh`) and its own state dir,
so it never conflicts with the `memory` skill's files.

## Notes
- Retrieval is on-demand by design (look it up, don't preload).
- A future embedding/semantic backend can sit behind the same `search.js` CLI.
- The LaunchAgent plist (`com.jesse.memcapture.plist`) is included in this folder; install it by copying
  to `~/Library/LaunchAgents/` and running `launchctl load ~/Library/LaunchAgents/com.jesse.memcapture.plist`.
