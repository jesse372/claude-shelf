---
name: loop-contract
description: "Scaffold any recurring task as a proper self-healing loop with a verifiable CONTRACT (goal, scope, deterministic verifier, budget/max-iters, stop+escalate) before it ever runs. Use whenever a task should run again — daily/weekly/on-a-condition — or the SECOND time a manual task recurs. Pairs with pipeline-qc (the runner). TRIGGERS: 'make this a loop', 'loopify', 'second time', 'turn this into a loop', 'every day', 'monitor this', 'recurring task', 'should this be a loop', 'automate this', 'run this on a schedule'."
version: 1.0.0
pinned: false
metadata:
  tags: [Automation, Loops, Meta]
  related: [pipeline-qc, wrap-up]
---

# Loop Contract

Every loop is born with a written **contract** before a single line of runner code. The contract is the
2026 "loop engineering" consensus distilled to 7 fields — it forces a *verifiable* goal and *bounded*
stop conditions so a loop helps unattended instead of "automating drift." This skill turns "make this a
loop" into a filled contract + a runner stub already wired to `pipeline-qc` self-healing and a generic
notifier for escalation.

## When to use
- A task will recur (daily / weekly / whenever some condition occurs) — propose the loop FIRST.
- The **second time** you do the same manual task → flag it and loopify.
- Any new unattended automation, watchdog, monitor, or health check.
- NOT for genuine one-offs (just do the task) — but say so in one line rather than silently skipping.

## Prerequisites
- `pipeline-qc` skill (the self-healing runner engine: `qc-lib.sh`, 3-tier repair ladder), if present.
- A notifier for escalation: this skill ships a generic `notify()` that posts a macOS notification and
  appends to `~/.claude/logs/loop-contract.log`. Wire your own channel (Slack/Telegram/email/
  ntfy/etc.) at the commented placeholder in `run.sh` if you want push alerts.
- A cheap model for the work tick: headless `claude -p --model haiku` (never inherit a costly default).
- Any credentials the loop needs come from your own secret manager (Keychain/1Password); see
  `~/JesseOS/workspace/security/README.md`.

## Quick reference
```bash
# Scaffold a new loop (contract + runner stub + state dir), then open the contract to fill it in:
~/.claude/skills/loop-contract/scripts/new-loop.sh <loop-name> "<one-line goal>"
# -> creates ~/JesseOS/workspace/loops/<loop-name>/{contract.md,run.sh,state/}
```
| Field | What it pins down | Bad → Good |
|---|---|---|
| **Trigger** | what starts a tick | "sometimes" → "launchd daily 09:00 / on CI-fail" |
| **Goal** | a *verifiable END-STATE* | "improve data" → "14 episodes parsed, schema-valid" |
| **Scope/Action** | allowed tool surface | "do whatever" → "read+edit `src/`, run tests" |
| **Verifier** | *deterministic* proof | "looks done" → "`npm test` exit 0 / probe green" |
| **Budget** | max-iters + token/$ cap | "until done" → "≤10 iters, ≤200k tok" |
| **State** | durable record off-context | "(none)" → "git commit + `state/STATUS.md`" |
| **Stop/Escalate** | kill + handoff | "loops forever" → "circuit-break 2× same err → notify" |

## Procedure
1. **Filter (1 line):** recurring + checkable? If genuinely one-off, say so and just do it.
2. **Scaffold:** run `new-loop.sh <name> "<goal>"`.
3. **Fill the contract** (`contract.md`) — all 7 fields. The Goal must be a state a *separate* check can
   confirm; the Verifier must be deterministic (tests/lint/types/schema/HTTP probe), **never** the
   model grading itself ("maker ≠ checker").
4. **Wire the runner** (`run.sh`): do ONE unit of work per tick on a cheap model, run the verifier,
   commit on green / mark `BLOCKED` on repeat failure, escalate at the ceiling. Reuse `pipeline-qc`'s
   `qc-lib.sh` for the 3-tier repair ladder rather than reimplementing.
5. **Confirm**, then schedule (launchd / cron / `/loop`). Check the inventory first so you
   don't duplicate an existing loop.
6. **Record** the new loop in memory (`~/JesseOS/vault/50-memory/decisions.md`) and note it wherever you
   track active automations.

## Pitfalls
- **Vague goal** (biggest failure mode, ~42% of agent failures): a goal a deterministic check can't
  confirm is not a loop, it's a wish. Rewrite as an end-STATE.
- **Maker grades itself** → use a separate verifier step/agent; self-evaluation is biased.
- **No kill conditions** → always set max-iters + budget + a no-progress circuit-breaker (e.g. same
  error twice ⇒ BLOCKED) + a human escalation path. Otherwise it burns tokens or drifts silently.
- **Costly model on the tick** → loops make 10×–100× the calls; pin `--model haiku`/`sonnet` for the work.
- **State in the conversation** → keep state on disk (git + `state/`), not in a growing context window.

## Verification
```bash
# A scaffolded loop is real if: contract has no TODO left, runner is executable, verifier exits nonzero on a seeded failure.
LOOP=~/JesseOS/workspace/loops/<loop-name>
! grep -q 'TODO' "$LOOP/contract.md" && test -x "$LOOP/run.sh" && echo "contract complete + runner executable"
```
