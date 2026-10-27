/* ============================================================
   AnotherLife — additional life systems
   Legal, licences, medical, citizenship, media and military.
   Same contract as modes.js: everything takes (g, api) so this file
   never imports the engine and no cycle forms.
   ============================================================ */
import { pick, rint, chance, clamp, an, afford } from "./util.js";

/* ============================================================
   LEGAL — suing, being sued, custody, restraining orders
   ============================================================ */
export const SUE_TARGETS = [
  { id:"neighbour", name:"Your Neighbour",     emoji:"🏡", why:"the tree, the noise, the fence", win:0.50, award:[500,40000] },
  { id:"employer",  name:"Your Employer",      emoji:"💼", why:"unfair dismissal or unpaid wages", win:0.45, award:[3000,180000], needJobHistory:true },
  { id:"company",   name:"A Large Company",    emoji:"🏢", why:"a faulty product or an injury",   win:0.35, award:[5000,900000] },
  { id:"doctor",    name:"A Hospital",         emoji:"🏥", why:"something that went wrong",       win:0.30, award:[20000,2000000] },
  { id:"paper",     name:"A Newspaper",        emoji:"📰", why:"what they printed about you",     win:0.40, award:[10000,600000], needFame:35 },
  { id:"ex",        name:"An Ex-Partner",      emoji:"💔", why:"property, money or spite",        win:0.45, award:[1000,120000], needEx:true },
];

export function sue(g, api, targetId) {
  const t = SUE_TARGETS.find(x => x.id === targetId);
  if (!t) return api.fail("Unknown.");
  if (g.age < 18) return api.fail("You'd need a parent to bring that.");
  if (t.needFame && g.fame < t.needFame) return api.fail("Nobody has printed anything about you.");
  if (t.needEx && !g.rels.some(r => r.type === "ex")) return api.fail("You'd need an ex first.");
  if (t.needJobHistory && !g.job && !g.pension) return api.fail("You'd need an employer to sue.");
  if (!api.useAction(g, "sue")) return api.fail("One claim a year. Courts are slow.");

  const fees = Math.round(rint(2000, 18000) * g.country.mult);
  if (g.money < fees) return api.fail(`A solicitor wants ${api.money(g, fees)} up front.`);
  g.money -= fees;

  const odds = t.win + (g.stats.smarts - 50) / 500 + (g.money > 500000 ? 0.08 : 0);
  if (chance(odds)) {
    const award = Math.round(rint(t.award[0], t.award[1]) * g.country.mult);
    api.applyResult(g, { text: `⚖️ You sued ${t.name.toLowerCase()} over ${t.why} and won ${api.money(g, award)}.`,
      money: +award, stats: { happiness: +16 }, kind: "good" });
  } else {
    const costs = Math.round(fees * rint(15, 40) / 10);
    api.applyResult(g, { text: `⚖️ You sued ${t.name.toLowerCase()} and lost. Their costs came to ${api.money(g, costs)}.`,
      money: -afford(g, costs), stats: { happiness: -18 }, kind: "bad" });
  }
  return api.ok();
}

export function custodyBattle(g, api) {
  const kids = g.rels.filter(r => r.type === "child" && r.alive && r.age < 18);
  if (!kids.length) return api.fail("You've no children young enough for that.");
  if (!g.rels.some(r => r.type === "ex")) return api.fail("There's nobody to fight.");
  if (!api.useAction(g, "custody")) return api.fail("Once a year.");
  const fees = Math.round(rint(4000, 30000) * g.country.mult);
  if (g.money < fees) return api.fail(`Family lawyers want ${api.money(g, fees)}.`);
  g.money -= fees;

  const odds = 0.42 + (g.stats.happiness - 50) / 400 - g.criminalRecord * 0.06 + (g.job ? 0.10 : -0.08) - (g.addiction ? 0.15 : 0);
  if (chance(Math.max(0.08, odds))) {
    kids.forEach(k => k.rel = clamp(k.rel + rint(6, 18)));
    api.applyResult(g, { text: `⚖️ You were awarded primary custody. It cost ${api.money(g, fees)} and was worth it.`,
      stats: { happiness: +22 }, kind: "good" });
  } else {
    kids.forEach(k => k.rel = clamp(k.rel - rint(4, 14)));
    api.applyResult(g, { text: `⚖️ You lost the custody hearing and were given weekends.`,
      stats: { happiness: -26 }, kind: "bad" });
  }
  return api.ok();
}

