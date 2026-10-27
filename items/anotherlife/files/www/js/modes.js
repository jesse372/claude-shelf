/* ============================================================
   AnotherLife — premium modes
   The equivalents of BitLife's paid packs: Fighter, Mafia, Royalty
   and Business. Each is a self-contained career-like system with its
   own state, actions and failure modes.

   Every function takes (g, api) where api supplies the engine helpers
   (line, applyResult, useAction, money, arrest...) so this module never
   imports the engine and no cycle forms.
   ============================================================ */
import { pick, rint, chance, clamp } from "./util.js";

/* ============================================================
   FIGHTER MODE
   ============================================================ */
export const FIGHT_STYLES = [
  { id:"boxing", name:"Boxing",     emoji:"🥊", pow:1.15, tec:0.95 },
  { id:"mma",    name:"MMA",        emoji:"🥋", pow:1.00, tec:1.10 },
  { id:"muay",   name:"Muay Thai",  emoji:"🦵", pow:1.10, tec:1.05 },
  { id:"wrest",  name:"Wrestling",  emoji:"🤼", pow:1.05, tec:1.00 },
];
export const BELTS = ["Amateur", "Regional Champion", "National Champion", "World Champion", "Undisputed"];
const OPPONENTS = ["Dmitri Volkov","Rashid Amari","Caio Ferreira","Jonno Blake","Kenta Sato","Marcus Oyelaran",
  "Tomas Brolin","Ivan Petrov","Ray Donnelly","Bilal Haddad","Wes Carter","Nico Bianchi"];

export function joinFightGym(g, api, styleId) {
  if (g.fighter) return api.fail("You're already fighting.");
  if (g.age < 16) return api.fail("You're too young to be licensed.");
  if (g.stats.health < 55) return api.fail("No commission will licence you at this level of fitness.");
  const st = FIGHT_STYLES.find(s => s.id === styleId);
  if (!st) return api.fail("Pick a discipline.");
  g.fighter = { style: st.id, name: st.name, emoji: st.emoji,
    wins: 0, losses: 0, draws: 0, kos: 0, rank: 40, belt: 0,
    power: rint(28, 46), technique: rint(24, 42), retired: false };
  api.applyResult(g, { text: `${st.emoji} You signed with a gym and began training in ${st.name}. Ranked #${g.fighter.rank}.`,
    stats: { health: +4, happiness: +12 }, kind: "good" });
  return api.ok();
}

export function fighterRating(g) {
  const f = g.fighter;
  const st = FIGHT_STYLES.find(s => s.id === f.style) || FIGHT_STYLES[0];
  const cond = 0.55 + (g.stats.health / 100) * 0.45;
  return (f.power * st.pow + f.technique * st.tec) * cond;
}

export function fighterPurse(g) {
  const f = g.fighter;
  const base = 4000 + Math.pow(Math.max(0, 41 - f.rank), 2.6) * 90;
  return Math.round((base + f.belt * 400000) * g.country.mult);
}

