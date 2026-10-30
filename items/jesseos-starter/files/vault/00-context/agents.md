# Agents on this machine
- Claude Code (CLI) and Codex share this same context, skills, and memory.
- Skills live in ~/.claude/skills/ and are mirrored into ~/.claude/skills and ~/.codex/skills.
- Memory lives in ~/JesseOS/vault/50-memory/.

## Storage rule (Jesse, 2026-10-30) — applies to Claude AND Codex
The Mac mini's internal disk is small (~113 GB, often <10 GB free). **Do not fill it.**
- Put ALL project data, media, renders, downloads, models, caches and temp files on an external drive:
  primary `/Volumes/LaCie` (exFAT, ~470 GB free); overflow `/Volumes/Back Up` (HFS+, ~1.1 TB free; ask before using it for anything that isn't a backup).
- Video work lives in `/Volumes/LaCie/VideoEdits` (temp: `tmp/`, caches: `cache/`). Deliveries: `/Volumes/LaCie/VideoEdits/DELIVER`, served on the home Wi-Fi.
- Never stage large files in iCloud Drive: iCloud is full, so they sit on the internal disk in a hidden upload queue.
- When running heavy jobs set `TMPDIR`, `XDG_CACHE_HOME`, `PIP_CACHE_DIR`, `TORCH_HOME` to LaCie paths.
- Internal disk is only for code, small scripts, configs and the few review images an agent must read directly. Prune those after use.
- Agent sessions running under Omnara can't read external drives right now (TCC). Run commands through Terminal with
  `~/JesseOS/workspace/video-edits-runner/tr.sh "<cmd>"` until Omnara gets Full Disk Access.
