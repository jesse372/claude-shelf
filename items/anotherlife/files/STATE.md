# Where things stand

Life-sim game (BitLife-like), Capacitor 6 → Android/iOS. Web code in `www/`,
engine is DOM-free and Node-testable.

## Current state: working, both APKs built
- `dist/AnotherLife.apk` (release), `dist/AnotherLife-dev.apk` (live-reload)
- Rebuild: `./scripts/release-apk.sh`, `./scripts/dev-apk.sh`
- Serve locally: `python3 serve.py` (port 8777, no-store headers, `/__rev`)
- Dev hooks only fire off-localhost — test via the LAN IP, not `localhost`

## The screen belongs to the life
Budget it. It was 52% chrome / 48% life, 8 visible lines, with 18% of every
line's width lost to a year gutter. Now 28% / 72%, 15 lines, full-width text.
The app's own name is not information and no longer has a bar. Identity is one
slim line (`.idbar`) — name, age, balance, and what you're doing — and tapping
it opens the status sheet (`statusSheet`, `currentTab === "status"`) which
holds the dossier, the numbered gauges, money, background and conditions.
On-screen stats are a 24px ribbon; warnings only render when something is
actually wrong. Re-measure with the /tmp/measure.mjs pattern after any change
to the header.

## Effects (`www/js/fx.js`)
Six: `hit` (red damage vignette + shake + thud), `money` (falling notes + coins),
`love`, `police` (red/blue wash + siren), `death` (the room closing in), `cheer`.
**No audio files** — every sound is synthesised with WebAudio at play time, so
there is nothing to license and the app stays fully offline. **Sound is written
blind, so measure it**: render through an `OfflineAudioContext` and check
duration, internal gaps and the pitch contour (see the browser-probe skill).
That is how the first "siren" was caught — four square beeps with silence
between them. A siren is one voice that never stops moving, which is what the
`sweep()` primitive is for. Effects hang off
real outcomes: a result can set `fx:"..."` explicitly, otherwise `inferFx()`
works it out (arrest, health ≤ −18, a windfall ≥ 25k that beats 1.5× your prior
balance, fame ≥ 12). Deliberately rare — median 6 per whole life. `play()` never
throws; decoration must not be able to break the game. Sound has a switch in
Menu → Settings and everything respects `prefers-reduced-motion`.

## Auditioning sounds
`http://<LAN-IP>:8777/sound-test` — dev-only page (lives in `tools/`, never in
`www/`, so it cannot ship) with a button per effect. Whoever writes synthesised
audio cannot hear it, so this is how a human checks it.

## Look and feel — deliberately not BitLife
The stylesheet used to open with "BitLife layout, blue where BitLife is red".
That is gone. Default is **paper**: unbleached `#f8f3ea`, warm brown ink, one
brass accent (`--amber #9c6612` for type, `#e9a13c` as a surface), a serif for
anything naming a person / year / sum, hairlines instead of stacked cards.
A **bark** theme ships behind Menu → Appearance (`[data-theme="dark"]` — the
same layout, different variables, persisted in `anotherlife.theme` and applied
by an inline script in `<head>` so switching never flashes).
Two things that only show up on paper: in-app marks must pass
`ring:"currentColor"` (cream rings vanish on a light page), and log lines are
plain ink for good news — nearly every entry is a good one, and tinting them
all green was a wall of green.
Structurally different too: a dossier header with the ring glyph and a big age
numeral, four counted tick-gauges instead of stacked emoji bars, the log as a
timeline down a year gutter, a flat amber age bar, drawn SVG nav glyphs.
Sections are Work / Estate / People / Pastimes.

**The mark lives in `www/js/mark.js`** — eccentric growth rings, outermost left
open because the year isn't finished. It is the single source for the app icon,
the splash, the favicon, the in-app glyph (one ring per ~16 years) and the
closed-ring seal on the death card. After editing it run:
`node tools/build-icons.mjs && npx capacitor-assets generate --android --assetPath resources`

