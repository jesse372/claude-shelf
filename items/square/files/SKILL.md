---
name: square
description: Read and update Jesse's Square catalogue — service prices for Luxe Beauty Yanchep (and any other Square merchant) — from the command line. Keeps the website and the Square booking page in sync by treating the site as the source of truth, diffing it against the live catalogue, and pushing the difference. Draft-then-confirm by design: every write produces a PLAN, and nothing reaches Square until a human runs `apply --confirm`. Reads are free and instant. TRIGGERS: 'square prices', 'update square', 'square catalogue', 'square catalog', 'square booking', 'square appointments', 'price change', 'update the prices', 'raise prices', 'put prices up', 'change the price of', 'luxe beauty prices', 'sync prices', 'do the site and square match', 'service menu', 'booking prices'.
---

# square

Square is where Luxe Beauty Yanchep takes bookings
(`squareup.com/appointments/book/Q0QM7TJZ6949G`). The website publishes the price list.
Those two drift apart. This skill makes the **website the source of truth** and pushes the
difference into Square.

**Entrypoint:** `~/.claude/skills/square/scripts/square.sh`

First run? See `SETUP.md` (one-time, ~5 min, needs a browser). Then `square.sh doctor`.

---

## The one rule: writes are plan-gated

A wrong price is money out of Jesse's pocket and an argument with a client at the door, so
**no command changes Square directly.** `plan` writes a JSON plan showing every price
change as `old -> new`. Only `apply --confirm` touches the live catalogue.

```
square.sh plan                      # diff site vs Square — changes NOTHING
square.sh show <plan-id>            # render it for the human
square.sh apply <plan-id> --confirm # only this writes to Square
```

**An agent must never pass `--confirm` on its own initiative.** Show Jesse the rendered
plan, get an explicit yes for those specific prices, then apply.

## Commands

| Command | What it does |
|---|---|
| `install-token '<TOKEN>'` | Store the access token in the Keychain (one time) |
| `doctor` | Token, merchant, location, currency, how many services found |
| `services [--json]` | Live Square services + current prices |
| `prices [--site DIR] [--no-csv]` | The canonical list scraped from the website |
| `plan [--site DIR] [--no-csv]` | Diff site vs Square, write a plan, print it |
| `plans` | List recent plans and whether they were applied |
| `show <plan-id>` | Re-render a plan |
| `apply <plan-id> --confirm` | Push it. Without `--confirm`, dry run (exit 2) |
| `token-status` | JSON probe used by auth-keepalive |

Default `--site` is `~/JesseOS/projects/luxe-beauty-yanchep`.

## How matching works

Service names are normalized (case, `&`/`and`, punctuation) and matched against **both**
the Square item name and the variation name, because Square Appointments shops are set up
either as one item per service ("Classic Full Set" / variation "Regular") or one item per
category ("Lash Extensions" / variation "Classic Full Set"). Both layouts work.

Anything the matcher can't resolve **is never guessed at**. It lands in one of three
buckets printed with every plan:
- `ambiguous` — more than one Square match; skipped, listed for a human
- `only_on_site` — advertised but not bookable in Square (a lost booking)
- `only_in_square` — bookable but unadvertised (often refills, which the site doesn't price)

## Safety properties worth keeping

- **Re-fetch before write.** `apply` re-reads each variation, and refuses to write if the
  live price no longer matches what the plan was built from (someone edited Square in the
  meantime). Override only with `--force` once you've looked.
- **Applied plans can't be replayed.** A plan records when it was applied and refuses a
  second run — re-`plan` instead, so the diff is against reality.
- **Only appointment services are touched.** Retail products (`product_type != APPOINTMENTS_SERVICE`)
  are ignored even if they share a name.
- **Prices only.** This skill never renames, deletes, or creates catalogue objects, and
  never touches durations, staff, or availability.
- Every applied change appends to `~/.claude/logs/square-writes.log`.

## The website side

`services.html` is parsed structurally (`<div class="row">` → `.name` + `.price`), not by
guessing "the text near a dollar sign". If that markup changes, `prices` raises instead of
returning a half-empty list. Services that exist only in
`marketing/square-services-import.csv` (the refills, which the site deliberately doesn't
publish) are included and tagged `[csv only]`; `--no-csv` drops them.

## Tests

```sh
python3 ~/.claude/skills/square/scripts/test_squarecat.py
```

15 offline tests, no network or token: name matching, both catalogue layouts, drift
detection, replay refusal, and the rule that `--confirm`-less apply sends nothing.

## Keepalive

Registered with **auth-framework** as target `square`. Every ~6h it probes the token and
alerts if it's missing or rejected — a Square personal access token doesn't expire on a
timer, but it does die if rotated or revoked, and you don't want to find that out on a
morning you're changing prices.
