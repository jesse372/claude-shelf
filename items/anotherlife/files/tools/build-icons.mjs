/* Renders every icon/splash the app ships from tools/mark.mjs, via headless
   Chrome (the one renderer we know is on this machine). Re-run after any
   change to the mark:  node tools/build-icons.mjs  */
import { markSVG, INK, CREAM, AMBER } from "../www/js/mark.js";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function png(out, w, h, html, transparent = false) {
  const f = `/tmp/icon-src-${Date.now()}-${Math.random().toString(36).slice(2)}.html`;
  fs.writeFileSync(f, `<!doctype html><meta charset="utf-8">
<body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;${transparent ? "" : `background:${INK};`}
 display:flex;align-items:center;justify-content:center">${html}</body>`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars",
    `--screenshot=${out}`, `--window-size=${w},${h}`, "--force-device-scale-factor=1",
    ...(transparent ? ["--default-background-color=00000000"] : []), `file://${f}`],
    { stdio: "ignore" });
  fs.unlinkSync(f);
  console.log(`  ${path.relative(ROOT, out)}  ${w}×${h}`);
}

const W = (p) => path.join(ROOT, "www", p);
const R = (p) => path.join(ROOT, "resources", p);

console.log("mark →");
/* Flat SVGs kept in the tree so the web build has vector art too. */
fs.writeFileSync(W("icons/mark.svg"), markSVG({ size: 512, plate: false }));
fs.writeFileSync(W("icons/favicon.svg"), markSVG({ size: 64, radius: 96 }));
console.log("  www/icons/mark.svg, www/icons/favicon.svg");

/* App icons: full bleed ink plate. */
png(W("icons/icon-1024.png"), 1024, 1024, markSVG({ size: 1024 }));
png(W("icons/icon-512.png"),   512,  512, markSVG({ size: 512 }));
png(W("icons/apple-touch-icon.png"), 180, 180, markSVG({ size: 180, rings: 5 }));
png(R("icon.png"), 1024, 1024, markSVG({ size: 1024 }));

/* Android adaptive: the foreground has to survive a circular crop, so the mark
   sits at 62% inside a transparent canvas and the plate becomes its own file. */
png(R("icon-foreground.png"), 1024, 1024, markSVG({ size: 635, plate: false }), true);
png(W("icons/icon-foreground-1024.png"), 1024, 1024, markSVG({ size: 635, plate: false }), true);
png(R("icon-background.png"), 1024, 1024, `<div style="width:100%;height:100%;background:${INK}"></div>`);

/* Splash: the mark, the wordmark, and nothing else. Paper by default so the
   launch runs straight into the app rather than flashing the opposite theme;
   the -dark variant is the bark one, for phones in dark mode. */
const PAPER = "#f8f3ea", PAPER_INK = "#2b241b";
const splash = (bg, ring) => `<div style="width:100%;height:100%;background:${bg};display:flex;
  flex-direction:column;align-items:center;justify-content:center;gap:120px">
  ${markSVG({ size: 760, plate: false, ring, live: AMBER })}
  <div style="font:600 128px/1 ui-serif,Georgia,'Times New Roman',serif;letter-spacing:.26em;
    color:${ring};padding-left:.26em">ANOTHERLIFE</div></div>`;
png(R("splash.png"),      2732, 2732, splash(PAPER, PAPER_INK), true);
png(R("splash-dark.png"), 2732, 2732, splash(INK, CREAM), true);

console.log("done");
