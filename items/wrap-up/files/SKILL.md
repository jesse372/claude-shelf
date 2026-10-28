---
name: wrap-up
description: "MANDATORY end-of-project / end-of-session protocol — run this BEFORE declaring any project, build, automation, or session done. Audits everything that was built for silent-failure risks, verifies all future/unattended automations actually work in their real (launchd/cron/headless) context, hardens edge cases, extracts reusable skills, records to memory, and reports whether it's truly hands-off. ALWAYS invoke when the user signals they are finishing up. TRIGGERS: 'wrap up', 'wrapping up', 'wrap this up', 'finish the project', 'finishing the project', 'finalize', 'is this done', 'is this project done', 'are we done', 'wrap up the session', 'close this out', 'sign off', 'before we finish', 'project complete', 'one final check', 'make sure everything works', 'call that a wrap', 'call it a wrap', 'lets call that a wrap', 'wrap that up', 'thats a wrap'."
version: 1.0.0
metadata:
  tags: [Process, QA, Reliability, Conventions]
  pinned: true
---

# wrap-up — the end-of-project protocol

**Standing rule: never declare a project/session "done" without running this.**
The whole point: catch the things that will **silently break later** when no one is watching, and
turn one-off work into reusable capability. Invoke it whenever the user says they're finishing up.

Run the auditor first for a head-start, then work the checklist:
```bash
~/.claude/skills/wrap-up/scripts/audit.sh [project_dir]
```

## The protocol (work top to bottom)

### 1. Inventory what the project created
Scheduled jobs (LaunchAgents / cron), services/workers, scripts, skills, state files, and
every **credential/token/session** it depends on. The auditor lists most of this.

### 2. Audit every unattended job for SILENT FAILURE (the #1 risk)
For each thing that runs without a human, ask:
- **Loaded & scheduled?** Actually running, right cadence.
- **Alerts on failure?** On error it must notify you (desktop notification + a log line, or your
  own channel) — not fail silently.
- **Staleness / heartbeat?** Would you *know* if it silently stopped producing output? A job whose
  per-run errors are handled can still **stop running entirely** or **silently produce nothing**
  (e.g. a scraper whose login expired so enumeration returns empty, no error). **Add a watchdog**:
  "if no new output in N days, alert once (throttled)."
- **Expiring dependencies?** Tokens, **login sessions**, proxies/VPN, secret-manager auth, MCP
  server auth. These expire silently. Add a **fallback/cache** or an **alert**. (API tokens: check
  their expiry field. Login sessions are the classic silent killer.)

### 3. Test the headless / launchd context, not just by hand
A job that works when you run it interactively can fail under launchd/cron: different `PATH`/`HOME`,
MCP servers not loaded, no interactive auth. **Actually invoke the unattended path** (e.g. run the
headless command, trigger the cron script) and confirm it works.

### 4. Harden
Apply the fixes the audit surfaced: staleness watchdogs, credential caches/fallbacks, failure
escalation. Re-test.

### 5. QC the logic for edge cases
Re-read the code for: empty/zero inputs, word-splitting in bash (`read` on space-containing values),
non-consecutive / boundary ranges, race conditions, idempotency (safe to re-run?), and
silent-truncation (top-N caps that hide data). Fix what you find.

### 6. Extract reusable skills  ← do not skip
What capability did this project produce that future-me would want pre-solved? Package it as a skill:
source in `~/.claude/skills/<name>/` (frontmatter `name` + trigger-rich `description`;
logic in `scripts/`), then sync it live with `~/.claude/skills/sync-skills.sh`. Especially
flag anything that could **one-shot a similar future task**.

### 6b. Post it to the Claude Shelf (Jesse's standing request)
Anything new and reusable you built (skill, tool, script, site, prompt) goes on Jesse's public
site for his friend. Use the `share-with-friend` skill:
`~/.claude/skills/share-with-friend/scripts/shelf.py publish --source <path> --title ... --summary ...`
Write the card text for the friend, not for Jesse. Skip anything tied to private accounts or client data,
and say so in the final report. Include the card link in the final report. If the work changed something already on the shelf, run
`shelf.py sync <slug>` and refresh its card text with `shelf.py edit` if what it does changed.

### 7. Record to long-term memory
Capture the final architecture, key decisions, and gotchas (schedules, file paths,
token/credential locations, failure modes) into long-term memory via the `memory` skill:
```bash
~/.claude/skills/memory/scripts/capture.sh
```
Memory lives in `~/JesseOS/vault/50-memory/` (e.g. `decisions.md`).

### 8. Final report
State plainly whether it's **truly hands-off**: what runs, on what schedule, the failure/escalation
path, and any **known limits** (with the threshold at which they'd bite). Then list **recommended
improvements** not executed, so the user can choose.

## Pitfalls / lessons baked in
- **Silent acquisition stop** is the classic miss: per-run error handling ≠ knowing the pipeline
  stopped. Always add a staleness watchdog for anything that should produce output on a cadence.
- **"Works when I run it" ≠ "works in cron."** Test the real context.
- **Tokens that never expire are rare; login sessions always expire.** Treat any login-session
  dependency as a future outage and plan the alert/fallback.
- Don't over-alert: throttle staleness nudges (e.g. once / 14d) so a legitimately-finished project
  doesn't nag forever.

## Verify
After wrapping: `audit.sh` shows all jobs loaded + alerting; you've added a watchdog for each
cadence-producing job; the headless path was tested; ≥1 reusable skill captured (or a clear "none");
memory updated; and the final report names the failure path and known limits.
