# Automations on this Mac (read every session)
Job list source: `~/JesseOS/workspace/guardian/registry.json`.
Run `python3 ~/JesseOS/workspace/guardian/guardian.py list` for the live list.

## Standing rules: unattended jobs must never break silently
- Every LaunchAgent / scheduled job / daemon **must be registered** in `guardian/registry.json` the moment it is
  created (label, what, kind, max_gap_h, log, script, selfheal, state_json, probe). An unregistered job is a bug.
- The **guardian** (every 10 min) checks each job: loaded, exit code, actually running on schedule, new crash
  lines in its log, state JSON still valid, plus an optional probe. Then it repairs:
  - Tier 1: load the agent, restore corrupted state from the last good copy, re-run the job, re-check.
  - Tier 2: headless Claude fixes the job's script (only where `selfheal: true`; never money, security or other
    people's code). The fix is kept only if a fresh run is green, otherwise reverted. Max once per 6h per job.
  - Tier 3: ONE alert per job per failure, then silence until it is green again.
- **Alerts go through `workspace/notify/notify.py`, never straight to email.** urgent = Telegram now;
  daily = one evening summary, skipped on empty days; quiet = log only. Default for anything new = daily.
- Unattended `claude -p` runs use `--permission-mode dontAsk` with an explicit `--allowedTools` list. Runs that
  need no connectors or skills also use `--safe-mode --strict-mcp-config --tools <needed> --no-session-persistence`.
- State files: write atomically (tmp file + `os.replace`).
- launchd jobs cannot read `~/Documents`, `~/Desktop` or `~/Downloads` (macOS privacy). Keep job files elsewhere.
- macOS has no GNU `timeout`: use `perl -e 'alarm shift; exec @ARGV' N cmd`.
- Anything that sends to a customer, supplier or subcontractor, or writes into a business system, starts as
  draft-then-approve. It becomes automatic only when the owner says so, and that decision is recorded here.

## Jobs (what they do + the rules they must keep)
| Job | What | Key rules |
|---|---|---|
| `com.jesse.guardian` (10 min) | Watches and repairs every job below | Pause: `launchctl bootout gui/$(id -u)/com.jesse.guardian` |
| `com.jesse.backup` (04:00) | Pushes `~/JesseOS` to the private GitHub repo | |
| `com.jesse.appupdate` (6h) | Updates the Claude Code / Codex CLIs, rolls back a version that will not start | |
| `com.jesse.authwatchdog` (09:00) | Warns before logins expire | Monitor only |
| `com.jesse.skillsync` (on change) | Mirrors skills to Claude and Codex | |
| `com.jesse.claude-remote` (5 min) | Keeps phone access (Remote Control) running | |
| `com.jesse.notify-digest` (18:40) | One evening summary of non-urgent messages | Sends nothing on empty days |

(Add each new job here with its rules, in the owner's own words and dated.)
