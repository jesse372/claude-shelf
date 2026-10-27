#!/usr/bin/env node
/* Ready-made screen sweep: load a URL, run the named selectors, report any
   uncaught exception or console error. Bespoke probes should import cdp.mjs. */
import { connect } from "./cdp.mjs";
const argv = process.argv.slice(2);
/* Honour --port. Without it the probe silently attaches to whatever stale
   Chrome is already on 9222 — a different project's browser — and reports
   confidently on the wrong page. */
let port = 9222;
const pi = argv.indexOf("--port");
if (pi !== -1) { port = Number(argv[pi + 1]); argv.splice(pi, 2); }
const args = argv;
if (!args.length || args[0] === "--help") {
  console.log(`usage: probe.mjs <url> [selector-to-click ...]
  Loads the url, clicks each selector in turn, screenshots to /tmp/probe-N.png,
  and reports every uncaught exception and console error.

options:
  --port <n>   CDP port (default 9222). Pass it, or you may attach to a stale
               Chrome from another project and test the wrong page entirely.`);
  process.exit(0);
}
const [url, ...clicks] = args;
const { ev, click, shot, goto, errors, close } = await connect({ port });
try { await goto(url); }
catch (e) { console.error("  " + e.message); close(); process.exit(1); }
await shot("/tmp/probe-0.png");
let i = 1;
for (const sel of clicks) {
  const found = await click(sel);
  await shot(`/tmp/probe-${i}.png`);
  console.log(`  ${found ? "clicked" : "NOT FOUND"}  ${sel}  -> /tmp/probe-${i}.png`);
  i++;
}
console.log(errors.length ? `\n${errors.length} problem(s):\n  ` + errors.join("\n  ") : "\nno exceptions or console errors");
close();
process.exit(errors.length ? 1 : 0);
