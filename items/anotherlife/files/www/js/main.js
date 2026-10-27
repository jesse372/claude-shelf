/* ============================================================
   AnotherLife — UI layer
   ============================================================ */
import * as E from "./engine.js";
import * as S from "./store.js";

const $ = id => document.getElementById(id);
import { markSVG } from "./mark.js";
import * as Fx from "./fx.js";

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));

let g = null;
let currentTab = null;     // which nav tab is open
let currentSub = null;     // a drill-down within that tab: () => void


/* ============================ DEV BUILD ============================
   The development APK loads www/ from a live server rather than the copy
   bundled in the APK, so it needs a way to pick up changes. The badge marks
   the build as dev, and tapping it reloads. It also polls /__rev and reloads
   itself when the served files change — but never mid-decision, or the
   player would lose the question they're looking at. */
/* A production Capacitor build serves itself from localhost, so "is it native"
   tells us nothing. What actually distinguishes the dev build is that its
   content comes from a real host — the Mac's LAN address or a tunnel. */
const IS_DEV = /^https?:$/.test(location.protocol)
  && !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(location.hostname);

let devRev = null, devStale = false;

function setupDevBadge() {
  const b = $("btn-dev");
  if (!b) return;
  if (!IS_DEV) { b.hidden = true; return; }
  b.hidden = false;
  b.onclick = () => location.reload();

  const poll = async () => {
    try {
      const r = await fetch("/__rev", { cache: "no-store" });
      if (r.ok) {
        const rev = (await r.text()).trim();
        if (devRev === null) devRev = rev;
        else if (rev !== devRev && !devStale) {
          devStale = true;
          b.classList.add("stale");
          b.textContent = "NEW ⟳";
          applyWhenIdle();
        }
      }
    } catch (e) { /* server asleep; try again next tick */ }
  };
  poll();
  setInterval(poll, 3000);
}

/* Reload as soon as nothing would be lost by doing so. */
function applyWhenIdle() {
  const idle = () =>
    $("modal-backdrop").hidden && $("sheet-backdrop").hidden &&
    (!g || !g.pendingChoices || !g.pendingChoices.length);
  if (idle()) { location.reload(); return; }
  toast("Update ready — finish this, then it'll reload");
  const t = setInterval(() => { if (idle()) { clearInterval(t); location.reload(); } }, 900);
}


/* ---------- hidden comp-code entry ----------
   Seven taps on the logo. Deliberately undiscoverable by accident.
   Lives on the title-screen mark since the header lost its own — which is
   also where someone with a code would be standing. */
let logoTaps = 0, logoTimer = null;
function setupSecret() {
  const mark = document.querySelector(".title-mark");
  if (!mark) return;
  mark.addEventListener("click", () => {
    logoTaps++;
    clearTimeout(logoTimer);
    logoTimer = setTimeout(() => { logoTaps = 0; }, 2500);
    if (logoTaps >= 7) {
      logoTaps = 0;
      currentTab = null; currentSub = () => codeSheet();
      refreshSheet();
    }
  });
}

function codeSheet() {
  openSheet("Redeem a Code",
    `<div class="note">Enter an unlock code.</div>` +
    `<div class="field"><label>Code</label><input id="comp-code" placeholder="" autocapitalize="characters"></div>` +
    `<button class="btn btn-primary" id="comp-go">Redeem</button>` +
    `<div style="height:10px"></div>` + backRow("Back"));
  $("comp-go").onclick = () => {
    const res = S.redeemCode($("comp-code").value);
    toast(res.msg);
    if (res.ok) { currentSub = null; render(); refreshSheet(); }
  };
}

/* ============================ BOOT ============================ */
function boot() {
  // Dev-only handle so the UI can be driven from a test harness or the console.
  // Never exposed in a store build.
  if (IS_DEV) window.__dev = {
    get g() { return g; }, set g(v) { g = v; },
    E, S, SUBS, openTab, openSheet, refreshSheet, startLife, render,
    sheetHTML: () => document.getElementById("sheet-body").innerHTML,
  };
  $("title-mark").innerHTML = markSVG({ size: 132, plate: false, ring: "currentColor" });
  setupDevBadge();
  setupSecret();
  if (E.load()) $("btn-continue").hidden = false;

  // Connect to Google Play / App Store billing when running as an installed
  // app. Safe no-op in the browser.
  S.initBilling(() => { if (g) { render(); refreshSheet(); } })
    .catch(err => console.warn("[billing]", err));

  $("btn-new").onclick = () => { startLife(E.newGame()); renderFeed(true); };
  $("btn-continue").onclick = () => { g = E.load(); if (g) showGame(); };
  $("btn-custom").onclick = customSheet;
  $("btn-graveyard").onclick = graveyardSheet;

  $("btn-age").onclick = doAge;
  $("btn-menu").onclick = () => { currentTab = "menu"; currentSub = null; markTab(); refreshSheet(); };
  $("btn-status").onclick = () => { currentTab = "status"; currentSub = null; markTab(); refreshSheet(); };
  $("sheet-close").onclick = closeSheet;
  $("sheet-backdrop").onclick = e => { if (e.target === $("sheet-backdrop")) closeSheet(); };

  document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => openTab(b.dataset.tab));
  $("sheet-body").addEventListener("click", onAction);
  $("modal-body").addEventListener("click", onAction);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
  window.__alBooted = true;          // stand the boot guard down
}

/* ---------- crash containment ----------
   Before this, one uncaught exception left a dead white screen with no way
   back and no clue what happened — the worst outcome for a shipped app,
   because the save is usually still fine. Anything that throws is contained,
   the player is told, and they can carry on from their last saved year. */
let crashed = false;
function onCrash(err) {
  if (crashed) return;                       // never loop on our own error UI
  crashed = true;
  try {
    console.error("[anotherlife]", err);
    $("modal-body").innerHTML =
      `<h2>Something went wrong</h2>` +
      `<div class="sub">Your life is saved. This screen is the bug, not your game.</div>` +
      `<button class="btn btn-primary" data-act="recover">Carry on</button>` +
      `<button class="btn" data-act="title">Main menu</button>`;
    openModal();
  } catch (e) { /* nothing left to do */ }
}
window.addEventListener("error", e => onCrash(e.error || e.message));
window.addEventListener("unhandledrejection", e => onCrash(e.reason));

/* Wrap anything driven by a tap: one bad action should cost you that action,
   not the session. */
function guard(what, fn) {
  try { return fn(); }
  catch (err) { console.error("[anotherlife] " + what, err); onCrash(err); }
}

function startLife(game) { g = game; E.save(g); showGame(); }
function showGame() {
  $("screen-title").classList.remove("active");
  $("screen-game").classList.add("active");
  render(); drainChoices();
}
function showTitle() {
  $("screen-game").classList.remove("active");
  $("screen-title").classList.add("active");
  $("btn-continue").hidden = !E.load();
}

/* ============================ RENDER ============================ */
function render() {
  if (!g) return;
  $("hdr-name").textContent = `${g.first} ${g.last}`;
  $("hdr-flag").textContent = g.country.flag || "";
  const ageEl = $("hdr-age");
  if (ageEl.textContent !== String(g.age)) {          // let the year landing register
    ageEl.textContent = g.age;
    ageEl.classList.remove("tick"); void ageEl.offsetWidth; ageEl.classList.add("tick");
  }
  $("hdr-sub").textContent = subLine(g);

  const m = $("hdr-money");
  m.textContent = (g.money < 0 ? "\u2212" : "") + E.moneyShort(g, g.money);
  m.classList.toggle("neg", g.money < 0);

  const gen = $("hdr-gen");
  gen.hidden = !(g.generation > 1);
  if (g.generation > 1) gen.textContent = `GEN ${g.generation}`;

  renderRibbon();
  renderWarnings();
  renderFeed();

  const ab = $("btn-age");
  ab.classList.toggle("dead", !g.alive);
  ab.querySelector(".age-word").textContent = g.alive ? "Live another year" : "Begin a new life";
  ab.querySelector(".age-plus").textContent = g.alive ? String(g.age + 1) : "\u21BB";
}

/* The rings from the app icon, thickening as the life goes on — one more
   ring roughly every sixteen years. It replaces the emoji face that used to
   sit here, and it is the same drawing the icon is generated from. */
const ringsFor = age => Math.max(1, Math.min(6, 1 + Math.floor(age / 16)));
/* The one line under the name. Where you are matters early, what you do
   matters later, and anything alarming beats both. */
function subLine(g) {
  const bits = [statusFor(g)];
  if (g.city) bits.push(`${g.city}, ${g.country.name}`);
  return bits.join(" \u00b7 ");
}

const moodFor = h => h >= 80 ? "\uD83D\uDE04" : h >= 60 ? "\uD83D\uDE42"
  : h >= 40 ? "\uD83D\uDE10" : h >= 20 ? "\uD83D\uDE15" : "\uD83D\uDE22";

function statusFor(g) {
  if (g.prison)    return `${g.prison.juvenile ? "Juvenile detention" : "In prison"} \u00b7 ${g.prison.yearsLeft}y left`;
  if (g.leave)     return `Signed off \u00b7 ${g.leave.reason}`;
  if (g.homeless)  return "Homeless";
  if (g.special)   return g.special.title;
  if (g.job)       return g.job.title;
  if (g.education) return labelFor(g.education);
  if (g.pension)   return "Retired";
  return "Unemployed";
}

function labelFor(edu) {
  if (edu.stage === "uni") return `University — ${edu.major}`;
  if (edu.stage === "grad") {
    const s = E.GRAD_SCHOOLS.find(x => x.id === edu.gradType);
    return s ? s.name : "Graduate School";
  }
  return { elementary:"Elementary School", middle:"Middle School", high:"High School" }[edu.stage] || "Student";
}

const STAT_DEFS = [
  ["Happy",  "happiness"],
  ["Health", "health"],
  ["Smarts", "smarts"],
  ["Looks",  "looks"],
];

/* Ten ticks you can count, rather than a sliding bar. */
function ticks(v) {
  const cls = v < 25 ? "low" : v < 50 ? "mid" : "";
  let out = "";
  for (let i = 0; i < 10; i++) out += `<i class="${i * 10 < v ? "on " + cls : ""}"></i>`;
  return `<span class="stat-bar">${out}</span>`;
}
const warnRow = (ico, text) =>
  `<div class="warnrow"><span class="warn-ico">${ico}</span><span class="warn-text">${esc(text)}</span></div>`;
const chip = (label, v) => `<span class="chip">${label}<b>${v}</b></span>`;

/* On screen: four gauges in 24px. Bar first, label under it. */
function renderRibbon() {
  $("stats").innerHTML = STAT_DEFS.map(([lbl, key]) =>
    `<div class="stat">${ticks(g.stats[key])}<span class="stat-name">${lbl}</span></div>`).join("");
}

/* Only rendered when something is actually wrong, so it costs nothing the
   rest of the time. */
function renderWarnings() {
  let h = "";
  const conds = E.conditionsOf(g);
  if (conds.length) h += warnRow("\uD83E\uDE7A", conds.map(c => c.name).join("  \u00b7  "));
  const bits = [];
  if (g.homeless) bits.push(`Homeless \u00b7 ${g.yearsHomeless} yr${g.yearsHomeless === 1 ? "" : "s"} on the street`);
  if (g.addiction) bits.push(`Addicted to ${g.addiction.kind} \u00b7 stage ${g.addiction.level} of 3`);
  if (g.stats.health < 20) bits.push("Your health is failing");
  if (bits.length) h += warnRow("\u26A0\uFE0F", bits.join("  \u00b7  "));
  $("warnstrip").innerHTML = h;
  $("warnstrip").hidden = !h;
}

/* Behind a tap on the name: everything the old cramped strip used to show,
   with room to actually read it. */
