# Loop Contract — {{NAME}}

> A loop only helps if it can PROVE it's done and STOP itself. Fill every field. No `TODO` may remain.

| Field | Value |
|---|---|
| **Name** | {{NAME}} |
| **Owner** | (you) |
| **Created** | {{DATE}} |
| **Status** | DRAFT |

## 1. Trigger
<!-- What starts a tick? launchd/cron schedule, an event (CI fail, new file, webhook), or /loop. -->
TODO

## 2. Goal (verifiable END-STATE — not a process)
<!-- A state a SEPARATE check could confirm. e.g. "All TS in src/ pass lint, 0 errors" NOT "improve code". -->
{{GOAL}}

## 3. Scope / Action (allowed tool surface — keep narrow)
<!-- read? edit which paths? run which commands? spawn subagents? NO destructive ops without a gate. -->
TODO

## 4. Verifier (DETERMINISTIC proof of success — maker ≠ checker)
<!-- tests / lint / typecheck / build exit code / schema validator / HTTP probe / screenshot diff.
     NEVER "the model says it looks good". Paste the exact command + the pass condition. -->
TODO

## 5. Budget (kill conditions)
- Max iterations: `10`
- Token / $ cap: TODO
- No-progress circuit-breaker: same error/verifier-failure `2`× in a row ⇒ mark BLOCKED, stop.

## 6. State (durable, OFF-context)
<!-- git commits + this loop's state/STATUS.md + (optional) a TODO.md checklist. -->
- git commit on green
- `state/STATUS.md` updated each tick (last run, result, next action)

## 7. Stop / Escalate
- Success ⇒ exit 0, log to `state/STATUS.md`.
- Ceiling hit / BLOCKED ⇒ escalate via the runner's `notify()` (macOS notification + append to
  `~/.claude/logs/loop-contract.log`; wire your own channel at the placeholder in `run.sh`).
- Never silently swallow a failure.