export function restrainingOrder(g, api, relId) {
  const r = g.rels.find(x => x.id === relId && x.alive);
  if (!r) return api.fail("They're not around.");
  if (!api.useAction(g, "ro_" + relId)) return api.fail("Already dealt with this year.");
  if (chance(0.6 + (r.rel < 25 ? 0.2 : 0))) {
    r.alive = false; r.type = "cutoff";
    api.applyResult(g, { text: `⚖️ A court ordered ${r.name} to stay away from you.`, stats: { happiness: +10 }, kind: "good" });
  } else {
    api.applyResult(g, { text: `⚖️ The court didn't think ${r.name} was a threat. They know you tried.`,
      stats: { happiness: -10 }, kind: "bad" });
    r.rel = clamp(r.rel - 40);
  }
  return api.ok();
}

/* ============================================================
   LICENCES — passing tests, and what happens without them
   ============================================================ */
export const LICENCES = [
  { id:"car",   name:"Driving Licence",     emoji:"🚗", min:17, cost: 900,   smarts:20, fail:"the parallel park" },
  { id:"bike",  name:"Motorcycle Licence",  emoji:"🏍️", min:17, cost: 700,   smarts:20, fail:"the emergency stop" },
  { id:"boat",  name:"Boating Licence",     emoji:"⛵", min:18, cost: 1200,  smarts:35, fail:"the navigation paper" },
  { id:"pilot", name:"Pilot's Licence",     emoji:"✈️", min:18, cost: 14000, smarts:65, fail:"the instrument rating" },
  { id:"gun",   name:"Firearms Licence",    emoji:"🔫", min:18, cost: 600,   smarts:30, fail:"the background check" },
];

export function takeLicence(g, api, id) {
  const l = LICENCES.find(x => x.id === id);
  if (!l) return api.fail("Unknown.");
  if (!g.licences) g.licences = {};
  if (g.licences[id]) return api.fail(`You already hold ${an(l.name)} ${l.name.toLowerCase()}.`);
  if (g.age < l.min) return api.fail(`You have to be ${l.min}.`);
  if (id === "gun" && g.criminalRecord > 0) return api.fail("Your record rules that out.");
  if (!api.useAction(g, "lic_" + id)) return api.fail("One attempt a year.");

  const cost = Math.round(l.cost * g.country.mult);
  if (g.money < cost) return api.fail(`It costs ${api.money(g, cost)} to sit.`);
  g.money -= cost;

  const odds = 0.35 + (g.stats.smarts - l.smarts) / 110 + (g.stats.health - 50) / 500;
  if (chance(Math.max(0.1, Math.min(0.95, odds)))) {
    g.licences[id] = true;
    api.applyResult(g, { text: `${l.emoji} You passed and hold ${an(l.name)} ${l.name.toLowerCase()}.`,
      stats: { happiness: +12, smarts: +2 }, kind: "good" });
  } else {
    api.applyResult(g, { text: `${l.emoji} You failed on ${l.fail}. ${api.money(g, cost)} gone.`,
      stats: { happiness: -8 } });
  }
  return api.ok();
}