## Files
- `www/js/engine.js` — all rules, no DOM
- `www/js/main.js` — all DOM. `SUBS` map = sub-sheets; the big `switch` = actions
- `www/js/util.js` — `afford(g,n)` (spendable money) and `local(g,n)` (price
  scaled to country cost of living). **Use these for any new money amount.**
  `moneyShort(g,n)` gives `$4.2B` — **display only, never on a row that charges**
- `www/js/{events,events-more,events-wild,events-culture}.js` — ~260 events
- `www/js/weave.js` — the composition layer. Prompts that are fixed strings
  are the same sentence in every life ever played; these compose from named
  people you actually know, your city, a time, weather, a detail. **Rule: every
  slot must read naturally against every other slot** — "a bag of shopping with
  an address inside" is the failure mode, which is why `container()` exists
  separately from `smallObject()`, and `livingKin()` never names the dead.
- `www/js/events-woven.js` — `WOVEN` (keyed to habits, work, people, age, and
  callbacks to choices made decades earlier) and `CIRCUMSTANCE` (keyed to
  money, children, partner, record, health, looks, smarts — so a rich childless
  ex-con and a broke parent of four draw different decks).
- `www/js/events-work.js` — events that belong to the job you actually do.
  Targeted by `job:"fire"`, `jobAny:[...]`, `sector:"Healthcare"` or
  `working:true` (all handled in the engine's pool filter). Results may carry
  `leave:{years,reason,comp}` to sign you off work — the job is held for two
  years, compensation pays a fraction of salary, then the employer moves on —
  and `die:"cause"` to be fatal outright. **Keep the fatal branches rare**:
  the first draft was a coin flip and killed 37% of electricians in a career.
  Measure with the /tmp/t_workdeath.mjs pattern, which counts deaths *by
  cause* against a desk-job control; 0.5-3% per 35-year career is the band.
  `g.habits` is a lifetime tally of activities (g.acts is wiped yearly) so
  content can react to what you keep doing.
- `www/js/events-childhood.js` — the first fifteen years, banded 0-2 / 3-5 /
  6-8 / 9-11 / 12-15. **Keep bands honest**: anything that reads the same at
  three and at thirteen is in the wrong file. Childhood ran on 53 events and
  ages 0-4 had 0-5 to draw on, so chickenpox appeared in 88% of lives and two
  childhoods shared 36% of their content. Now 120 distinct events fire, top
  event ~42%, overlap 14%. Measure with the /tmp/t_variety.mjs pattern before
  and after touching childhood weights.
- `www/js/jobs.js` — 519 jobs, `{ id, sector, name, tier, base, ladder[4], gradType? }`.
  A graduate qualifies for ~476 of them, so **the listings screen is
  sector-first** (`SUBS.jobsec`) and locked jobs are summarised by requirement
  rather than printed one by one. Ranked professions carry their real ladders;
  the rest use the `step()`/`grow()` patterns. `data.js` re-exports JOBS so
  every existing import still works.
- `www/js/{data,modes,systems,archetypes,store}.js`
- `STORE.md` — SKUs, keystore, Play Console, iOS

## The endgame (added because a billionaire had nothing to buy)
Assets is a hub now: what you own at the top, shops as sub-sheets underneath
(`SUBS.shop` → `shopSheet(kind)`, banded by price, cheapest first).
- `HOUSES`/`CARS`/`LUXURY` run to $4.2B / $1.8B / $450M. `CARS` entries carry
  `dep` (most bleed value, collectibles gain); anything over $1M costs 2.2%/yr
  to keep, luxury over $5M costs 0.4%/yr.
- `EMPIRE` — 22 going concerns, $2.5M→$14B. Each has `yield` (annual profit as
  a fraction of valuation), `drift` (valuation move) and `fame`/yr. Ticked in
  `ageEmpire()`. Deliberately tuned so trophies (club, studio, rocket) lose
  money and buy fame, while the boring ones (bank, foundry) pay — a diversified
  empire lands under the index fund's 6.5%.
- `LEGACY` — 20 one-off, unsellable, not counted in net worth: titles,
  experiences, philanthropy up to $20B. `buyLegacy()`. Each carries `done`, a
  past-tense sentence for the log.
- New ribbons: Billionaire, Tycoon, Collector, Benefactor, Saint.

## Variety is a weighting problem, not a volume problem
Measured, not guessed. Two whole lives used to share **42%** of the events that
happened to them, and **36 events fired in 80%+ of every life** — every
character found a wallet. A life burns through only ~29% of what its age
windows make available, so the pool was never the ceiling: concentration was.
Fix was iterative — find everything firing in 78%+ of lives, cut its `w`,
repeat. Now 34% overlap and **3** near-universal events, with density
unchanged (4.0 lines a year, 84 decisions a life, 2.5% quiet years).
Harnesses: /tmp/t_overlap.mjs (life-to-life overlap), /tmp/t_common.mjs (what
fires in nearly every life), /tmp/t_density.mjs (did the cuts drain it?),
/tmp/t_variants.mjs (distinct readable scenes).

## Six traps that have each caused real bugs
1. `Math.min(g.money, cost)` credits you when overdrawn. Always `afford()`.
2. `safe()` swallows handler exceptions, so a broken event silently does
   nothing. Run the handler check (below) after touching events.
3. **An event that assumes something about you must `req` it.** "A booking has
   walked in" fired at people who had never done sex work, because the event
   was gated only on the 18+ switch. Doing a thing has to leave a durable
   trace: `sexWork()` sets `flags.soldsex`, `useDrug()` and `addict()` set
   `flags.usedDrugs` (at `addict()` because addiction can arrive by event and
   later be beaten — the *fact* is permanent, the habit isn't). Audit with the
   /tmp/t_assume.mjs pattern, which samples each event's text for "your
   boss/client/dealer/partner/kids/car/business" and flags any with no `req`.
   Note `events-wild.js` had no `F` helper — a `req` reading a flag there
   threw, `safe()` swallowed it, and the event silently never fired, which
   looks exactly like a fix.
4. **A broke character must not be able to hand money over.** Two separate
   shapes, both were live: an unguarded `money:-X` that pushes you negative
   (fine for a *debt* — a fine, a student loan, damages — never for theft or a
   purchase, since you can only be robbed of what you have), and `afford()`
   correctly returning 0 while the text still says "You donated $0". Test with
   the /tmp/t_broke.mjs pattern: run every option of every event at `money = 0`
   and assert the delta is never negative and no payment is claimed that did
   not happen. Only three deliberate debts should remain.
5. **`renderFeed` must rebuild the open year, never append its tail.** An
   outcome is written directly *after* the question that caused it (engine
   `insertAt` splices mid-array), so when two decisions land in the same year,
   answering the first shifts everything after it. Counting DOM nodes and
   appending from there re-printed the second question and silently dropped
   the outcome — you made a choice and it looked like nothing happened, in
   ~6% of years. Compare the DOM against `__dev.g.log` (dev hooks need the
   LAN address, not localhost) rather than trusting the log alone: the data
   was correct the whole time, only the screen was wrong.
6. **A low `w` does not make a childhood event rare.** The pool a six-year-old
   is eligible for is tiny, an unseen event is weighted up 3x, and the age
   window is a dozen years wide, so a small weight only delays it. Childhood
   migration was firing in 38.8% of lives on `w:6`. Use `rareLife(g, key, p)`
   in `events-culture.js` — one coin flip per life, remembered in `g.flags` —
   for anything that should shape a minority of lives. Both childhood
   migration events sit at `p = 0.15` and also require `stillHome(g)`, which
   is what stops them chaining (emigrate to Australia and you instantly
   qualified for the expat-dad event to Bali). Measured after: 5.5% of lives
   move as a child, 8.9% for a player who always takes the eager option, 0%
   move twice. Harness: /tmp/t_migrate.mjs pattern — answer `pendingChoices`
   via `E.resolveChoice(g, c.id, c.choices[i].idx)` or you measure 0%.

## serve.py must stay threaded
It used to be a plain `socketserver.TCPServer`: one connection at a time,
listen backlog 5. The app is ~20 files (16 ES modules) and a WebView opens six
connections at once, so whenever the server was *also* doing something — a
second device, an APK download, a headless-Chrome probe — connections were
RESET mid-load. On the phone that reads as `net::ERR_CONNECTION_ABORTED`, and
since a failed module import stops everything, the app just doesn't start. It
looks exactly like the server being down. Reproduce with a parallel fetch of
all ~18 assets while something else pulls `/AnotherLife.apk`: single-threaded
lost 1-2 requests per round, threaded is 720/720.

## When the phone can't reach the Mac
Three different failures have looked identical from the sofa. Read the error,
they mean different things:
- `ERR_CONNECTION_REFUSED` — nothing listening. The server is stopped.
- `ERR_CONNECTION_ABORTED` — server up but resetting connections. That was the
  single-threaded `serve.py`; see the threading note above.
- `ERR_CONNECTION_TIMED_OUT` — packets are not arriving at all. The Mac is
  fine; the network path is not. Phone on a different SSID/band (this Mac sits
  on `The Wifi_5G`), router client-isolation, or mobile data. **Nothing on the
  Mac can fix this** — check the Mac's IP still matches the one baked into the
  dev APK's `server.url`, then stop debugging the server.
- A **blank white page** in the dev APK is usually just one of the above
  before the WebView gets round to drawing its error page.

Route around it entirely with the tunnel — works over mobile data, any Wi-Fi,
anywhere:
```bash
cloudflared tunnel --url http://127.0.0.1:8777 --no-autoupdate
```
It prints a `https://<random>.trycloudflare.com` URL. The game is a web app, so
that URL plays in the phone's browser with no install, and `/AnotherLife.apk`
downloads from it too. The URL dies with the process and is different each run.

## The dev APK needs the Mac. The release APK does not.
`dist/AnotherLife-dev.apk` loads its code from `http://<LAN-IP>:8777`, so it
shows ERR_CONNECTION_REFUSED the moment `serve.py` stops. **Do not kill the dev
server as part of tidying up.** `dist/AnotherLife.apk` bundles everything and
never depends on this machine — install that one for ordinary play.

Do *not* try to keep the server alive with a LaunchAgent: launchd-spawned
python stalls before it binds the socket (process alive, no listening FD, no
libs loaded) because the project lives under `~/Documents`, which is
TCC-protected, and a daemon has no way to answer the consent prompt. Start it
from a shell that already has the grant.

## Test harnesses (all in /tmp, recreate as needed — see git log for what they assert)
- every event handler runs without throwing (~92k invocations)
- 1,200-life regression: lifespan, invariants, no minors homeless
- 3,000 debt-heavy lives: debt must never reset to zero
- headless Chrome sweep: every priced row charges exactly what it displays

## Shipping — read before you build for a store
- `scripts/release-apk.sh` → **debug-signed** APK, sideload onto your own phone only.
- `scripts/store-aab.sh` → the signed AAB for Play. Refuses to run without
  `android/key.properties`, with CHANGEME still in it, with a dev server block,
  or with a versionCode you've already uploaded — and checks the bundle really
  is signed before handing it over. After a successful upload:
  `echo <versionCode> > dist/.last-uploaded-versioncode`
- The phone currently runs a **debug-signed** build. A store build is signed
  with a different key and **cannot upgrade over it** — it has to be
  uninstalled first, which loses that device's save.

## Open / user-blocked
- iOS needs Xcode installed by the user
- Play Console + App Store accounts, and creating the IAP products, are
  user actions. Comp code for friends: `MATESRATES`.
