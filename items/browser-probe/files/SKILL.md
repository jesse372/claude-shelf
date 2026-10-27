---
name: browser-probe
description: "Drive a real headless Chrome over CDP from plain Node — no Playwright/Puppeteer install — to TEST A WEB OR CAPACITOR APP'S ACTUAL UI: screenshot every screen at phone metrics, sweep for uncaught exceptions, and compare the rendered DOM against the app's own state to catch bugs that live only in rendering. Use when you need to prove a UI change works rather than assume it, verify a mobile web/Capacitor build, hunt a 'looks wrong but the data is right' bug, or screenshot a flow. TRIGGERS: 'test the UI', 'check it renders', 'screenshot the app', 'does it look right', 'headless chrome', 'browser test', 'verify the frontend', 'capacitor app', 'it looks wrong but the data is fine', 'white screen', 'e2e test', 'smoke test the app'."
version: 1.0.0
metadata:
  tags: [Testing, Frontend, Web, Mobile, QA]
---

# browser-probe — prove the UI, don't assume it

Chrome is already on this Mac. You do not need a test framework to drive it: launch it with
`--remote-debugging-port` and talk CDP over the WebSocket that Node has had built in since v22.

```bash
~/.claude/skills/browser-probe/scripts/launch.sh          # start headless Chrome
node ~/.claude/skills/browser-probe/scripts/probe.mjs --help
```

`scripts/cdp.mjs` is the whole driver (~40 lines). Import it and write a bespoke probe — that is
the point, the probes are meant to be written per-bug.

## The three probes that actually earn their keep

**1. Screen sweep — does anything throw?**
Walk every tab/route/sub-screen in several app states (empty, full, error, logged-out) and collect
`Runtime.exceptionThrown` + console errors. Catches the white-screen class in one run.

**2. DOM vs state — the bug that state-scanning cannot see.**
Compare what is on screen against the app's own model:
```js
const mismatch = await ev(`(() => {
  const model = __dev.state.items.map(i => i.text);      // your app's truth
  const dom   = [...document.querySelectorAll(".row")].map(e => e.textContent);
  return model.length === dom.length && model.every((t,i) => t === dom[i]) ? null : { model, dom };
})()`);
```
**Scanning the data model alone will tell you everything is fine.** A real bug shipped for weeks
because the data was always correct and only the incremental renderer was wrong.

**3. Audio you cannot hear — measure it.**
Synthesised sound is written blind. Render it through an `OfflineAudioContext` and check the
numbers instead of trusting your intention: duration above a noise floor, internal silent gaps,
peak level, and a pitch contour by autocorrelation every 100ms. A "siren" built from short beeps
shows up immediately as gaps plus a flat contour; a real one is continuous with a pitch that
oscillates. Swap `window.AudioContext` for a Proxy over the offline context that reports
`state: "running"`, so code which calls `resume()` still works.

**4. Invariant at the boundary.**
Drive the UI with a deliberately extreme state (zero money, no records, 10,000 rows, a 60-character
name) and assert the invariant that must hold.

## Hard-won pitfalls

- **A sandboxed shell often cannot reach a server it did not itself start.** If `curl` to your own
  dev server returns `000` while the process is plainly listening, re-run the check outside the
  sandbox before concluding the server is broken.
- **Dev hooks are usually gated on hostname.** Apps commonly do
  `IS_DEV = hostname !== "localhost"`. Load the page over the machine's **LAN IP** to get
  `window.__dev`, or your probe silently tests the production path.
- **Headless never advances the animation timeline.** A CSS animation reports
  `playState: "running"` while its `currentTime` stays pinned at 0, so every screenshot catches
  frame one and you conclude the effect is broken. Don't sleep — *scrub*:
  ```js
  for (const el of document.querySelectorAll("#fx *, #app")) 
    for (const a of el.getAnimations()) { a.currentTime = 300; a.pause(); }
  ```
  Deterministic, and it captures the exact frame you want every time.
- **Wait for animations before `captureScreenshot`** (~400ms) or you photograph a half-faded modal
  and think the layout is broken.
- **Measure the layout, don't eyeball it.** `getBoundingClientRect().height` per region ÷
  `innerHeight` turns "feels cramped" into "52% of the screen is chrome", which is arguable.
- **Never kill a dev server someone's device is pointed at.** If a phone runs a live-reload build,
  stopping the server bricks their app until you restart it.
- **A probe that cannot reach the app must fail, not pass.** Navigating with `location.href` to a
  dead server loads a Chrome error page which throws nothing — a confident green while the app is
  down. `goto()` uses `Page.navigate` and fails on `errorText` or an empty body.
- **Errors leak across page loads.** Reuse one browser for two probes and the first page's
  exceptions are reported against the second. `cdp.mjs` clears its buffer on
  `Runtime.executionContextsCleared`; if you write your own listener, do the same or you will
  chase a bug that belongs to a page you already left.
- Prefer `--user-data-dir=/tmp/<name>` per project; a stale profile causes baffling behaviour.

## Verify
A probe run is only useful if it can fail. Break something on purpose (throw in a handler, make
`localStorage.setItem` throw) and confirm the probe reports it, before trusting a green run.