/* Driving without one, or over the limit, catches up with you. */
export function drivingRisk(g, api) {
  if (!g.assets.cars.length || g.age < 16) return;
  const unlicensed = !(g.licences && g.licences.car);
  const drunk = g.addiction && g.addiction.kind === "alcohol";
  if (!unlicensed && !drunk) return;
  const risk = (unlicensed ? 0.06 : 0) + (drunk ? 0.08 : 0);
  if (!chance(risk)) return;
  if (drunk && chance(0.5)) {
    api.applyResult(g, { text: `🚓 You were pulled over and blew over the limit.`, stats: { happiness: -16 }, kind: "bad" });
    api.arrest(g, "drink driving", [1, 3]);
  } else {
    const fine = Math.round(rint(300, 3000) * g.country.mult);
    api.applyResult(g, { text: `🚓 You were stopped driving without a licence and fined ${api.money(g, fine)}.${
      g.money < fine ? " You didn't have it, so you owe it." : ""}`,
      money: -fine, stats: { happiness: -10 }, kind: "bad" });
  }
}

/* ============================================================
   MEDICAL — conditions you live with, and what can be done
   ============================================================ */
export const CONDITIONS = [
  { id:"asthma",   name:"Asthma",              emoji:"🫁", health:-2, happy:-1, curable:false, treat:"an inhaler" },
  { id:"diabetes", name:"Type 2 Diabetes",     emoji:"🩸", health:-3, happy:-2, curable:false, treat:"medication and diet" },
  { id:"backpain", name:"Chronic Back Pain",   emoji:"🦴", health:-2, happy:-4, curable:true,  treat:"surgery" },
  { id:"anxiety",  name:"Anxiety Disorder",    emoji:"😰", health:-1, happy:-6, curable:true,  treat:"therapy and medication" },
  { id:"depress",  name:"Depression",          emoji:"🌧️", health:-2, happy:-8, curable:true,  treat:"therapy and medication" },
  { id:"arthrit",  name:"Arthritis",           emoji:"🖐️", health:-3, happy:-3, curable:false, treat:"pain management" },
  { id:"heart",    name:"Heart Disease",       emoji:"❤️‍🩹", health:-6, happy:-3, curable:true,  treat:"bypass surgery" },
  { id:"cancer",   name:"Cancer",              emoji:"🎗️", health:-12, happy:-10, curable:true, treat:"chemotherapy", deadly:0.12 },
  { id:"kidney",   name:"Kidney Failure",      emoji:"🫘", health:-9, happy:-6, curable:true,  treat:"a transplant", deadly:0.08 },
  { id:"insomnia", name:"Insomnia",            emoji:"🌙", health:-2, happy:-4, curable:true,  treat:"a sleep clinic" },
];

export function diagnose(g, api, id) {
  if (!g.conditions) g.conditions = [];
  if (g.conditions.some(c => c.id === id)) return;
  const c = CONDITIONS.find(x => x.id === id);
  if (!c) return;
  g.conditions.push({ id: c.id, since: g.age });
  api.applyResult(g, { text: `${c.emoji} You were diagnosed with ${c.name.toLowerCase()}.`,
    stats: { happiness: -rint(8, 18), health: -rint(2, 8) }, kind: "bad" });
}

export function treat(g, api, id) {
  if (!g.conditions) g.conditions = [];
  const have = g.conditions.find(c => c.id === id);
  if (!have) return api.fail("You don't have that.");
  const c = CONDITIONS.find(x => x.id === id);
  if (!api.useAction(g, "treat_" + id)) return api.fail("You've already had a course of that this year.");

  const cost = Math.round((c.deadly ? 40000 : c.curable ? 12000 : 2500) * g.country.mult);
  const covered = g.insurance && g.insurance.health;
  const pay = covered ? Math.round(cost * 0.2) : cost;
  if (g.money < pay) return api.fail(`Treatment costs ${api.money(g, pay)}${covered ? " after insurance" : ""}.`);
  g.money -= pay;

  const odds = c.curable ? 0.62 + (g.stats.health - 50) / 260 : 0;
  if (c.curable && chance(odds)) {
    g.conditions = g.conditions.filter(x => x.id !== id);
    api.applyResult(g, { text: `${c.emoji} ${c.treat[0].toUpperCase() + c.treat.slice(1)} worked. You're clear of ${c.name.toLowerCase()}.`,
      stats: { health: +rint(10, 24), happiness: +rint(12, 25) }, kind: "good" });
  } else if (c.curable) {
    api.applyResult(g, { text: `${c.emoji} The treatment didn't take. You're still living with it.`,
      stats: { happiness: -10 }, kind: "bad" });
  } else {
    api.applyResult(g, { text: `${c.emoji} ${c.treat[0].toUpperCase() + c.treat.slice(1)} keeps the ${c.name.toLowerCase()} manageable.`,
      stats: { health: +rint(3, 9), happiness: +8 }, kind: "good" });
  }
  return api.ok();
}