export function fighterAction(g, api, what) {
  if (!g.fighter) return api.fail("You're not a fighter.");
  const f = g.fighter;

  if (what === "train") {
    if (!api.useAction(g, "fi_train")) return api.fail("You've already had a training camp this year.");
    const cost = Math.round(3000 * g.country.mult);
    if (g.money < cost) return api.fail(`A proper camp costs ${api.money(g, cost)}.`);
    g.money -= cost;
    const dp = rint(1, 6), dt = rint(1, 6);
    f.power = clamp(f.power + dp); f.technique = clamp(f.technique + dt);
    api.applyResult(g, { text: `${f.emoji} A hard training camp. Power +${dp}, technique +${dt}.`,
      stats: { health: +rint(2, 7), happiness: +3 }, kind: "good" });
    return api.ok();
  }

  if (what === "fight" || what === "title") {
    const isTitle = what === "title";
    if (isTitle && f.rank > 3) return api.fail(`You need to be ranked top 3 for a title shot. You're #${f.rank}.`);
    if (isTitle && f.belt >= BELTS.length - 1) return api.fail("There's nothing left to win.");
    if (!api.useAction(g, isTitle ? "fi_title" : "fi_fight", isTitle ? 1 : 3))
      return api.fail(isTitle ? "One title fight a year." : "Three fights a year is already punishing.");

    const opp = pick(OPPONENTS);
    const oppRating = fighterRating(g) * (isTitle ? rint(105, 130) / 100 : rint(75, 118) / 100);
    const mine = fighterRating(g) * (rint(80, 120) / 100);      // fights are genuinely swingy
    const purse = fighterPurse(g) * (isTitle ? 3 : 1);

    if (mine > oppRating) {
      const ko = chance(0.42);
      f.wins++; if (ko) f.kos++;
      const climb = isTitle ? f.rank - 1 : Math.max(1, Math.round(f.rank * 0.22));
      f.rank = Math.max(1, f.rank - climb);
      const hurt = ko ? rint(1, 5) : rint(4, 12);
      let text = `${f.emoji} You beat ${opp}${ko ? " by knockout" : " on the cards"}. ${api.money(g, purse)} purse. Record ${f.wins}-${f.losses}-${f.draws}, ranked #${f.rank}.`;
      if (isTitle) { f.belt++; text = `${f.emoji} 🏆 You beat ${opp} to become ${BELTS[f.belt]}! ${api.money(g, purse)} purse. Record ${f.wins}-${f.losses}-${f.draws}.`; }
      api.applyResult(g, { text, money: +purse, fame: +api.fameGainRaw(g, isTitle ? rint(10, 22) : rint(2, 7)),
        stats: { health: -hurt, happiness: +(isTitle ? 26 : 12) }, kind: "good",
        fx: isTitle ? "cheer" : "hit" });
    } else {
      const stopped = chance(0.45);
      f.losses++;
      f.rank = Math.min(60, f.rank + (isTitle ? 3 : rint(2, 7)));
      const hurt = stopped ? rint(14, 30) : rint(6, 16);
      api.applyResult(g, { text: `${f.emoji} ${opp} beat you${stopped ? " by stoppage" : " by decision"}. ${api.money(g, Math.round(purse * 0.3))} purse. Record ${f.wins}-${f.losses}-${f.draws}, ranked #${f.rank}.`,
        money: +Math.round(purse * 0.3), stats: { health: -hurt, happiness: -14 }, kind: "bad", fx: "hit" });
      if (g.stats.health < 12 && chance(0.3)) api.die(g, "injuries sustained in the ring");
    }
    return api.ok();
  }

  if (what === "retire") {
    const legacy = f.belt > 0 ? `${BELTS[f.belt]}, ${f.wins}-${f.losses}-${f.draws}` : `${f.wins}-${f.losses}-${f.draws}`;
    api.applyResult(g, { text: `${f.emoji} You hung up the gloves. Final record: ${legacy}.`, stats: { happiness: +6 } });
    f.retired = true; g.fighter = null;
    return api.ok();
  }
  return api.fail("Unknown action.");
}

/* Long-term damage: taking punches for a living catches up with you. */
export function fighterYear(g, api) {
  const f = g.fighter;
  if (!f) return;
  const punished = f.losses * 2 + f.wins;
  if (punished > 8 && chance(0.05 + punished / 400)) {
    api.applyResult(g, { text: "Years of head trauma are starting to show.", stats: { smarts: -rint(3, 9), health: -rint(2, 6) }, kind: "bad" });
  }
  if (g.age > 38 && chance(0.25)) {
    api.line(g, `Age is taking the edge off your speed.`);
    f.power = clamp(f.power - rint(1, 4));
    f.technique = clamp(f.technique - rint(0, 2));
  }
}

/* ============================================================
   MAFIA MODE
   ============================================================ */
export const FAMILIES = ["the Moretti family","the Kowalczyk syndicate","the O'Dwyer crew","the Vasquez cartel","the Petrov bratva"];
export const MOB_RANKS = ["Associate","Soldier","Caporegime","Underboss","Boss","Godfather"];
const RACKETS = ["protection","numbers","docks","haulage","construction","waste"];