function statusSheet() {
  const arch = E.archetypeOf(g);
  const heritage = g.heritage && g.heritage !== g.country.name ? `from ${g.heritage}` : null;
  const nw = E.netWorth(g);

  let h = `<div class="status-head">
      <div class="status-mark">${markSVG({ size: 54, plate: false, rings: ringsFor(g.age), ring: "currentColor" })}</div>
      <div>
        <div class="status-name">${g.country.flag || ""} ${esc(g.first)} ${esc(g.last)}</div>
        <div class="status-sub">${moodFor(g.stats.happiness)} ${esc(statusFor(g))}<br>
          ${g.age} year${g.age === 1 ? "" : "s"} old \u00b7 ${esc(g.city)}, ${esc(g.country.name)}</div>
      </div>
    </div>`;

  h += H("Condition") + `<div class="statgrid">` + STAT_DEFS.map(([lbl, key]) =>
    `<div class="stat"><span class="stat-name">${lbl}</span>${ticks(g.stats[key])}
      <span class="stat-pct">${g.stats[key]}</span></div>`).join("") + `</div>`;

  let chips = "";
  if (g.fame >= 5) chips += chip("Fame", g.fame);
  if (g.special && (g.buzz || 0) > 0) chips += chip("Buzz", g.buzz);
  if (g.criminalRecord) chips += chip("Record", g.criminalRecord);
  if (g.generation > 1) chips += chip("Generation", g.generation);
  if (chips) h += `<div class="statchips">${chips}</div>`;

  h += H("Money") +
    staticRow("\uD83D\uDCB5", "Bank", null, (g.money < 0 ? "\u2212" : "") + E.money(g, g.money), g.money < 0 ? "low" : "") +
    staticRow("\uD83E\uDDEE", "Net worth", null, (nw < 0 ? "\u2212" : "") + E.money(g, nw), nw < 0 ? "low" : "");

  if (arch || heritage || g.diplomas.high || g.licences && Object.keys(g.licences).length) {
    h += H("Background");
    if (arch) h += staticRow(arch.emoji, arch.name, arch.blurb);
    if (heritage) h += staticRow("\uD83E\uDDF3", `Originally ${g.heritage}`, "You were not born where you live");
    const edu = g.diplomas.grad ? "Postgraduate" : g.diplomas.uni ? `Graduate \u00b7 ${g.diplomas.major || ""}`
              : g.diplomas.high ? "High school" : null;
    if (edu) h += staticRow("\uD83C\uDF93", "Education", edu);
  }

  const conds = E.conditionsOf(g);
  if (conds.length) h += H("Health") + conds.map(c => staticRow("\uD83E\uDE7A", c.name, c.blurb || null)).join("");

  openSheet("You", h);
}

let renderedYears = 0;
function renderFeed(force) {
  const feed = $("feed");
  if (force || renderedYears > g.log.length) { feed.innerHTML = ""; renderedYears = 0; }
  for (let i = renderedYears; i < g.log.length; i++) {
    const y = g.log[i];
    const label = y.age === 0 ? `Born \u00b7 ${g.birthYear}` : `Age ${y.age} \u00b7 ${g.birthYear + y.age}`;
    const blk = el("div", "yr",
      `<div class="yr-head"><span class="yr-label">${label}</span></div><div class="yr-body"></div>`);
    const body = blk.querySelector(".yr-body");
    for (const e of y.entries) body.appendChild(el("div", "ev " + (e.kind || ""), esc(e.text)));
    feed.appendChild(blk);
  }
  renderedYears = g.log.length;
  /* The current year does not only grow at the end. An outcome is written
     directly *after* the question that caused it (engine `insertAt`), so when
     two decisions land in the same year, answering the first splices its
     result into the middle. Appending the tail then re-printed the second
     question and silently dropped the outcome — you made a choice and it
     looked like nothing happened. Rebuild the open year instead; it is a
     handful of nodes, once per render. */
  const last = feed.lastElementChild;
  const y = g.log[g.log.length - 1];
  const body = last && last.querySelector(".yr-body");
  if (body && y && body.childElementCount !== y.entries.length) {
    body.innerHTML = "";
    for (const e of y.entries) body.appendChild(el("div", "ev " + (e.kind || ""), esc(e.text)));
  }
  feed.scrollTop = feed.scrollHeight;
}

/* ============================ AGE UP ============================ */
/* Lines written so far, so we can tell what a single year actually produced
   and react to the biggest thing in it. */
const logMark = () => g.log.reduce((n, y) => n + y.entries.length, 0);
function entriesSince(mark) {
  const all = [];
  for (const y of g.log) for (const e of y.entries) all.push(e);
  return all.slice(mark);
}

let warnedNoSave = false;
function doAge() {
  if (!g) return;
  if (!g.alive) { newLifeFlow(); return; }
  const mark = logMark();
  E.ageUp(g);
  Fx.playFor(entriesSince(mark));
  if (E.saveIsBroken() && !warnedNoSave) {      // playing a life nothing is writing down
    warnedNoSave = true;
    toast("This device isn't letting the game save. Your progress won't be kept.");
  }
  render();
  if (!g.alive) { setTimeout(deathScreen, 380); return; }
  drainChoices();
}

/* Show one question at a time, and never while an outcome is still on screen. */

/* Runs when the player dismisses an outcome popup. Lets us hold the next
   question back until they've actually read what just happened. */
let afterResult = null;

function showResult(entries, then) {
  afterResult = then || null;
  $("modal-body").innerHTML =
    `<div class="modal-emoji">${entries.some(e => e.kind === "bad") ? "😕" : "✅"}</div>` +
    entries.map(e => `<p class="res ${e.kind || ""}">${esc(e.text)}</p>`).join("") +
    `<button class="btn btn-primary" data-act="okres">${then ? "Continue" : "OK"}</button>`;
  openModal();
}

/* Every log entry from the last couple of years, newest year last. */
function recentEntries(g) {
  return g.log.slice(-2).flatMap(y => y.entries);
}

function drainChoices() {
  if (!g.pendingChoices || !g.pendingChoices.length) { closeModal(); return; }
  const c = g.pendingChoices[0];
  $("modal-body").innerHTML =
    `<div class="modal-emoji">🤔</div><p>${esc(c.text)}</p>` +
    c.choices.map(ch => `<button class="btn" data-act="choice" data-ev="${esc(c.id)}" data-i="${ch.idx}">${esc(ch.label)}${
      ch.note ? `<span class="btn-note">${esc(ch.note)}</span>` : ""}</button>`).join("");
  openModal();
}

/* ============================ ACTION ROUTER ============================ */
function onAction(e) {
  const t = e.target.closest("[data-act]");
  if (!t || t.classList.contains("disabled")) return;
  const d = t.dataset;
  const amount = pct => Math.max(1, Math.round(g.money * (+pct / 100)));

  /* Runs a menu action, persists it, and surfaces what happened.
     Takes a thunk so we can snapshot the log *before* the action runs. */
  const run = rawFn => guard("action:" + d.act, () => {
    const fn = rawFn;
    const yr = g.log[g.log.length - 1];
    const before = yr ? yr.entries.length : 0;
    const res = fn();

    if (res && res.ok === false) { if (res.msg) toast(res.msg); render(); refreshSheet(); return; }

    E.save(g);                       // menu actions were never being persisted
    render();
    refreshSheet();

    if (!g.alive) { closeSheet(); setTimeout(deathScreen, 300); return; }

    const now = g.log[g.log.length - 1];
    const added = now ? now.entries.slice(before) : [];
    if (added.length) { Fx.playFor(added); showResult(added); }   // the sheet covers the feed, so say it out loud
  });

  switch (d.act) {
    case "choice": {
      const seen = new Set(recentEntries(g).map(e => e.id));
      E.resolveChoice(g, d.ev, +d.i);
      render();

      if (!g.alive) { closeModal(); setTimeout(deathScreen, 300); return; }

      // Anything newly written that isn't itself the next question's prompt
      // is the outcome of what they just chose — show it before moving on.
      const nextPrompts = new Set(g.pendingChoices.map(p => p.lineId));
      const outcome = recentEntries(g).filter(e => !seen.has(e.id) && !nextPrompts.has(e.id));

      if (outcome.length) { Fx.playFor(outcome); showResult(outcome, g.pendingChoices.length ? drainChoices : null); }
      else { closeModal(); if (g.pendingChoices.length) setTimeout(drainChoices, 180); }
      return;
    }

    /* career */
    case "job":       run(() => E.applyForJob(g, d.k)); return;
    case "jobact":    run(() => E.jobAction(g, d.k)); return;
    case "audition":  run(() => E.auditionFor(g, d.k)); return;
    case "specialact":run(() => E.specialAction(g, d.k)); return;
    case "enroll":    run(() => E.enroll(g, d.k, d.arg)); return;
    case "dropout":   run(() => E.dropOut(g)); return;
    case "club":      run(() => E.joinClub(g, d.k)); return;

    /* assets */
    case "buy":       run(() => E.buyAsset(g, d.k, +d.i)); return;
    case "sell":      run(() => E.sellAsset(g, d.k, d.id)); return;
    case "pet":       run(() => E.buyPet(g, +d.i)); return;

    /* finance */
    case "invest":    run(() => E.invest(g, d.k, amount(d.pct))); return;
    case "divest":    run(() => E.divest(g, d.k)); return;
    case "insure":    run(() => E.toggleInsurance(g, d.k)); return;
    case "loan":      run(() => E.takeLoan(g, +d.amt)); return;
    case "repay":     run(() => E.repayLoan(g, d.id)); return;
    case "bankrupt":  run(() => E.declareBankruptcy(g)); return;

    /* people */
    case "rel":       run(() => E.relAction(g, d.id, d.k)); return;
    case "lover":     run(() => E.takeLover(g)); return;
    case "sue":       run(() => E.sue(g, d.k)); return;
    case "custody":   run(() => E.custodyBattle(g)); return;
    case "restrain":  run(() => E.restrainingOrder(g, d.id)); return;
    case "licence":   run(() => E.takeLicence(g, d.k)); return;
    case "treat":     run(() => E.treatCondition(g, d.k)); return;
    case "citizen":   run(() => E.applyCitizenship(g)); return;
    case "media":     run(() => E.doMedia(g, d.k)); return;
    case "deploy":    run(() => E.deploy(g)); return;

    /* do */
    case "activity":  run(() => E.activity(g, d.k)); return;
    case "rehab":     run(() => E.rehab(g)); return;
    case "drug":      run(() => E.useDrug(g, d.k)); return;
    case "deal":      run(() => E.dealDrug(g, d.k)); return;
    case "sexwork":   run(() => E.sexWork(g, d.k)); return;
    case "vice":      run(() => E.buyVice(g, d.k)); return;
    case "casino":    run(() => E.casino(g, d.k, amount(d.pct))); return;
    case "crime":     run(() => E.commitCrime(g, d.k)); return;
    case "prison":    run(() => E.prisonAction(g, d.k)); return;

    /* premium modes */
    case "fightjoin":  run(() => E.joinFightGym(g, d.k)); return;
    case "fightact":   run(() => E.fighterAction(g, d.k)); return;
    case "mafiajoin":  run(() => E.joinMafia(g)); return;
    case "adopt":      run(() => E.adopt(g, d.k, d.arg === "any" ? null : d.arg)); return;
    case "dateprofile":run(() => E.dateProfile(g, d.k)); return;
    case "emigrateto": run(() => E.emigrateTo(g, d.k)); return;
    case "holiday":    run(() => E.goOnHoliday(g, d.k)); return;
    case "enlist":     run(() => E.enlist(g, d.k)); return;
    case "joinfamily": run(() => E.joinMafiaFamily(g, d.k)); return;
    case "mafiaact":   run(() => E.mafiaAction(g, d.k)); return;
    case "royalact":   run(() => E.royalAction(g, d.k)); return;
    case "bizfound":   run(() => E.foundBusiness(g, d.k)); return;
    case "bizact":     run(() => E.businessAction(g, d.k)); return;
    case "successor":  run(() => E.nameSuccessor(g, d.id)); return;
    case "heirloom":   run(() => E.buyHeirloom(g, d.k)); return;
    case "legacy":     run(() => E.buyLegacy(g, d.k)); return;
    case "rewind":     run(() => E.rewindYear(g)); return;
    case "revive":     run(() => E.godRevive(g)); return;
    case "heir":       closeModal(); closeSheet(); continueLine(d.id); return;

    /* store */
    case "iap": (async () => {
        const res = await S.purchase(d.arg);
        if (res.ok) { toast("Unlocked. Enjoy."); } else if (res.msg) toast(res.msg);
        render(); refreshSheet();
      })(); return;
    case "restore": (async () => {
        const res = await S.restore();
        toast(res.msg || (res.ok ? "Purchases restored." : "Nothing to restore."));
        render(); refreshSheet();
      })(); return;
    case "sound":
      Fx.setSound(!Fx.soundEnabled());
      if (Fx.soundEnabled()) Fx.play("cheer");     // hear what you just switched on
      refreshSheet();
      return;
    case "theme":
      setTheme(themeNow() === "dark" ? "paper" : "dark");
      refreshSheet();
      return;
    case "adult": {
      const now = E.setAdultMode(!E.adultMode());
      toast(now ? "Adult content on. Applies from age 18." : "Adult content off.");
      render(); refreshSheet();
      return;
    }
    case "devunlock":
      if (!S.isNative()) { S.PRODUCTS.forEach(p => S.grant(p.id, "preview")); toast("All packs unlocked for testing."); }
      render(); refreshSheet(); return;

    /* navigation */
    case "sub":       currentSub = SUBS[d.k] ? () => SUBS[d.k](d.arg) : null; refreshSheet(); return;
    case "back":      currentSub = null; refreshSheet(); return;
    case "relmenu":   currentSub = () => relSheet(d.id); refreshSheet(); return;
    case "okres": {
      const then = afterResult; afterResult = null;
      closeModal();
      if (then) setTimeout(then, 160);
      return;
    }
    case "recover":   crashed = false; closeModal(); closeSheet();
                      guard("recover", () => { const s2 = E.load(); if (s2) { g = s2; render(); } });
                      return;
    case "newlife":   closeModal(); closeSheet(); newLifeFlow(); return;
    case "title":     closeModal(); closeSheet(); showTitle(); return;
  }
}

