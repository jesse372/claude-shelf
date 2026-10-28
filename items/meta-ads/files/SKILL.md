---
name: meta-ads
description: Run Jesse's Facebook/Meta ads from the command line — duplicate campaigns/ad sets/ads, edit names, budgets and status, pause/resume, and pull performance reports (spend, CTR, leads, cost-per-lead). Draft-then-confirm by design: every write produces a PLAN showing the exact API calls, and nothing reaches Meta until a human runs `apply --confirm`. Reads are free and instant. TRIGGERS: 'facebook ads', 'meta ads', 'fb ads', 'my ads', 'ad account', 'duplicate that ad', 'duplicate the campaign', 'clone the ad set', 'pause that campaign', 'turn off that ad', 'raise the budget', 'increase budget', 'lower the budget', 'how are my ads doing', 'ad performance', 'cost per lead', 'CPL', 'which ad is working', 'ads manager', 'campaign performance', 'scale the winner', 'kill the loser'.
---

# meta-ads

Jesse makes the creative. This skill does the mechanical work around it: duplication,
edits, budget changes, pausing, and analysis — against the official Meta Marketing API.

**Entrypoint:** `~/.claude/skills/meta-ads/scripts/ads.sh`

First run? See `SETUP.md` (one-time, ~10 min, needs a browser). Then `ads.sh doctor`.

---

## The one rule: writes are plan-gated

Ads spend real money, so **no command ever changes the account directly.**
`duplicate`, `edit`, `pause`, `resume` all just write a **plan** — a JSON file listing the
exact API calls, with budgets shown in both dollars and the raw minor units Meta receives.

```
ads.sh edit AS123 --daily-budget 75     # writes a plan, changes NOTHING
ads.sh apply <plan-id> --confirm        # only this touches Meta
```

`apply` without `--confirm` is a dry run. An applied plan cannot be re-applied by accident.
Duplicates default to **PAUSED**, so a new copy can never start spending unreviewed.

**Agents must never pass `--confirm` on their own.** Generate the plan, show it to Jesse,
and let him run the apply line. That is the whole safety model — don't route around it.

---

## Reading (safe, no confirmation)

```bash
ads.sh doctor                          # token + account + permission check
ads.sh accounts                        # every ad account this token can see

ads.sh list campaigns                  # all campaigns w/ status + budget
ads.sh list adsets --status ACTIVE
ads.sh list ads --parent AS123         # ads inside one ad set

ads.sh report                          # last 7d by campaign
ads.sh report --level ad --days 30     # last 30 complete days, per ad
ads.sh report --level adset --preset last_14d
ads.sh report --since 2026-08-01 --until 2026-08-31
ads.sh weekly                          # last 7d vs prior 7d + Turn off / Scale / Freshen verdicts
```

`report` shows spend, impressions, clicks, CTR, CPC, leads and **cost per lead** —
CPL being the number that actually matters for wedding enquiries.

## Writing (always two steps)

```bash
# duplicate — copy starts PAUSED
ads.sh duplicate C123                          # one copy
ads.sh duplicate AS123 --count 3               # three copies (creative testing)
ads.sh duplicate AS123 --name "Spring - Broad" # exact name
ads.sh duplicate C123 --deep                   # include child ad sets + ads
ads.sh duplicate AD123 --into AS456            # copy an ad into a different ad set

# edit — budgets are in whole dollars; the plan shows the minor-unit value
ads.sh edit AS123 --daily-budget 75
ads.sh edit C123 --name "Q4 - Engaged Couples"
ads.sh edit AD123 --status PAUSED

ads.sh pause AS123
ads.sh resume AS123

# then review + execute
ads.sh plans                    # everything pending
ads.sh show <plan-id>
ads.sh apply <plan-id> --confirm
```

Plans live in `~/.meta-ads/plans/` and keep the API response after applying, so there's an
audit trail of what changed and when.

---

## Notes for whoever runs this

- **Budgets are per-day unless the object uses a lifetime budget.** `--daily-budget 75`
  means $75/day. The plan prints the % change vs the current budget — read it before confirming.
- **Meta rejects budget cuts of more than ~30% on ad sets in the learning phase**, and big
  swings reset learning. Prefer stepped changes.
- **0 leads with real spend** usually means pixel/CAPI mapping, not bad ads. The report
  prints a warning when it sees that, so don't diagnose creative off a broken conversion signal.
- Ads point at <https://www.jessechance.com/sale> (see vault memory) — check the landing page
  is up before blaming ad performance.
- API version is pinned in `scripts/metaads.py` (`META_API_VERSION` overrides it). Meta
  retires versions roughly every 2 years; `doctor` will tell you when it's time to bump.

## Tests

`python3 scripts/test_metaads.py` — stubs the API and asserts the safety properties:
money conversion is exact, planning issues no writes, `apply` without `--confirm` is inert,
duplicates default to PAUSED, plan ids never collide, applied plans don't re-run.

## Weekly email

`~/JesseOS/workspace/loops/meta-ads-weekly` emails `ads.sh weekly` to Jesse every Monday 07:41
(read-only; rules in its `contract.md`). Until a token exists it sends a setup nudge at most
every 28 days. Lead counts take each Meta action family once (`lead` already includes
`offsite_conversion.fb_pixel_lead`), so CPL isn't halved by double counting.
