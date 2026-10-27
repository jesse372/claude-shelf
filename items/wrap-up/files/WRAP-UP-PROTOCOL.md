# The Wrap-Up Protocol

### A checklist for the moment you say *"okay, that's done."*

Most projects don't fail when you build them. They fail **three weeks later**, quietly, when
nobody's watching — the token expired, the login session timed out, the scraper's source changed
its HTML, the cron job stopped running and **nothing told you**. By the time you find out, it's
been broken for a fortnight.

This is the protocol for the last 30 minutes of a project: the part that turns *"it works on my
machine right now"* into *"it will still be working next month, and I'll know within a day if it
isn't."* It also turns the one-off thing you just built into something reusable.

Run it before you declare **anything** done — a script, an automation, a deploy, a whole project.

---

## The 8 steps

### 1. Inventory everything you created
List it all: scheduled jobs (cron / launchd / systemd / CI), services, scripts, deployed functions,
config, state files, and — critically — **every credential, token, login session, or external
dependency it relies on.** You can't audit what you haven't listed.

### 2. Audit every unattended job for *silent failure* — this is the whole game
For anything that runs without a human watching, ask four questions:

- **Is it actually scheduled and running?** Confirm it's enabled, at the right cadence.
- **Does it alert when it fails?** On error it must tell you (a desktop notification, a log line you
  actually read, or your own channel — Slack / email / a pager) — not die quietly in a log nobody
  reads.
- **Would you know if it silently *stopped producing output*?** This is the one everyone misses.
  Handling per-run errors is *not* the same as knowing the whole pipeline quit. A scraper whose
  login expired might return **zero results with no error** — looks healthy, does nothing. **Add a
  heartbeat / staleness check:** *"if there's been no new output in N days, alert me once."*
- **What does it depend on that *expires?*** Tokens, **login sessions**, API keys, proxies/VPNs,
  OAuth, your secrets-manager session. These die silently. Add a **fallback, a cache, or an
  expiry alert.** (Rule of thumb: API tokens *can* be set to never expire; **login sessions
  always expire.** Treat every login-session dependency as a scheduled future outage.)

### 3. Test it in the *real* context, not by hand
A job that works when you run it in your terminal can fail under cron/CI/a server: different
environment variables, different working directory, no interactive login, missing tools, a
different user. **Actually trigger the unattended path** and watch it succeed. "Works when I run
it" is not "works at 3am on Tuesday."

### 4. Harden
Fix what the audit found: add the staleness watchdog, the credential fallback, the failure alert.
Then re-test. (Tip: **throttle** your alerts — a staleness nudge should fire *once*, then go quiet
for a while, so a project that's *legitimately* finished doesn't nag you forever.)

### 5. QC the logic for edge cases
Re-read your own code with fresh, hostile eyes:
- Empty / zero / single-item inputs (the "0 results" and "exactly 1" cases break naive code).
- Off-by-one and boundary values; non-consecutive ranges.
- String-splitting bugs (spaces, commas, newlines in values you parse).
- Race conditions and **idempotency** — is it safe to run twice? What if two copies overlap?
- **Silent truncation** — a "top 50" cap or a "most recent 100" limit that quietly hides data
  and makes you think you saw everything. (This one bites often: an export looks complete at 301
  items; the real total is 759, hidden behind a default page size.)

### 6. Extract the reusable thing — don't skip this
Ask: *what capability did this project produce that future-me will want pre-solved?* Package it —
a template, a script, a documented procedure, a snippet, a "skill" for your AI agent. The best
projects leave behind a tool that lets you **one-shot the next similar task.** A week of work
becomes a 5-minute command.

### 7. Write it down
Append the final architecture, the key decisions, and the gotchas to wherever you keep notes:
schedules, file paths, where the credentials live, the known failure modes. Future-you (or whoever
inherits it) will thank you. The cost is two minutes; the value is not re-deriving everything in
six months.

### 8. Give the honest final report
State plainly whether it's **truly hands-off**: what runs, on what schedule, how it screams when it
breaks, and **any known limits** — including the threshold at which they'd actually bite ("fine up
to ~20 items, then the file gets too big"). Then list the improvements you *didn't* do, so the
decision to stop is a choice, not an accident.

---

## The lessons, distilled
- **Per-run error handling ≠ knowing the pipeline stopped.** Always add a staleness watchdog for
  anything that's *supposed* to produce output on a schedule.
- **"Works when I run it" ≠ "works in cron."** Test the real, headless context.
- **Tokens can be forever; login sessions never are.** Plan the outage before it happens.
- **A default limit is a silent lie.** If something caps results, *log what it dropped*, or you'll
  mistake "the first page" for "everything."
- **Don't let the work evaporate.** The reusable skill is often worth more than the project.

---

## Use it with an AI coding agent
Paste this at the end of a build session:

> Before we call this done, run a wrap-up audit. Inventory every unattended job, service, script,
> and credential this created. For each scheduled thing: confirm it's running, that it alerts me on
> failure, that there's a staleness/heartbeat check so I'd know if it silently stopped, and that any
> expiring token/login-session has a fallback or alert. Test the headless/cron path actually works —
> not just running it by hand. Re-check the logic for edge cases (empty inputs, string-splitting,
> idempotency, silent truncation/limits). Then: extract anything reusable into a tool/template,
> write down the architecture and gotchas, and give me an honest report on whether it's truly
> hands-off — what runs, the schedule, the failure path, and any known limits — plus improvements
> you didn't do.

---

*Built from a real project (a fully-automated subtitle + streaming pipeline) where the scariest bug
wasn't anything that crashed — it was everything that could quietly stop and never say a word.*