/* ============================ SHEET PLUMBING ============================ */
function openSheet(title, html) {
  const body = $("sheet-body");
  const keep = $("sheet-title").textContent === title ? body.scrollTop : 0;
  body.innerHTML = html;
  groupRows(body);
  body.scrollTop = keep;
  $("sheet-title").textContent = title;
  $("sheet-backdrop").hidden = false;
}

/* Wrap each run of consecutive .row siblings in a .group panel, so a long list
   reads as one calm surface with hairline dividers instead of N floating cards.
   Done in the DOM rather than with :has() so older Android WebViews behave. */
function groupRows(container) {
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const box = document.createElement("div");
    box.className = "group";
    run[0].before(box);
    run.forEach(r => box.appendChild(r));
    run = [];
  };
  for (const kid of [...container.children]) {
    if (kid.classList && kid.classList.contains("row")) run.push(kid);
    else flush();
  }
  flush();
}
function closeSheet() { $("sheet-backdrop").hidden = true; currentTab = null; currentSub = null; markTab(); }
function openModal() { $("modal-backdrop").hidden = false; }
function closeModal() { $("modal-backdrop").hidden = true; }

function openTab(tab) { if (!g) return; currentTab = tab; currentSub = null; markTab(); refreshSheet(); }
function markTab() {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("on", b.dataset.tab === currentTab));
}
function refreshSheet() {
  return guard("refreshSheet", () => _refreshSheet());
}
function _refreshSheet() {
  if (currentSub) { currentSub(); return; }
  ({ occupation:occupationSheet, assets:assetsSheet, menu:menuSheet, status:statusSheet,
     relationships:relationshipsSheet, activities:activitiesSheet }[currentTab] || (()=>{}))();
}

const backRow = label => row({ act:"back", ico:"←", t: label || "Back" });

/* ---------------- Appearance ----------------
   Paper by default. The bark theme is the same layout with different
   variables, so there is only ever one stylesheet to keep honest. */
const THEME_KEY = "anotherlife.theme";
const themeNow = () => document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "paper";
function setTheme(t) {
  const dark = t === "dark";
  document.documentElement.toggleAttribute("data-theme", false);
  if (dark) document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem(THEME_KEY, dark ? "dark" : "paper"); } catch (e) {}
  const meta = $("meta-theme");
  if (meta) meta.setAttribute("content", dark ? "#14120f" : "#f8f3ea");
}

function row({ act, k, i, id, arg, pct, amt, ico, t, s, r, rMuted, rClass, locked, extra }) {
  const at = [
    act ? `data-act="${act}"` : "", k != null ? `data-k="${esc(k)}"` : "",
    i != null ? `data-i="${i}"` : "", id != null ? `data-id="${esc(id)}"` : "",
    arg != null ? `data-arg="${esc(arg)}"` : "", pct != null ? `data-pct="${pct}"` : "",
    amt != null ? `data-amt="${amt}"` : "", extra || "",
  ].join(" ");
  return `<button class="row${locked ? " locked" : ""}" ${at}>
    ${ico ? `<span class="row-ico">${ico}</span>` : ""}
    <span class="row-main"><span class="row-t">${esc(t)}</span>${s ? `<span class="row-s">${esc(s)}</span>` : ""}</span>
    ${r ? `<span class="row-r${rMuted ? " muted" : ""}${rClass ? " " + rClass : ""}">${esc(r)}</span>` : ""}
  </button>`;
}
const staticRow = (ico, t, s, r, rClass) =>
  `<div class="row" style="pointer-events:none"><span class="row-ico">${ico}</span>
   <span class="row-main"><span class="row-t">${esc(t)}</span>${s ? `<span class="row-s">${esc(s)}</span>` : ""}</span>
   ${r ? `<span class="row-r${rClass ? " " + rClass : ""}">${esc(r)}</span>` : ""}</div>`;
const H = t => `<div class="section-h">${esc(t)}</div>`;

/* ============================ CAREER ============================ */
/* Career actions are once a year now, so show when one is spent. */
function actRow(key, ico, title, sub, price) {
  const left = E.canDo(g, "sp_" + (key === "publicity" ? "pub" : key));
  const p = price ? Math.round(price * g.country.mult) : 0;
  return row({ act: left ? "specialact" : null, k:key, ico, t:title,
    s: left ? sub : "Already done this year",
    r: p ? E.money(g, p) : "", rMuted: !left || g.money < p, locked: !left });
}

function occupationSheet() {
  if (g.prison) return prisonSheet();
  let h = "";

  if (g.special) {
    const sdef = E.SPECIAL.find(x => x.id === g.special.id);
    const buzz = g.buzz || 0;
    const since = g.age - (g.lastBig == null ? -99 : g.lastBig);
    const bigReady = sdef && sdef.big && g.fame >= sdef.big.minFame && since >= E.BIG_COOLDOWN;
    const bigWhy = !sdef || !sdef.big ? ""
      : g.fame < sdef.big.minFame ? `Needs ${sdef.big.minFame} fame — you're on ${g.fame}`
      : since < E.BIG_COOLDOWN ? `Wait ${E.BIG_COOLDOWN - since} more year${E.BIG_COOLDOWN - since === 1 ? "" : "s"}`
      : `Odds rise with buzz — about ${Math.round(Math.min(0.72, 0.18 + buzz / 260 + (g.stats.smarts - 50) / 900) * 100)}% right now`;

    h += H("Current Career") +
      staticRow(g.special.emoji, g.special.title,
        `${g.special.name} · fame ${g.fame} · ${g.yearsInJob} yr${g.yearsInJob === 1 ? "" : "s"}`,
        E.money(g, E.specialSalary(g)) + "/yr") +
      `<div class="group"><div class="row" style="pointer-events:none">
        <span class="row-ico">🔥</span>
        <span class="row-main"><span class="row-t">Buzz ${buzz}</span>
          <span class="row-s">Momentum. Raises the odds of your next move, and fades each year.</span>
          <span class="meter"><i class="${buzz < 30 ? "low" : buzz < 60 ? "mid" : ""}" style="width:${buzz}%"></i></span></span></div></div>` +
      H("Actions") +
      (sdef && sdef.big ? row({ act:"specialact", k:"big", ico:"🌟", t:sdef.big.label,
        s: bigReady ? bigWhy : `Locked — ${bigWhy}`, locked: !bigReady }) : "") +
      actRow("project",   "🎯", g.special.project, "Your main shot at raising your profile") +
      actRow("publicity", "📣", "Hire a Publicist", "Buys buzz, not fame \u2014 buzz lifts your next move", 9000) +
      actRow("scandal",   "🔥", "Court a Scandal", "Big buzz, real cost to your happiness") +
      row({ act:"specialact", k:"quit", ico:"🚪", t:"Leave the Industry" });
  } else if (g.job) {
    const def = E.jobDef(g.job.id);
    const perf = g.jobPerf;
    h += H("Current Job") +
      `<div class="row" style="pointer-events:none"><span class="row-ico">💼</span>
        <span class="row-main"><span class="row-t">${esc(g.job.title)}</span>
          <span class="row-s">${esc(g.job.name)} · ${g.yearsInJob} yr${g.yearsInJob === 1 ? "" : "s"} · Performance ${perf}%</span>
          <span class="meter"><i class="${perf < 35 ? "low" : perf < 65 ? "mid" : ""}" style="width:${perf}%"></i></span>
        </span><span class="row-r">${esc(E.money(g, g.job.salary))}</span></div>` +
      H("Actions") +
      row({ act:"jobact", k:"harder",    ico:"🔥", t:"Work Harder", s:"Boost performance, costs health" }) +
      row({ act:"jobact", k:"raise",     ico:"💰", t:"Ask for a Raise" }) +
      row({ act:"jobact", k:"promotion", ico:"📈", t:"Ask for a Promotion",
            s: def && g.job.rung < def.ladder.length - 1 ? `Next: ${def.ladder[g.job.rung + 1]}` : "You're at the top" }) +
      row({ act:"jobact", k:"quit",      ico:"🚪", t:"Quit" });
  } else if (g.age < 16) {
    h += `<div class="empty">You're too young to work.<br>Focus on school for now.</div>`;
  } else {
    h += H("Find Work") +
      row({ act:"sub", k:"jobs",    ico:"💼", t:"Job Listings", s:`${E.availableJobs(g).length} open to you now` }) +
      row({ act:"sub", k:"special", ico:"🌟", t:"Special Careers", s:"Acting, music, sport, politics, space…" });
    if (g.pension) h += staticRow("🏖️", "Retired", `Pension ${E.money(g, g.pension)}/yr`);
  }

  h += H("Ventures & Special Modes") +
    (!S.owns("pack_fighter")
      ? lockRow("pack_fighter")
      : g.fighter
      ? row({ act:"sub", k:"fighter", ico:g.fighter.emoji, t:`${g.fighter.name} — ${E.BELTS[g.fighter.belt]}`,
              s:`${g.fighter.wins}-${g.fighter.losses}-${g.fighter.draws} · ranked #${g.fighter.rank}`,
              r:E.money(g, E.fighterPurse(g)), rMuted:true })
      : row({ act:"sub", k:"fighter", ico:"🥊", t:"The Fight Game", s:"Turn professional. Boxing, MMA, Muay Thai, wrestling" })) +
    (!S.owns("pack_business")
      ? lockRow("pack_business")
      : g.business
      ? row({ act:"sub", k:"business", ico:g.business.emoji, t:g.business.name,
              s:`${g.business.staff} staff${g.business.public ? " · listed" : ""}`, r:E.money(g, g.business.valuation) })
      : row({ act:"sub", k:"business", ico:"🏢", t:"Start a Business", s:"Found a company, scale it, float it" })) +
    (g.royal
      ? (S.owns("pack_royalty")
          ? row({ act:"sub", k:"royal", ico:"👑", t:`${E.royalTitle(g)} of ${g.royal.house}`,
                  s:`Popularity ${g.royal.popularity}${g.royal.ruler ? " · you rule" : ""}` })
          : lockRow("pack_royalty", "You were born royal — unlock to take the throne"))
      : "");

  h += H("Education");
  if (g.education) {
    h += staticRow("🎓", labelFor(g.education), `${g.education.yearsLeft} year${g.education.yearsLeft === 1 ? "" : "s"} remaining`);
    if (["high", "uni", "grad"].includes(g.education.stage))
      h += row({ act:"dropout", ico:"🚪", t:"Drop Out" });
    if (["middle", "high"].includes(g.education.stage))
      h += row({ act:"sub", k:"clubs", ico:"🏅", t:"School Clubs", s: g.club ? `You're in the ${(E.CLUBS.find(c=>c.id===g.club)||{}).name}` : "Join a team or society" });
  } else {
    if (!g.diplomas.high && g.age >= 18) h += row({ act:"enroll", k:"ged", ico:"📝", t:"Take the GED", s:"High school equivalency exam" });
    if (g.diplomas.high && !g.diplomas.uni) h += row({ act:"sub", k:"uni", ico:"🏛️", t:"Apply to University", s:`${E.UNI_MAJORS.length} majors · 4 years` });
    if (g.diplomas.uni && !g.diplomas.grad) h += row({ act:"sub", k:"grad", ico:"🎓", t:"Apply to Graduate School", s:"Med, law, business, dental, vet…" });
    if (g.diplomas.grad) {
      const s = E.GRAD_SCHOOLS.find(x => x.id === g.diplomas.gradType);
      h += staticRow("✅", "Education complete", `${s ? s.name : "Graduate school"} · ${g.diplomas.major || "—"}`);
    }
  }
  openSheet("Work", h);
}

const SECTOR_ICON = {
  "Emergency Services":"🚨", "Healthcare":"🩺", "Trades":"🔧", "Military":"🎖️",
  "Aviation":"✈️", "Maritime":"⚓", "Law & Finance":"⚖️", "Technology":"💻",
  "Education":"🎓", "Science":"🔬", "Media & Arts":"🎬", "Hospitality":"🍽️",
  "Retail & Office":"🏢", "Transport":"🚚", "Land & Animals":"🐄",
  "Industry":"🏭", "Sport":"🏅", "Community":"🤝",
};

/* 519 jobs and a graduate qualifies for most of them, so the listings are
   sector-first. Locked jobs stay in their sector alongside the open ones and
   keep their names: "Surgeon — needs Medical School" is the whole point of
   showing them, and a bare count of what you can't do yet tells you nothing
   to aim at. */