export function medicalYear(g, api) {
  if (!g.conditions) g.conditions = [];
  for (const held of g.conditions.slice()) {
    const c = CONDITIONS.find(x => x.id === held.id);
    if (!c) continue;
    // The body already declines with age; conditions add to that rather than
    // doubling it, or a single diagnosis at 40 becomes a death sentence.
    if (chance(0.6)) g.stats.health = clamp(g.stats.health + Math.round(c.health * 0.6));
    g.stats.happiness = clamp(g.stats.happiness + c.happy);
    if (c.deadly && chance(c.deadly * (g.insurance && g.insurance.health ? 0.6 : 1))) {
      api.die(g, c.name.toLowerCase());
      return;
    }
  }
  // new diagnoses get likelier with age and worse health
  const risk = 0.008 + Math.max(0, g.age - 40) / 2200 + (100 - g.stats.health) / 3400;
  if (chance(risk)) {
    const pool = CONDITIONS.filter(c => !g.conditions.some(h => h.id === c.id) &&
      (!c.deadly || g.age > 30) && (c.id !== "arthrit" || g.age > 45));
    if (pool.length) diagnose(g, api, pick(pool).id);
  }
}

/* ============================================================
   CITIZENSHIP — visas, passports, deportation
   ============================================================ */
export function applyCitizenship(g, api) {
  if (!g.citizenships) g.citizenships = [];
  const here = g.country.name;
  if (g.birthCountry === here || g.citizenships.includes(here)) return api.fail("You're already a citizen here.");
  if (!api.useAction(g, "citizen")) return api.fail("One application a year.");
  const years = g.age - (g.movedAt || g.age);
  const cost = Math.round(2500 * g.country.mult);
  if (g.money < cost) return api.fail(`The application fee is ${api.money(g, cost)}.`);
  g.money -= cost;

  const odds = 0.15 + years * 0.07 + (g.job ? 0.15 : 0) + (g.stats.smarts - 50) / 400 - g.criminalRecord * 0.12;
  if (chance(Math.max(0.05, Math.min(0.92, odds)))) {
    g.citizenships.push(here);
    api.applyResult(g, { text: `🛂 You were granted citizenship of ${here}.`, stats: { happiness: +22 }, kind: "good" });
  } else {
    api.applyResult(g, { text: `🛂 Your citizenship application was refused.`, stats: { happiness: -14 }, kind: "bad" });
  }
  return api.ok();
}

export function deportationRisk(g, api) {
  if (!g.birthCountry || g.birthCountry === g.country.name) return;
  if (g.citizenships && g.citizenships.includes(g.country.name)) return;
  if (!g.criminalRecord) return;
  if (!chance(0.05 + g.criminalRecord * 0.04)) return;
  const home = g.birthCountry;
  api.applyResult(g, { text: `🛂 Your record caught up with your visa. You were deported back to ${home}.`,
    stats: { happiness: -30 }, kind: "bad" });
  g.job = null; g.special = null;
}

/* ============================================================
   MEDIA — what fame lets you do
   ============================================================ */
export const MEDIA = [
  { id:"podcast",  name:"Start a Podcast",       emoji:"🎙️", minFame: 0,  pay:[0,40000],     fame:[1,8] },
  { id:"talkshow", name:"Go on a Talk Show",     emoji:"📺", minFame: 30, pay:[2000,60000],  fame:[4,14] },
  { id:"reality",  name:"Join a Reality Show",   emoji:"🎬", minFame: 15, pay:[10000,400000],fame:[8,26] },
  { id:"doc",      name:"Sit for a Documentary", emoji:"🎥", minFame: 45, pay:[5000,200000], fame:[6,18] },
  { id:"memoir",   name:"Publish a Memoir",      emoji:"📖", minFame: 40, pay:[8000,900000], fame:[5,16] },
];