export function joinMafia(g, api) {
  if (g.mafia) return api.fail("You're already made.");
  if (g.age < 16) return api.fail("They don't take children.");
  const odds = 0.35 + Math.min(0.35, g.criminalRecord * 0.09) + (g.gang ? 0.15 : 0);
  if (!chance(odds)) {
    api.applyResult(g, { text: "You put word out that you wanted in. Nobody called back.", stats: { happiness: -6 } });
    return api.ok();
  }
  g.mafia = { family: (g.__wantFamily && FAMILIES.includes(g.__wantFamily)) ? g.__wantFamily : pick(FAMILIES), rank: 0, respect: rint(10, 25), heat: 0, rackets: [] };
  delete g.__wantFamily;
  api.applyResult(g, { text: `🕴️ You were brought in with ${g.mafia.family} as an Associate.`,
    stats: { happiness: +14 }, kind: "good" });
  return api.ok();
}

export function mafiaAction(g, api, what) {
  if (!g.mafia) return api.fail("You're not connected.");
  const m = g.mafia;

  if (what === "job") {
    if (!api.useAction(g, "mb_job", 3)) return api.fail("Three earners a year is plenty.");
    m.heat += rint(4, 12);
    const take = Math.round(rint(3000, 60000) * (1 + m.rank * 0.7) * g.country.mult);
    const caught = chance(Math.min(0.75, 0.14 + m.heat / 260 + g.criminalRecord * 0.012));
    if (caught) {
      api.arrest(g, "racketeering", [3 + m.rank, 9 + m.rank * 2]);
    } else {
      m.respect = clamp(m.respect + rint(3, 9));
      api.applyResult(g, { text: `🕴️ You put in work for ${m.family} and earned ${api.money(g, take)}. Respect ${m.respect}.`,
        money: +take, stats: { happiness: +6 }, kind: "good" });
    }
    return api.ok();
  }

  if (what === "tribute") {
    if (!api.useAction(g, "mb_tribute")) return api.fail("You've kicked up already this year.");
    const amt = Math.round(Math.max(2000, g.money * 0.12));
    if (g.money < amt) return api.fail(`You'd need ${api.money(g, amt)} to kick up properly.`);
    m.respect = clamp(m.respect + rint(8, 18));
    m.heat = Math.max(0, m.heat - rint(5, 15));
    api.applyResult(g, { text: `🕴️ You kicked ${api.money(g, amt)} up to the family. Respect ${m.respect}.`,
      money: -amt, kind: "good" });
    return api.ok();
  }

  if (what === "racket") {
    if (!api.useAction(g, "mb_racket")) return api.fail("One move a year on the rackets.");
    if (m.rank < 1) return api.fail("Associates don't run rackets. Earn a button first.");
    const r = pick(RACKETS.filter(x => !m.rackets.includes(x)));
    if (!r) return api.fail("You already run everything worth running.");
    if (chance(0.55 + m.respect / 300)) {
      m.rackets.push(r);
      m.heat += rint(5, 14);
      api.applyResult(g, { text: `🕴️ You took over the ${r} racket. It'll earn every year now.`, stats: { happiness: +14 }, kind: "good" });
    } else {
      m.respect = clamp(m.respect - rint(5, 12));
      api.applyResult(g, { text: `🕴️ Your move on the ${r} racket was slapped down.`, stats: { happiness: -12, health: -8 }, kind: "bad" });
    }
    return api.ok();
  }

  if (what === "hit") {
    if (!api.useAction(g, "mb_hit")) return api.fail("One this year. Bodies attract attention.");
    if (m.rank < 1) return api.fail("Nobody's asked you to do that yet.");
    m.heat += rint(15, 30);
    if (chance(0.58 + g.stats.smarts / 400)) {
      m.respect = clamp(m.respect + rint(12, 25));
      api.applyResult(g, { text: `🕴️ The job was done cleanly. Nobody says your name out loud any more. Respect ${m.respect}.`,
        stats: { happiness: -8 }, kind: "good" });
    } else {
      api.arrest(g, "murder", [18, 35]);
    }
    return api.ok();
  }

  if (what === "leave") {
    if (chance(0.45)) {
      api.applyResult(g, { text: `🕴️ You asked out and they let you walk. That almost never happens.`, stats: { happiness: +10 } });
      g.mafia = null;
    } else {
      api.applyResult(g, { text: `🕴️ You asked out. They made an example of you instead.`,
        stats: { health: -rint(25, 50), happiness: -25 }, kind: "bad" });
      if (g.stats.health <= 5) api.die(g, "a settling of accounts");
    }
    return api.ok();
  }
  return api.fail("Unknown action.");
}