function jobsSheet() {
  const open = E.availableJobs(g);
  const locked = E.lockedJobs(g);
  const tally = {};
  for (const j of open)   (tally[j.sector] = tally[j.sector] || { open:0, locked:0, top:0 }).open++;
  for (const j of open)   tally[j.sector].top = Math.max(tally[j.sector].top, j.offered);
  for (const j of locked) (tally[j.sector] = tally[j.sector] || { open:0, locked:0, top:0 }).locked++;
  const sectors = Object.keys(tally).sort();

  openSheet("Job Listings",
    `<div class="note">${open.length} open to you now, ${locked.length} still out of reach.</div>` +
    sectors.map(sec => {
      const t = tally[sec];
      const bits = [`${t.open} open`];
      if (t.locked) bits.push(`${t.locked} locked`);
      return row({ act:"sub", k:"jobsec", arg:sec, ico: SECTOR_ICON[sec] || "💼", t:sec,
        s: bits.join(" · "),
        r: t.top ? "up to " + E.money(g, t.top) : "", rMuted: !t.open });
    }).join("") +
    `<div style="height:8px"></div>` + backRow("Back to Work"));
}

function jobSectorSheet(sector) {
  const open = E.availableJobs(g).filter(j => j.sector === sector)
                .sort((a, b) => b.offered - a.offered);
  const locked = E.lockedJobs(g).filter(j => j.sector === sector)
                .sort((a, b) => b.base - a.base);
  let h = "";
  if (open.length) h += H(`Open to you (${open.length})`) +
    open.map(j => row({ act:"job", k:j.id, ico:"💼", t:j.name,
      s: j.majorMatch ? j.ladder[0] : `${j.ladder[0]} · degree mismatch`,
      r: E.money(g, j.offered) + "/yr" })).join("");
  if (locked.length) h += H(`Locked (${locked.length})`) +
    locked.map(j => row({ ico:"🔒", t:j.name, s:j.why, locked:true,
      /* what it pays, so there's something to want */
      r: "~" + E.money(g, Math.round(j.base * g.country.mult)) + "/yr", rMuted:true })).join("");
  if (!h) h = `<div class="empty">Nothing in this sector.</div>`;
  openSheet(sector, h + `<div style="height:8px"></div>` +
    row({ act:"sub", k:"jobs", ico:"←", t:"Back to Job Listings" }));
}

function specialSheet() {
  const list = E.specialList(g);
  openSheet("Special Careers",
    `<div class="note">These aren't advertised — you try out. Once you're in, your earnings track your fame rather than a salary band.</div>` +
    list.map(s => {
      const branchy = s.id === "military" && s.eligible;
      return row({ act: branchy ? "sub" : s.eligible ? "audition" : null, k: branchy ? "enlist" : s.id,
        ico:s.emoji, t:s.name,
        s: s.eligible ? (branchy ? "Choose a branch, then sit the entrance test" : `Start as ${s.ladder[0]}`)
                      : `Needs ${s.unmet.join(", ")}`,
        locked: !s.eligible });
    }).join("") +
    `<div style="height:8px"></div>` + backRow("Back to Work"));
}

function uniSheet() {
  const cost = Math.round(9000 * g.country.mult);
  const afford = g.money >= cost;
  openSheet("Choose a Major",
    H(`Tuition ${E.money(g, cost)}/yr · 4 years`) +
    (afford ? "" : `<div class="note">You can't afford the ${E.money(g, cost)} first-year tuition right now. Earn or borrow it first.</div>`) +
    E.UNI_MAJORS.map(m => row({ act: afford ? "enroll" : null, k:"uni", arg:m,
      ico: afford ? "📚" : "🔒", t:m, locked:!afford })).join("") +
    `<div style="height:8px"></div>` + backRow("Back to Work"));
}

function gradSheet() {
  openSheet("Graduate School",
    E.GRAD_SCHOOLS.map(s => {
      const cost = Math.round(s.cost * g.country.mult);
      const okMajor = !s.majors || s.majors.includes(g.diplomas.major);
      const okSmart = g.stats.smarts >= s.minSmarts;
      const okMoney = g.money >= cost;
      const open = okMajor && okSmart && okMoney;
      const why = !okMajor ? `Needs a degree in ${s.majors.join(" / ")}`
                : !okSmart ? `Needs ${s.minSmarts} smarts (you have ${g.stats.smarts})`
                : !okMoney ? `${s.years} years · you can't afford the tuition`
                : `${s.years} years`;
      return row({ act: open ? "enroll" : null, k:"grad", arg:s.id, ico: open ? "🎓" : "🔒",
        t:s.name, s:why, r:E.money(g, cost), rMuted:!open, locked:!open });
    }).join("") +
    `<div style="height:8px"></div>` + backRow("Back to Work"));
}

