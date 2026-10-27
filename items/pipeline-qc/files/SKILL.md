---
name: pipeline-qc
description: >
  The universal self-healing QC framework for every JesseOS pipeline/workflow. Standing rule:
  any workflow that runs unattended should monitor AND repair itself so a human never QCs by hand.
  Provides a bash engine (qc-lib.sh) that walks each stage of a pipeline and runs every failing one
  up a 3-tier ladder: Tier 1 mechanical repair, Tier 2 headless-Claude self-repair with a verify-gate
  (the edit is kept only if the same probe goes green, else reverted), Tier 3 human escalation via a
  pluggable notifier. Use when building or hardening ANY recurring automation, adding monitoring/a
  watchdog/health checks, or when a pipeline keeps breaking silently. New skills adopt this by default;
  existing QC loops should be migrated onto it. TRIGGERS: 'self-healing', 'self-repair', 'pipeline QC',
  'health check', 'watchdog', 'monitor this workflow', 'make it self-monitoring', 'auto-repair',
  'qc loop', 'should never need to manually QC', 'add a QC loop', 'verify-gate', 'escalate'.
version: 1.0.0
pinned: true
metadata:
  tags: [Reliability, Automation, Framework, SelfHealing]
  related: []
---

# pipeline-qc

A reusable engine that makes any pipeline **self-monitoring and self-repairing**. You write the
stage probes/repairs for your domain; the engine runs the check → repair → re-check → escalate loop,
including a **headless-Claude self-repair tier** that fixes logic drift (a parser/selector/config that
broke because an upstream site changed) and is **safe by construction** — Claude's edit is kept only
if the same probe goes green afterward, otherwise it is reverted and a human is paged.

## When to use
- Building or hardening **any** recurring/unattended automation → add a `<name>-qc.sh` from the start.
- An existing pipeline breaks silently / needs a watchdog → wrap its stages in this framework.
- NOT for one-off scripts a human watches run. The point is *unattended* reliability.

## The 3-tier self-healing ladder (the core idea)
Failures come in two classes that need different fixes — the ladder routes each automatically:

| Tier | Mechanism | Handles | Stage flag |
|---|---|---|---|
| **1 — Mechanical** | a deterministic repair fn, then re-probe | service down, file missing, job behind | `--repair` (+`--critical`/`--soft`) |
| **2 — Claude** | headless `claude -p` edits a file, **gated by re-probe** | logic drift: parser/selector/config the site changed under | `--selfheal-file` + `--selfheal-prompt` |
| **3 — Human** | notifier alert (macOS notification + log; wire your own channel) | true human-gates (OTP/login), or Tiers 1–2 gave up | `--human-gate`, or any unrepaired stage |

All-green with nothing repaired → **silent** (log only). Repairs → one notification line. Unrepaired →
a notification with the exact stages. The verify-gate means a bad self-edit can never survive.

**Two built-in safety nets (free with the engine):**
- **Heartbeat / dead-man's-switch.** Every `qc_run` writes `~/.qc-heartbeats/<label>`. The independent
  `qc-heartbeat-watchdog.sh` (its own LaunchAgent, every 6h) pages you if a QC loop itself stops
  running — *who watches the watchman*. Tune the window per pipeline with `--heartbeat-maxgap <sec>`
  (default 30h).
- **Stuck-stage escalation.** A `--soft` stage that keeps kicking but never catches up isn't silent
  forever: it escalates after `--soft-escalate` consecutive runs with **no progress** (the probe's
  `$QC_DETAIL` unchanged — default 3). A stage whose detail keeps changing (e.g. "4 un-subtitled" → "3")
  is *progressing*, so it never escalates. Tip: a soft probe should return **OK** (not behind) while its
  job is *actively running* (e.g. defer on a held lock dir), so legitimate in-flight work is never
  mistaken for "behind".

## Prerequisites
- macOS `/bin/bash` (engine is bash-3.2 safe). `claude` CLI (Tier 2), `git` (for `--commit`).
- A notifier: by default the engine posts a macOS notification (`osascript`) and appends to
  `~/.claude/logs/pipeline-qc.log`. To route Tier-3 alerts somewhere durable (Telegram /
  email / ntfy / Slack), edit the `_qc_notify` placeholder in `scripts/qc-lib.sh` (and the matching
  `notify()` in `scripts/qc-heartbeat-watchdog.sh`) — there is one clearly-commented hook in each.
- Secrets/creds via your own secret manager — see `~/JesseOS/workspace/security/README.md`. Never inline.

## Quick reference
```bash
# In your <name>-qc.sh:
source "$HOME/.claude/skills/pipeline-qc/scripts/qc-lib.sh"

qc_init  --name "<label>" --lockdir <dir>/.qc.lockd \
         --logfile <dir>/qc.log --repo <dir>           # --repo enables --commit
                                                        # --model sonnet --timeout 600 --no-tidy

qc_stage --name "Service"  --probe probe_fn --repair repair_fn --critical   # Tier-1, gates downstream
qc_stage --name "Parser"   --probe probe_fn --selfheal-file <f> \           # Tier-2 self-repair
         --selfheal-context ctx_fn --selfheal-prompt prompt_fn --commit
qc_stage --name "Session"  --probe probe_fn --deep --human-gate             # Tier-3, deep mode only
qc_stage --name "Backlog"  --probe probe_fn --repair kick_fn --soft         # behind => kick, no fail

qc_run "$@"        # honors --deep
```
**Probe contract:** return `0`=OK / non-0=RED; set `$QC_DETAIL` to a one-line status. Probes run in
the current shell, so they may set globals later stages reuse.

## Procedure (adopt it in ~10 min)
1. `cp ~/.claude/skills/pipeline-qc/templates/example-qc.sh ~/<dir>/<name>-qc.sh` and edit.
2. List your pipeline's stages **in dependency order**. For each, write a `probe_*` (define what
   "healthy" means as a runnable check) and, where possible, a `repair_*`.
3. Mark the right flags: upstream infra = `--critical`; a file that drifts with an upstream site =
   `--selfheal-file/--selfheal-prompt` (+`--commit`); a human-only gate = `--human-gate` (usually
   `--deep`); a "catch up" backlog = `--soft`.
4. Schedule it: copy `templates/com.jesse.PIPELINE-qc.plist`, run it shortly **after** the workflow's
   own runs; add a once-daily `--deep` variant to catch session/auth expiry early.
5. Test (see Verification) — including a deliberately-broken self-heal target.

## Pitfalls (learned the hard way)
- **bash 3.2 only.** No associative arrays; guard every array expansion (the engine already does —
  follow its style in your probes). launchd runs `/bin/bash`, not your shell.
- **Claude prompt via STDIN.** The engine pipes it (`printf … | claude -p`); a positional prompt
  errors "Input must be provided…". It also uses `--dangerously-skip-permissions` (headless, no TTY)
  and a `timeout` (default 600s; sonnet repair takes ~2–4 min).
- **Probes set globals, so don't run them in `$(subshell)`** — the engine calls them directly and
  reads `$QC_DETAIL`. Keep probes self-contained (re-compute on each call) so the verify-gate is real.
- **Schedule QC after the workflow, not before** — it grades fresh output.
- **Don't alert on green.** Silence on healthy runs is intentional (anti-fatigue). Only repairs/failures page.

## Verification
```bash
/bin/bash ~/<dir>/<name>-qc.sh            # must run clean under 3.2 and report each stage
# Prove Tier-2 actually self-heals: break a --selfheal-file target, then re-run; the loop should
# fix it, verify green, keep+commit — and revert+escalate if you make it unfixable.
```