export function mafiaYear(g, api) {
  const m = g.mafia;
  if (!m) return;
  m.heat = Math.max(0, m.heat - rint(3, 9));

  let take = 0;
  for (const r of m.rackets) take += Math.round(rint(8000, 70000) * (1 + m.rank * 0.5) * g.country.mult);
  g.money += take;
  if (m.rackets.length && chance(0.6)) {
    const how = pick([
      `Your ${m.rackets.length === 1 ? "racket" : "rackets"} brought in ${api.money(g, take)}.`,
      `The ${pick(m.rackets)} racket earned well — ${api.money(g, take)} came your way.`,
      `${api.money(g, take)} came up through the crew this year.`,
      `Collections were good. ${api.money(g, take)}.`,
    ]);
    api.line(g, `🕴️ ${how}`);
  }

  // promotion on respect
  const want = Math.min(MOB_RANKS.length - 1, Math.floor(m.respect / 20));
  if (want > m.rank) {
    m.rank = want;
    api.applyResult(g, { text: `🕴️ ${m.family} made you ${MOB_RANKS[m.rank]}.`, stats: { happiness: +18 }, kind: "good" });
  }
  // the life catches up
  if (m.heat > 70 && chance(0.25)) api.arrest(g, "racketeering", [5 + m.rank, 14 + m.rank * 2]);
  else if (m.rank >= 3 && chance(0.04)) {
    api.applyResult(g, { text: `🕴️ A rival crew came for you.`, stats: { health: -rint(20, 55), happiness: -20 }, kind: "bad" });
    if (g.stats.health <= 4) api.die(g, "a mob hit");
  }
}

/* ============================================================
   ROYALTY MODE
   ============================================================ */
export const ROYAL_TITLES_M = ["Prince","Crown Prince","King","High King"];
export const ROYAL_TITLES_F = ["Princess","Crown Princess","Queen","High Queen"];
export const HOUSES = ["House Aldringham","House Wallenberg","House Montclair","House Sørensen","House Castellane","House Varga"];

export function makeRoyal(g, born) {
  const titles = g.gender === "male" ? ROYAL_TITLES_M : ROYAL_TITLES_F;
  g.royal = { house: pick(HOUSES), tier: born ? 0 : 0, popularity: rint(45, 75), treasury: rint(20, 90) * 1000000, ruler: false };
  return titles[g.royal.tier];
}
export function royalTitle(g) {
  const titles = g.gender === "male" ? ROYAL_TITLES_M : ROYAL_TITLES_F;
  return titles[Math.min(titles.length - 1, g.royal.tier)];
}

export function royalAction(g, api, what) {
  if (!g.royal) return api.fail("You're not royal.");
  const r = g.royal;

  if (what === "appearance") {
    if (!api.useAction(g, "ry_app")) return api.fail("One tour a year.");
    const d = rint(3, 12) + Math.round((g.stats.looks - 50) / 12);
    r.popularity = clamp(r.popularity + d);
    api.applyResult(g, { text: `👑 You toured the country. Popularity ${r.popularity}.`, stats: { happiness: +6 }, fame: +api.fameGainRaw(g, rint(2, 6)), kind: "good" });
    return api.ok();
  }
  if (what === "tax") {
    if (!api.useAction(g, "ry_tax")) return api.fail("You've already touched the taxes this year.");
    const take = Math.round(r.treasury * 0.12);
    r.treasury -= take; g.money += take;
    r.popularity = clamp(r.popularity - rint(8, 20));
    api.applyResult(g, { text: `👑 You levied a tax and took ${api.money(g, take)} for yourself. The country noticed. Popularity ${r.popularity}.`, kind: "bad" });
    return api.ok();
  }
  if (what === "invest") {
    if (!api.useAction(g, "ry_invest")) return api.fail("Once a year.");
    const spend = Math.round(r.treasury * 0.15);
    r.treasury -= spend;
    r.popularity = clamp(r.popularity + rint(8, 20));
    api.applyResult(g, { text: `👑 You spent ${api.money(g, spend)} of the treasury on hospitals and roads. Popularity ${r.popularity}.`, stats: { happiness: +10 }, kind: "good" });
    return api.ok();
  }
  if (what === "war") {
    if (!api.useAction(g, "ry_war")) return api.fail("One war a year is quite enough.");
    if (!r.ruler) return api.fail("You don't command the army. Yet.");
    if (chance(0.45 + g.stats.smarts / 400)) {
      const spoils = rint(20, 200) * 1000000;
      r.treasury += spoils; r.popularity = clamp(r.popularity + rint(10, 25));
      api.applyResult(g, { text: `👑 The war was short and victorious. The treasury gained ${api.money(g, spoils)}.`, stats: { happiness: +18 }, fame: +api.fameGainRaw(g, rint(8, 18)), kind: "good" });
    } else {
      r.treasury = Math.max(0, r.treasury - rint(30, 200) * 1000000);
      r.popularity = clamp(r.popularity - rint(20, 40));
      api.applyResult(g, { text: `👑 The war went badly and cost a fortune. Popularity ${r.popularity}.`, stats: { happiness: -22 }, kind: "bad" });
    }
    return api.ok();
  }
  if (what === "abdicate") {
    api.applyResult(g, { text: `👑 You abdicated and walked away from ${r.house}.`, money: +Math.round(r.treasury * 0.1), stats: { happiness: +8 } });
    g.royal = null;
    return api.ok();
  }
  return api.fail("Unknown action.");
}