function clubsSheet() {
  openSheet("School Clubs",
    E.CLUBS.map(c => row({ act:"club", k:c.id, ico: g.club === c.id ? "✅" : "🏅", t:c.name,
      s: Object.entries(c.stats).map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${k}`).join(", ") })).join("") +
    `<div style="height:8px"></div>` + backRow("Back to Work"));
}

function prisonSheet() {
  const juv = !!g.prison.juvenile;
  if (juv) {
    return openSheet("Juvenile Detention",
      H(`Serving ${g.prison.yearsLeft} of ${g.prison.total} years \u2014 ${g.prison.crime}`) +
      `<div class="note">You're a minor, so this is detention rather than prison — shorter, with schooling, and your record is sealed when you turn 18.</div>` +
      row({ act:"prison", k:"behave", ico:"\uD83D\uDE47", t:"Keep Your Head Down", s:"Chance of early release" }) +
      row({ act:"prison", k:"study",  ico:"\uD83D\uDCDA", t:"Do the Schooling", s:"Smarts up" }) +
      row({ act:"prison", k:"lawyer", ico:"\u2696\uFE0F", t:"Appeal the Sentence", s:"~30% succeed, and you probably have no money in here",
            r: E.money(g, Math.round(15000 * g.country.mult)), rMuted: g.money < Math.round(15000 * g.country.mult) }) +
      row({ act:"prison", k:"escape", ico:"\uD83C\uDFC3", t:"Attempt Escape", s:"Very risky" }));
  }
  openSheet("Prison",
    H(`Serving ${g.prison.yearsLeft} of ${g.prison.total} years \u2014 ${g.prison.crime}`) +
    (g.gang ? staticRow("\uD83D\uDC3A", `Running with ${g.gang}`, "Protection, at a price") : "") +
    row({ act:"prison", k:"behave",   ico:"\uD83D\uDE47", t:"Keep Your Head Down", s:"Chance of early release" }) +
    row({ act:"prison", k:"study",    ico:"\uD83D\uDCDA", t:"Prison Education", s:"Smarts up" }) +
    row({ act:"prison", k:"gang",     ico:"\uD83D\uDC3A", t:"Join a Gang", s:"Safety, but violent" }) +
    row({ act:"prison", k:"conjugal", ico:"\u2764\uFE0F", t:"Conjugal Visit", s:"Requires a partner" }) +
    row({ act:"prison", k:"riot",     ico:"\uD83D\uDD25", t:"Start a Riot", s:"High risk" }) +
    row({ act:"prison", k:"lawyer",   ico:"\u2696\uFE0F", t:"Hire an Appeals Lawyer", s:"About 30% succeed",
          r: E.money(g, Math.round(15000 * g.country.mult)), rMuted: g.money < Math.round(15000 * g.country.mult) }) +
    row({ act:"prison", k:"escape",   ico:"\uD83C\uDFC3", t:"Attempt Escape", s:"Very risky" }));
}

/* ============================ ASSETS ============================ */
/* The catalogues got long enough that dumping every tier onto one sheet
   buried the things you actually own. Assets is now a hub: what's yours at
   the top, the shops underneath, each one its own sub-sheet. */
function assetsSheet() {
  const A = g.assets;
  if (!A.empire) A.empire = [];
  const legacy = g.legacy || [];
  const cur = n => Math.round(n * g.country.mult);

  let h = H(`Net Worth: ${E.moneyShort(g, E.netWorth(g))}`) +
    row({ act:"sub", k:"finance", ico:"🏦", t:"Bank, Investments & Insurance",
          s:"Savings, shares, loans, cover" });

  if (A.houses.length || A.cars.length || A.luxury.length || A.empire.length || g.pets.length) {
    h += H("Owned");
    h += A.houses.map(a => row({ act:"sell", k:"house", id:a.id, ico:a.emoji, t:a.name, s:`Bought at age ${a.bought} · tap to sell`, r:E.money(g, a.value) })).join("");
    h += A.cars.map(a => row({ act:"sell", k:"car", id:a.id, ico:a.emoji, t:a.name, s:`${a.age} yr${a.age === 1 ? "" : "s"} old · tap to sell`, r:E.money(g, a.value) })).join("");
    h += A.luxury.map(a => row({ act:"sell", k:"luxury", id:a.id, ico:a.emoji, t:a.name, s:"Tap to sell", r:E.money(g, a.value) })).join("");
    h += A.empire.map(a => row({ act:"sell", k:"empire", id:a.id, ico:a.emoji, t:a.name,
          s: a.last == null
            ? `Owned ${a.age} yr${a.age === 1 ? "" : "s"} · tap to sell`
            : `${a.last >= 0 ? "Made" : "Lost"} ${E.moneyShort(g, a.last)} last year · tap to sell`,
          r:E.money(g, a.value) })).join("");
    h += g.pets.map(p => staticRow(p.emoji, p.name, `${p.kind} · ${p.age} yr${p.age === 1 ? "" : "s"} old`)).join("");
  }

  if (legacy.length) {
    h += H("Legacy");
    h += legacy.map(x => staticRow(x.emoji, x.name, `Age ${x.at} · ${E.money(g, x.spent)} given`)).join("");
  }

  /* Range hints only — nothing here is charged, so the compact form is safe. */
  const from = list => "from " + E.moneyShort(g, cur(Math.min(...list.map(x => x.price))));
  const top  = list => "up to " + E.moneyShort(g, cur(Math.max(...list.map(x => x.price))));

  h += H("Spend It") +
    row({ act:"sub", k:"shop", arg:"house",  ico:"🏠", t:"Real Estate",
          s:`${E.HOUSES.length} properties · ${top(E.HOUSES)}` }) +
    row({ act:"sub", k:"shop", arg:"car",    ico:"🚗", t:"Vehicles",
          s:`Cars, boats, aircraft · ${top(E.CARS)}` }) +
    row({ act:"sub", k:"shop", arg:"luxury", ico:"💎", t:"Luxury & Collectibles",
          s:`Art, jewels, auction lots · ${top(E.LUXURY)}` }) +
    row({ act:"sub", k:"shop", arg:"empire", ico:"🏛️", t:"Empire",
          s:`Clubs, studios, banks, rockets · ${top(E.EMPIRE)}` }) +
    row({ act:"sub", k:"legacy", ico:"🕊️", t:"Legacy & Status",
          s:`Titles, honours, giving it all away` }) +
    row({ act:"sub", k:"heirlooms", ico:"⌚", t:"Heirlooms",
          s:`Perks that outlive you${g.heirlooms.length ? ` · ${g.heirlooms.length} owned` : ""}` }) +
    row({ act:"sub", k:"pets", ico:"🐕", t:"Pets", s:from(E.PETS) });

  openSheet("Estate", h);
}

/* Price bands, so a 29-row catalogue reads as chapters rather than a wall. */
const BANDS = [
  { max: 100000,      label: "Getting Started" },
  { max: 1000000,     label: "Doing Well" },
  { max: 10000000,    label: "Rich" },
  { max: 100000000,   label: "Seriously Rich" },
  { max: 1000000000,  label: "Obscene" },
  { max: Infinity,    label: "Billionaires Only" },
];
const bandOf = p => BANDS.find(b => p < b.max).label;

const SHOPS = {
  house:  { title:"Real Estate", list:() => E.HOUSES, note:"Property drifts up most years, and costs about 1.2% of its value a year to keep." },
  car:    { title:"Vehicles",    list:() => E.CARS,   note:"Most of these lose value every year. The collectibles don't. Anything over a million costs 2.2% a year in crew, hangarage and insurance." },
  luxury: { title:"Luxury & Collectibles", list:() => E.LUXURY, note:"Bought well, these outrun the stock market. Bought badly, they're a very expensive hobby." },
  empire: { title:"Empire",      list:() => E.EMPIRE, note:"Each of these is a real business. It pays you or bleeds you every year, its valuation moves, and some of them buy fame instead of money." },
};

function shopSheet(kind) {
  const shop = SHOPS[kind];
  if (!shop) return assetsSheet();
  const list = shop.list();
  let h = `<div class="note">${esc(shop.note)}</div>`;
  let band = null;

  // Cheapest first, so the ladder you're climbing is obvious.
  const rows = list.map((x, i) => ({ x, i, p: Math.round(x.price * g.country.mult) }))
                   .sort((a, b) => a.p - b.p);

  for (const { x, i, p } of rows) {
    const b = bandOf(p);
    if (b !== band) { h += H(b); band = b; }
    h += row({ act:"buy", k:kind, i, ico:x.emoji, t:x.name, s:shopSub(kind, x),
               r:E.money(g, p), rMuted:g.money < p, locked:g.money < p });
  }
  h += backRow("Back to Estate");
  openSheet(shop.title, h);
}

/* One honest line about what owning the thing actually does to you. */
function shopSub(kind, x) {
  if (kind === "empire") {
    const mid = ((x.yield[0] + x.yield[1]) / 2) * 100;
    const ret = mid > 3 ? "pays" : mid > 0 ? "breaks even" : "burns cash";
    return `${x.blurb} · ${ret}${x.fame ? ` · +${x.fame} fame/yr` : ""}`;
  }
  if (kind === "luxury") {
    const a = Math.round((x.app || 0) * 100);
    return a > 0 ? `Appreciates about ${a}% a year` : `Loses about ${Math.abs(a)}% a year`;
  }
  if (kind === "car") {
    const d = Math.round((typeof x.dep === "number" ? x.dep : -0.12) * 100);
    return d > 0 ? `A collectible — gains about ${d}% a year` : `Loses about ${Math.abs(d)}% a year`;
  }
  return "";
}

/* Legacy: the only money in the game you can never get back. */
function legacySheet() {
  const owned = new Set((g.legacy || []).map(x => x.id));
  let h = `<div class="note">None of this can be sold and none of it counts towards your net worth. That is rather the point — it buys standing, and it follows your name.</div>`;
  const groups = [...new Set(E.LEGACY.map(x => x.group))];
  for (const grp of groups) {
    h += H(grp);
    h += E.LEGACY.filter(x => x.group === grp).map(x => {
      const p = Math.round(x.price * g.country.mult);
      if (owned.has(x.id)) return staticRow(x.emoji, x.name, "Done ✓", "", "muted");
      return row({ act:"legacy", k:x.id, ico:x.emoji, t:x.name,
        s:`${x.blurb} · +${x.fame} fame`, r:E.money(g, p), rMuted:g.money < p, locked:g.money < p });
    }).join("");
  }
  h += backRow("Back to Estate");
  openSheet("Legacy & Status", h);
}

function heirloomsSheet() {
  let h = `<div class="note">Heirlooms survive your death and pass to whoever inherits your line.</div>`;
  if (g.heirlooms.length) h += H("In the family") +
    g.heirlooms.map(x => staticRow(x.emoji, x.name, `${x.perk} +${x.bonus} · passes to your heirs`)).join("");
  h += H("For sale") + E.HEIRLOOMS.filter(x => !g.heirlooms.some(y => y.id === x.id)).map(x => {
    const p = Math.round(x.price * g.country.mult);
    return row({ act:"heirloom", k:x.id, ico:x.emoji, t:x.name, s:x.blurb,
      r:E.money(g, p), rMuted:g.money < p, locked:g.money < p });
  }).join("");
  h += backRow("Back to Estate");
  openSheet("Heirlooms", h);
}

function petsSheet() {
  let h = "";
  if (g.pets.length) h += H("Yours") +
    g.pets.map(p => staticRow(p.emoji, p.name, `${p.kind} · ${p.age} yr${p.age === 1 ? "" : "s"} old`)).join("");
  h += H("Adopt") + E.PETS.map((x, i) => {
    const p = Math.round(x.price * g.country.mult);
    return row({ act:"pet", i, ico:x.emoji, t:x.name, s:`Lives ${x.life[0]}–${x.life[1]} years`,
      r:E.money(g, p), rMuted:g.money < p, locked:g.money < p });
  }).join("");
  h += backRow("Back to Estate");
  openSheet("Pets", h);
}

/* ============================ FINANCE ============================ */
function financeSheet() {
  const invTotal = g.investments.reduce((s, i) => s + i.value, 0);
  const debt = g.loans.reduce((s, L) => s + L.balance, 0);
  const nw = E.netWorth(g);
  let h = H("Overview") +
    staticRow("💵", "Cash", null, (g.money < 0 ? "-" : "") + E.money(g, g.money), g.money < 0 ? "low" : "") +
    staticRow("📈", "Investments", null, E.money(g, invTotal), invTotal ? "" : "muted") +
    staticRow("🏦", "Debt", null, debt ? "-" + E.money(g, debt) : E.money(g, 0), debt ? "low" : "muted") +
    staticRow("🧮", "Net Worth", null, (nw < 0 ? "-" : "") + E.money(g, nw), nw < 0 ? "low" : "");

  if (g.investments.length) {
    h += H("Your Portfolio");
    h += g.investments.map(i => {
      const gain = i.value - i.basis;
      const pct = i.basis ? Math.round((gain / i.basis) * 100) : 0;
      return row({ act:"divest", k:i.id, ico:i.emoji, t:i.name, s:`Cost ${E.money(g, i.basis)} · tap to sell`,
        r:`${E.money(g, i.value)} (${gain >= 0 ? "+" : "−"}${Math.abs(pct)}%)`, rClass: gain >= 0 ? "" : "low" });
    }).join("");
  }

  if (g.stake) h += H("Inherited holding") +
    staticRow(g.stake.emoji, g.stake.name,
      g.stake.inTrust ? `Held in trust until you are 18${g.stake.held ? ` · ${E.money(g, g.stake.held)} withheld so far` : ""}`
                      : "A stake, not the running of it",
      E.money(g, g.stake.valuation));

  h += H("Invest") +
    E.INVESTMENTS.map(i => row({ act:"sub", k:"invest", arg:i.id, ico:i.emoji, t:i.name,
      s:`~${Math.round(i.mean * 100)}% average return · ${i.vol > 0.5 ? "extremely" : i.vol > 0.2 ? "very" : i.vol > 0.1 ? "moderately" : "barely"} volatile`,
      r:`min ${E.money(g, i.min)}`, rMuted:true })).join("");

  h += H("Insurance") +
    E.INSURANCE.map(i => row({ act:"insure", k:i.id, ico: g.insurance[i.id] ? "✅" : i.emoji,
      t:i.name, s: g.insurance[i.id] ? `Active · covers ${i.covers}` : `Covers ${i.covers}`,
      r:`${E.money(g, Math.round(i.premium * g.country.mult))}/yr`, rMuted:!g.insurance[i.id] })).join("");

  h += H("Borrowing");
  if (g.loans.length) h += g.loans.map(L => row({ act:"repay", id:L.id, ico:"🏦", t:`Loan of ${E.money(g, L.principal)}`,
    s:`${(L.rate * 100).toFixed(1)}% interest · tap to clear`, r:"-" + E.money(g, L.balance), rClass:"low" })).join("");
  [5000, 25000, 100000].forEach(a => {
    const amt = Math.round(a * g.country.mult);
    h += row({ act:"loan", amt, ico:"💳", t:`Borrow ${E.money(g, amt)}`, s:"Repaid automatically each year" });
  });
  if (debt > 0) h += row({ act:"bankrupt", ico:"⚠️", t:"Declare Bankruptcy", s:"Wipes your debts and everything you own" });
  h += `<div style="height:8px"></div>` + backRow("Back to Estate");

  openSheet("Money", h);
}

function investSheet(id) {
  const def = E.INVESTMENTS.find(i => i.id === id);
  if (!def) return financeSheet();
  openSheet(def.name,
    `<div class="note">Average return about ${Math.round(def.mean * 100)}% a year, but returns swing wildly — ${def.vol > 0.5 ? "this can lose most of its value in a single year" : def.vol > 0.2 ? "expect big up and down years" : "fairly steady"}. Minimum ${E.money(g, def.min)}.</div>` +
    H("How much of your cash?") +
    `<div class="amt">` + [10, 25, 50, 100].map(p =>
      `<button data-act="invest" data-k="${id}" data-pct="${p}">${p === 100 ? "All" : p + "%"}</button>`).join("") + `</div>` +
    H("You have") + staticRow("💵", "Cash available", null, E.money(g, g.money)) +
    row({ act:"sub", k:"finance", ico:"←", t:"Back to Money" }));
}

/* ============================ RELATIONSHIPS ============================ */
const REL_ICON = { mother:"👩", father:"👨", sibling:"🧑", child:"👶", grandmother:"👵", grandfather:"👴",
  aunt:"👩‍🦰", uncle:"🧔", cousin:"🧑‍🤝‍🧑", friend:"🙂", bestfriend:"🤝", partner:"❤️", ex:"💔", coworker:"👔", enemy:"😠" };

function relationshipsSheet() {
  const alive = g.rels.filter(r => r.alive);
  const groups = [
    ["Family",   alive.filter(r => ["mother","father","sibling","child","grandmother","grandfather","aunt","uncle","cousin"].includes(r.type))],
    ["Love",     alive.filter(r => ["partner","ex"].includes(r.type))],
    ["Friends",  alive.filter(r => ["friend","bestfriend"].includes(r.type))],
    ["Work",     alive.filter(r => r.type === "coworker")],
  ];
  let h = "";
  for (const [name, list] of groups) {
    if (!list.length) continue;
    h += H(name);
    h += list.map(r => {
      const cls = r.rel < 35 ? "low" : r.rel < 65 ? "mid" : "";
      return `<button class="row" data-act="relmenu" data-id="${esc(r.id)}">
        <span class="row-ico">${REL_ICON[r.type] || "🙂"}</span>
        <span class="row-main"><span class="row-t">${esc(r.name)}</span>
          <span class="row-s">${esc(E.relLabel(r))} · age ${r.age}${r.type === "partner" && g.married ? " · married" : ""}</span>
          <span class="meter"><i class="${cls}" style="width:${r.rel}%"></i></span></span>
        <span class="row-r ${cls}">${r.rel}%</span></button>`;
    }).join("");
  }
  const ptrs = E.partners(g);
  if (ptrs.length > 1) {
    h += H("Your Partners") +
      `<div class="note">You're seeing ${ptrs.length} people${E.secretPartners(g).length ? ` — ${E.secretPartners(g).length} of them without the others knowing` : ", openly"}. Spreading yourself thin costs you a little with each of them every year.</div>`;
  }

  h += H("Family Planning") + row({ act:"sub", k:"adopt", ico:"👶", t:"Adopt a Child",
    s:"Choose the age and, if you want, the sex \u00b7 a clean record helps a lot",
    r: "from " + E.money(g, Math.min(...E.ADOPT_BANDS.map(b => E.adoptCost(g, b.id)))),
    rMuted: g.money < Math.min(...E.ADOPT_BANDS.map(b => E.adoptCost(g, b.id))) });

  const dead = g.rels.filter(r => !r.alive && !["lostfriend","cutoff"].includes(r.type));
  if (dead.length) h += H("Passed Away") + dead.map(r => staticRow("🪦", r.name, `${E.relLabel(r)} · died at ${r.age}`)).join("");
  if (!alive.length) h = `<div class="empty">You're completely alone in the world.</div>` + h;

  openSheet("People", h);
}

function relSheet(id) {
  const r = g.rels.find(x => x.id === id);
  if (!r) return relationshipsSheet();
  const A = (k, ico, t, s) => row({ act:"rel", k, id, ico, t, s });
  const cur = n => E.money(g, Math.round(n * g.country.mult));
  let h = H(`${E.relLabel(r)} · relationship ${r.rel}%`) +
    A("time","🕐","Spend Time Together", "Free") +
    A("talk","💬","Have a Conversation", "Free") +
    A("compliment","😊","Compliment", "Free") +
    A("movie","🍿","Go to the Cinema", `${cur(20)}–${cur(80)}`) +
    A("trip","🧳","Take a Trip Together", `${cur(600)}–${cur(4000)}`) +
    A("gift","🎁","Give a Gift", `${cur(50)}–${cur(900)}`) +
    A("givemoney","💸","Give Them Money", `${cur(200)}–${cur(5000)}`) +
    A("askmoney","🤲","Ask for Money") +
    H("Conflict") +
    A("argue","😤","Argue") +
    A("insult","😠","Insult Them") +
    A("cutoff","✂️","Cut Them Off", "Permanent");
  if (r.type === "partner") {
    h += H("Love");
    if (!r.secret && !E.spouse(g)) h += A("propose","💍","Propose Marriage");
    if (!r.secret && !r.poly) h += A("open","🔓","Ask to Open the Relationship",
      "If they agree, you can both see other people openly");
    if (r.secret) h += A("confess","😬","Come Clean About Them",
      "Tell your other partner. It could end everything, or become an arrangement");
    h += A("baby","👶","Try for a Baby") +
         A("ivf","🧪","Fertility Treatment", `${cur(14000)} · much better odds`) +
         A("breakup","💔", r.spouse ? "Divorce" : "Break Up");
  }
  h += `<div style="height:8px"></div>` + backRow("Back to Relationships");
  openSheet(r.name, h);
}

/* ============================ ACTIVITIES ============================ */
function activitiesSheet() {
  if (g.prison) return prisonSheet();
  let h = "";
  const groups = [...new Set(E.ACTIVITIES.map(a => a.group))];
  for (const grp of groups) {
    const list = E.ACTIVITIES.filter(a => a.group === grp && (!a.min || g.age >= a.min));
    if (!list.length) continue;
    h += H(grp) + list.map(a => {
      // These two need a follow-up question, so they open a chooser rather than firing.
      const opens = a.id === "emigrate" ? "emigrate" : a.id === "vacation" ? "holiday"
                  : a.id === "date" ? "dating" : null;
      let price = a.cost ? Math.round(a.cost * g.country.mult) : 0, label = "";
      if (opens === "holiday") {
        price = Math.min(...E.HOLIDAYS.map(x => Math.round(x.cost * g.country.mult)));
        label = "from " + E.money(g, price);
      } else if (opens === "emigrate") {
        price = E.emigrateCost(g);
        label = E.money(g, price);
      } else if (price) label = E.money(g, price);
      return row({ act: opens ? "sub" : "activity", k: opens || a.id, ico:a.emoji, t:a.name,
        s: a.sub || (opens === "holiday" ? `${E.HOLIDAYS.length} destinations, each worth something different` : ""),
        r: label, rMuted: price > 0 && g.money < price, locked: price > 0 && g.money < price });
    }).join("");
    // cheating sits with the other Love options, but only if there's someone to cheat on
    if (grp === "Love" && g.age >= 18 && E.openPartners(g).length) {
      h += row({ act:"lover", ico:"\uD83E\uDD2B", t:"Take a Lover",
        s:"Start something on the side. Secrets don't keep \u2014 the longer it runs, the likelier it comes out" });
    }
  }
  if (E.adultMode() && g.age >= 18) {
    h += H("Vice \u2014 18+") +
      row({ act:"sub", k:"drugs", ico:"\uD83D\uDC8A", t:"Score Something",
            s:"Nine substances. Each one trades a high against your health, the law, and getting hooked" }) +
      row({ act:"sub", k:"deal", ico:"\uD83D\uDCB0", t:"Deal",
            s:"Buy in, sell on. Every run this year raises the odds of a cell" }) +
      row({ act:"sub", k:"sexwork", ico:"\uD83D\uDC84", t:"Sell Sex",
            s:"Four tiers, from the street to a high-end agency" }) +
      row({ act:"vice", k:"escort", ico:"\uD83C\uDF39", t:"Hire an Escort", s:"Occasionally costs a marriage",
            r:"~" + E.money(g, Math.round(900 * g.country.mult)), rMuted: g.money < Math.round(900 * g.country.mult) }) +
      row({ act:"vice", k:"strip", ico:"\uD83D\uDC83", t:"Strip Club", s:"An expensive evening",
            r:"~" + E.money(g, Math.round(400 * g.country.mult)), rMuted: g.money < Math.round(400 * g.country.mult) });
  }

  if (g.addiction || g.homeless) {
    h += H("Getting Straight");
    if (g.addiction) h += row({ act:"rehab", ico:"\uD83C\uDFE5", t:"Go to Rehab",
      s:"Residential works more often; state-funded is free but a lottery.",
      r: "up to " + E.money(g, Math.round(14000 * g.country.mult)), rMuted: g.money < Math.round(14000 * g.country.mult) });
    if (g.homeless) h += `<div class="note">You need a wage, or ${E.money(g, Math.round(30000 * g.country.mult))} saved, to get an address again. Job listings are under Career.</div>`;
  }

  h += H("Courts & Paperwork") +
    row({ act:"sub", k:"legal",   ico:"\u2696\uFE0F", t:"Take Someone to Court", s:"Sue, fight for custody, seek a restraining order" }) +
    row({ act:"sub", k:"licence", ico:"\uD83E\uDEAA", t:"Licences & Tests",
          s:`${Object.keys(g.licences || {}).filter(k => g.licences[k]).length} of ${E.LICENCES.length} held` }) +
    (g.birthCountry && g.country.name !== g.birthCountry && !(g.citizenships || []).includes(g.country.name)
      ? row({ act:"citizen", ico:"\uD83D\uDEC2", t:"Apply for Citizenship",
              s:`You're living in ${g.country.name} on a visa \u2014 the longer you've been here, the better your odds`,
              r: E.money(g, Math.round(2500 * g.country.mult)),
              rMuted: g.money < Math.round(2500 * g.country.mult) }) : "");

  if (E.conditionsOf(g).length) {
    h += H("Your Health") +
      E.conditionsOf(g).map(c => {
        const gross = Math.round((c.deadly ? 40000 : c.curable ? 12000 : 2500) * g.country.mult);
        const covered = !!(g.insurance && g.insurance.health);
        const pay = covered ? Math.round(gross * 0.2) : gross;
        return row({ act:"treat", k:c.id, ico:c.emoji, t:c.name,
          s:`Since ${c.since}. ${c.treat}${c.curable ? "" : " \u2014 manageable, not curable"}${covered ? " \u00b7 insurance covers 80%" : ""}`,
          r: E.money(g, pay), rMuted: g.money < pay });
      }).join("");
  }

  if (g.fame >= 10 || g.special) {
    h += H("Media") +
      E.MEDIA.map(m => {
        const f = 1 + g.fame / 80;
        const lo = Math.round(m.pay[0] * g.country.mult * f), hi = Math.round(m.pay[1] * g.country.mult * f);
        return row({ act:"media", k:m.id, ico:m.emoji, t:m.name,
          s: g.fame >= m.minFame ? `Fame +${m.fame[0]}\u2013${m.fame[1]} if it lands`
                                 : `Needs ${m.minFame} fame \u2014 you're on ${g.fame}`,
          r: g.fame >= m.minFame ? `${E.money(g, lo)}\u2013${E.money(g, hi)}` : "",
          locked: g.fame < m.minFame });
      }).join("");
  }

  if (g.special && g.special.id === "military") {
    h += H("Service") +
      row({ act:"deploy", ico:"\uD83E\uDE96", t:"Take a Tour",
            s:`${g.tours || 0} completed. Pay and decorations against real danger` });
  }

  h += H("Casino") + E.CASINO.map(c => row({ act:"sub", k:"casino", arg:c.id, ico:c.emoji, t:c.name,
    s:`${Math.round(c.win * 100)}% win rate${c.skill ? " · skill matters" : ""}`, r:`up to ${c.pay[1]}×`, rMuted:true })).join("");
  h += H("Underworld") +
    (!S.owns("pack_mafia")
      ? lockRow("pack_mafia")
      : g.mafia
      ? row({ act:"sub", k:"mafia", ico:"🕴️", t:`${E.MOB_RANKS[g.mafia.rank]} — ${g.mafia.family}`,
              s:`Respect ${g.mafia.respect} · heat ${g.mafia.heat}` })
      : row({ act:"sub", k:"family", ico:"🕴️", t:"Seek Out the Mafia", s:"A record helps. Getting out is harder than getting in" }));

  h += H("Crime") + E.CRIMES.map(c => row({ act:"crime", k:c.id, ico:"🥷", t:c.name,
    s:`${Math.round(c.risk * 100)}% risk · ${c.sentence[0]}-${c.sentence[1]} yr sentence${c.smartCrime ? " · smarts help a lot" : ""}` })).join("");
  openSheet("Pastimes", h);
}

function casinoSheet(id) {
  const c = E.CASINO.find(x => x.id === id);
  if (!c) return activitiesSheet();
  openSheet(c.name,
    `<div class="note">${c.name} pays out ${Math.round(c.win * 100)}% of the time, between ${c.pay[0]}× and ${c.pay[1]}× your stake.${c.skill ? " Your smarts meaningfully improve your odds here." : " Pure chance — smarts won't help."}</div>` +
    H("Stake how much?") +
    `<div class="amt">` + [10, 25, 50, 100].map(p =>
      `<button data-act="casino" data-k="${id}" data-pct="${p}">${p === 100 ? "All in" : p + "%"}</button>`).join("") + `</div>` +
    staticRow("💵", "Cash available", null, E.money(g, g.money)) +
    backRow("Back to Pastimes"));
}

const SUBS = { jobs:jobsSheet, jobsec:jobSectorSheet, special:specialSheet, uni:uniSheet, grad:gradSheet,
               clubs:clubsSheet, casino:casinoSheet, invest:investSheet, finance:financeSheet,
               god:godSheet, fighter:fighterSheet, mafia:mafiaSheet, royal:royalSheet,
               business:businessSheet, graveyard:graveyardSheet, store:storeSheet, buy:buySheet,
               drugs:drugsSheet, deal:dealSheet, sexwork:sexworkSheet,
               legal:legalSheet, licence:licenceSheet, adopt:adoptSheet, dating:datingSheet, emigrate:emigrateSheet,
               holiday:holidaySheet, enlist:enlistSheet, family:familySheet,
               shop:shopSheet, legacy:legacySheet, heirlooms:heirloomsSheet, pets:petsSheet };




function legalSheet() {
  const kids = g.rels.filter(r => r.type === "child" && r.alive && r.age < 18).length;
  const cur = n => E.money(g, Math.round(n * g.country.mult));

  openSheet("Courts & Paperwork",
    `<div class="note">A solicitor takes a fee up front whether you win or lose, and losing means paying the other side's costs too.</div>` +
    H("Sue someone") +
    E.SUE_TARGETS.map(t => row({ act:"sue", k:t.id, ico:t.emoji, t:t.name,
      s:`Over ${t.why} \u00b7 about ${Math.round(t.win * 100)}% of these succeed`,
      r:`${cur(2000)}\u2013${cur(18000)}`, rMuted: g.money < Math.round(2000 * g.country.mult) })).join("") +
    H("Family court") +
    row({ act:"custody", ico:"\uD83D\uDC6A", t:"Fight for Custody",
          r: kids ? `${cur(4000)}\u2013${cur(30000)}` : "", rMuted: g.money < Math.round(4000 * g.country.mult),
          s: kids ? `${kids} child${kids === 1 ? "" : "ren"} under 18. A job helps; a record and a habit do not` : "You've no children young enough",
          locked: !kids }) +
    H("Protection") +
    (g.rels.filter(r => r.alive && r.rel < 40 && r.type !== "child").slice(0, 6).map(r =>
      row({ act:"restrain", id:r.id, ico:"\uD83D\uDEAB", t:`Restraining Order \u2014 ${r.name}`,
            s:`${E.relLabel(r)} \u00b7 relationship ${r.rel}%` })).join("") ||
      `<div class="note">Nobody in your life is hostile enough for a court to grant one.</div>`) +
    `<div style="height:8px"></div>` + backRow("Back to Pastimes"));
}

function licenceSheet() {
  openSheet("Licences & Tests",
    `<div class="note">Driving without a licence risks a fine. Driving while you're drinking risks a great deal more.</div>` +
    E.LICENCES.map(l => {
      const held = !!(g.licences && g.licences[l.id]);
      const cost = Math.round(l.cost * g.country.mult);
      return row({ act: held ? null : "licence", k:l.id, ico: held ? "\u2705" : l.emoji, t:l.name,
        s: held ? "Held" : `Minimum age ${l.min} \u00b7 needs about ${l.smarts} smarts`,
        r: held ? "" : E.money(g, cost), rMuted: !held, locked: held });
    }).join("") + `<div style="height:8px"></div>` + backRow("Back to Pastimes"));
}

function datingSheet() {
  const why = E.datingWhy(g);
  if (why) return openSheet("Dating App",
    `<div class="note">${esc(why)}</div>` + backRow("Back to Pastimes"));
  const list = E.datingProfiles(g);
  const left = E.actionsLeft(g, "dating", 3);
  openSheet("Dating App",
    `<div class="note">Five people are near you this year. The ones with the best photos and the most money are also the least likely to reply \u2014 the percentage is your realistic chance. You get three approaches a year, and anyone you message drops off the list either way.</div>` +
    (left ? `<div class="note">${left} approach${left === 1 ? "" : "es"} left this year.</div>`
          : `<div class="note">You've done all your swiping for this year. Age up for a new batch.</div>`) +
    (list.length ? list.map(p => row({ act: left ? "dateprofile" : null, k:p.id,
        ico: p.gender === "male" ? "\uD83D\uDC68" : "\uD83D\uDC69",
        t:`${p.name}, ${p.age}`,
        s:`Looks ${p.looks} \u00b7 ${p.wealth} \u00b7 ${p.trait}`,
        r:`${p.odds}%`, rClass: p.odds >= 55 ? "" : p.odds >= 25 ? "mid" : "low",
        locked: !left })).join("")
      : `<div class="note">You've been through everyone on there this year.</div>`) +
    `<div style="height:8px"></div>` + backRow("Back to Pastimes"));
}

function adoptSheet(want) {
  const gender = want || "any";
  const pill = (v, label) => `<button class="row" data-act="sub" data-k="adopt" data-arg="${v}"
    style="flex:1;justify-content:center;${gender === v ? "font-weight:600" : "opacity:.55"}">
    <span class="row-main" style="text-align:center"><span class="row-t">${gender === v ? "\u25CF " : ""}${esc(label)}</span></span></button>`;
  openSheet("Adopt a Child",
    `<div class="note">Agencies have far more applicants than young children, so the younger you ask for, the longer the queue and the higher the fees. Asking for a boy or a girl specifically narrows the pool and lowers your odds.</div>` +
    H("Who are you hoping for?") +
    `<div style="display:flex;gap:6px;margin:0 0 10px">${pill("any","Either")}${pill("female","A girl")}${pill("male","A boy")}</div>` +
    H("How old?") +
    E.ADOPT_BANDS.map(b => {
      const p = E.adoptCost(g, b.id);
      const odds = Math.round((b.odds - (gender === "any" ? 0 : 0.12)) * 100);
      return row({ act:"adopt", k:b.id, arg:gender, ico:b.emoji, t:`${b.name} \u00b7 ${b.age[0]}\u2013${b.age[1]} yrs`,
        s:`${b.sub} \u00b7 roughly ${odds}% approved`,
        r: E.money(g, p), rMuted: g.money < p, locked: g.money < p });
    }).join("") + `<div style="height:8px"></div>` + backRow("Back to Relationships"));
}

function emigrateSheet() {
  const price = E.emigrateCost(g);
  const afford = g.money >= price;
  openSheet("Where To?",
    `<div class="note">Moving costs ${E.money(g, price)} wherever you land, plus the flight. You'll leave your job behind and live on a visa until you're granted citizenship. The percentage is roughly what daily life costs there \u2014 wages scale with it, so a cheap country is not automatically a rich life.</div>` +
    (afford ? "" : `<div class="note">You can't afford to go anywhere yet.</div>`) +
    E.COUNTRIES.filter(c => c.name !== g.country.name).map(c =>
      row({ act:"emigrateto", k:c.name, ico:c.flag, t:c.name,
        s:`${c.city.slice(0, 3).join(", ")} \u00b7 ${c.cur} \u00b7 costs ${Math.round(c.mult * 100)}% of US prices`,
        r: E.money(g, price), rMuted: !afford, locked: !afford })).join("") +
    `<div style="height:8px"></div>` + backRow("Back to Pastimes"));
}

function holidaySheet() {
  openSheet("Where Are You Going?",
    `<div class="note">Where you go changes what you come home with.</div>` +
    E.HOLIDAYS.map(x => {
      const p = Math.round(x.cost * g.country.mult);
      const perks = [`happiness +${x.happy[0]}\u2013${x.happy[1]}`,
        x.health ? `health ${x.health > 0 ? "+" : ""}${x.health}` : null,
        x.smarts ? `smarts +${x.smarts}` : null,
        x.fame ? `fame +${x.fame}` : null].filter(Boolean).join(" \u00b7 ");
      return row({ act:"holiday", k:x.id, ico:x.emoji, t:x.name, s:perks,
        r: E.money(g, p), rMuted: g.money < p, locked: g.money < p });
    }).join("") + `<div style="height:8px"></div>` + backRow("Back to Pastimes"));
}

function enlistSheet() {
  openSheet("Which Branch?",
    `<div class="note">Branches differ in what they pay and how likely a deployment is to go badly.</div>` +
    E.BRANCHES.map(b => row({ act:"enlist", k:b.id, ico:b.emoji, t:b.name,
      s:`${b.danger >= 1.2 ? "Most dangerous posting" : b.danger >= 1 ? "Standard risk on deployment"
          : b.danger >= 0.7 ? "Safer than most" : "Safest of the four"} \u00b7 pay ${
          b.pay > 1 ? "+" + Math.round((b.pay - 1) * 100) + "%" : "standard"}`,
      r: b.danger >= 1.2 ? "high risk" : b.danger >= 1 ? "risky" : "lower risk", rMuted:true })).join("") +
    `<div style="height:8px"></div>` + backRow("Back to Special Careers"));
}

function familySheet() {
  openSheet("Which Family?",
    `<div class="note">You don't pick them so much as ask. A criminal record is the only r\u00e9sum\u00e9 that counts, and once you're in, leaving is the hard part.</div>` +
    E.FAMILIES.map(f => row({ act:"joinfamily", k:f, ico:"\uD83D\uDD74\uFE0F",
      t: f.replace(/^the /, "The "), s:"Ask to be put up for membership" })).join("") +
    `<div style="height:8px"></div>` + backRow("Back to Pastimes"));
}

/* ============================ STORE ============================ */
function lockRow(id, why) {
  const p = S.productFor(id);
  return row({ act:"sub", k:"buy", arg:id, ico:"🔒", t:p.name,
    s: why || p.blurb.split(".")[0] + ".", r: S.displayPrice(id), rMuted:true });
}

function storeSheet() {
  const items = [...S.PRODUCTS];
  openSheet("Unlock More Modes",
    `<div class="note">One-off purchases, no subscription. Everything you've unlocked stays unlocked on this device and can be restored on a new one.</div>` +
    items.map(p => row({ act:"sub", k:"buy", arg:p.id, ico: S.owns(p.id) ? "✅" : p.emoji,
      t:p.name, s: S.owns(p.id) ? "Unlocked" : p.blurb,
      r: S.owns(p.id) ? "" : S.displayPrice(p.id), rMuted:!S.owns(p.id) })).join("") +
    (S.owns(S.BUNDLE.id) || S.ownedCount() === S.PRODUCTS.length ? "" :
      H("Better value") +
      row({ act:"sub", k:"buy", arg:S.BUNDLE.id, ico:S.BUNDLE.emoji, t:S.BUNDLE.name,
            s:S.BUNDLE.blurb, r:S.displayPrice(S.BUNDLE.id) })) +
    H("Already paid?") +
    row({ act:"restore", ico:"🔄", t:"Restore Purchases", s:"Bring back anything bought on another device" }) +
    (S.isNative() ? "" :
      `<div class="note" style="margin-top:14px">You're on the web preview, where the app stores can't take payment. Use the testing unlock below to try the packs.</div>` +
      row({ act:"devunlock", ico:"🧪", t:"Unlock everything (testing)", s:"Preview only — not present in the published app" })) +
    `<div style="height:8px"></div>` + backRow("Back to Menu"));
}

function buySheet(id) {
  const p = S.productFor(id);
  if (!p) return storeSheet();
  const bundleParts = id === S.BUNDLE.id ? S.PRODUCTS : null;
  openSheet(p.name,
    `<div style="text-align:center;font-size:52px;line-height:1;margin:6px 0 14px">${p.emoji}</div>` +
    `<div class="note" style="text-align:center;font-size:15px">${esc(p.blurb)}</div>` +
    (bundleParts ? H("Includes") + bundleParts.map(x =>
        staticRow(x.emoji, x.name, null, S.owns(x.id) ? "owned" : "")).join("") : "") +
    (S.owns(id)
      ? `<div class="note" style="text-align:center">You already own this.</div>`
      : `<button class="btn btn-primary btn-lg" data-act="iap" data-arg="${esc(id)}">Buy for ${esc(S.displayPrice(id))}</button>`) +
    `<div class="note" style="text-align:center;margin-top:12px">One-off payment. No subscription.</div>` +
    backRow("Back to the store"));
}


function drugsSheet() {
  openSheet("Score Something",
    `<div class="note">Prices vary. So does what it does to you. The riskier ones hook you fast and carry longer sentences.</div>` +
    E.DRUGS.map(d => {
      const p = Math.round(d.price * g.country.mult);
      return row({ act:"drug", k:d.id, ico:d.emoji, t:d.name,
        s:`${Math.round(d.addict * 100)}% chance of getting hooked \u00b7 ${Math.round(d.bust * 100)}% chance of being caught`,
        r:"~" + E.money(g, p), rMuted:g.money < p, locked:g.money < p });
    }).join("") + `<div style="height:8px"></div>` + backRow("Back to Pastimes"));
}

function dealSheet() {
  openSheet("Deal",
    `<div class="note">You put money up front and hope to clear more. Each run this year draws more heat, a record draws more still, and the harder the drug the longer the sentence.</div>` +
    E.DRUGS.map(d => {
      const stake = Math.round(d.price * 12 * g.country.mult);
      return row({ act:"deal", k:d.id, ico:d.emoji, t:d.name,
        s:`Clears ${E.money(g, Math.round(d.deal[0] * g.country.mult))}\u2013${E.money(g, Math.round(d.deal[1] * g.country.mult))} if it goes well`,
        r:"stake " + E.money(g, stake), rMuted:g.money < stake, locked:g.money < stake });
    }).join("") + `<div style="height:8px"></div>` + backRow("Back to Pastimes"));
}

function sexworkSheet() {
  openSheet("Sell Sex",
    `<div class="note">Higher tiers pay far better and are far safer, but they want looks. The street pays worst and is the most dangerous.</div>` +
    E.SEXWORK.map(t => row({ act:"sexwork", k:t.id, ico:t.emoji, t:t.name,
      s:`${Math.round(t.risk * 100)}% chance of arrest or worse per season`,
      r:`${E.money(g, Math.round(t.pay[0] * g.country.mult))}\u2013${E.money(g, Math.round(t.pay[1] * g.country.mult))}` })).join("") +
    `<div style="height:8px"></div>` + backRow("Back to Pastimes"));
}

/* ============================ PREMIUM MODE SHEETS ============================ */
function menuSheet() {
  const dead = !g.alive;
  openSheet("Menu",
    H("Time Machine") +
    (S.owns("pack_god")
      ? row({ act:"rewind", ico:"⏳", t:"Undo Last Year",
              s: E.canRewind(g) ? "Go back and live it differently" : "Nothing to undo yet",
              locked: !E.canRewind(g) })
      : lockRow("pack_god")) +
    (S.owns("pack_god")
      ? H("God Mode") +
        row({ act:"sub", k:"god", ico:"✨", t:"Edit Your Life", s:"Set your stats, money, fame and age" }) +
        (dead ? row({ act:"revive", ico:"💗", t:"Refuse to Die", s:"Come back from the dead" }) : "")
      : "") +
    H("Legacy") +
    (E.heirs(g).length
      ? E.heirs(g).map(k => row({ act:"heir", id:k.id, ico:"🕯️", t:`Continue as ${k.name}`,
          s:`Your ${k.gender === "male" ? "son" : "daughter"}, age ${k.age}${dead ? "" : " — only after you die"}`,
          locked: !dead })).join("")
      : `<div class="note">Have children and your line can continue after you die, inheriting your money and heirlooms.</div>`) +
    H("Settings") +
    row({ act:"adult", ico: E.adultMode() ? "\uD83D\uDD1E" : "\uD83D\uDD12",
          t:"Adult content (18+)",
          s: E.adultMode()
               ? "On \u2014 crude, dark and explicit-adjacent events can occur"
               : "Off \u2014 tap to enable. Only ever applies to characters aged 18+",
          r: E.adultMode() ? "ON" : "OFF", rMuted: !E.adultMode() }) +
    row({ act:"sound", ico: Fx.soundEnabled() ? "\uD83D\uDD0A" : "\uD83D\uDD07",
          t:"Sound & effects",
          s: Fx.soundEnabled() ? "On \u2014 the big moments land" : "Off \u2014 effects still show, silently",
          r: Fx.soundEnabled() ? "ON" : "OFF", rMuted: !Fx.soundEnabled() }) +
    row({ act:"theme", ico: themeNow() === "dark" ? "\uD83C\uDF11" : "\uD83D\uDCDC",
          t:"Appearance",
          s: themeNow() === "dark" ? "Bark \u2014 tap for paper" : "Paper \u2014 tap for bark",
          r: themeNow() === "dark" ? "BARK" : "PAPER", rMuted:true }) +
    H("Store") +
    row({ act:"sub", k:"store", ico:"🛒", t:"Unlock More Modes",
          s:`${S.ownedCount()} of ${S.PRODUCTS.length} packs unlocked` }) +
    H("Other") +
    row({ act:"sub", k:"graveyard", ico:"🪦", t:"Graveyard", s:"Every life you've lived" }) +
    row({ act:"title", ico:"🏠", t:"Main Menu" }));
}

function godSheet() {
  openSheet("God Mode",
    `<div class="note">Set anything to whatever you like. This is the cheat panel — it will not judge you.</div>` +
    ["happiness","health","smarts","looks","fame"].map(f =>
      `<div class="field"><label>${f}${f === "fame" ? "" : " (0-100)"}</label>
        <input id="god-${f}" type="number" value="${f === "fame" ? g.fame : g.stats[f]}"></div>`).join("") +
    `<div class="field"><label>Bank balance</label><input id="god-money" type="number" value="${Math.round(g.money)}"></div>
     <div class="field"><label>Age</label><input id="god-age" type="number" value="${g.age}"></div>
     <button class="btn btn-primary" id="god-apply">Apply</button>` +
    `<div style="height:8px"></div>` + backRow("Back to Menu"));
  $("god-apply").onclick = () => {
    for (const f of ["happiness","health","smarts","looks","fame","money","age"]) {
      const el2 = $("god-" + f);
      if (el2 && el2.value !== "") E.godSet(g, f, el2.value);
    }
    E.save(g); render(); toast("Reality adjusted."); currentSub = null; refreshSheet();
  };
}

function fighterSheet() {
  if (!g.fighter) {
    return openSheet("The Fight Game",
      `<div class="note">Turn professional. Train, climb the rankings and fight for a belt — but every fight costs you health, and the damage accumulates.</div>` +
      H("Choose a discipline") +
      E.FIGHT_STYLES.map(s2 => row({ act:"fightjoin", k:s2.id, ico:s2.emoji, t:s2.name,
        s: s2.pow > s2.tec ? "Power over technique" : s2.tec > s2.pow ? "Technique over power" : "Balanced" })).join("") +
      `<div style="height:8px"></div>` + backRow("Back to Work"));
  }
  const f = g.fighter;
  openSheet("The Fight Game",
    H("Record") +
    staticRow(f.emoji, `${f.wins}-${f.losses}-${f.draws} (${f.kos} KO)`,
      `${f.name} · ranked #${f.rank} · ${E.BELTS[f.belt]}`, E.money(g, E.fighterPurse(g)) + "/fight") +
    `<div class="group"><div class="row" style="pointer-events:none"><span class="row-ico">💪</span>
      <span class="row-main"><span class="row-t">Power ${f.power} · Technique ${f.technique}</span>
      <span class="row-s">Condition also depends on your health.</span>
      <span class="meter"><i class="${f.power < 40 ? "low" : f.power < 65 ? "mid" : ""}" style="width:${f.power}%"></i></span></span></div></div>` +
    H("Actions") +
    row({ act:"fightact", k:"train", ico:"🏋️", t:"Training Camp", s:"Raises power and technique",
          r: E.money(g, Math.round(3000 * g.country.mult)),
          rMuted: g.money < Math.round(3000 * g.country.mult) }) +
    row({ act:"fightact", k:"fight", ico:"🥊", t:"Take a Fight", s:"Up to three a year. Win to climb the rankings" }) +
    row({ act:"fightact", k:"title", ico:"🏆", t:"Fight for the Title",
          s: f.rank <= 3 ? "Triple purse. Win it and you're champion" : `Needs a top-3 ranking — you're #${f.rank}`,
          locked: f.rank > 3 }) +
    row({ act:"fightact", k:"retire", ico:"🚪", t:"Retire" }) +
    `<div style="height:8px"></div>` + backRow("Back to Work"));
}

function mafiaSheet() {
  const m = g.mafia;
  if (!m) return activitiesSheet();
  openSheet("Underworld",
    H(m.family) +
    staticRow("🕴️", E.MOB_RANKS[m.rank], `Respect ${m.respect} · police heat ${m.heat}`) +
    (m.rackets.length ? H("Rackets you run") + m.rackets.map(r => staticRow("💰", r[0].toUpperCase() + r.slice(1), "Earns every year")).join("") : "") +
    H("Actions") +
    row({ act:"mafiaact", k:"job", ico:"💼", t:"Put in Work", s:"Earn for the family. Three a year. Heat rises" }) +
    row({ act:"mafiaact", k:"tribute", ico:"🤝", t:"Kick Up", s:"Pay tribute — buys respect, cools heat" }) +
    row({ act:"mafiaact", k:"racket", ico:"🏗️", t:"Take a Racket", s:"Soldiers and above. Permanent yearly income" }) +
    row({ act:"mafiaact", k:"hit", ico:"🔫", t:"Do a Hit", s:"Big respect. Life sentence if it goes wrong" }) +
    row({ act:"mafiaact", k:"leave", ico:"🚪", t:"Ask Out", s:"They rarely say yes" }) +
    `<div style="height:8px"></div>` + backRow("Back to Pastimes"));
}

function royalSheet() {
  const r = g.royal;
  if (!r) return occupationSheet();
  openSheet("The Crown",
    H(r.house) +
    staticRow("👑", E.royalTitle(g), `${r.ruler ? "Reigning" : "In line to the throne"} · popularity ${r.popularity}`,
      E.money(g, r.treasury)) +
    H("Actions") +
    row({ act:"royalact", k:"appearance", ico:"🎀", t:"Royal Tour", s:"Win the public over" }) +
    row({ act:"royalact", k:"invest", ico:"🏥", t:"Spend on the Country", s:"Treasury down, popularity up" }) +
    row({ act:"royalact", k:"tax", ico:"💰", t:"Levy a Tax", s:"Take from the treasury. They will resent it" }) +
    row({ act:"royalact", k:"war", ico:"⚔️", t:"Declare War", s: r.ruler ? "Glory or ruin" : "Only a reigning monarch can", locked: !r.ruler }) +
    row({ act:"royalact", k:"abdicate", ico:"🚪", t:"Abdicate" }) +
    `<div style="height:8px"></div>` + backRow("Back to Work"));
}

function businessSheet() {
  if (!g.business) {
    return openSheet("Start a Business",
      `<div class="note">Found a company, put capital in, and either grow it or watch it fold. Float it and the payday is enormous.</div>` +
      E.SECTORS.map(s2 => {
        const p = Math.round(s2.cost * g.country.mult);
        return row({ act:"bizfound", k:s2.id, ico:s2.emoji, t:s2.name,
          s:`~${Math.round(s2.growth * 100)}% growth · ${s2.vol > 0.4 ? "very" : s2.vol > 0.25 ? "fairly" : "less"} volatile`,
          r:E.money(g, p), rMuted:g.money < p, locked:g.money < p });
      }).join("") +
      `<div style="height:8px"></div>` + backRow("Back to Work"));
  }
  const b = g.business;
  openSheet(b.name,
    H("Your company") +
    staticRow(b.emoji, b.name, `${b.staff} staff${b.public ? " · publicly listed" : ""}`, E.money(g, b.valuation)) +
    H("Actions") +
    row({ act:"bizact", k:"invest", ico:"💵", t:"Inject Capital", s:"Grow the valuation and hire",
          r: E.money(g, Math.max(10000, Math.round(b.valuation * 0.2))),
          rMuted: g.money < Math.max(10000, Math.round(b.valuation * 0.2)) }) +
    row({ act:"bizact", k:"market", ico:"📣", t:"Marketing Push", s:"Might raise the valuation sharply",
          r: E.money(g, Math.max(5000, Math.round(b.valuation * 0.08))),
          rMuted: g.money < Math.max(5000, Math.round(b.valuation * 0.08)) }) +
    row({ act:"bizact", k:"ipo", ico:"📈", t:"Float the Company",
          s: b.public ? "Already listed" : "Needs a big valuation. Huge payday", locked: b.public }) +
    row({ act:"bizact", k:"sell", ico:"🤝", t:"Sell Up" }) +
    /* Who gets it when you're gone. Left unsaid, the board decides, and the
       board mostly decides your children are shareholders. */
    H("Succession") +
    (E.heirs(g).length
      ? E.heirs(g).map(k => row({ act:"successor", id:k.id,
          ico: b.successor === k.id ? "✒️" : "👤", t:k.name,
          s: b.successor === k.id
               ? `Named to take over${k.age < 18 ? " — held in trust until 18" : ""} · tap to remove`
               : `Age ${k.age} · ${k.rel >= 58 ? "well regarded" : "the board is unconvinced"} · tap to name`,
          r: b.successor === k.id ? "NAMED" : "", rMuted:true })).join("")
      : `<div class="note">You have no children to leave it to. The board will sell it.</div>`) +
    `<div style="height:8px"></div>` + backRow("Back to Work"));
}

function continueLine(heirId) {
  const next = E.continueAsHeir(g, heirId);
  if (!next) { toast("That heir is gone."); return; }
  g = next;
  renderedYears = 0;
  showGame();
  renderFeed(true);
}

/* ============================ DEATH ============================ */
function deathScreen() {
  const stars = "★".repeat(g.stars) + "☆".repeat(5 - g.stars);
  $("modal-body").innerHTML = `
    <div class="modal-mark">${markSVG({ size: 62, plate: false, closed: true, ring: "currentColor" })}</div>
    <h2>${esc(g.first)} ${esc(g.last)}</h2>
    <div class="sub">${g.birthYear} — ${g.birthYear + g.age} · died at ${g.age} from ${esc(g.causeOfDeath)}</div>
    <div class="stars">${stars}</div>
    ${g.ribbons && g.ribbons.length ? `<div style="text-align:center;margin-bottom:14px">${g.ribbons.map(r => `<span class="pill on">${esc(r)}</span>`).join("")}</div>` : ""}
    <div class="tomb">
      <div class="tomb-row"><span>Net worth</span><span>${esc(E.money(g, E.netWorth(g)))}</span></div>
      <div class="tomb-row"><span>Final role</span><span>${esc(g.special ? g.special.title : g.job ? g.job.title : g.pension ? "Retired" : "Unemployed")}</span></div>
      <div class="tomb-row"><span>Education</span><span>${g.diplomas.grad ? "Graduate" : g.diplomas.uni ? "Bachelor's" : g.diplomas.high ? "High School" : "None"}</span></div>
      <div class="tomb-row"><span>Fame</span><span>${g.fame}</span></div>
      <div class="tomb-row"><span>Country</span><span>${esc(g.country.name)}</span></div>
      <div class="tomb-row"><span>Children</span><span>${g.rels.filter(r => r.type === "child").length}</span></div>
      <div class="tomb-row"><span>Times arrested</span><span>${g.criminalRecord}</span></div>
      <div class="tomb-row"><span>Years in prison</span><span>${g.yearsJailed}</span></div>
    </div>
    ${E.heirs(g).map(k => `<button class="btn btn-primary" data-act="heir" data-id="${esc(k.id)}">Continue as ${esc(k.name)} (${k.age})</button>`).join("")}
    <button class="btn ${E.heirs(g).length ? "" : "btn-primary"}" data-act="newlife">Start Another Life</button>
    <button class="btn btn-ghost" data-act="title">Main Menu</button>`;
  openModal();
}

function newLifeFlow() { E.clearSave(); startLife(E.newGame()); renderFeed(true); }

/* ============================ TITLE SHEETS ============================ */
function customSheet() {
  openSheet("Custom Character", `
    <div class="field"><label>First name</label><input id="c-first" placeholder="Leave blank for random"></div>
    <div class="field"><label>Last name</label><input id="c-last" placeholder="Leave blank for random"></div>
    <div class="field"><label>Gender</label>
      <div class="seg"><button id="c-m" class="on">Male</button><button id="c-f">Female</button></div></div>
    <div class="field"><label>Country</label><select id="c-country">
      <option value="">Random</option>
      ${E.COUNTRIES.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join("")}
    </select></div>
    <button class="btn btn-primary" id="c-go">Begin Life</button>`);

  let gender = "male";
  $("c-m").onclick = () => { gender = "male"; $("c-m").classList.add("on"); $("c-f").classList.remove("on"); };
  $("c-f").onclick = () => { gender = "female"; $("c-f").classList.add("on"); $("c-m").classList.remove("on"); };
  $("c-go").onclick = () => {
    const ci = $("c-country").value;
    closeSheet();
    startLife(E.newGame({ first:$("c-first").value.trim() || null, last:$("c-last").value.trim() || null,
      gender, country: ci === "" ? null : E.COUNTRIES[+ci] }));
    renderFeed(true);
  };
}

function graveyardSheet() {
  const list = E.graveyard();
  if (!list.length) return openSheet("Graveyard", `<div class="empty">No lives lived yet.</div>`);
  openSheet("Graveyard", list.map(d => `
    <div class="row" style="pointer-events:none;align-items:flex-start"><span class="row-ico">🪦</span>
      <span class="row-main"><span class="row-t">${esc(d.name)}</span>
        <span class="row-s">Died at ${d.age} · ${esc(d.cause)} · ${esc(d.job)}</span>
        ${d.ribbons && d.ribbons.length ? `<span style="display:block;margin-top:5px">${d.ribbons.map(r => `<span class="pill">${esc(r)}</span>`).join("")}</span>` : ""}
      </span><span class="row-r">${"★".repeat(d.stars)}</span></div>`).join(""));
}

/* ============================ TOAST ============================ */
let toastT;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 2600);
}

boot();