export function doMedia(g, api, id) {
  const m = MEDIA.find(x => x.id === id);
  if (!m) return api.fail("Unknown.");
  if (g.fame < m.minFame) return api.fail(`Nobody's asking. You need ${m.minFame} fame; you're on ${g.fame}.`);
  if (!api.useAction(g, "media_" + id)) return api.fail("Once a year.");

  const good = chance(0.55 + (g.stats.smarts - 50) / 400 + (g.buzz || 0) / 400);
  if (good) {
    const pay = Math.round(rint(m.pay[0], m.pay[1]) * g.country.mult * (1 + g.fame / 80));
    const f = api.fameGainRaw(g, rint(m.fame[0], m.fame[1]));
    api.applyResult(g, { text: `${m.emoji} ${m.name} went well. ${api.money(g, pay)} and Fame +${f}.`,
      money: +pay, fame: +f, stats: { happiness: +14 }, kind: "good" });
  } else {
    api.applyResult(g, { text: `${m.emoji} ${m.name} was a car crash. People are still quoting it back at you.`,
      fame: +rint(1, 5), stats: { happiness: -18 }, kind: "bad" });
  }
  return api.ok();
}

/* ============================================================
   MILITARY — branches, deployment and what it leaves behind
   ============================================================ */
export const BRANCHES = [
  { id:"army",   name:"Army",       emoji:"🪖", danger:1.00, pay:1.00 },
  { id:"navy",   name:"Navy",       emoji:"⚓", danger:0.70, pay:1.05 },
  { id:"air",    name:"Air Force",  emoji:"🛩️", danger:0.60, pay:1.15 },
  { id:"marine", name:"Marines",    emoji:"🎖️", danger:1.30, pay:1.10 },
];

export function deploy(g, api) {
  if (!g.special || g.special.id !== "military") return api.fail("You're not serving.");
  if (!api.useAction(g, "deploy")) return api.fail("One tour a year.");
  const br = BRANCHES.find(b => b.id === (g.branch || "army")) || BRANCHES[0];
  g.tours = (g.tours || 0) + 1;

  const bad = chance(0.16 * br.danger);
  const pay = Math.round(rint(6000, 30000) * br.pay * g.country.mult);
  if (bad) {
    if (chance(0.12)) { api.die(g, "wounds sustained on deployment"); return api.ok(); }
    api.applyResult(g, { text: `${br.emoji} You came back from your ${g.tours}${g.tours === 1 ? "st" : g.tours === 2 ? "nd" : g.tours === 3 ? "rd" : "th"} tour injured.`,
      money: +pay, stats: { health: -rint(15, 35), happiness: -18 }, kind: "bad" });
    if (chance(0.4)) { g.ptsd = true; api.line(g, "You brought something home with you that doesn't show up on a scan.", "bad"); }
  } else {
    const f = api.fameGainRaw(g, rint(2, 7));
    api.applyResult(g, { text: `${br.emoji} You completed a tour and were paid ${api.money(g, pay)}.`,
      money: +pay, fame: +f, stats: { health: -rint(2, 8), happiness: +6 }, kind: "good" });
    if (g.tours >= 3 && chance(0.3)) {
      api.applyResult(g, { text: `${br.emoji} You were decorated for what you did out there.`,
        fame: +api.fameGainRaw(g, rint(6, 16)), stats: { happiness: +20 }, kind: "good" });
    }
  }
  return api.ok();
}

export function militaryYear(g, api) {
  if (g.ptsd && chance(0.25)) {
    api.applyResult(g, { text: pick([
      "You didn't sleep much this year.",
      "A car backfired and you were on the floor before you knew it.",
      "You drank to get through the anniversary.",
    ]), stats: { happiness: -rint(4, 12), health: -rint(0, 4) } });
  }
}