export function royalYear(g, api) {
  const r = g.royal;
  if (!r) return;
  r.treasury = Math.round(r.treasury * (1 + rint(-3, 7) / 100));
  const stipend = Math.round(r.treasury * 0.004);
  g.money += stipend;

  // succession
  if (!r.ruler && g.age >= 25 && chance(0.06)) {
    r.ruler = true; r.tier = 2;
    api.applyResult(g, { text: `👑 The monarch has died. You are now ${royalTitle(g)} of ${r.house}.`, stats: { happiness: +25 }, fame: +api.fameGainRaw(g, rint(15, 30)), kind: "good" });
  } else if (!r.ruler && r.tier === 0 && g.age >= 18 && chance(0.10)) {
    r.tier = 1;
    api.applyResult(g, { text: `👑 You were named ${royalTitle(g)}.`, stats: { happiness: +14 }, kind: "good" });
  }
  // revolution
  if (r.ruler && r.popularity < 22 && chance(0.22)) {
    api.applyResult(g, { text: `👑 The people rose against you.`, stats: { happiness: -40 }, kind: "bad" });
    if (chance(0.5)) api.die(g, "a revolution");
    else { g.royal = null; api.line(g, "You fled into exile with nothing.", "bad"); g.money = Math.round(g.money * 0.1); }
  }
  r.popularity = clamp(r.popularity + rint(-4, 3));
}

/* ============================================================
   BUSINESS / VENTURES
   ============================================================ */
export const SECTORS = [
  { id:"tech",   name:"Tech Startup",     emoji:"💻", growth:0.28, vol:0.55, cost: 40000 },
  { id:"food",   name:"Restaurant Group", emoji:"🍽️", growth:0.11, vol:0.22, cost: 60000 },
  { id:"retail", name:"Retail Chain",     emoji:"🛍️", growth:0.10, vol:0.20, cost: 90000 },
  { id:"prop",   name:"Property Firm",    emoji:"🏗️", growth:0.13, vol:0.28, cost: 150000 },
  { id:"media",  name:"Media Company",    emoji:"🎬", growth:0.17, vol:0.40, cost: 70000 },
  { id:"fashion",name:"Fashion Label",    emoji:"👗", growth:0.15, vol:0.45, cost: 50000 },
];

export function foundBusiness(g, api, sectorId) {
  if (g.business) return api.fail("You're already running a company.");
  const s = SECTORS.find(x => x.id === sectorId);
  if (!s) return api.fail("Pick a sector.");
  const cost = Math.round(s.cost * g.country.mult);
  if (g.money < cost) return api.fail(`Founding that needs ${api.money(g, cost)}.`);
  g.money -= cost;
  g.business = { sector: s.id, name: s.name, emoji: s.emoji, valuation: cost, staff: 2, invested: cost, public: false };
  api.applyResult(g, { text: `${s.emoji} You founded a ${s.name.toLowerCase()} for ${api.money(g, cost)}.`, stats: { happiness: +14 }, kind: "good" });
  return api.ok();
}

export function businessAction(g, api, what) {
  if (!g.business) return api.fail("You don't run a company.");
  const b = g.business;
  const s = SECTORS.find(x => x.id === b.sector) || SECTORS[0];

  if (what === "invest") {
    if (!api.useAction(g, "bz_invest")) return api.fail("One capital injection a year.");
    const amt = Math.round(Math.max(10000, b.valuation * 0.2));
    if (g.money < amt) return api.fail(`That needs ${api.money(g, amt)}.`);
    g.money -= amt; b.invested += amt;
    b.valuation = Math.round(b.valuation + amt * (1 + Math.random()));
    b.staff += rint(1, 8);
    api.applyResult(g, { text: `${b.emoji} You put ${api.money(g, amt)} into the business. Valued at ${api.money(g, b.valuation)}, ${b.staff} staff.`, kind: "good" });
    return api.ok();
  }
  if (what === "market") {
    if (!api.useAction(g, "bz_market")) return api.fail("One campaign a year.");
    const amt = Math.round(Math.max(5000, b.valuation * 0.08));
    if (g.money < amt) return api.fail(`A campaign costs ${api.money(g, amt)}.`);
    g.money -= amt;
    if (chance(0.6)) {
      b.valuation = Math.round(b.valuation * (1.15 + Math.random() * 0.35));
      api.applyResult(g, { text: `${b.emoji} The campaign worked. Valued at ${api.money(g, b.valuation)}.`, stats: { happiness: +8 }, kind: "good" });
    } else {
      api.applyResult(g, { text: `${b.emoji} The campaign fell flat and the money is gone.`, stats: { happiness: -8 }, kind: "bad" });
    }
    return api.ok();
  }
  if (what === "ipo") {
    if (b.public) return api.fail("You've already floated.");
    if (b.valuation < 5000000 * g.country.mult) return api.fail(`You need a valuation over ${api.money(g, 5000000 * g.country.mult)} to float.`);
    if (!api.useAction(g, "bz_ipo")) return api.fail("Once a year.");
    if (chance(0.6)) {
      const raise = Math.round(b.valuation * (0.35 + Math.random() * 0.4));
      b.public = true; b.valuation = Math.round(b.valuation * 1.5);
      api.applyResult(g, { text: `${b.emoji} 📈 You floated the company and raised ${api.money(g, raise)}.`,
        money: +raise, fame: +api.fameGainRaw(g, rint(6, 14)), stats: { happiness: +25 }, kind: "good" });
    } else {
      b.valuation = Math.round(b.valuation * 0.6);
      api.applyResult(g, { text: `${b.emoji} The float was pulled. The company was re-rated downwards.`, stats: { happiness: -20 }, kind: "bad" });
    }
    return api.ok();
  }
  if (what === "sell") {
    const price = Math.round(b.valuation * (0.8 + Math.random() * 0.5));
    api.applyResult(g, { text: `${b.emoji} You sold the business for ${api.money(g, price)}.`, money: +price, stats: { happiness: +12 }, kind: "good" });
    g.business = null;
    return api.ok();
  }
  return api.fail("Unknown action.");
}

export function businessYear(g, api) {
  const b = g.business;
  if (!b) return;
  const s = SECTORS.find(x => x.id === b.sector) || SECTORS[0];
  const r = s.growth + (Math.random() * 2 - 1) * s.vol;
  b.valuation = Math.max(0, Math.round(b.valuation * (1 + r)));
  const profit = Math.round(b.valuation * 0.06 * (r > 0 ? 1 : 0.3));
  g.money += profit;
  if (chance(0.5))
    api.line(g, `${b.emoji} ${b.name} ${r > 0 ? "grew" : "shrank"} this year. Valued at ${api.money(g, b.valuation)}; you drew ${api.money(g, profit)}.`,
      r > 0 ? "good" : "bad");
  if (b.valuation < 1000 && chance(0.5)) {
    api.applyResult(g, { text: `${b.emoji} ${b.name} collapsed and was wound up.`, stats: { happiness: -22 }, kind: "bad" });
    g.business = null;
  }
}
