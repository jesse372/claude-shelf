/* ============================================================
   AnotherLife — simulation engine
   All game rules live here. No DOM access whatsoever.
   ============================================================ */
import {
  FIRST_M, FIRST_F, SURNAMES, COUNTRIES, UNI_MAJORS, GRAD_SCHOOLS, CLUBS,
  JOBS, SPECIAL, HOUSES, CARS, LUXURY, EMPIRE, LEGACY, PETS, INVESTMENTS, INSURANCE,
  CRIMES, CASINO, GANGS, ACTIVITIES, DEATHS_OLD, DEATHS_ANY, RIBBONS, HEIRLOOMS, DRUGS, SEXWORK,
} from "./data.js";
import { EVENTS as CORE_EVENTS } from "./events.js";
import { WILD } from "./events-wild.js";
import { MORE } from "./events-more.js";
import { CULTURE } from "./events-culture.js";
import { CHILDHOOD } from "./events-childhood.js";
import { WORK, SUCCESSION } from "./events-work.js";
import { WOVEN, CIRCUMSTANCE } from "./events-woven.js";
const EVENTS = CORE_EVENTS.concat(WILD, MORE, CULTURE, CHILDHOOD, WORK, WOVEN, CIRCUMSTANCE, SUCCESSION);
import * as M from "./modes.js";
import * as SY from "./systems.js";
import * as ARCH from "./archetypes.js";
import { pick, rint, chance, money, moneyShort, clamp, an, afford } from "./util.js";

export {
  pick, rint, chance, money, moneyShort, JOBS, SPECIAL, HOUSES, CARS, LUXURY, EMPIRE, LEGACY, PETS,
  INVESTMENTS, INSURANCE, CRIMES, CASINO, ACTIVITIES, UNI_MAJORS, HEIRLOOMS, DRUGS, SEXWORK,
  GRAD_SCHOOLS, CLUBS, COUNTRIES,
};

/* Old job id -> its nearest equivalent in the rewritten table. */
const JOB_ALIASES = {
  analyst:"bus_analyst", banker:"banker_retail", cabin:"flight_att", clerk:"admin",
  cook:"chef", datasci:"data_sci", designer:"graphic_des", dogwalker:"groomer",
  ecologist:"conservation", emt:"para", engineer:"mech_eng", executive:"exec_ceo",
  fastfood:"fast_food", firefighter:"fire", guard:"security_guard", mover:"removals",
  psych:"psych_clin", realtor:"estate_agent", retail:"shop_assist", sales:"sales_rep",
  scientist:"chemist", socialwork:"social_worker", stylist:"hairdresser",
  teacher:"teacher_sec", telemkt:"call_centre", trainer:"pt", trucker:"truck_driver",
};

export const BIG_COOLDOWN = 4;   // years between headline career moves
const SAVE_KEY = "anotherlife.save.v2";
const GRAVE_KEY = "anotherlife.graveyard.v2";

let uid = 1;
const nextId = () => `e${uid++}`;
/* normally-distributed sample, for investment returns */
function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ============================================================
   CHARACTER CREATION
   ============================================================ */
export function newGame(opts = {}) {
  uid = 1;
  const gender = opts.gender || pick(["male", "female"]);
  const country = opts.country || pick(COUNTRIES);
  const last = opts.last || pick(SURNAMES);
  const first = opts.first || pick(gender === "male" ? FIRST_M : FIRST_F);

  const g = {
    first, last, gender,
    country, city: pick(country.city),
    birthYear: new Date().getFullYear(), age: 0, alive: true, causeOfDeath: null,
    stats: {
      happiness: rint(50, 90), health: rint(60, 100),
      smarts: rint(15, 90),    looks:  rint(15, 90),
    },
    money: 0, fame: 0,
    job: null, special: null, jobPerf: 60, yearsInJob: 0, pension: 0,
    education: null, club: null,
    diplomas: { high: false, uni: false, grad: false, major: null, gradType: null },
    rels: [], pets: [],
    assets: { houses: [], cars: [], luxury: [], empire: [] },
    legacy: [],
    investments: [], insurance: {}, loans: [],
    prison: null, gang: null, criminalRecord: 0, yearsJailed: 0,
    married: false, ribbons: [],
    flags: {}, seen: {}, fired: {}, acts: {}, buzz: 0, lastBig: -99, lineSeq: 0, insertAt: null, juvieRecord: 0, lastSay: {},
    fighter: null, mafia: null, royal: null, business: null, heirlooms: [], generation: 1,
    withParents: true, homeless: false, yearsHomeless: 0, missedRent: 0, addiction: null,
    licences: {}, conditions: [], citizenships: [], branch: null, tours: 0, ptsd: false,
    leave: null, habits: {}, stake: null,
    log: [], pendingChoices: [], stars: 0,
    seed: Math.floor(Math.random() * 2147483647),   // shuffles this life's deck
  };

  g.birthCountry = country.name;
  g.heritage = country.name;
  buildFamily(g);
  if (opts.royal || chance(0.012)) {                 // born into a royal house
    const t = M.makeRoyal(g, true);
    g.__bornRoyal = t;
  }
  g.familyWealth = opts.wealth || pick(["poor", "poor", "working", "working", "working", "comfortable", "rich"]);

  // Where you're from shapes what you start with.
  const arch = ARCH.pickArchetype(country.name, g.familyWealth, Math.random);
  if (arch) {
    g.archetype = arch.id;
    for (const k in (arch.stats || {})) g.stats[k] = clamp(g.stats[k] + arch.stats[k]);
    if (arch.money) g.money += Math.round(arch.money * country.mult);
  }

  openYear(g);
  line(g, `You were born a ${gender === "male" ? "boy" : "girl"} in ${g.city}, ${country.name}.`, "good");
  const mum = g.rels.find(r => r.type === "mother");
  const dad = g.rels.find(r => r.type === "father");
  if (mum && dad) line(g, `Your parents are ${mum.name} and ${dad.name}. Your family is ${g.familyWealth}.`);
  else if (mum) line(g, `Your mother is ${mum.name}. Your father was never in the picture.`);
  else line(g, `You were placed in foster care as an infant.`, "bad");
  g.rels.filter(r => r.type === "sibling").forEach(s =>
    line(g, `You have a ${s.gender === "male" ? "brother" : "sister"}, ${s.name}, age ${s.age}.`));
  if (g.archetype) {
    const a = ARCH.archetypeById(g.archetype);
    if (a) line(g, `${a.emoji} ${a.blurb}`);
  }
  if (g.__bornRoyal) { line(g, `👑 You were born into ${g.royal.house}. You are a ${g.__bornRoyal}.`, "good"); delete g.__bornRoyal; }
  return g;
}

function buildFamily(g) {
  if (chance(0.04)) return;                       // orphan
  const single = chance(0.18);
  g.rels.push(mkRel("mother", "female", g.last, rint(19, 42)));
  if (!single) g.rels.push(mkRel("father", "male", g.last, rint(20, 48)));

  if (chance(0.45)) for (let i = 0, n = rint(1, 3); i < n; i++)
    g.rels.push(mkRel("sibling", pick(["male", "female"]), g.last, rint(0, 16)));

  // grandparents
  if (chance(0.75)) g.rels.push(mkRel("grandmother", "female", g.last, rint(52, 78)));
  if (chance(0.62)) g.rels.push(mkRel("grandfather", "male", g.last, rint(54, 80)));
  // aunts / uncles / cousins
  if (chance(0.55)) g.rels.push(mkRel("aunt", "female", null, rint(24, 55)));
  if (chance(0.50)) g.rels.push(mkRel("uncle", "male", null, rint(24, 58)));
  if (chance(0.45)) for (let i = 0, n = rint(1, 2); i < n; i++)
    g.rels.push(mkRel("cousin", pick(["male", "female"]), null, rint(0, 22)));
}

function mkRel(type, gender, last, age) {
  return {
    id: nextId(), type, gender, age, alive: true,
    name: `${pick(gender === "male" ? FIRST_M : FIRST_F)} ${last || pick(SURNAMES)}`,
    rel: rint(55, 95),
  };
}


/* ============================================================
   PARTNERS — you can have more than one, two different ways.
   Openly, if everyone involved agrees (r.poly), or secretly, which is
   cheating and carries a real chance of being found out (r.secret).
   ============================================================ */
export function partners(g) {
  return g.rels.filter(r => r.type === "partner" && r.alive);
}
export function openPartners(g) { return partners(g).filter(r => !r.secret); }
export function secretPartners(g) { return partners(g).filter(r => r.secret); }
export function spouse(g) { return partners(g).find(r => r.spouse) || null; }
/* Free to see someone new openly if you're single, or if everyone you're
   already with has agreed to an open relationship. */
export function canDateOpenly(g) {
  const open = openPartners(g);
  return open.length === 0 || open.every(r => r.poly);
}

export const REL_LABEL = {
  mother:"mother", father:"father", sibling:"sibling", grandmother:"grandmother",
  grandfather:"grandfather", aunt:"aunt", uncle:"uncle", cousin:"cousin",
  friend:"friend", bestfriend:"best friend", partner:"partner", ex:"ex",
  child:"child", coworker:"coworker", enemy:"enemy",
};
export function relLabel(r) {
  if (r.type === "partner") {
    if (r.secret) return "secret lover";
    if (r.spouse) return r.poly ? "spouse (open)" : "spouse";
    return r.poly ? "partner (open)" : "partner";
  }
  return REL_LABEL[r.type] || r.type;
}

const REL_FLOOR = {
  mother:45, father:45, sibling:40, child:50, partner:35, ex:8,
  grandmother:45, grandfather:45, aunt:30, uncle:30, cousin:25,
  friend:18, bestfriend:35, coworker:15, enemy:5,
};
const FAMILY_TYPES = ["mother","father","sibling","child","grandmother","grandfather","aunt","uncle","cousin"];

/* ============================================================
   LOGGING
   ============================================================ */
function openYear(g) { g.log.push({ age: g.age, entries: [] }); }

/* Lines normally append, but while a choice is being resolved we splice its
   outcome in directly after its prompt — otherwise the log reads out of order
   (auto events land during ageUp, choices only when the player answers). */
function line(g, text, kind = "", fx = null) {
  if (!g.log.length) openYear(g);
  const entry = { text, kind, id: ++g.lineSeq };
  if (fx) entry.fx = fx;
  const at = g.insertAt;
  if (at && at.year != null) {
    const yr = g.log[at.year];
    if (yr) { yr.entries.splice(at.index, 0, entry); at.index++; return entry; }
  }
  g.log[g.log.length - 1].entries.push(entry);
  return entry;
}

/* Locate a previously written line so we can write just after it. */
function findLine(g, id) {
  for (let y = g.log.length - 1; y >= 0 && y >= g.log.length - 3; y--) {
    const ix = g.log[y].entries.findIndex(e => e.id === id);
    if (ix >= 0) return { year: y, index: ix + 1 };
  }
  return null;
}
export function logLine(g, text, kind) { line(g, text, kind); }

/* ============================================================
   EFFECT APPLICATION
   ============================================================ */
export function applyResult(g, r) {
  if (!r) return;

  // insurance softens a covered loss before it is applied
  if (r.insuranceClaim && r.money < 0 && g.insurance[r.insuranceClaim]) {
    const covered = Math.round(-r.money * (0.7 + Math.random() * 0.2));
    r = { ...r, money: r.money + covered };
    r.text = (r.text || "") + ` Your insurance covered ${money(g, covered)}.`;
  }

  // If money moved and the sentence doesn't already name a figure, say it.
  if (r.money && r.text && !r.text.includes(g.country.cur)) {
    r = { ...r, text: `${r.text} (${r.money < 0 ? "\u2212" : "+"}${money(g, r.money)})` };
  }

  if (r.stats) for (const k in r.stats) g.stats[k] = clamp(g.stats[k] + r.stats[k]);
  if (r.money) g.money = Math.round(g.money + r.money);
  if (r.fame) g.fame = clamp(g.fame + r.fame);
  if (r.buzz) g.buzz = clamp((g.buzz || 0) + r.buzz);
  if (r.flags) { if (!g.flags) g.flags = {}; Object.assign(g.flags, r.flags); }

  // Write the outcome BEFORE any knock-on effect that logs its own line,
  // otherwise the consequence reads before the thing that caused it.
  if (r.text) line(g, r.text, r.kind || inferKind(r), r.fx || inferFx(g, r));

  if (r.fire) { g.job = null; g.jobPerf = 60; g.yearsInJob = 0; }
  if (r.leave && !g.leave && g.job) {
    g.leave = { years: Math.max(1, r.leave.years || 1), reason: r.leave.reason || "injury",
                comp: r.leave.comp == null ? 0.6 : r.leave.comp, served: 0, salary: g.job.salary };
  }
  if (r.removePet) g.pets = g.pets.filter(p => p.id !== r.removePet);
  if (r.addPet) {
    const def = PETS.find(p => p.name === r.addPet) || PETS[3];
    g.pets.push({ id: nextId(), kind: def.name, emoji: def.emoji, name: petName(), age: 0, life: rint(def.life[0], def.life[1]) });
  }
  if (r.relAdj) {
    const t = g.rels.find(x => x.id === r.relAdj.id);
    if (t) t.rel = clamp(t.rel + r.relAdj.d);
  }
  if (r.divorce) {
    const p = g.rels.find(x => x.type === "partner" && x.alive);
    if (p) { p.type = "ex"; g.married = false; }
  }
  if (r.addictKind) addict(g, r.addictKind);
  if (r.clearAddiction) g.addiction = null;
  if (r.clearCondition && (g.conditions || []).length) g.conditions.shift();
  if (r.migrateTo) migrateTo(g, r.migrateTo, r.migrateText);
  if (r.endHomeless) { g.homeless = false; g.missedRent = 0; }
  if (r.softLand && !softLanding(g)) becomeHomeless(g, "Nobody had room for you. You slept in a stairwell that night.");
  if (r.takeAnyJob) {
    const jobs = availableJobs(g).filter(j => j.tier === 0);
    if (jobs.length) {
      const j = pick(jobs);
      g.job = { id:j.id, name:j.name, title:j.ladder[0], rung:0, salary:j.offered };
      g.jobPerf = 60; g.yearsInJob = 0;
      line(g, `You started as ${an(g.job.title)} ${g.job.title} on ${money(g, j.offered)}/yr.`, "good");
    }
  }
  /* A shareholder taking the chair: the stake becomes the company. */
  if (r.takeChair && g.stake && !g.business) {
    const st = g.stake;
    g.business = { sector:"tech", name:st.name, emoji:st.emoji, valuation:st.valuation,
                   staff: Math.max(2, Math.round(st.valuation / 90000)), invested:st.valuation,
                   public:true, successor:null, inherited:true };
    g.stake = null;
  }
  if (r.sellStake && g.stake) {
    g.money += Math.round(g.stake.valuation * (r.sellStake === true ? 1 : r.sellStake));
    g.stake = null;
  }
  if (r.arrest) arrest(g, r.arrest.name || "a crime", r.arrest.sentence || [1, 3]);
  /* Last, so the cause is already on the page above the death notice. */
  if (r.die && g.alive) die(g, r.die);
}

/* Which moments are big enough to feel. Deliberately conservative — an effect
   on every other line stops meaning anything. Anything can override by setting
   `fx` on its own result. */
function inferFx(g, r) {
  if (r.arrest) return "police";
  const dh = r.stats && typeof r.stats.health === "number" ? r.stats.health : 0;
  if (dh <= -18) return "hit";                       // a real beating, not a cold
  if (typeof r.money === "number" && r.money > 0) {
    const before = Math.max(0, g.money - r.money);
    // a windfall: life-changing relative to what you had, and large outright
    if (r.money >= 25000 && r.money > before * 1.5) return "money";
  }
  if (r.fame && r.fame >= 12) return "cheer";
  return null;
}

function inferKind(r) {
  if (r.money > 0) return "good";
  if (r.money < 0 || r.fire) return "bad";
  if (r.stats) {
    const sum = Object.values(r.stats).reduce((a, b) => a + b, 0);
    return sum > 0 ? "good" : sum < 0 ? "bad" : "";
  }
  return "";
}
const petName = () => pick(["Biscuit","Otto","Marlow","Pepper","Nugget","Boris","Juniper","Wanda","Clementine","Diesel","Mango","Pickle","Bandit","Suki"]);

/* ============================================================
   AGE UP
   ============================================================ */
export function ageUp(g) {
  if (!g.alive) return;
  snapshot(g);                                  // so the Time Machine can undo it
  g.age++;
  g.acts = {};                                  // fresh set of actions each year
  g.buzz = Math.round((g.buzz || 0) * 0.62);    // momentum fades if you don't use it
  openYear(g);

  if (g.prison) { g.yearsJailed++; servePrisonYear(g); afterYear(g); return; }

  // Several of these can kill you outright — an overdose, a fight, a mob hit,
  // a revolution. Stop the year the moment that happens, or the character
  // carries on living after their own death notice.
  const phases = [
    ageEducation, ageCareer, ageSpecial,
    g => M.fighterYear(g, MODE_API),
    g => M.mafiaYear(g, MODE_API),
    g => M.royalYear(g, MODE_API),
    g => M.businessYear(g, MODE_API),
    ageFinances, ageHousing, ageAddiction,
    g => SY.medicalYear(g, MODE_API),
    g => SY.militaryYear(g, MODE_API),
    g => SY.drivingRisk(g, MODE_API),
    g => SY.deportationRisk(g, MODE_API),
    ageRelationships, ageAssets, agePets, ageBody, rollEvents,
  ];
  for (const phase of phases) {
    phase(g);
    if (!g.alive) { save(g); return; }
  }
  afterYear(g);
}

const QUIET = [
  "Nothing much happened this year.",
  "A quiet, unremarkable year.",
  "The year passed without incident.",
  "You mostly kept to yourself this year.",
  "An ordinary year, start to finish.",
];
function sealJuvenileRecord(g) {
  if (g.age === 18 && (g.juvieRecord || 0) > 0 && !g.juvieSealed) {
    g.juvieSealed = true;
    line(g, `⚖️ You turned 18 and your juvenile record was sealed.`, "good");
  }
}

function afterYear(g) {
  sealJuvenileRecord(g);
  const yr = g.log[g.log.length - 1];
  if (yr && !yr.entries.length) line(g, pick(QUIET));
  checkDeath(g);
  save(g);
}

/* ---------- body ---------- */
function ageBody(g) {
  const a = g.age;
  const ceiling = 100 - Math.max(0, a - 25) * 0.85;
  g.stats.health = clamp(g.stats.health + (ceiling - g.stats.health) * 0.28 + rint(-2, 2));

  if (a >= 18 && a <= 26) g.stats.looks = clamp(g.stats.looks + rint(0, 2));
  if (a > 32) g.stats.looks = clamp(g.stats.looks - (a > 55 ? rint(1, 3) : rint(0, 2)));

  const close = g.rels.filter(r => r.alive && r.rel > 60).length;
  g.stats.happiness = clamp(g.stats.happiness + (close >= 3 ? 1 : close === 0 ? -4 : 0));

  if (g.fame > 0) {
    const decay = g.special ? 1 + g.fame / 115 : 4 + g.fame / 25;
    g.fame = clamp(g.fame - decay);
  }

  if (g.stats.health < 15 && g.age > 5) line(g, "Your health is failing. You should see a doctor.", "bad");
}

/* ---------- education ---------- */
function ageEducation(g) {
  const a = g.age;
  if (a === 6)  { g.education = { stage:"elementary", yearsLeft:6 }; line(g, "You started Elementary School.", "good"); return; }
  if (a === 12) { g.education = { stage:"middle", yearsLeft:3 };     line(g, "You started Middle School.", "good"); return; }
  if (a === 15) { g.education = { stage:"high", yearsLeft:3 };       line(g, "You started High School.", "good"); return; }

  if (!g.education) return;
  g.education.yearsLeft--;

  if (g.club) {
    const c = CLUBS.find(x => x.id === g.club);
    if (c) for (const k in c.stats) g.stats[k] = clamp(g.stats[k] + Math.round(c.stats[k] / 3));
  }
  if (!["uni", "grad"].includes(g.education.stage))
    g.stats.smarts = clamp(g.stats.smarts + rint(0, 3));

  if (g.education.yearsLeft > 0) return;

  const st = g.education.stage;
  if (st === "high") {
    if (g.stats.smarts >= 30) {
      g.diplomas.high = true;
      line(g, "🎓 You graduated from High School.", "good");
      applyResult(g, { stats:{ happiness:+10, smarts:+3 } });
    } else {
      line(g, "You failed to graduate High School.", "bad");
      applyResult(g, { stats:{ happiness:-12 } });
    }
    g.club = null; g.education = null;
  } else if (st === "uni") {
    g.diplomas.uni = true; g.diplomas.major = g.education.major;
    line(g, `🎓 You graduated university with a degree in ${g.education.major}.`, "good");
    applyResult(g, { stats:{ happiness:+14, smarts:+8 } });
    g.education = null;
  } else if (st === "grad") {
    g.diplomas.grad = true; g.diplomas.gradType = g.education.gradType;
    const sch = GRAD_SCHOOLS.find(s => s.id === g.education.gradType);
    line(g, `🎓 You completed ${sch ? sch.name : "graduate school"}.`, "good");
    applyResult(g, { stats:{ happiness:+12, smarts:+10 } });
    g.education = null;
  } else g.education = null;
}

export function enroll(g, kind, arg) {
  if (g.education) return fail("You're already enrolled in school.");
  if (g.prison) return fail("Not from in here.");

  if (kind === "uni") {
    if (!g.diplomas.high) return fail("You need a High School diploma first.");
    if (g.diplomas.uni)   return fail("You already have a degree.");
    const cost = Math.round(9000 * g.country.mult);
    if (g.money < cost) return fail(`Tuition is ${money(g, cost)} per year. You can't afford it.`);
    if (g.stats.smarts < 35 && chance(0.6)) { line(g, `Your application to study ${arg} was rejected.`, "bad"); return ok(); }
    g.money -= cost;
    g.education = { stage:"uni", yearsLeft:4, major:arg };
    line(g, `You enrolled at university to study ${arg}. Tuition: ${money(g, cost)}/yr.`, "good");
    return ok();
  }

  if (kind === "grad") {
    const sch = GRAD_SCHOOLS.find(s => s.id === arg);
    if (!sch) return fail("Unknown programme.");
    if (!g.diplomas.uni) return fail("You need a bachelor's degree first.");
    if (g.diplomas.grad) return fail("You already have a graduate degree.");
    if (g.stats.smarts < sch.minSmarts) return fail(`${sch.name} needs at least ${sch.minSmarts} smarts.`);
    if (sch.majors && !sch.majors.includes(g.diplomas.major))
      return fail(`${sch.name} requires a degree in ${sch.majors.join(", ")}.`);
    const cost = Math.round(sch.cost * g.country.mult);
    if (g.money < cost) return fail(`${sch.name} costs ${money(g, cost)}. You can't afford it.`);
    g.money -= cost;
    g.education = { stage:"grad", yearsLeft:sch.years, gradType:sch.id, major:g.diplomas.major };
    line(g, `You started ${sch.name} (${sch.years} years).`, "good");
    return ok();
  }

  if (kind === "ged") {
    if (g.diplomas.high) return fail("You already graduated.");
    if (g.age < 18) return fail("You have to be 18 to take the GED.");
    const cost = Math.round(400 * g.country.mult);
    if (g.money < cost) return fail("You can't afford the exam fee.");
    g.money -= cost;
    if (g.stats.smarts + rint(0, 30) > 45) {
      g.diplomas.high = true;
      line(g, "🎓 You passed the GED and earned a High School equivalency.", "good");
      applyResult(g, { stats:{ happiness:+10 } });
    } else {
      line(g, "You failed the GED exam.", "bad");
      applyResult(g, { stats:{ happiness:-6 } });
    }
    return ok();
  }
  return fail("Unknown course.");
}

export function dropOut(g) {
  if (!g.education) return fail("You're not in school.");
  if (g.education.stage === "elementary" || g.education.stage === "middle")
    return fail("You're too young to drop out.");
  const st = g.education.stage;
  g.education = null; g.club = null;
  applyResult(g, { text:`You dropped out of ${st === "high" ? "High School" : st === "uni" ? "university" : "graduate school"}.`, stats:{ happiness:-8 }, kind:"bad" });
  return ok();
}

export function joinClub(g, id) {
  if (!g.education || !["high", "middle"].includes(g.education.stage))
    return fail("Clubs are a school thing.");
  const c = CLUBS.find(x => x.id === id);
  if (!c) return fail("No such club.");
  if (g.club === id) return fail(`You're already in the ${c.name}.`);
  g.club = id;
  applyResult(g, { text:`You joined the ${c.name}.`, stats:{ happiness:+5 }, kind:"good" });
  return ok();
}

/* ---------- action economy ----------
   Everything used to be spammable within a single year, which let you run
   twenty world tours before ageing up. Each action now costs a slot, and the
   ledger resets every birthday. */
function useAction(g, key, max) {
  if (!g.acts) g.acts = {};
  const n = g.acts[key] || 0;
  if (n >= (max || 1)) return false;
  g.acts[key] = n + 1;
  return true;
}
export function actionsLeft(g, key, max) {
  if (!g.acts) return max || 1;
  return Math.max(0, (max || 1) - (g.acts[key] || 0));
}
export function canDo(g, key, max) { return actionsLeft(g, key, max) > 0; }

/* Buzz is momentum: publicity and scandal build it, and it raises the odds
   and payout of whatever you attempt next. It bleeds away if unused. */
function addBuzz(g, n) { g.buzz = clamp((g.buzz || 0) + n); }


/* Recurring yearly lines used to be word-for-word identical, which made a
   long life read like a stuck record. These vary the phrasing, and the
   amounts they report carry a little noise so they aren't literally the
   same number every year either. */
const SAY = {
  pay: [
    (g, t, n) => `You worked as ${an(t)} ${t} and took home ${money(g, n)} after tax.`,
    (g, t, n) => `Another year as ${an(t)} ${t}. ${money(g, n)} in the bank after tax.`,
    (g, t, n) => `Your work as ${an(t)} ${t} brought in ${money(g, n)} after tax.`,
    (g, t, n) => `${money(g, n)} landed in your account this year from the ${t} job.`,
    (g, t, n) => `You clocked another year as ${an(t)} ${t} — ${money(g, n)} after tax.`,
  ],
  dole: [
    (g, n) => `You claimed ${money(g, n)} in unemployment support.`,
    (g, n) => `The state paid you ${money(g, n)} while you looked for work.`,
    (g, n) => `You signed on and received ${money(g, n)}.`,
    (g, n) => `${money(g, n)} in benefits kept you going this year.`,
  ],
  rent: [
    (g, n, o) => `${o ? "Bills and upkeep" : "Rent and bills"} came to ${money(g, n)}.`,
    (g, n, o) => `You paid ${money(g, n)} to keep ${o ? "the place standing" : "a roof over your head"}.`,
    (g, n, o) => `${money(g, n)} went on ${o ? "upkeep and bills" : "rent and bills"}.`,
    (g, n, o) => `Keeping the lights on cost ${money(g, n)}.`,
  ],
  pension: [
    (g, n) => `You collected ${money(g, n)} in pension.`,
    (g, n) => `Your pension paid out ${money(g, n)} this year.`,
    (g, n) => `${money(g, n)} came in from the pension.`,
    (g, n) => `The pension covered another year — ${money(g, n)}.`,
    (g, n) => `Another year on the pension. ${money(g, n)}.`,
  ],
  habit: [
    (g, k, n) => `Your ${k} cost you ${money(g, n)} this year.`,
    (g, k, n) => `${money(g, n)} disappeared on ${k} again.`,
    (g, k, n) => `You got through ${money(g, n)} feeding the ${k}.`,
    (g, k, n) => `The ${k} took another ${money(g, n)} off you.`,
  ],
  fame: [
    (g, e, t, s, n) => `${e} You worked as ${an(t)} ${t} on ${money(g, s)}/yr and took home ${money(g, n)} after tax.`,
    (g, e, t, s, n) => `${e} Another year as ${an(t)} ${t}. ${money(g, n)} after tax, on ${money(g, s)}.`,
    (g, e, t, s, n) => `${e} Billed as ${an(t)} ${t} this year — ${money(g, n)} in hand.`,
  ],
};
const jitter = (n, pct) => Math.round(n * (1 + (Math.random() * 2 - 1) * (pct || 0.12)));

/* Pick a phrasing, but never the same one as last year — with five variants
   a plain random pick still repeats back-to-back one year in five, which is
   exactly what reads as the game repeating itself. */
function say(g, key, ...args) {
  const list = SAY[key];
  if (!g.lastSay) g.lastSay = {};
  const prev = g.lastSay[key];
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === prev) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
  g.lastSay[key] = i;
  return list[i](g, ...args);
}

/* ---------- ordinary career ---------- */
/* Signed off injured. The job is held for two years; past that the employer
   moves on, though the compensation keeps coming. */
function leaveYear(g) {
  const L = g.leave;
  L.served = (L.served || 0) + 1;
  const base = g.job ? g.job.salary : (L.salary || 0);
  const paid = Math.round(base * (L.comp == null ? 0.6 : L.comp) * 0.72);
  if (paid > 0) {
    g.money += paid;
    line(g, `🩼 Signed off work — ${L.reason}. Compensation paid ${money(g, paid)}.`);
  } else {
    line(g, `🩼 Off work all year — ${L.reason}. Nothing came in.`, "bad");
  }
  g.stats.happiness = clamp(g.stats.happiness - rint(2, 7));

  if (g.job && L.served >= 2 && L.years > 2) {
    L.salary = g.job.salary;
    line(g, `Your employer could not hold the job open any longer.`, "bad");
    g.job = null; g.yearsInJob = 0;
  }
  if (L.served >= L.years) {
    g.leave = null;
    if (g.job) line(g, `You were signed fit and went back to work as ${an(g.job.title)} ${g.job.title}.`, "good");
    else line(g, `You were signed fit again, and out of a job.`, "bad");
  }
}

function ageCareer(g) {
  if (g.leave) return leaveYear(g);
  if (!g.job) {
    if (g.pension) {
      const paid = jitter(g.pension, 0.06);
      g.money += paid;
      if (chance(0.75)) line(g, say(g, "pension", paid));
    }
    return;
  }
  g.yearsInJob++;
  g.job.salary = Math.round(g.job.salary * (1 + rint(-1, 4) / 100));
  const net = Math.round(g.job.salary * 0.72);
  g.money += net;
  line(g, say(g, "pay", g.job.title, net));

  g.jobPerf = clamp(g.jobPerf + rint(-8, 6) + Math.round((g.stats.smarts - 50) / 25));

  const def = jobDef(g.job.id);
  if (def && g.job.rung < def.ladder.length - 1 && g.jobPerf > 78 && g.yearsInJob >= 2 && chance(0.35)) promote(g);
  if (g.jobPerf < 12 && chance(0.5)) {
    line(g, `You were fired from your job as ${an(g.job.title)} ${g.job.title}.`, "bad");
    applyResult(g, { fire:true, stats:{ happiness:-18 } });
  }
  if (g.age >= 68 && chance(0.25) && g.job) {
    line(g, `You retired after ${g.yearsInJob} years as ${an(g.job.title)} ${g.job.title}.`, "good");
    g.pension = Math.round(g.job.salary * 0.4);
    g.job = null; g.yearsInJob = 0;
    applyResult(g, { stats:{ happiness:+12 } });
  }
}

export function jobDef(id) { return JOBS.find(j => j.id === id) || SPECIAL.find(j => j.id === id); }

function promote(g) {
  const def = jobDef(g.job.id);
  g.job.rung++;
  g.job.title = def.ladder[g.job.rung];
  g.job.salary = Math.round(g.job.salary * rint(118, 148) / 100);
  g.jobPerf = clamp(g.jobPerf - 10);
  line(g, `🎉 You were promoted to ${g.job.title} — now earning ${money(g, g.job.salary)}/yr.`, "good");
  applyResult(g, { stats:{ happiness:+12 } });
}

export function availableJobs(g) {
  return JOBS.filter(j => {
    if (j.tier === 0) return true;
    if (j.tier === 1) return g.diplomas.high;
    if (j.tier === 2) return g.diplomas.uni;
    if (j.tier === 3) return g.diplomas.grad && g.diplomas.gradType === j.gradType;
    return false;
  }).map(j => {
    const majorMatch = !j.major || g.diplomas.major === j.major;
    const salary = Math.round(j.base * g.country.mult * (majorMatch ? 1 : 0.8) * (1 + (g.stats.smarts - 50) / 400));
    return { ...j, offered: salary, majorMatch };
  });
}

export function lockedJobs(g) {
  const open = new Set(availableJobs(g).map(j => j.id));
  return JOBS.filter(j => !open.has(j.id)).map(j => {
    let why = "";
    if (j.tier === 1) why = "Needs a High School diploma";
    else if (j.tier === 2) why = "Needs a bachelor's degree";
    else if (j.tier === 3) {
      const s = GRAD_SCHOOLS.find(x => x.id === j.gradType);
      why = `Needs ${s ? s.name : "graduate school"}`;
    }
    return { ...j, why };
  });
}

export function applyForJob(g, jobId) {
  if (g.prison) return fail("You're in prison.");
  if (g.job) return fail("You already have a job. Quit first.");
  if (g.age < 16) return fail("You're too young to work.");
  const j = availableJobs(g).find(x => x.id === jobId);
  if (!j) return fail("You aren't qualified for that job.");

  let odds = 0.55 + (g.stats.smarts - 50) / 220 + (g.stats.looks - 50) / 400;
  if (!j.majorMatch) odds -= 0.15;
  if (recordAgainstYou(g) > 0) odds -= 0.2;
  if (g.homeless) odds -= 0.25;                     // no address, no interview
  if (g.addiction) odds -= 0.12;
  odds = Math.max(0.05, Math.min(0.95, odds));

  if (!chance(odds)) {
    line(g, `You interviewed for ${j.name} and were rejected.`, "bad");
    applyResult(g, { stats:{ happiness:-5 } });
    return ok();
  }
  g.job = { id:j.id, name:j.name, title:j.ladder[0], rung:0, salary:j.offered };
  g.jobPerf = 60; g.yearsInJob = 0;
  line(g, `You were hired as ${an(g.job.title)} ${g.job.title} for ${money(g, j.offered)}/yr.`, "good");
  applyResult(g, { stats:{ happiness:+12 } });
  return ok();
}

export function jobAction(g, what) {
  if (!g.job) return fail("You don't have a job.");
  if (what !== "quit" && !useAction(g, "job_" + what)) return fail("You've already tried that this year.");
  if (what === "quit") {
    line(g, `You quit your job as ${an(g.job.title)} ${g.job.title}.`);
    g.job = null; g.jobPerf = 60; g.yearsInJob = 0;
    applyResult(g, { stats:{ happiness:+4 } });
    return ok();
  }
  if (what === "harder") {
    g.jobPerf = clamp(g.jobPerf + rint(6, 16));
    applyResult(g, { text:"You put in longer hours and your performance improved.", stats:{ happiness:-5, health:-3 } });
    return ok();
  }
  if (what === "raise") {
    if (g.yearsInJob < 1) return fail("You just started. Give it a year.");
    if (chance(0.15 + g.jobPerf / 200)) {
      const bump = rint(6, 18);
      g.job.salary = Math.round(g.job.salary * (1 + bump / 100));
      applyResult(g, { text:`You asked for a raise and got ${bump}% — now ${money(g, g.job.salary)}/yr.`, stats:{ happiness:+10 }, kind:"good" });
    } else {
      g.jobPerf = clamp(g.jobPerf - 5);
      applyResult(g, { text:"You asked for a raise. Your boss said 'let's revisit next quarter'.", stats:{ happiness:-6 } });
    }
    return ok();
  }
  if (what === "promotion") {
    const def = jobDef(g.job.id);
    if (g.job.rung >= def.ladder.length - 1) return fail("You're already at the top of this ladder.");
    if (g.yearsInJob < 2) return fail("You need at least 2 years in the role.");
    if (chance(0.1 + g.jobPerf / 180)) promote(g);
    else { g.jobPerf = clamp(g.jobPerf - 6); applyResult(g, { text:"You asked for a promotion and were turned down.", stats:{ happiness:-8 } }); }
    return ok();
  }
  return fail("Unknown action.");
}

/* ---------- special careers ---------- */
export function specialList(g) {
  return SPECIAL.map(s => {
    const unmet = [];
    const r = s.req || {};
    if (r.looks  && g.stats.looks  < r.looks)  unmet.push(`${r.looks} looks`);
    if (r.smarts && g.stats.smarts < r.smarts) unmet.push(`${r.smarts} smarts`);
    if (r.health && g.stats.health < r.health) unmet.push(`${r.health} health`);
    if (r.uni  && !g.diplomas.uni)  unmet.push("a degree");
    if (r.high && !g.diplomas.high) unmet.push("a High School diploma");
    if (s.minAge && g.age < s.minAge) unmet.push(`age ${s.minAge}+`);
    if (s.maxAge && g.age > s.maxAge) unmet.push(`under ${s.maxAge}`);
    return { ...s, unmet, eligible: unmet.length === 0 };
  });
}

export function auditionFor(g, id) {
  if (g.prison) return fail("You're in prison.");
  if (g.special) return fail(`You're already working as a ${g.special.title}.`);
  if (g.job) return fail("Quit your day job first.");
  if (g.age < 16) return fail("You're too young.");
  const s = specialList(g).find(x => x.id === id);
  if (!s) return fail("Unknown career.");
  if (!s.eligible) return fail(`You need ${s.unmet.join(", ")} first.`);

  const odds = Math.max(0.1, Math.min(0.85,
    0.30 + (g.stats.looks - 50) / 400 + (g.stats.smarts - 50) / 500 + g.fame / 180));
  if (!chance(odds)) {
    applyResult(g, { text:`You tried out for ${s.name} and didn't make the cut.`, stats:{ happiness:-7 }, kind:"bad" });
    return ok();
  }
  g.special = { id:s.id, name:s.name, emoji:s.emoji, title:s.ladder[0], rung:0,
                base:Math.round(s.base * g.country.mult), project:s.project };
  if (s.id === "military" && !g.branch) {
    g.branch = pick(SY.BRANCHES).id;
    const br = SY.BRANCHES.find(b => b.id === g.branch);
    line(g, `${br.emoji} You enlisted in the ${br.name}.`);
  }
  g.fame = clamp(g.fame + fameGain(g, rint(4, 10)));
  applyResult(g, { text:`${s.emoji} You broke into ${s.name.toLowerCase()} work as a ${s.ladder[0]}.`, stats:{ happiness:+18 }, kind:"good" });
  return ok();
}

/* Earnings scale with the CUBE of fame, so the gap between famous and
   globally famous is enormous — fame 50 is a good living, fame 100 is
   Ed Sheeran money. Tuned so base 26k (musician) pays ~10.4M at fame 100. */
export function specialSalary(g) {
  const f = Math.max(0, g.fame) / 100;
  return Math.round(g.special.base * (1 + Math.pow(f, 3.4) * 400));
}

/* Each point of fame is harder to win than the last, and some fields are
   far stingier than others (influencer 1.4 vs military 0.34). */
function fameGain(g, raw) {
  const def = SPECIAL.find(s => s.id === (g.special && g.special.id));
  const rate = def && def.fameRate ? def.fameRate : 1;
  const resist = Math.max(0.24, 1 - g.fame / 130);
  return Math.max(1, Math.round(raw * rate * resist));
}

function ageSpecial(g) {
  if (!g.special) return;
  g.yearsInJob++;
  const net = Math.round(specialSalary(g) * 0.72);
  g.money += net;
  line(g, say(g, "fame", g.special.emoji, g.special.title, specialSalary(g), net));

  const def = SPECIAL.find(s => s.id === g.special.id);
  const rung = Math.min(def.ladder.length - 1, Math.floor(g.fame / (100 / def.ladder.length)));
  if (rung > g.special.rung) {
    g.special.rung = rung;
    g.special.title = def.ladder[rung];
    applyResult(g, { text:`⭐ Your profile rose — you're now billed as a ${g.special.title}.`, stats:{ happiness:+14 }, kind:"good" });
  } else if (rung < g.special.rung && chance(0.5)) {
    g.special.rung = rung;
    g.special.title = def.ladder[rung];
    applyResult(g, { text:`Your star faded. You're back to ${g.special.title} work.`, stats:{ happiness:-12 }, kind:"bad" });
  }
  if (def.maxAge && g.age > def.maxAge && chance(0.4)) {
    applyResult(g, { text:`Age caught up with you and your ${def.name.toLowerCase()} career ended.`, stats:{ happiness:-16 }, kind:"bad" });
    g.pension = Math.round(specialSalary(g) * 0.25);
    g.special = null; g.yearsInJob = 0;
  }
}

export function specialAction(g, what, opts) {
  const force = !!(opts && opts.force);
  if (!g.special) return fail("You're not in a special career.");
  const def = SPECIAL.find(s => s.id === g.special.id);
  const buzz = g.buzz || 0;

  if (what === "project") {
    if (!useAction(g, "sp_project")) return fail(`You can only do that once a year. Age up to try again.`);
    // Buzz meaningfully shifts the odds, and outcomes swing hard either way.
    const roll = Math.random() + (g.stats.smarts - 50) / 700 + (g.stats.looks - 50) / 800 + buzz / 210;
    if (roll > 0.80) {
      const f = fameGain(g, rint(8, 22));
      addBuzz(g, rint(6, 14));
      applyResult(g, { text:`${g.special.emoji} Your latest work was a genuine hit. Fame +${f} (now ${clamp(g.fame + f)}).`,
        fame:+f, stats:{ happiness:+16 }, kind:"good" });
    } else if (roll > 0.52) {
      const f = fameGain(g, rint(2, 7));
      addBuzz(g, rint(1, 5));
      applyResult(g, { text:`${g.special.emoji} Your latest work did modestly well. Fame +${f} (now ${clamp(g.fame + f)}).`,
        fame:+f, stats:{ happiness:+5 } });
    } else if (roll > 0.24) {
      applyResult(g, { text:`${g.special.emoji} Your latest work landed with a shrug. Nobody much noticed.`, stats:{ happiness:-5 } });
    } else {
      const f = rint(3, 10);
      addBuzz(g, -rint(5, 15));
      applyResult(g, { text:`${g.special.emoji} Your latest work flopped badly. Fame -${f}.`,
        fame:-f, stats:{ happiness:-14 }, kind:"bad" });
    }
    return ok();
  }

  if (what === "publicity") {
    if (!useAction(g, "sp_pub")) return fail("You've already worked the press this year.");
    const cost = Math.round(9000 * g.country.mult);
    if (g.money < cost) return fail(`A publicist costs ${money(g, cost)}.`);
    g.money -= cost;
    const b = rint(9, 26);
    addBuzz(g, b);
    applyResult(g, { text:`You put a publicist on retainer for ${money(g, cost)}. Buzz +${b} (now ${clamp(buzz + b)}) — it won't make you famous by itself, but it lifts the odds on your next move.`,
      stats:{ happiness:+2 }, kind:"good" });
    return ok();
  }

  if (what === "scandal") {
    if (!useAction(g, "sp_scandal")) return fail("One scandal a year is quite enough.");
    const b = rint(14, 34);
    addBuzz(g, b);
    const backfire = chance(0.30);
    applyResult(g, { text:`A tabloid ran a story about you. Buzz +${b}${backfire ? ", but the coverage was vicious" : ""}.`,
      fame: backfire ? -rint(2, 6) : 0, stats:{ happiness:-rint(10, 20) }, kind: backfire ? "bad" : "" });
    return ok();
  }

  if (what === "big") {
    const b2 = def.big;
    if (!b2) return fail("Nothing like that in this line of work.");
    if (g.fame < b2.minFame) return fail(`You need ${b2.minFame} fame for that. You're on ${g.fame}.`);
    const since = g.age - (g.lastBig == null ? -99 : g.lastBig);
    if (!force && since < BIG_COOLDOWN) return fail(`You can't mount another one so soon — wait ${BIG_COOLDOWN - since} more year${BIG_COOLDOWN - since === 1 ? "" : "s"}.`);
    if (!force && !useAction(g, "sp_big")) return fail("Once a year at most.");

    g.lastBig = g.age;
    const salary = specialSalary(g);
    // Without buzz behind it this is a coin-flip at best; with a year of
    // groundwork it becomes a good bet. Payout scales with buzz too.
    const odds = Math.min(0.72, 0.18 + buzz / 260 + (g.stats.smarts - 50) / 900);
    const spent = buzz;
    g.buzz = Math.round(buzz * 0.15);

    if (chance(odds)) {
      const mult = (1.4 + spent / 42) * (0.75 + Math.random() * 0.7);
      const pay = Math.round(salary * mult);
      const f = fameGain(g, rint(b2.fame[0], b2.fame[1]));
      applyResult(g, { text:`${g.special.emoji} ${b2.label} — it was a triumph. ${money(g, pay)} earned, Fame +${f} (now ${clamp(g.fame + f)}).`,
        money:+pay, fame:+f, stats:{ happiness:+22, health:-8 }, kind:"good" });
    } else {
      const loss = Math.round(salary * (0.3 + Math.random() * 0.6));
      const f = rint(5, 14);
      applyResult(g, { text:`${g.special.emoji} ${b2.label} — it underperformed badly. ${money(g, loss)} lost and Fame -${f}.`,
        money:-afford(g, loss), fame:-f, stats:{ happiness:-20, health:-8 }, kind:"bad" });
    }
    return ok();
  }

  if (what === "quit") {
    applyResult(g, { text:`You walked away from your ${def.name.toLowerCase()} career.`, stats:{ happiness:-4 } });
    g.special = null; g.yearsInJob = 0;
    return ok();
  }
  return fail("Unknown action.");
}

/* ---------- finances: investments, loans, insurance ---------- */
function ageFinances(g) {
  let gainsTax = 0;
  for (const inv of g.investments) {
    const def = INVESTMENTS.find(i => i.id === inv.id);
    if (!def) continue;
    const before = inv.value;
    const r = def.mean + gauss() * def.vol;
    inv.value = Math.max(0, Math.round(inv.value * (1 + r)));
    const gain = inv.value - before;
    if (gain > 0) {                       // gains are taxed; compounding isn't free
      const tax = Math.round(gain * 0.26);
      inv.value -= tax;
      gainsTax += tax;
    }
  }
  if (gainsTax > 0 && chance(0.5))
    line(g, `You paid ${money(g, gainsTax)} in tax on investment gains.`);

  // Great fortunes leak: management, advisers, security, upkeep.
  const holdings = g.investments.reduce((s, i) => s + i.value, 0)
    + g.assets.houses.reduce((s, a) => s + a.value, 0);
  if (holdings > 5000000) {
    const drag = Math.round(holdings * 0.012);
    g.money -= drag;
    if (chance(0.4)) line(g, `Managing your wealth cost ${money(g, drag)} this year.`);
  }
  const invTotal = g.investments.reduce((s, i) => s + i.value, 0);
  if (invTotal > 0 && chance(0.55)) {
    const prev = g.__prevInv || invTotal;
    const d = invTotal - prev;
    if (Math.abs(d) > prev * 0.1)
      line(g, d > 0 ? `📈 Your investments gained ${money(g, d)}.` : `📉 Your investments lost ${money(g, -d)}.`, d > 0 ? "good" : "bad");
  }
  g.__prevInv = invTotal;

  for (const k in g.insurance) {
    if (!g.insurance[k]) continue;
    const def = INSURANCE.find(i => i.id === k);
    if (def) g.money -= Math.round(def.premium * g.country.mult);
  }

  for (const L of g.loans) {
    L.balance = Math.round(L.balance * (1 + L.rate));
    const pay = Math.min(L.balance, Math.round(L.principal * 0.12));
    if (g.money >= pay) { g.money -= pay; L.balance -= pay; }
    else { L.missed = (L.missed || 0) + 1; g.stats.happiness = clamp(g.stats.happiness - 6);
           line(g, `You missed a loan repayment. The balance is now ${money(g, L.balance)}.`, "bad"); }
  }
  g.loans = g.loans.filter(L => {
    if (L.balance <= 0) { line(g, `✅ You paid off your ${L.name}.`, "good"); return false; }
    return true;
  });
}

export function invest(g, id, amount) {
  const def = INVESTMENTS.find(i => i.id === id);
  if (!def) return fail("Unknown investment.");
  amount = Math.round(amount);
  if (amount < def.min) return fail(`Minimum investment is ${money(g, def.min)}.`);
  if (g.money < amount) return fail("You don't have that much.");
  g.money -= amount;
  const ex = g.investments.find(i => i.id === id);
  if (ex) { ex.value += amount; ex.basis += amount; }
  else g.investments.push({ id, name:def.name, emoji:def.emoji, value:amount, basis:amount });
  applyResult(g, { text:`${def.emoji} You invested ${money(g, amount)} in ${def.name}.`, kind:"good" });
  return ok();
}

export function divest(g, id) {
  const i = g.investments.findIndex(x => x.id === id);
  if (i < 0) return fail("You don't hold that.");
  const inv = g.investments[i];
  const gain = inv.value - inv.basis;
  g.money += inv.value;
  g.investments.splice(i, 1);
  applyResult(g, { text:`You sold your ${inv.name} for ${money(g, inv.value)} (${gain >= 0 ? "+" : "−"}${money(g, gain)}).`, kind: gain >= 0 ? "good" : "bad" });
  return ok();
}

export function toggleInsurance(g, id) {
  const def = INSURANCE.find(i => i.id === id);
  if (!def) return fail("Unknown policy.");
  if (g.insurance[id]) {
    g.insurance[id] = false;
    applyResult(g, { text:`You cancelled your ${def.name}.` });
  } else {
    const p = Math.round(def.premium * g.country.mult);
    if (g.money < p) return fail(`The first premium is ${money(g, p)}.`);
    g.insurance[id] = true;
    applyResult(g, { text:`${def.emoji} You took out ${def.name} — ${money(g, p)}/yr, covers ${def.covers}.`, kind:"good" });
  }
  return ok();
}

export function takeLoan(g, amount) {
  amount = Math.round(amount);
  if (amount <= 0) return fail("Pick an amount.");
  const income = g.job ? g.job.salary : g.special ? specialSalary(g) : 0;
  const cap = Math.max(5000, Math.round(income * 3)) * g.country.mult;
  if (amount > cap) return fail(`The bank will only lend you up to ${money(g, cap)}.`);
  if (g.loans.length >= 3) return fail("You already have three loans outstanding.");
  const rate = 0.06 + (g.criminalRecord ? 0.04 : 0) + (income === 0 ? 0.06 : 0);
  g.loans.push({ id:nextId(), name:"bank loan", principal:amount, balance:Math.round(amount * (1 + rate)), rate });
  g.money += amount;
  applyResult(g, { text:`🏦 You took out a ${money(g, amount)} loan at ${(rate * 100).toFixed(1)}% interest.`, kind:"good" });
  return ok();
}

export function repayLoan(g, id) {
  const L = g.loans.find(x => x.id === id);
  if (!L) return fail("No such loan.");
  if (g.money < L.balance) return fail(`You need ${money(g, L.balance)} to clear it.`);
  g.money -= L.balance;
  g.loans = g.loans.filter(x => x.id !== id);
  applyResult(g, { text:`✅ You paid off your ${L.name} in full.`, stats:{ happiness:+8 }, kind:"good" });
  return ok();
}

export function declareBankruptcy(g) {
  const debt = g.loans.reduce((s, L) => s + L.balance, 0);
  if (debt <= 0 && g.money >= 0) return fail("You have nothing to declare.");
  g.loans = [];
  g.money = Math.max(0, g.money);
  g.assets = { houses:[], cars:[], luxury:[], empire:[] };
  g.investments = [];
  g.criminalRecord = g.criminalRecord;
  applyResult(g, { text:`You declared bankruptcy. Your debts are gone and so is everything you owned.`, stats:{ happiness:-25 }, kind:"bad" });
  return ok();
}


/* ============================================================
   HOUSING, HOMELESSNESS AND ADDICTION
   You used to be able to live an entire life on nothing. Now rent is
   real, parents run out of patience, and the bottom is a place you can
   actually end up.
   ============================================================ */
export function incomeOf(g) {
  if (g.job) return g.job.salary;
  if (g.special) return specialSalary(g);
  if (g.pension) return g.pension;
  if (g.mafia && g.mafia.rackets.length) return 20000 * g.mafia.rackets.length;
  return 0;
}

function moveOut(g, why) {
  g.withParents = false;
  g.missedRent = 0;
  line(g, why || "You moved out of your parents' place.", "good");
}


/* A relative with any goodwill left will usually give you a sofa before
   the street does. */
export function softLanding(g) {
  const kin = g.rels.filter(r => r.alive && r.rel > 45 &&
    ["mother","father","sibling","grandmother","grandfather","aunt","uncle","friend","bestfriend"].includes(r.type));
  if (!kin.length || !chance(0.6)) return false;
  const k = pick(kin);
  k.rel = clamp(k.rel - rint(5, 15));
  applyResult(g, { text: `${k.name} let you sleep on their sofa rather than see you on the street.`,
    stats: { happiness: -8 }, kind: "" });
  return true;
}
export function becomeHomeless(g, why) {
  if (g.homeless) return;
  g.homeless = true;
  g.withParents = false;
  g.yearsHomeless = 0;
  applyResult(g, { text: why || "With nowhere left to go, you ended up on the street.",
    stats: { happiness: -30, health: -12 }, kind: "bad" });
}

export function endHomelessness(g, why) {
  if (!g.homeless) return;
  g.homeless = false;
  g.missedRent = 0;
  applyResult(g, { text: why || "You got off the street and into a place of your own.",
    stats: { happiness: +26, health: +8 }, kind: "good" });
}

function ageHousing(g) {
  if (g.prison) return;
  const income = incomeOf(g);

  if (g.withParents) {
    const parents = g.rels.filter(r => (r.type === "mother" || r.type === "father") && r.alive);
    if (g.age < 18 || g.education) return;
    if (!parents.length) {
      moveOut(g, "With nobody left at home, you had to find your own way.");
      if (income === 0 && g.money < 3000 * g.country.mult && !softLanding(g))
        becomeHomeless(g, "You had no income and nowhere to go.");
      return;
    }
    // Patience ramps with age — nobody is turfed out the week they turn 18.
    const patience = income > 0
      ? (g.age >= 20 ? 0.30 : 0.10)
      : (g.age < 20 ? 0 : Math.min(0.45, 0.10 + (g.age - 20) * 0.05));
    const askedAt = g.fired && (g.fired.house_moveout || g.fired.house_kickout);
    const asked = askedAt != null ? g.age - Math.max(g.fired.house_moveout || -99, g.fired.house_kickout || -99) : 99;
    if (asked >= 4 && patience > 0 && chance(patience))
      queueChoice(g, income > 0 ? "house_moveout" : "house_kickout");
    return;
  }

  if (!g.homeless) {
    // Out of work and not yet destitute? Most places have some kind of net.
    if (income === 0 && g.age >= 18 && g.age < 68 && !g.education) {
      const dole = jitter(Math.round(5200 * g.country.mult), 0.18);
      g.money += dole;
      if (chance(0.4)) line(g, say(g, "dole", dole));
    }
    const owns = g.assets.houses.length > 0;
    const cost = jitter(Math.round((owns ? 5200 : 9200) * g.country.mult * (1 + Math.max(0, g.age - 25) / 260)), 0.10);
    if (g.money >= cost) {
      g.money -= cost;
      g.missedRent = 0;
      if (chance(0.3)) line(g, say(g, "rent", cost, owns));
    } else {
      g.missedRent = (g.missedRent || 0) + 1;
      line(g, `You couldn't cover ${owns ? "your bills" : "rent"} — ${money(g, cost)} due.`, "bad");
      g.stats.happiness = clamp(g.stats.happiness - 10);
      if (g.missedRent >= 3) {
        if (owns) {
          const h = g.assets.houses[0];
          g.assets.houses = g.assets.houses.filter(x => x.id !== h.id);
          applyResult(g, { text: `Your ${h.name} was repossessed.`, stats: { happiness: -25 }, kind: "bad" });
          g.missedRent = 0;
        } else becomeHomeless(g, "You were evicted and had nowhere to go.");
      }
    }
  }

  if (g.homeless) {
    // You are not homeless if you own a home, or can plainly afford one.
    if (g.assets.houses.length) {
      endHomelessness(g, `You moved into your own property. You have an address again.`);
      return;
    }
    const rehouse = Math.round(30000 * g.country.mult);
    if (g.money >= rehouse || income >= rehouse) {
      endHomelessness(g, `You could finally afford a place of your own again.`);
      return;
    }
    g.yearsHomeless++;
    const begged = Math.round(rint(200, 2600) * g.country.mult);
    g.money += begged;
    applyResult(g, { text: `You slept rough and made ${money(g, begged)} however you could.`,
      stats: { health: -rint(4, 12), happiness: -rint(3, 9), looks: -rint(2, 6) }, kind: "bad" });
    if (g.stats.health < 8 && chance(0.35)) die(g, "exposure while sleeping rough");
  }
}

/* ---------- addiction ---------- */
export function addict(g, kind) {
  /* Addiction can arrive through an event rather than through useDrug(), and
     it can later be beaten — so record the fact permanently here, at the one
     place it always begins. Events that say "your dealer" need to know you
     ever had one, not whether you have a habit right now. */
  if (kind && kind !== "alcohol") {
    if (!g.flags) g.flags = {};
    g.flags.usedDrugs = true;
  }
  if (g.addiction) { g.addiction.level = Math.min(3, g.addiction.level + 1); return; }
  g.addiction = { kind, level: 1 };
}

function ageAddiction(g) {
  const a = g.addiction;
  if (!a) return;
  const label = a.kind === "alcohol" ? "drinking" : "using";
  const spend = Math.round(rint(1200, 9000) * a.level * g.country.mult);
  const paid = afford(g, spend);
  g.money -= paid;

  applyResult(g, { text: say(g, "habit", a.kind === "alcohol" ? "drinking" : "habit", paid),
    stats: { health: -rint(2, 7) * (a.level / 2), happiness: -rint(2, 7), smarts: -rint(0, 2) }, kind: "bad" });

  if (g.job && chance(0.10 * a.level)) {
    applyResult(g, { text: `You lost your job over the ${label}.`, fire: true, stats: { happiness: -18 }, kind: "bad" });
  }
  if (chance(0.12)) a.level = Math.min(3, a.level + 1);
  if (a.level >= 3 && chance(0.10)) {
    if (chance(0.45)) die(g, a.kind === "alcohol" ? "liver failure" : "an overdose");
    else applyResult(g, { text: `You overdosed and were brought back in A&E.`, stats: { health: -30, happiness: -20 }, kind: "bad" });
  }
}

export function rehab(g) {
  if (!g.addiction) return fail("You've nothing to go to rehab for.");
  if (!useAction(g, "rehab")) return fail("You've already tried that this year.");
  const cost = Math.round(14000 * g.country.mult);
  if (g.money < cost) {
    // state-funded place, longer odds
    if (chance(0.35)) { g.addiction = null; applyResult(g, { text: "You got a state-funded place and came out clean.", stats: { happiness: +20, health: +12 }, kind: "good" }); }
    else applyResult(g, { text: "You went on the waiting list for a funded place and relapsed before it came.", stats: { happiness: -10 }, kind: "bad" });
    return ok();
  }
  g.money -= cost;
  if (chance(0.62)) { g.addiction = null; applyResult(g, { text: `You paid ${money(g, cost)} for a residential programme and came out clean.`, stats: { happiness: +24, health: +16 }, kind: "good" }); }
  else applyResult(g, { text: `You paid ${money(g, cost)} for rehab and relapsed within months.`, stats: { happiness: -14 }, kind: "bad" });
  return ok();
}

/* ---------- relationships ---------- */
function ageRelationships(g) {
  for (const r of g.rels) {
    if (!r.alive) continue;
    r.age++;
    const floor = REL_FLOOR[r.type] != null ? REL_FLOOR[r.type] : 25;
    r.rel = clamp(r.rel + (floor - r.rel) * 0.06 + rint(-2, 2));

    if (chance(deathChance(r.age, 60))) {
      r.alive = false;
      line(g, `💀 Your ${relLabel(r)}, ${r.name}, died at age ${r.age}.`, "bad");
      applyResult(g, { stats:{ happiness: r.type === "partner" ? -35 : FAMILY_TYPES.includes(r.type) ? -22 : -12 } });
      if (r.type === "partner") g.married = false;
      if ((r.type === "mother" || r.type === "father") && chance(0.5)) {
        const amt = rint(1000, 60000);
        applyResult(g, { text:`You inherited ${money(g, amt)} from ${r.name}.`, money:+amt, kind:"good" });
      }
    }
  }

  for (const partner of partners(g)) {
    // spreading yourself thin costs you
    const others = partners(g).length - 1;
    if (others > 0) partner.rel = clamp(partner.rel - rint(0, 2 + others));

    if (partner.rel < 20 && chance(partner.secret ? 0.5 : 0.4)) {
      if (partner.secret) {
        line(g, `${partner.name} got tired of being a secret and ended it.`, "bad");
        partner.type = "ex";
        applyResult(g, { stats:{ happiness:-16 } });
      } else {
        line(g, `${partner.name} ${partner.spouse ? "filed for divorce" : "broke up with you"}.`, "bad");
        partner.type = "ex";
        if (partner.spouse) { g.married = false; partner.spouse = false; }
        applyResult(g, { stats:{ happiness:-28 } });
        if (partner.spouse !== false && g.money > 0 && chance(0.6)) {
          const loss = Math.round(g.money * 0.35);
          applyResult(g, { text:`The settlement cost you ${money(g, loss)}.`, money:-loss });
        }
      }
      continue;
    }
    if (partner.spouse && chance(0.12) && g.age < 48) newChild(g, partner, "had");
  }

  checkAffairDiscovery(g);

  if (!partners(g).length && g.age >= 16 && chance(0.10 + g.stats.looks / 500 + g.fame / 400)) {
    const p = mkRel("partner", g.gender === "male" ? "female" : "male", null, Math.max(16, g.age + rint(-6, 6)));
    p.rel = rint(60, 90);
    g.rels.push(p);
    line(g, `❤️ You started dating ${p.name}.`, "good");
    applyResult(g, { stats:{ happiness:+14 } });
  }

  const friends = g.rels.filter(r => r.alive && (r.type === "friend" || r.type === "bestfriend"));
  for (const f of friends) {
    if (f.type === "friend" && f.rel < 12 && chance(0.35)) {
      f.type = "lostfriend"; f.alive = false;
      line(g, `You and ${f.name} lost touch.`);
    } else if (f.type === "friend" && f.rel > 88 && chance(0.15) && !g.rels.some(x => x.type === "bestfriend" && x.alive)) {
      f.type = "bestfriend";
      applyResult(g, { text:`${f.name} became your best friend.`, stats:{ happiness:+10 }, kind:"good" });
    }
  }
  if (chance(0.11) && g.age >= 5 && friends.length < 6) {
    const f = mkRel("friend", pick(["male", "female"]), null, Math.max(3, g.age + rint(-4, 4)));
    g.rels.push(f);
    line(g, `You became friends with ${f.name}.`);
  }

  if ((g.job || g.special) && chance(0.14) && g.rels.filter(r => r.alive && r.type === "coworker").length < 4) {
    const c = mkRel("coworker", pick(["male", "female"]), null, Math.max(18, g.age + rint(-12, 12)));
    c.rel = rint(40, 70);
    g.rels.push(c);
    line(g, `You got friendly with ${c.name} at work.`);
  }
}


/* Secrets don't keep. The more you have and the longer they run, the
   likelier someone talks. */
function checkAffairDiscovery(g) {
  const secrets = secretPartners(g);
  if (!secrets.length) return;
  const open = openPartners(g);
  for (const s of secrets) {
    s.years = (s.years || 0) + 1;
    const risk = 0.08 + secrets.length * 0.05 + s.years * 0.02 + (g.fame > 50 ? 0.06 : 0);
    if (!chance(Math.min(0.6, risk))) continue;

    if (!open.length) {
      // nobody to betray — it just stops being a secret
      s.secret = false;
      line(g, `You stopped hiding ${s.name} and simply had a partner again.`);
      continue;
    }
    const wronged = pick(open);
    line(g, `💔 ${wronged.name} found out about ${s.name}.`, "bad");
    wronged.rel = clamp(wronged.rel - rint(35, 70));
    applyResult(g, { stats:{ happiness:-26 } });

    if (chance(wronged.poly ? 0.25 : 0.62)) {
      line(g, `${wronged.name} ${wronged.spouse ? "filed for divorce" : "ended it"} on the spot.`, "bad");
      wronged.type = "ex";
      if (wronged.spouse) { g.married = false; wronged.spouse = false;
        if (g.money > 0 && chance(0.7)) {
          const loss = Math.round(g.money * 0.4);
          applyResult(g, { text:`The divorce cost you ${money(g, loss)}.`, money:-loss });
        } }
    } else {
      line(g, `${wronged.name} stayed, which was somehow worse.`);
    }
    s.secret = false;
    break;
  }
}

function newChild(g, partner, verb) {
  const gen = pick(["male", "female"]);
  const kid = mkRel("child", gen, g.last, 0);
  kid.rel = 90;
  g.rels.push(kid);
  line(g, `👶 You${partner ? ` and ${partner.name}` : ""} ${verb} a ${gen === "male" ? "son" : "daughter"}, ${kid.name}.`, "good");
  applyResult(g, { stats:{ happiness:+18 } });
  return kid;
}

export function relAction(g, relId, action) {
  return withCostNote(g, () => _relAction(g, relId, action));
}
function _relAction(g, relId, action) {
  const r = g.rels.find(x => x.id === relId);
  if (!r || !r.alive) return fail("They're not around anymore.");
  if (!useAction(g, "rel_" + relId, 3)) return fail(`You've spent enough time with ${r.name} this year.`);

  switch (action) {
    case "time": {
      const d = rint(3, 12);
      r.rel = clamp(r.rel + d);
      applyResult(g, { text:`You spent time with ${r.name}. It was ${d > 8 ? "genuinely lovely" : "nice"}.`, stats:{ happiness:+5 }, kind:"good" });
      return ok();
    }
    case "talk": {
      const d = rint(2, 8);
      r.rel = clamp(r.rel + d);
      applyResult(g, { text:`You had a long conversation with ${r.name} about ${pick(["work","the past","nothing at all","their health","old friends","the news"])}.`, stats:{ happiness:+3 } });
      return ok();
    }
    case "compliment": {
      const good = chance(0.7 + g.stats.looks / 500);
      r.rel = clamp(r.rel + (good ? rint(4, 10) : -3));
      applyResult(g, { text: good ? `You complimented ${r.name} and they lit up.` : `You complimented ${r.name}. It landed weird.`, stats:{ happiness: good ? +3 : -2 } });
      return ok();
    }
    case "movie": {
      const c = Math.round(rint(20, 80) * g.country.mult);
      if (g.money < c) return fail("You can't afford the tickets.");
      g.money -= c;
      r.rel = clamp(r.rel + rint(4, 11));
      applyResult(g, { text:`You took ${r.name} to the cinema.`, stats:{ happiness:+6 }, kind:"good" });
      return ok();
    }
    case "trip": {
      const c = Math.round(rint(600, 4000) * g.country.mult);
      if (g.money < c) return fail(`A trip together would cost about ${money(g, c)}.`);
      g.money -= c;
      r.rel = clamp(r.rel + rint(12, 25));
      applyResult(g, { text:`You took a trip with ${r.name}. It did you both good.`, stats:{ happiness:+14 }, kind:"good" });
      return ok();
    }
    case "gift": {
      const cost = rint(50, 900);
      if (g.money < cost) return fail("You can't afford a decent gift.");
      r.rel = clamp(r.rel + rint(8, 20));
      applyResult(g, { text:`You bought ${r.name} a gift worth ${money(g, cost)}.`, money:-cost, stats:{ happiness:+5 }, kind:"good" });
      return ok();
    }
    case "givemoney": {
      const amt = afford(g, rint(200, 5000));
      if (amt < 100) return fail("You've got nothing to give.");
      r.rel = clamp(r.rel + rint(10, 22));
      applyResult(g, { text:`You gave ${r.name} ${money(g, amt)}.`, money:-amt, stats:{ happiness:+4 }, kind:"good" });
      return ok();
    }
    case "askmoney": {
      if (r.rel < 45) { r.rel = clamp(r.rel - 8); return fail(`${r.name} refused and seemed offended you asked.`); }
      const amt = rint(100, 5000);
      r.rel = clamp(r.rel - rint(3, 10));
      applyResult(g, { text:`${r.name} lent you ${money(g, amt)}.`, money:+amt, kind:"good" });
      return ok();
    }
    case "argue": {
      r.rel = clamp(r.rel - rint(6, 16));
      applyResult(g, { text:`You had a blazing argument with ${r.name}.`, stats:{ happiness:-6 }, kind:"bad" });
      return ok();
    }
    case "insult": {
      r.rel = clamp(r.rel - rint(10, 25));
      applyResult(g, { text:`You insulted ${r.name}. They did not take it well.`, stats:{ happiness:-4 }, kind:"bad" });
      return ok();
    }
    case "cutoff": {
      r.alive = false; r.type = "cutoff";
      applyResult(g, { text:`You cut ${r.name} out of your life entirely.`, stats:{ happiness:-8 }, kind:"bad" });
      return ok();
    }
    case "open": {
      if (r.type !== "partner") return fail("That isn't a partner.");
      if (r.secret) return fail("You'd have to tell them about the others first.");
      if (r.poly) return fail(`${r.name} is already happy with an open relationship.`);
      const odds = 0.20 + r.rel / 220 + (g.stats.smarts - 50) / 500;
      if (chance(odds)) {
        r.poly = true;
        applyResult(g, { text:`You and ${r.name} agreed to open the relationship. It took a long conversation.`,
          stats:{ happiness:+8 }, kind:"good" });
      } else {
        r.rel = clamp(r.rel - rint(10, 25));
        applyResult(g, { text:`You asked ${r.name} about opening the relationship. It did not go well.`,
          stats:{ happiness:-14 }, kind:"bad" });
      }
      return ok();
    }
    case "confess": {
      if (!r.secret) return fail("There's nothing to confess.");
      const others = openPartners(g);
      if (!others.length) { r.secret = false; applyResult(g, { text:`You stopped hiding ${r.name}.`, stats:{ happiness:+6 } }); return ok(); }
      const wronged = pick(others);
      wronged.rel = clamp(wronged.rel - rint(20, 45));
      if (chance(wronged.poly ? 0.75 : 0.35)) {
        r.secret = false; r.poly = true; wronged.poly = true;
        applyResult(g, { text:`You told ${wronged.name} about ${r.name}. Astonishingly, you all came to an arrangement.`,
          stats:{ happiness:+10 }, kind:"good" });
      } else {
        applyResult(g, { text:`You told ${wronged.name} about ${r.name}. They walked out.`, stats:{ happiness:-24 }, kind:"bad" });
        wronged.type = "ex";
        if (wronged.spouse) { g.married = false; wronged.spouse = false; }
        r.secret = false;
      }
      return ok();
    }
    case "propose": {
      if (r.type !== "partner") return fail("You're not dating them.");
      if (spouse(g)) return fail(`You're already married to ${spouse(g).name}.`);
      if (r.secret) return fail("You can hardly propose to someone you're hiding.");
      if (chance(0.15 + r.rel / 150 + (g.money > 20000 ? 0.1 : 0))) {
        g.married = true; r.spouse = true;
        r.rel = clamp(r.rel + 15);
        const cost = afford(g, rint(3000, 40000));
        applyResult(g, { text:`💍 ${r.name} said yes! The wedding cost ${money(g, cost)}.`, money:-cost, stats:{ happiness:+30 }, kind:"good", fx:"love" });
      } else {
        r.rel = clamp(r.rel - 15);
        applyResult(g, { text:`You proposed to ${r.name}. They said no.`, stats:{ happiness:-25 }, kind:"bad" });
      }
      return ok();
    }
    case "breakup": {
      if (r.type !== "partner") return fail("You're not dating them.");
      r.type = "ex";
      if (r.spouse) { g.married = false; r.spouse = false; }
      applyResult(g, { text:`You broke up with ${r.name}.`, stats:{ happiness:-12 }, kind:"bad" });
      return ok();
    }
    case "baby": {
      if (r.type !== "partner") return fail("You need a partner.");
      if (g.age > 55) return fail("That ship has sailed, biologically.");
      if (r.rel < 50) return fail(`${r.name} isn't interested in having a child with you right now.`);
      if (chance(0.55)) newChild(g, r, "had");
      else applyResult(g, { text:"You tried for a baby this year. No luck yet.", stats:{ happiness:-2 } });
      return ok();
    }
    case "ivf": {
      if (r.type !== "partner") return fail("You need a partner.");
      const cost = Math.round(14000 * g.country.mult);
      if (g.money < cost) return fail(`Fertility treatment costs ${money(g, cost)}.`);
      g.money -= cost;
      if (chance(0.55)) newChild(g, r, "had");
      else applyResult(g, { text:"The fertility treatment didn't take this time.", stats:{ happiness:-14 }, kind:"bad" });
      return ok();
    }
  }
  return fail("Unknown action.");
}


/* Start something on the side. Cheap thrill, real risk. */
export function takeLover(g) {
  if (g.age < 18) return fail("You're too young for that.");
  if (g.prison) return fail("Not from in here.");
  if (!openPartners(g).length) return fail("You've nobody to be unfaithful to. Just date them.");
  if (!useAction(g, "affair")) return fail("Once a year, even for you.");

  const odds = 0.30 + g.stats.looks / 260 + (g.money > 200000 ? 0.08 : 0) + g.fame / 400;
  if (!chance(Math.min(0.85, odds))) {
    applyResult(g, { text:"You tried to start something on the side and got nowhere.", stats:{ happiness:-5 } });
    return ok();
  }
  const p = mkRel("partner", g.gender === "male" ? "female" : "male", null, Math.max(18, g.age + rint(-10, 10)));
  p.rel = rint(50, 85);
  p.secret = true;
  p.years = 0;
  g.rels.push(p);
  applyResult(g, { text:`🤫 You started seeing ${p.name} behind ${openPartners(g).map(x => x.name).join(" and ")}'s back.`,
    stats:{ happiness:+14 } });
  return ok();
}

/* Adoption agencies have far more applicants than newborns, so the younger the
   child you ask for, the longer the queue and the higher the fee. Older children
   are easier to be matched with, and arrive already attached to someone else. */
export const ADOPT_BANDS = [
  { id:"baby",    name:"A Newborn",      emoji:"👶", age:[0, 1],   odds:0.38, cost:26000,
    sub:"Years on a waiting list. The hardest match to get" },
  { id:"toddler", name:"A Toddler",      emoji:"🧒", age:[2, 4],   odds:0.55, cost:18000,
    sub:"Still a long queue, but a shorter one" },
  { id:"child",   name:"A Young Child",  emoji:"🧑", age:[5, 11],  odds:0.78, cost:12000,
    sub:"Far more children waiting than families" },
  { id:"teen",    name:"A Teenager",     emoji:"🧑‍🎓", age:[12, 16], odds:0.90, cost:8000,
    sub:"Almost always approved. They may take years to warm to you" },
];

export function adoptCost(g, bandId) {
  const b = ADOPT_BANDS.find(x => x.id === bandId) || ADOPT_BANDS[2];
  return Math.round(b.cost * g.country.mult);
}

function clampNum(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
export function adopt(g, bandId, wantGender) {
  if (g.age < 21) return fail("You're too young to adopt.");
  const b = ADOPT_BANDS.find(x => x.id === bandId);
  if (!b) return fail("Choose the age of the child you're hoping for.");
  const cost = adoptCost(g, b.id);
  if (g.money < cost) return fail(`Adopting ${b.name.toLowerCase()} costs about ${money(g, cost)} in fees.`);
  if (g.criminalRecord > 1) return fail("Your criminal record disqualified your application.");
  g.money -= cost;

  /* Asking for a specific sex narrows the pool, so it costs you some odds. */
  const specific = wantGender === "male" || wantGender === "female";
  let odds = b.odds - (specific ? 0.12 : 0);
  if (spouse(g)) odds += 0.08;
  if (g.money > 400000 * g.country.mult) odds += 0.05;
  if (g.criminalRecord === 1) odds -= 0.15;

  if (!chance(clampNum(odds, 0.05, 0.95))) {
    applyResult(g, { text:`Your application to adopt ${b.name.toLowerCase()} was turned down. The ${money(g, cost)} in fees is not refundable.`,
      stats:{ happiness:-16 }, kind:"bad" });
    return ok();
  }
  const gen = specific ? wantGender : pick(["male", "female"]);
  const kid = mkRel("child", gen, g.last, rint(b.age[0], b.age[1]));
  kid.adopted = true;
  /* Older children arrive with a history; they need time before they trust you. */
  kid.rel = kid.age >= 12 ? rint(28, 48) : kid.age >= 5 ? rint(48, 68) : rint(70, 88);
  g.rels.push(kid);
  applyResult(g, { text:`👶 You adopted ${gen === "male" ? "a boy" : "a girl"}, ${kid.name}, age ${kid.age}. Fees came to ${money(g, cost)}.${
      kid.rel < 50 ? ` ${kid.name} is wary of you — that will take years, not months.` : ""}`,
    stats:{ happiness:+22 }, kind:"good" });
  return ok();
}

/* ---------- assets ---------- */
function ageAssets(g) {
  for (const h of g.assets.houses) {
    h.value = Math.round(h.value * (1 + rint(-4, 9) / 100));
    g.money -= Math.round(h.value * 0.012);
  }
  /* Most vehicles bleed value; the collectibles in CARS carry a positive
     `dep` and quietly beat the market instead. Anything past a million also
     costs real money to keep — crew, hangarage, insurance. */
  for (const c of g.assets.cars) {
    const def = CARS.find(x => x.name === c.name);
    const dep = def && typeof def.dep === "number" ? def.dep : -0.12;
    c.value = Math.round(c.value * (1 + dep + gauss() * 0.02));
    if (c.value > 1000000) g.money -= Math.round(c.value * 0.022);
    c.age++;
  }
  for (const l of g.assets.luxury) {
    const def = LUXURY.find(x => x.name === l.name);
    l.value = Math.round(l.value * (1 + (def ? def.app : 0) + gauss() * 0.04));
    if (l.value > 5000000) g.money -= Math.round(l.value * 0.004);   // vault, guards, humidity
    l.age++;
  }
  ageEmpire(g);
  ageStake(g);
  if (g.assets.houses.length && g.money < 0) line(g, "You're behind on your property bills.", "bad");
}

/* Trophy holdings are going concerns, not ornaments: every year each one
   throws off (or burns) cash and its valuation moves. Reported as one summary
   line so an empire of eight doesn't bury the rest of the year. */
const EMPIRE_NEWS = {
  up:   ["had the year of its life", "beat every forecast", "was written up as the deal of the decade",
         "printed money", "doubled its best-ever year"],
  down: ["haemorrhaged money all year", "was a disaster from January", "made the business pages for the wrong reasons",
         "needed a rescue you had to fund yourself", "was described in print as a vanity project"],
};
function ageEmpire(g) {
  const held = g.assets.empire || [];
  if (!held.length) return;
  let net = 0, fame = 0, worst = null, best = null;
  for (const e of held) {
    const def = EMPIRE.find(x => x.id === e.eid) || {};
    const yl = def.yield || [-0.05, 0.10], dr = def.drift || [-0.06, 0.10];
    const rate  = yl[0] + Math.random() * (yl[1] - yl[0]);
    const drift = dr[0] + Math.random() * (dr[1] - dr[0]);
    const profit = Math.round(e.value * rate);
    e.value = Math.max(1000, Math.round(e.value * (1 + drift)));
    e.last = profit;                      // shown on the Assets sheet
    e.age++;
    net += profit;
    fame += def.fame || 0;
    if (!best  || drift > best.d)  best  = { e, d: drift };
    if (!worst || drift < worst.d) worst = { e, d: drift };
  }
  g.money += net;
  if (fame) g.fame = clamp(g.fame + fame);
  const what = held.length === 1 ? held[0].name : `${held.length} holdings`;
  line(g, net >= 0
    ? `${held.length === 1 ? held[0].emoji : "📈"} ${what} returned ${money(g, net)} this year.`
    : `${held.length === 1 ? held[0].emoji : "📉"} ${what} cost you ${money(g, -net)} to keep running.`,
    net >= 0 ? "good" : "bad");
  if (best && best.d > 0.14 && chance(0.55))
    line(g, `${best.e.emoji} ${best.e.name} ${pick(EMPIRE_NEWS.up)} — now worth ${money(g, best.e.value)}.`, "good");
  else if (worst && worst.d < -0.10 && chance(0.55))
    line(g, `${worst.e.emoji} ${worst.e.name} ${pick(EMPIRE_NEWS.down)} — down to ${money(g, worst.e.value)}.`, "bad");
}

/* A shareholding you did not ask for and cannot direct. It pays, it drifts,
   and it is a standing invitation to want more. */
function ageStake(g) {
  const st = g.stake;
  if (!st) return;
  const drift = -0.06 + Math.random() * 0.16;
  st.valuation = Math.max(1000, Math.round(st.valuation * (1 + drift)));
  const rate = 0.02 + Math.random() * 0.05;
  const paid = Math.round(st.valuation * rate * 0.72);
  if (st.inTrust && g.age < 18) {
    line(g, `${st.emoji} The trust took this year's ${money(g, paid)} from ${st.name}. You see none of it yet.`);
    st.held = (st.held || 0) + paid;
    return;
  }
  if (st.inTrust) {                       // eighteenth birthday, the trust opens
    st.inTrust = false;
    const held = st.held || 0;
    if (held > 0) { g.money += held; line(g, `${st.emoji} The trust opened. ${money(g, held)} of withheld dividends came to you at once.`, "good"); }
    st.held = 0;
  }
  g.money += paid;
  line(g, `${st.emoji} Your stake in ${st.name} paid ${money(g, paid)} in dividends.`, paid > 0 ? "good" : "");
}

function agePets(g) {
  for (const p of g.pets.slice()) {
    p.age++;
    if (p.life && p.age > p.life) {
      g.pets = g.pets.filter(x => x.id !== p.id);
      applyResult(g, { text:`${p.emoji} ${p.name} the ${p.kind.toLowerCase()} died of old age at ${p.age}.`, stats:{ happiness:-16 }, kind:"bad" });
    }
  }
}

/* "a Airship" and "a A Royal Palace" both read wrong. Names that already
   carry their own article keep it, lower-cased mid-sentence. */
const withArticle = n => /^(a|an|the) /i.test(n)
  ? n.replace(/^(A|An|The) /, m => m.toLowerCase())
  : `${an(n)} ${n}`;

const ASSET_SRC = { house: HOUSES, car: CARS, luxury: LUXURY, empire: EMPIRE };
const assetBucket = (g, kind) => {
  if (!g.assets.empire) g.assets.empire = [];        // old saves
  return kind === "house" ? g.assets.houses : kind === "car" ? g.assets.cars
       : kind === "empire" ? g.assets.empire : g.assets.luxury;
};

export function buyAsset(g, kind, index) {
  const src = ASSET_SRC[kind] || LUXURY;
  const bucket = assetBucket(g, kind);
  const item = src[index];
  if (!item) return fail("That isn't for sale.");
  const price = Math.round(item.price * g.country.mult);
  if (g.money < price) return fail(`You can't afford it. It costs ${money(g, price)}.`);
  g.money -= price;
  bucket.push({ id:nextId(), eid:item.id, name:item.name, emoji:item.emoji, value:price, bought:g.age, age:0 });
  const joy = kind === "empire" ? Math.min(26, 10 + Math.round(Math.log10(Math.max(10, item.price)) * 2)) : 10;
  applyResult(g, {
    text: `${item.emoji} You bought ${withArticle(item.name)} for ${money(g, price)}.${kind === "empire" ? " It's yours now." : ""}`,
    stats:{ happiness:+joy }, kind:"good" });
  if (kind === "empire" && item.fame) applyResult(g, { fame:+item.fame });
  if (kind === "house" && g.homeless) endHomelessness(g, "You have a roof of your own again.");
  else if (kind === "house" && g.withParents && g.age >= 18 && !g.education)
    moveOut(g, "You moved out of your parents' place and into your own.");
  return ok();
}

export function sellAsset(g, kind, id) {
  const arr = assetBucket(g, kind);
  const i = arr.findIndex(a => a.id === id);
  if (i < 0) return fail("You don't own that.");
  const a = arr[i];
  arr.splice(i, 1);
  g.money += a.value;
  applyResult(g, { text:`You sold your ${a.name} for ${money(g, a.value)}.`, kind:"good" });
  return ok();
}

/* ---------- legacy ----------
   Money you will never see again. It buys standing rather than an asset:
   permanent fame, a lasting lift in happiness, and a line in the obituary.
   Deliberately not sellable and deliberately not counted in net worth —
   giving it away is the point. */
export function buyLegacy(g, id) {
  if (!g.legacy) g.legacy = [];
  const item = LEGACY.find(x => x.id === id);
  if (!item) return fail("That isn't on offer.");
  if (g.legacy.some(x => x.id === id)) return fail(`You've already done that.`);
  const price = Math.round(item.price * g.country.mult);
  if (g.money < price) return fail(`That costs ${money(g, price)}. You're ${money(g, price - g.money)} short.`);
  g.legacy.push({ id:item.id, name:item.name, emoji:item.emoji, group:item.group, spent:price, at:g.age });
  applyResult(g, { text:`${item.emoji} ${item.done || item.blurb}.`, money:-price,
    stats:{ happiness:+item.happy }, fame:+item.fame, kind:"good" });

  if (item.effect === "citizenship") {
    const held = new Set([g.country.name, ...(g.citizenships || [])]);
    const dest = COUNTRIES.filter(c => !held.has(c.name));
    if (dest.length) {
      const c = pick(dest);
      g.citizenships = (g.citizenships || []).concat(c.name);
      line(g, `${c.flag} You are now a citizen of ${c.name}. No queue, no test.`, "good");
    }
  }
  return ok();
}

export function legacySpend(g) {
  return (g.legacy || []).reduce((s, x) => s + (x.spent || 0), 0);
}

export function buyPet(g, index) {
  const p = PETS[index];
  if (!p) return fail("No such pet.");
  const price = Math.round(p.price * g.country.mult);
  if (g.money < price) return fail(`You can't afford a ${p.name}.`);
  g.money -= price;
  g.pets.push({ id:nextId(), kind:p.name, emoji:p.emoji, name:petName(), age:0, life:rint(p.life[0], p.life[1]) });
  applyResult(g, { text:`${p.emoji} You adopted a ${p.name} and named them ${g.pets[g.pets.length - 1].name}.`, stats:{ happiness:+14 }, kind:"good" });
  return ok();
}

/* ---------- activities ---------- */
/* Some actions debit g.money directly rather than through applyResult, so the
   amount never reached the log. Wrap them and annotate whatever they printed. */
function withCostNote(g, fn) {
  const before = g.money;
  const yr0 = g.log[g.log.length - 1];
  const n0 = yr0 ? yr0.entries.length : 0;
  const res = fn();
  const spent = before - g.money;
  if (spent > 0) {
    const yr = g.log[g.log.length - 1];
    const added = yr ? yr.entries.slice(n0) : [];
    const last = added[added.length - 1];
    if (last && !last.text.includes(g.country.cur)) last.text += ` (\u2212${money(g, spent)})`;
  }
  return res;
}

export function activity(g, what) {
  /* A lifetime tally, so content can react to what you actually keep doing.
     g.acts is wiped every year and is no use for this. */
  if (!g.habits) g.habits = {};
  g.habits[what] = (g.habits[what] || 0) + 1;
  return withCostNote(g, () => _activity(g, what));
}
function _activity(g, what) {
  if (!g.alive) return fail("You're dead.");
  if (g.prison) return fail("You're in prison.");
  if (!useAction(g, "act_" + what)) return fail("You've already done that this year.");
  // Price comes from the ACTIVITIES table so the figure shown in the menu is
  // always the figure charged — they used to be defined in two places.
  const priceOf = id => {
    const a = ACTIVITIES.find(x => x.id === id);
    return Math.round((a && a.cost ? a.cost : 0) * g.country.mult);
  };
  const cost = n => Math.round(n * g.country.mult);
  const pay = () => { const c = priceOf(what); if (g.money < c) return null; g.money -= c; return c; };

  switch (what) {
    case "gym":
      if (pay() === null) return fail("You can't afford a gym membership.");
      applyResult(g, { text:"You spent the year training hard at the gym.", stats:{ health:+rint(5,12), looks:+rint(2,6), happiness:+3 }, kind:"good" }); return ok();
    case "meditate":
      applyResult(g, { text:"You meditated daily. Your mind quieted down.", stats:{ happiness:+rint(6,14), health:+2 }, kind:"good" }); return ok();
    case "library":
      applyResult(g, { text:"You read your way through the local library.", stats:{ smarts:+rint(4,10), happiness:+2 }, kind:"good" }); return ok();
    case "martial":
      if (pay() === null) return fail("You can't afford the classes.");
      applyResult(g, { text:`You trained in ${pick(["karate","judo","boxing","muay thai","jiu-jitsu"])}.`, stats:{ health:+rint(6,13), happiness:+6, smarts:+2 }, kind:"good" }); return ok();
    case "music":
      if (pay() === null) return fail("Lessons are beyond your budget.");
      applyResult(g, { text:`You took ${pick(["piano","guitar","violin","drum","singing"])} lessons.`, stats:{ smarts:+rint(3,8), happiness:+9 }, kind:"good" }); return ok();
    case "doctor": {
      const c = priceOf(what);
      if (g.money < c) return fail(`A check-up costs ${money(g, c)}. You can't afford it.`);
      g.money -= c;
      applyResult(g, { text:"You saw a doctor and followed the treatment plan.", stats:{ health:+rint(8,20) }, insuranceClaim:"health", kind:"good" }); return ok();
    }
    case "dentist":
      if (pay() === null) return fail("You can't afford the dentist.");
      applyResult(g, { text:"You had your teeth cleaned and a filling replaced.", stats:{ looks:+rint(2,6), health:+3 }, kind:"good" }); return ok();
    case "therapy":
      if (pay() === null) return fail("Therapy is beyond your budget right now.");
      applyResult(g, { text:"You saw a therapist every week. It helped more than you expected.", stats:{ happiness:+rint(12,24), smarts:+3 }, kind:"good" }); return ok();
    case "spa":
      if (pay() === null) return fail("You can't afford a spa day.");
      applyResult(g, { text:"You had a spa day and felt human again.", stats:{ looks:+rint(3,8), happiness:+10 }, kind:"good" }); return ok();
    case "surgery": {
      if (pay() === null) return fail(`Cosmetic surgery costs ${money(g, priceOf(what))}.`);
      if (chance(0.78)) applyResult(g, { text:"The surgery went well. You look noticeably better.", stats:{ looks:+rint(10,25), happiness:+8 }, kind:"good" });
      else applyResult(g, { text:"The surgery was botched. You look worse and you're in pain.", stats:{ looks:-rint(8,20), health:-12, happiness:-20 }, kind:"bad" });
      return ok();
    }
    case "tattoo": {
      if (pay() === null) return fail("You can't afford it.");
      const good = chance(0.7);
      applyResult(g, { text: good ? `You got a ${pick(["beautiful","striking","subtle"])} tattoo and love it.` : "You got a tattoo you immediately regretted.", stats:{ looks: good ? +rint(2,7) : -rint(3,9), happiness: good ? +8 : -8 } });
      return ok();
    }
    case "diet":
      applyResult(g, { text:"You went on a strict diet and stuck to it.", stats:{ health:+rint(4,10), looks:+rint(3,8), happiness:-4 }, kind:"good" }); return ok();

    case "vacation":
      return fail("Choose a destination.");
    case "party":
      if (pay() === null) return fail("You're too broke to go out.");
      applyResult(g, { text:"You went out and closed the place down.", stats:{ happiness:+rint(6,15), health:-rint(2,6), smarts:-1 } }); return ok();
    case "nightclub":
      if (pay() === null) return fail("You can't afford a night out.");
      applyResult(g, { text:`You spent the night at ${pick(["a warehouse rave","a rooftop bar","a basement club","an all-nighter"])}.`, stats:{ happiness:+rint(8,18), health:-rint(3,8) } }); return ok();
    case "cinema":
      if (pay() === null) return fail("You can't even afford a ticket.");
      applyResult(g, { text:`You saw ${pick(["a terrible blockbuster","a three-hour epic","an indie film you pretended to understand","a re-release"])}.`, stats:{ happiness:+rint(3,8) } }); return ok();
    case "concert":
      if (pay() === null) return fail("Tickets are beyond your budget.");
      applyResult(g, { text:"You saw a band you love live.", stats:{ happiness:+rint(8,18) }, kind:"good" }); return ok();
    case "hunting":
      if (pay() === null) return fail("You can't afford the trip.");
      applyResult(g, chance(0.6) ? { text:"You went hunting and came back with something.", stats:{ happiness:+9, health:+3 }, kind:"good" }
                                  : { text:"You went hunting and sat in the cold for two days.", stats:{ happiness:-4, health:-2 } }); return ok();
    case "fishing":
      if (pay() === null) return fail("You can't afford the gear.");
      applyResult(g, chance(0.55) ? { text:"You caught something worth photographing.", stats:{ happiness:+10 }, kind:"good" }
                                   : { text:"You caught nothing and enjoyed it anyway.", stats:{ happiness:+5 } }); return ok();
    case "skydive": {
      if (pay() === null) return fail("You can't afford a jump.");
      if (chance(0.985)) applyResult(g, { text:"🪂 You jumped out of a plane and lived. Incredible.", stats:{ happiness:+rint(15,28) }, kind:"good" });
      else { applyResult(g, { text:"🪂 Your parachute failed.", kind:"bad" }); die(g, "a skydiving accident"); }
      return ok();
    }
    case "volunteer":
      applyResult(g, { text:`You volunteered at ${pick(["a food bank","an animal shelter","a hospice","a youth centre"])} all year.`, stats:{ happiness:+rint(8,16), smarts:+2 }, kind:"good" }); return ok();
    case "protest": {
      if (chance(0.12)) { applyResult(g, { text:"You joined a protest and were arrested in a kettle.", stats:{ happiness:-8 }, kind:"bad" });
                          arrest(g, "public disorder", [1, 1]); }
      else applyResult(g, { text:"You marched for something you believe in.", stats:{ happiness:+11 }, kind:"good" });
      return ok();
    }
    case "emigrate":
      return fail("Choose where you're going.");

    case "date":
      return fail("Open the dating app and pick someone.");
    case "hookup": {
      if (g.age < 18) return fail("You're too young for that.");
      if (chance(0.35 + g.stats.looks / 200)) {
        applyResult(g, { text:"You had a memorable one-night thing.", stats:{ happiness:+rint(6,14) } });
        if (chance(0.06) && g.age < 45) newChild(g, null, "unexpectedly had");
      } else applyResult(g, { text:"You struck out completely.", stats:{ happiness:-6 } });
      return ok();
    }
    case "blinddate": {
      if (g.age < 18) return fail("You're too young for that.");
      if (!canDateOpenly(g)) {
        const jealous = openPartners(g).find(r => !r.poly);
        return fail(`${jealous.name} wouldn't be happy about that.`);
      }
      if (chance(0.4)) {
        const p = mkRel("partner", g.gender === "male" ? "female" : "male", null, Math.max(18, g.age + rint(-6, 10)));
        p.rel = rint(50, 80);
        g.rels.push(p);
        applyResult(g, { text:`A friend set you up with ${p.name}. It actually worked.`, stats:{ happiness:+13 }, kind:"good" });
      } else applyResult(g, { text:"The blind date was excruciating for both of you.", stats:{ happiness:-8 } });
      return ok();
    }
  }
  return fail("Unknown activity.");
}


/* ============================================================
   VICE — every entry point re-checks the 18+ gate itself, so nothing
   here is reachable by a child character or with the switch off.
   ============================================================ */
function viceAllowed(g) { return adultMode() && g.age >= 18; }

export function useDrug(g, id) {
  if (!viceAllowed(g)) return fail("Not available.");
  if (g.prison) return fail("Not in here — though people manage.");
  const d = DRUGS.find(x => x.id === id);
  if (!d) return fail("Unknown.");
  if (!useAction(g, "drug_" + id, 2)) return fail("Twice a year is enough of that one.");
  if (!g.flags) g.flags = {};
  g.flags.usedDrugs = true;          // so "your dealer" means you have one

  const price = Math.round(d.price * g.country.mult * rint(80, 140) / 100);
  if (g.money < price) return fail(`You couldn't scrape together the ${money(g, price)}.`);
  g.money -= price;

  // caught holding
  if (chance(d.bust * (1 + g.criminalRecord * 0.05))) {
    applyResult(g, { text: `${d.emoji} You were stopped and searched holding ${d.name.toLowerCase()}.`, kind:"bad" });
    arrest(g, `possession of ${d.name.toLowerCase()}`, d.addict > 0.3 ? [2, 6] : [1, 3]);
    return ok();
  }

  const hooked = chance(d.addict * (g.addiction ? 1.6 : 1));
  const bad = chance(0.06 + d.health[1] / 260);

  if (bad) {
    applyResult(g, { text: `${d.emoji} The ${d.name.toLowerCase()} went badly wrong. You woke up in resus with a tube in your arm.`,
      money: 0, stats: { health: -rint(20, 40), happiness: -14 }, kind:"bad" });
    if (g.stats.health <= 6) { die(g, `an overdose`); return ok(); }
  } else {
    applyResult(g, { text: `${d.emoji} You paid ${money(g, price)} for ${d.name.toLowerCase()} and had a night you'll mostly remember.`,
      stats: { happiness: +rint(d.high[0], d.high[1]), health: -rint(d.health[0], d.health[1]) } });
  }
  if (hooked) {
    addict(g, d.id === "weed" ? "weed" : "drugs");
    line(g, `You've started needing it more often than you'd admit.`, "bad");
  }
  return ok();
}

export function dealDrug(g, id) {
  if (!viceAllowed(g)) return fail("Not available.");
  if (g.prison) return fail("You're inside.");
  const d = DRUGS.find(x => x.id === id);
  if (!d) return fail("Unknown.");
  const spree = (g.acts && g.acts.deal) || 0;
  useAction(g, "deal", 999);

  const stake = Math.round(d.price * 12 * g.country.mult);
  if (g.money < stake) return fail(`You'd need ${money(g, stake)} up front to make it worth doing.`);
  g.money -= stake;

  let risk = d.bust * 1.5 + spree * 0.07 + Math.min(0.2, g.criminalRecord * 0.02) - (g.stats.smarts - 50) / 500;
  if (g.mafia) risk -= 0.06;
  risk = Math.max(0.05, Math.min(0.95, risk));

  if (chance(risk)) {
    arrest(g, `dealing ${d.name.toLowerCase()}`, [3 + Math.round(d.addict * 8), 10 + Math.round(d.addict * 14)]);
    return ok();
  }
  const take = Math.round(rint(d.deal[0], d.deal[1]) * g.country.mult);
  g.criminalRecord += chance(0.15) ? 1 : 0;
  applyResult(g, { text: `${d.emoji} You moved a quantity of ${d.name.toLowerCase()} and cleared ${money(g, take)}.`,
    money: +take, stats: { happiness: +6 }, kind:"good" });
  return ok();
}

/* Selling sex. Money against danger, stigma and the law. */
export function sexWork(g, tierId) {
  if (!viceAllowed(g)) return fail("Not available.");
  if (g.prison) return fail("You're inside.");
  const t = SEXWORK.find(x => x.id === tierId);
  if (!t) return fail("Unknown.");
  if (t.id === "agency" && g.stats.looks < 65) return fail("The agency turned you down.");
  if (t.id === "escort" && g.stats.looks < 45) return fail("You didn't get any bookings.");
  if (!useAction(g, "sexwork", 3)) return fail("You've worked enough this year.");
  /* Remembered so the events written around this work can require it. Without
     it, "a booking has walked in" turned up for accountants. */
  if (!g.flags) g.flags = {};
  g.flags.soldsex = true;

  if (chance(t.risk)) {
    if (chance(0.55)) { arrest(g, "soliciting", [1, 2]); return ok(); }
    applyResult(g, { text: `${t.emoji} A client turned nasty and you got hurt.`,
      stats: { health: -rint(t.harm[0] * 2, t.harm[1] * 2), happiness: -20 }, kind:"bad" });
    if (g.stats.health <= 4) { die(g, "an assault by a client"); return ok(); }
    return ok();
  }

  const pay = Math.round(rint(t.pay[0], t.pay[1]) * g.country.mult * (1 + (g.stats.looks - 50) / 160));
  applyResult(g, { text: `${t.emoji} A season of ${t.name.toLowerCase()} brought in ${money(g, pay)}.`,
    money: +pay, stats: { health: -rint(t.harm[0], t.harm[1]), happiness: -rint(2, t.stigma) }, kind:"good" });
  if (chance(0.10)) applyResult(g, { text: "You picked something up and needed a course of antibiotics.",
    stats: { health: -rint(6, 14), happiness: -8 }, kind:"bad" });
  return ok();
}

/* Paying for it, rather than being paid. */
export function buyVice(g, what) {
  if (!viceAllowed(g)) return fail("Not available.");
  if (g.prison) return fail("You're inside.");
  if (!useAction(g, "vice_" + what, 2)) return fail("Twice a year is plenty.");
  const cost = n => Math.round(n * g.country.mult * rint(70, 150) / 100);

  if (what === "strip") {
    const c = priceOf(what);
    if (g.money < c) return fail("You couldn't afford the door, let alone the rest.");
    g.money -= c;
    applyResult(g, { text: `You spent ${money(g, c)} in a strip club and remember roughly half of it.`,
      stats: { happiness: +rint(6, 16), health: -3 } });
    return ok();
  }
  if (what === "escort") {
    const c = priceOf(what);
    if (g.money < c) return fail(`You'd need about ${money(g, c)}.`);
    g.money -= c;
    if (chance(0.10)) { applyResult(g, { text: `It was a sting. You were arrested in the hotel corridor.`, kind:"bad" });
      arrest(g, "kerb crawling", [1, 2]); return ok(); }
    applyResult(g, { text: `You paid ${money(g, c)} for company for the evening.`,
      stats: { happiness: +rint(8, 18), health: -rint(0, 4) } });
    if (chance(0.08)) applyResult(g, { text: "You caught something and had to explain it to a doctor.",
      stats: { health: -rint(6, 14), happiness: -10 }, kind:"bad" });
    if (g.married && chance(0.18)) {
      const p = g.rels.find(r => r.type === "partner" && r.alive);
      applyResult(g, { text: `${p ? p.name : "Your partner"} found the receipt.`, stats: { happiness: -24 },
        relAdj: p ? { id: p.id, d: -40 } : null, divorce: chance(0.5), kind:"bad" });
    }
    return ok();
  }
  return fail("Unknown.");
}


/* ---------- destinations you choose for yourself ---------- */
export const HOLIDAYS = [
  { id:"beach",   name:"A Fortnight on a Beach", emoji:"🏖️", cost: 3500, happy:[14,26], health:+5 },
  { id:"city",    name:"City Break",             emoji:"🏙️", cost: 1800, happy:[8,18],  health:+1, smarts:+3 },
  { id:"safari",  name:"Safari",                 emoji:"🦁", cost: 9000, happy:[20,34], health:+3, fame:1 },
  { id:"ski",     name:"Skiing",                 emoji:"🎿", cost: 6000, happy:[14,26], health:+6 },
  { id:"backpack",name:"Backpacking",            emoji:"🎒", cost: 2200, happy:[16,30], health:-2, smarts:+7 },
  { id:"cruise",  name:"A Cruise",               emoji:"🛳️", cost: 5200, happy:[12,24], health:+4 },
  { id:"road",    name:"A Road Trip",            emoji:"🚐", cost: 1200, happy:[10,22], health:+2 },
  { id:"retreat", name:"A Silent Retreat",       emoji:"🧘", cost: 2600, happy:[6,30],  health:+8, smarts:+5 },
];

export function goOnHoliday(g, id) {
  if (g.prison) return fail("You're in prison.");
  if (!useAction(g, "act_vacation")) return fail("You've already had a holiday this year.");
  const h = HOLIDAYS.find(x => x.id === id);
  if (!h) return fail("Pick a destination.");
  const price = Math.round(h.cost * g.country.mult);
  if (g.money < price) return fail(`That costs ${money(g, price)}.`);
  g.money -= price;
  const where = pick(HOLIDAY_PLACES[id] || ["somewhere warm"]);
  applyResult(g, { text:`${h.emoji} You went ${h.id === "cruise" ? "on a cruise around" : "to"} ${where}. ${money(g, price)}.`,
    stats:{ happiness:+rint(h.happy[0], h.happy[1]), health:h.health || 0, smarts:h.smarts || 0 },
    fame: h.fame || 0, kind:"good" });
  return ok();
}

const HOLIDAY_PLACES = {
  beach:["Bali","the Amalfi coast","Zanzibar","Phuket","the Algarve","Tulum"],
  city:["Lisbon","Tokyo","Berlin","New York","Marrakesh","Buenos Aires"],
  safari:["the Serengeti","Kruger","the Okavango Delta","Maasai Mara"],
  ski:["Niseko","Chamonix","Whistler","Val d'Isère","Queenstown"],
  backpack:["southeast Asia","South America","the Balkans","west Africa"],
  cruise:["the Mediterranean","the Norwegian fjords","the Caribbean","the Baltic"],
  road:["the coast","the outback","Route 66","the Highlands"],
  retreat:["a monastery in Kyoto","a hut in the Pyrenees","a centre in Rishikesh"],
};

/* Emigration: cost is charged in the money you have now, before the move. */
export function emigrateCost(g) { return Math.round(5000 * g.country.mult); }

export function emigrateTo(g, countryName) {
  if (g.prison) return fail("You're in prison.");
  if (!useAction(g, "act_emigrate")) return fail("One move a year.");
  const dest = COUNTRIES.find(c => c.name === countryName);
  if (!dest) return fail("Unknown country.");
  if (dest.name === g.country.name) return fail("You already live there.");
  const price = emigrateCost(g);
  if (g.money < price) return fail(`Relocating costs ${money(g, price)}.`);
  g.money -= price;
  const from = g.country.name;
  g.country = dest; g.city = pick(dest.city); g.movedAt = g.age;
  if (g.job) { g.job = null; g.yearsInJob = 0; line(g, "You left your job behind."); }
  applyResult(g, { text:`✈️ You emigrated from ${from} to ${g.city}, ${dest.name}. ${money(g, price)}.`,
    stats:{ happiness:+10 }, kind:"good" });
  return ok();
}

/* Choose your branch rather than being assigned one. */
export function enlist(g, branchId) {
  const br = SY.BRANCHES.find(b => b.id === branchId);
  if (!br) return fail("Pick a branch.");
  g.branch = br.id;
  const r = auditionFor(g, "military");
  if (r && r.ok === false) g.branch = null;
  return r;
}

/* Choose which family takes you in. */
export function joinMafiaFamily(g, family) {
  g.__wantFamily = family;
  return joinMafia(g);
}


/* ============================================================
   DATING APP — you see who's actually on there and choose, rather than
   being handed whoever the game felt like. The profiles are generated
   once per year and cached on the save, so scrolling the list doesn't
   reshuffle it; they refresh when you age up.
   ============================================================ */
const DATE_TRAITS = [
  "loves hiking", "in a band", "two dogs", "vegan", "very online", "runs marathons",
  "a bit of a gym rat", "reads constantly", "wants kids soon", "not looking for anything serious",
  "recently divorced", "career-obsessed", "travels for work", "still lives with parents",
  "owns their own place", "into astrology", "plays too much video game", "a keen cook",
  "loves a night out", "teetotal", "has a kid already", "studying part-time",
];

export function datingWhy(g) {
  if (g.age < 16) return "You're too young for that.";
  if (g.prison) return "There's no signal in here.";
  if (!canDateOpenly(g)) {
    const jealous = openPartners(g).find(r => !r.poly);
    return `${jealous.name} wouldn't be happy about that. Open the relationship first, or go behind their back with Take a Lover.`;
  }
  return null;
}

/* Each profile carries its own odds, so the trade-off is visible: the
   best-looking, wealthiest people on there are the least likely to reply. */
export function datingProfiles(g) {
  if (datingWhy(g)) return [];
  if (g.__dating && g.__dating.year === g.age) return g.__dating.list;

  const list = [];
  for (let i = 0; i < 5; i++) {
    const gen = chance(0.5) ? "male" : "female";
    const p = mkRel("partner", gen, null, Math.max(16, g.age + rint(-9, 9)));
    p.looks  = clamp(rint(20, 96));
    p.wealth = pick(["broke", "getting by", "getting by", "comfortable", "well off", "seriously wealthy"]);
    p.trait  = pick(DATE_TRAITS);
    p.rel    = rint(50, 80);

    /* Their standards rise with their looks and money; yours matter too. */
    let odds = 0.62
      - (p.looks - 50) / 170
      - (p.wealth === "seriously wealthy" ? 0.18 : p.wealth === "well off" ? 0.08 : 0)
      + (g.stats.looks - 50) / 200
      + g.fame / 300
      + (g.money > 500000 * g.country.mult ? 0.10 : g.money > 50000 * g.country.mult ? 0.04 : 0)
      - Math.abs(p.age - g.age) / 120;
    p.odds = Math.round(Math.max(0.05, Math.min(0.92, odds)) * 100);
    list.push(p);
  }
  g.__dating = { year: g.age, list };
  return list;
}

export function dateProfile(g, id) {
  const why = datingWhy(g);
  if (why) return fail(why);
  if (!useAction(g, "dating", 3)) return fail("You've swiped enough for one year.");
  const list = datingProfiles(g);
  const p = list.find(x => String(x.id) === String(id));
  if (!p) return fail("That profile is gone.");

  /* Whatever happens, they come off the list — you can't retry the same person. */
  g.__dating.list = list.filter(x => x !== p);

  if (!chance(p.odds / 100)) {
    applyResult(g, { text:`You messaged ${p.name}. ${pick(["No reply.", "Left on read.", "They unmatched you.", "They replied once, then nothing."])}`,
      stats:{ happiness:-5 }, kind:"bad" });
    return ok();
  }
  delete p.looks; delete p.wealth; delete p.trait; delete p.odds;
  p.poly = openPartners(g).length > 0;
  g.rels.push(p);
  applyResult(g, { text:`❤️ You matched with ${p.name}, ${p.age}, and started dating${p.poly ? ", openly alongside the others" : ""}.`,
    stats:{ happiness:+15 }, kind:"good" });
  return ok();
}

/* ---------- casino ---------- */
export function casino(g, gameId, stake) {
  if (g.prison) return fail("There's no casino in here.");
  const game = CASINO.find(c => c.id === gameId);
  if (!game) return fail("Unknown game.");
  stake = Math.round(stake);
  if (stake <= 0) return fail("Pick an amount.");
  if (g.money < stake) return fail("You don't have that much.");

  const edge = game.skill ? Math.min(0.06, game.skill * (g.stats.smarts - 50) / 100) : 0;
  const win = Math.random() < game.win + edge;
  if (win) {
    const mult = game.pay[0] + Math.random() * (game.pay[1] - game.pay[0]) * (Math.random() < 0.12 ? 1 : 0);
    const gain = Math.round(stake * mult) - stake;
    applyResult(g, { text:`${game.emoji} You staked ${money(g, stake)} on ${game.name} and won ${money(g, gain)}.`, money:+gain, stats:{ happiness:+8 }, kind:"good" });
  } else {
    applyResult(g, { text:`${game.emoji} You staked ${money(g, stake)} on ${game.name} and lost it.`, money:-stake, stats:{ happiness:-10 }, kind:"bad" });
  }
  return ok();
}

/* ---------- crime & prison ---------- */
function arrest(g, crimeName, sentence) {
  const minor = g.age < 18;
  let yrs = rint(sentence[0], sentence[1]);

  if (minor) {
    // A juvenile sentence is shorter and can't run past your 18th birthday.
    yrs = Math.max(1, Math.min(yrs, 18 - g.age, 4));
    g.juvieRecord = (g.juvieRecord || 0) + 1;
    g.prison = { yearsLeft:yrs, total:yrs, crime:crimeName, juvenile:true };
    g.education = null;
    line(g, `🚓 You were sentenced to ${yrs} year${yrs > 1 ? "s" : ""} in juvenile detention for ${crimeName.toLowerCase()}.`, "bad", "police");
    applyResult(g, { stats:{ happiness:-24 } });
    return;
  }

  g.criminalRecord++;
  g.prison = { yearsLeft:yrs, total:yrs, crime:crimeName };
  g.job = null; g.special = null; g.education = null;
  line(g, `🚓 You were sentenced to ${yrs} year${yrs > 1 ? "s" : ""} in prison for ${crimeName.toLowerCase()}.`, "bad", "police");
  applyResult(g, { stats:{ happiness:-30 } });
}

/* A juvenile record stops counting against you once it is sealed at 18. */
export function recordAgainstYou(g) {
  return g.criminalRecord + (g.age < 18 ? (g.juvieRecord || 0) : 0);
}

export function commitCrime(g, crimeId) {
  if (g.prison) return fail("You're already inside.");
  const c = CRIMES.find(x => x.id === crimeId);
  if (!c) return fail("Unknown crime.");
  if (g.age < 10) return fail("You're a literal child.");

  // Commit as many as you like — but every job this year draws more heat,
  // and a record makes the police look at you first.
  const spree = g.acts && g.acts.crime ? g.acts.crime : 0;
  useAction(g, "crime", 999);

  let risk = c.risk - (g.stats.smarts - 50) / (c.smartCrime ? 250 : 400);
  if (g.gang) risk -= 0.05;
  const arch = ARCH.archetypeById(g.archetype);
  if (arch && arch.crime) risk -= arch.crime * 0.35;   // knows how these things work
  risk += spree * 0.09;                                  // heat from this year's spree
  risk += Math.min(0.18, g.criminalRecord * 0.025);      // known to the police
  risk = Math.max(0.05, Math.min(0.97, risk));

  if (chance(risk)) {
    // Prison is the normal outcome, and repeat offenders rarely get a fine.
    const jailChance = Math.min(0.96, 0.82 + g.criminalRecord * 0.04 + spree * 0.03);
    if (chance(jailChance)) {
      const harsher = Math.min(6, Math.floor(g.criminalRecord / 2));
      arrest(g, c.name, [c.sentence[0] + harsher, c.sentence[1] + harsher]);
    } else {
      g.criminalRecord++;
      const fine = Math.round(rint(200, 8000) * g.country.mult);
      applyResult(g, { text:`🚓 You were caught but got off with a ${money(g, fine)} fine.${
        g.money < fine ? " You didn't have it, so you owe it." : ""}`, money:-fine, stats:{ happiness:-15 }, kind:"bad" });
    }
  } else {
    const take = Math.round(rint(c.min, c.max) * g.country.mult);
    if (take > 0) applyResult(g, { text:`You pulled off ${c.name.toLowerCase()} and got away with ${money(g, take)}.`, money:+take, stats:{ happiness:+6 }, kind:"good" });
    else applyResult(g, { text:`You got away with ${c.name.toLowerCase()}. No money in it, but a rush.`, stats:{ happiness:+8 } });
  }
  return ok();
}

const JUVIE_FLAVOUR = [
  "You got in a fight in the yard and lost privileges for a month.",
  "You sat through the mandatory schooling and learned something despite yourself.",
  "A key worker took an interest in you. It helped more than you'd admit.",
  "You made a friend in here you'll regret knowing later.",
  "You kept your head down and counted the days.",
  "You were put on the anger management programme.",
];
function servePrisonYear(g) {
  const juv = !!g.prison.juvenile;
  g.prison.yearsLeft--;
  g.stats.happiness = clamp(g.stats.happiness - rint(2, juv ? 6 : 8));
  g.stats.health = clamp(g.stats.health - rint(0, juv ? 3 : 5));
  if (juv && chance(0.35)) g.stats.smarts = clamp(g.stats.smarts + rint(0, 2));
  if (chance(juv ? 0.4 : 0.2)) line(g, juv ? pick(JUVIE_FLAVOUR) : pick([
    "You got in a fight in the yard.",
    "You spent the year in the prison library.",
    "You joined the prison kitchen crew.",
    "A guard took a disliking to you.",
    "You kept your head down and did your time.",
    "You earned a qualification through the education programme.",
  ]));
  if (g.prison.yearsLeft <= 0) {
    line(g, juv
      ? `🔓 You were released from juvenile detention. Your record will be sealed when you turn 18.`
      : `🔓 You were released from prison after serving your sentence for ${g.prison.crime.toLowerCase()}.`, "good");
    g.prison = null; g.gang = null;
    // Release doesn't mean the street — minors go home, and anyone with family
    // usually gets a sofa first.
    const kinAtHome = g.rels.some(r => r.alive && (r.type === "mother" || r.type === "father"));
    if (g.age < 18 && kinAtHome) {
      g.withParents = true;
      line(g, "You went back to your parents' place.");
    } else if (!g.assets.houses.length && g.money < 2000 * g.country.mult && g.age >= 18) {
      if (!softLanding(g)) becomeHomeless(g, "You walked out with nothing and nowhere to go.");
    }
    applyResult(g, { stats:{ happiness:+15 } });
  } else {
    line(g, `You served another year in ${juv ? "juvenile detention" : "prison"}. ${g.prison.yearsLeft} year${g.prison.yearsLeft > 1 ? "s" : ""} remaining.`, "bad");
  }
  ageRelationships(g);
  ageBody(g);
}

export function prisonAction(g, what) {
  if (!g.prison) return fail("You're not in prison.");
  if (g.prison.juvenile && ["gang", "conjugal", "riot"].includes(what))
    return fail("Not in here. This is juvenile detention.");
  if (!useAction(g, "prison_" + what)) return fail("You've already tried that this year.");
  switch (what) {
    case "behave":
      if (chance(0.35) && g.prison.yearsLeft > 1) {
        g.prison.yearsLeft--;
        applyResult(g, { text:"Good behaviour knocked a year off your sentence.", stats:{ happiness:+8 }, kind:"good" });
      } else applyResult(g, { text:"You kept your head down. No change to your sentence.", stats:{ happiness:+2 } });
      return ok();
    case "gang": {
      if (g.gang) return fail(`You're already running with ${g.gang}.`);
      if (chance(0.6)) { g.gang = pick(GANGS);
        applyResult(g, { text:`You joined ${g.gang}. Nobody bothers you now.`, stats:{ happiness:+8, health:-3 }, kind:"good" }); }
      else applyResult(g, { text:"You tried to join a gang and got beaten for your trouble.", stats:{ health:-14, happiness:-10 }, kind:"bad" });
      return ok();
    }
    case "riot": {
      if (chance(0.25)) {
        g.prison.yearsLeft = Math.max(0, g.prison.yearsLeft - 1);
        applyResult(g, { text:"The riot forced reforms. Conditions improved.", stats:{ happiness:+12, health:-8 } });
      } else {
        const add = rint(1, 3);
        g.prison.yearsLeft += add; g.prison.total += add;
        applyResult(g, { text:`The riot was crushed. ${add} more year${add > 1 ? "s" : ""} added.`, stats:{ health:-16, happiness:-14 }, kind:"bad" });
      }
      return ok();
    }
    case "study": {
      applyResult(g, { text:"You studied through the prison education programme.", stats:{ smarts:+rint(4,11), happiness:+4 }, kind:"good" });
      return ok();
    }
    case "conjugal": {
      const p = g.rels.find(r => r.type === "partner" && r.alive);
      if (!p) return fail("You have no partner to visit.");
      p.rel = clamp(p.rel + rint(5, 14));
      applyResult(g, { text:`${p.name} came for a conjugal visit.`, stats:{ happiness:+12 }, kind:"good" });
      if (chance(0.15) && g.age < 50) newChild(g, p, "had");
      return ok();
    }
    case "lawyer": {
      const cost = Math.round(15000 * g.country.mult);
      if (g.money < cost) return fail(`A good appeals lawyer costs ${money(g, cost)}.`);
      g.money -= cost;
      if (chance(0.3)) { applyResult(g, { text:"⚖️ Your appeal succeeded. You walked free.", stats:{ happiness:+25 }, kind:"good" }); g.prison = null; }
      else applyResult(g, { text:"Your appeal was denied. The money is gone.", stats:{ happiness:-12 }, kind:"bad" });
      return ok();
    }
    case "escape": {
      const odds = 0.12 + (g.stats.smarts - 50) / 400 + (g.stats.health - 50) / 500 + (g.gang ? 0.08 : 0);
      if (chance(Math.max(0.03, odds))) {
        g.prison = null; g.criminalRecord++; g.fugitive = true;
        applyResult(g, { text:"🏃 You escaped from prison. You're a fugitive now.", stats:{ happiness:+20, health:-8 }, kind:"good" });
      } else {
        const add = rint(1, 4);
        g.prison.yearsLeft += add; g.prison.total += add;
        applyResult(g, { text:`You tried to escape and were caught. ${add} year${add > 1 ? "s" : ""} added to your sentence.`, stats:{ happiness:-20, health:-10 }, kind:"bad" });
      }
      return ok();
    }
  }
  return fail("Unknown action.");
}


/* ---------- bridge handed to the premium modes ---------- */
const MODE_API = {
  ok, fail, line, applyResult, money, useAction,
  arrest: (g, name, sentence) => arrest(g, name, sentence),
  die: (g, cause) => die(g, cause),
  fameGainRaw: (g, raw) => (g.special ? fameGain(g, raw) : Math.max(1, Math.round(raw * 0.5))),
};

/* ---------- premium mode entry points ---------- */
export const FIGHT_STYLES = M.FIGHT_STYLES;
export const BELTS = M.BELTS;
export const MOB_RANKS = M.MOB_RANKS;
export const FAMILIES = M.FAMILIES;
export const SECTORS = M.SECTORS;
export const fighterRating = M.fighterRating;
export const fighterPurse = M.fighterPurse;
export const royalTitle = M.royalTitle;

export const joinFightGym  = (g, style)  => M.joinFightGym(g, MODE_API, style);
export const fighterAction = (g, what)   => M.fighterAction(g, MODE_API, what);
export const joinMafia     = (g)         => M.joinMafia(g, MODE_API);
export const mafiaAction   = (g, what)   => M.mafiaAction(g, MODE_API, what);
export const royalAction   = (g, what)   => M.royalAction(g, MODE_API, what);
export const foundBusiness = (g, sector) => M.foundBusiness(g, MODE_API, sector);
export const businessAction= (g, what)   => M.businessAction(g, MODE_API, what);


/* ============================================================
   CONTENT SETTINGS
   Adult content is off by default, gated behind an explicit toggle AND
   the character being 18 or over. Both conditions must hold — the switch
   alone never exposes it to a child character.
   ============================================================ */
const ADULT_KEY = "anotherlife.adult.v1";
let adultOn = null;

export function adultMode() {
  if (adultOn === null) {
    try { adultOn = localStorage.getItem(ADULT_KEY) === "1"; } catch (e) { adultOn = false; }
  }
  return adultOn;
}
export function setAdultMode(on) {
  adultOn = !!on;
  try { localStorage.setItem(ADULT_KEY, adultOn ? "1" : "0"); } catch (e) {}
  return adultOn;
}


/* ---------- additional systems ---------- */
export const SUE_TARGETS = SY.SUE_TARGETS;
export const LICENCES = SY.LICENCES;
export const CONDITIONS = SY.CONDITIONS;
export const MEDIA = SY.MEDIA;
export const BRANCHES = SY.BRANCHES;

export const sue              = (g, t)  => SY.sue(g, MODE_API, t);
export const custodyBattle    = (g)     => SY.custodyBattle(g, MODE_API);
export const restrainingOrder = (g, id) => SY.restrainingOrder(g, MODE_API, id);
export const takeLicence      = (g, id) => SY.takeLicence(g, MODE_API, id);
export const treatCondition   = (g, id) => SY.treat(g, MODE_API, id);
export const applyCitizenship = (g)     => SY.applyCitizenship(g, MODE_API);
export const doMedia          = (g, id) => SY.doMedia(g, MODE_API, id);
export const deploy           = (g)     => SY.deploy(g, MODE_API);
export function conditionsOf(g) {
  return (g.conditions || []).map(h => ({ ...SY.CONDITIONS.find(c => c.id === h.id), since: h.since }));
}


export const ARCHETYPES = ARCH.ARCHETYPES;
export function archetypeOf(g) { return ARCH.archetypeById(g.archetype); }

/* Move the whole family, keeping heritage intact. */
export function migrateTo(g, countryName, why) {
  const dest = COUNTRIES.find(c => c.name === countryName);
  if (!dest) return false;
  const from = g.country.name;
  g.country = dest;
  g.city = pick(dest.city);
  g.movedAt = g.age;
  if (g.job) { g.job = null; g.yearsInJob = 0; }
  line(g, why || `✈️ Your family moved from ${from} to ${dest.name}.`, "good");
  return true;
}

/* ---------- random events ---------- */
/* How often a year should put a decision in front of the player. */
const DECISION_RATE = 0.75;

/* Years before the same event may recur. A repeated *decision* is far more
   noticeable than a repeated bit of flavour text, so it waits much longer. */
const COOLDOWN_CHOICE = 30;
const COOLDOWN_AUTO = 14;

const resolveText = (v, g) => typeof v === "function" ? (safe(() => v(g)) || "") : v;

function queueChoice(g, id) {
  const e = EVENTS.find(x => x && x.id === id);
  if (!e || !e.choice) return false;
  if (e.once) g.seen[e.id] = true;
  g.fired[e.id] = g.age;
  const text = resolveText(e.choice.text, g);
  const entry = line(g, text);                 // written now, so ordering is right
  g.pendingChoices.push({
    id: e.id, text, lineId: entry.id,
    /* `cost` lets a choice say what it will take before you commit to it —
       essential for the ones that move a share of everything you own. */
    choices: e.choice.choices.map((c, idx) => ({
      label: resolveText(c.label, g), note: c.cost ? resolveText(c.cost, g) : "", idx })),
  });
  return true;
}

function fireEvent(g, e, used) {
  used.add(e.id);
  if (e.once) g.seen[e.id] = true;
  g.fired[e.id] = g.age;
  if (e.choice) queueChoice(g, e.id);
  else applyResult(g, safe(() => e.auto(g)));
}

function rollEvents(g) {
  if (!g.seen) g.seen = {};
  if (!g.flags) g.flags = {};
  if (!g.fired) g.fired = {};
  const pool = EVENTS.filter(e => {
    if (!e) return false;                       // survive a malformed content edit
    if (e.chained) return false;                // only reachable as a follow-up
    if (e.adult && !(adultMode() && g.age >= 18)) return false;
    if (e.arch && e.arch !== g.archetype) return false;
    if (e.archAny && !e.archAny.includes(g.archetype)) return false;
    if (e.country && e.country !== g.country.name) return false;
    if (e.heritage && e.heritage !== g.heritage) return false;
    if (e.migrant && g.heritage === g.country.name) return false;
    /* Targeting the work itself. `job` is one job id, `jobAny` a list, and
       `sector` catches everyone in a line of work (519 jobs, 18 sectors — you
       cannot write content per job, but you can per trade). */
    if (e.job && (!g.job || g.job.id !== e.job)) return false;
    if (e.jobAny && (!g.job || e.jobAny.indexOf(g.job.id) < 0)) return false;
    if (e.sector) {
      const d = g.job ? jobDef(g.job.id) : null;
      if (!d || d.sector !== e.sector) return false;
    }
    if (e.working && !g.job) return false;
    if (e.onLeave && !g.leave) return false;
    if (g.age < e.min || g.age > e.max) return false;
    if (e.once && g.seen[e.id]) return false;
    const last = g.fired[e.id];
    if (last != null && g.age - last < (e.choice ? COOLDOWN_CHOICE : COOLDOWN_AUTO)) return false;
    return !e.req || safe(() => e.req(g));
  });
  if (!pool.length) return;

  const used = new Set();
  for (let i = 0, n = rint(1, 3); i < n; i++) {
    const e = weighted(pool.filter(x => !used.has(x.id)), g);
    if (!e) break;
    if (!chance(0.55)) { used.add(e.id); continue; }
    fireEvent(g, e, used);
  }

  // A year with no decision in it is a year of just tapping. Force one when we can.
  if (!g.pendingChoices.length && chance(DECISION_RATE)) {
    const e = weighted(pool.filter(x => x.choice && !used.has(x.id)), g);
    if (e) fireEvent(g, e, used);
  }
  // and sometimes a second, unrelated one
  if (g.pendingChoices.length === 1 && chance(0.22)) {
    const e = weighted(pool.filter(x => x.choice && !used.has(x.id)), g);
    if (e) fireEvent(g, e, used);
  }
}

export function resolveChoice(g, eventId, idx) {
  if (!g.alive) { g.pendingChoices = []; return; }
  const e = EVENTS.find(x => x && x.id === eventId);
  const pending = g.pendingChoices.find(p => p.id === eventId);
  g.pendingChoices = g.pendingChoices.filter(p => p.id !== eventId);
  if (!e || !e.choice) return;
  const c = e.choice.choices[idx];
  if (!c) return;
  const r = safe(() => c.run(g));
  g.insertAt = pending && pending.lineId != null ? findLine(g, pending.lineId) : null;
  applyResult(g, r);
  if (r && r.doBig && g.special) specialAction(g, "big", { force: true });
  if (r && r.next) queueChoice(g, r.next);   // multi-step scene, written in place
  g.insertAt = null;
  save(g);
}

/* Every character gets their own shuffled deck.

   Measured problem: two whole lives shared 40% of the events that happened to
   them, because weighting concentrates draws on the same high-`w` events in
   every life ever played. Gating helps but only for the minority of events
   that can be gated.

   So each life gets a seed, and each event's weight is multiplied by a stable
   pseudo-random factor derived from (seed, event id). One character is a
   magnet for the hospital events and barely sees the street ones; the next is
   the reverse. Deterministic per life, so a save replays identically, and it
   costs one hash per draw. */
function lifeBias(g, id) {
  let h = 2166136261 ^ ((g && g.seed) || 0);
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 0.3 + (((h >>> 0) % 10000) / 10000) * 1.9;          // 0.30 .. 2.20
}

function weighted(pool, g) {
  if (!pool || !pool.length) return null;
  const wt = e => (e.w || 1)
    * (e.priority ? 10 : 1)                                  // flag-gated payoffs must land
    * (e.priority ? 1 : lifeBias(g, e.id))                   // this character's own deck
    * (g && g.fired && g.fired[e.id] == null ? 3 : 1);       // prefer what you haven't seen
  const total = pool.reduce((s, e) => s + wt(e), 0);
  let r = Math.random() * total;
  for (const e of pool) { r -= wt(e); if (r <= 0) return e; }
  return pool[pool.length - 1];
}

/* ---------- death ---------- */
function deathChance(age, health) {
  let p = 0.0004 * Math.exp(0.085 * Math.max(0, age - 20));
  p *= Math.max(0.4, 1 + (55 - health) / 45);
  if (health <= 5) p = Math.max(p, 0.5);
  else if (health <= 15) p = Math.max(p, 0.2);
  if (age > 105) p = Math.max(p, 0.45);
  return Math.min(0.97, p);
}

function checkDeath(g) {
  if (!g.alive) return;
  if (!chance(deathChance(g.age, g.stats.health))) return;
  die(g, g.age >= 65 ? pick(DEATHS_OLD) : pick(DEATHS_ANY.concat(g.stats.health < 25 ? ["a long illness"] : [])));
}

export function die(g, cause) {
  if (!g.alive) return;
  g.alive = false;
  g.leave = null;
  g.causeOfDeath = cause;
  g.pendingChoices = [];
  line(g, `💀 You died at ${g.age} from ${cause}.`, "bad", "death");

  const net = netWorth(g);
  if (g.insurance.life) {
    const payout = Math.round(120000 * g.country.mult);
    line(g, `Your life insurance paid out ${money(g, payout)} to your family.`, "good");
  }
  const heirs = g.rels.filter(r => r.alive && (r.type === "child" || r.type === "partner"));
  if (heirs.length && net > 0)
    line(g, `Your estate of ${money(g, net)} was divided between ${heirs.length} heir${heirs.length > 1 ? "s" : ""}.`);

  g.__net = net;
  g.ribbons = RIBBONS.filter(r => safe(() => r.test(g))).map(r => r.name);
  g.stars = scoreLife(g);
  addToGraveyard(g);
  save(g);
}

export function netWorth(g) {
  const sum = a => a.reduce((s, x) => s + x.value, 0);
  const debt = g.loans.reduce((s, L) => s + L.balance, 0);
  const biz = (g.business ? g.business.valuation : 0) + (g.stake ? g.stake.valuation : 0);
  return Math.round(g.money + sum(g.assets.houses) + sum(g.assets.cars) + sum(g.assets.luxury)
    + sum(g.assets.empire || [])
    + g.investments.reduce((s, i) => s + i.value, 0) + biz - debt);
}

export function scoreLife(g) {
  const s = g.stats;
  let score = ((s.happiness + s.health + s.smarts + s.looks) / 4) * 0.5;
  score += Math.min(25, Math.log10(Math.max(1, netWorth(g))) * 3.5);
  score += Math.min(12, g.age / 8);
  score += g.diplomas.grad ? 8 : g.diplomas.uni ? 5 : g.diplomas.high ? 2 : 0;
  score += Math.min(10, g.rels.filter(r => r.rel > 70).length * 2);
  score += Math.min(8, g.fame / 12);
  score -= g.criminalRecord * 2;
  return Math.max(1, Math.min(5, Math.round(score / 20)));
}


/* ============================================================
   PREMIUM: God Mode, Time Machine, Heirlooms, Legacy
   ============================================================ */

/* ---- Time Machine: rewind the year you just lived ---- */
function snapshot(g) {
  const { rewind, ...rest } = g;
  try { g.rewind = JSON.stringify(rest); } catch (e) { g.rewind = null; }
}
export function canRewind(g) { return !!g.rewind; }
export function rewindYear(g) {
  if (!g.rewind) return fail("There's nothing to go back to.");
  let prev;
  try { prev = JSON.parse(g.rewind); } catch (e) { return fail("That year is lost to you."); }
  for (const k of Object.keys(g)) delete g[k];
  Object.assign(g, prev);
  g.rewind = null;
  line(g, "⏳ You went back and lived that year differently.");
  save(g);
  return ok();
}

/* ---- God Mode ---- */
export function godSet(g, field, value) {
  const n = Math.round(Number(value));
  if (!isFinite(n)) return fail("That isn't a number.");
  if (["happiness", "health", "smarts", "looks"].includes(field)) {
    g.stats[field] = clamp(n);
    line(g, `✨ You willed your ${field} to ${g.stats[field]}.`);
  } else if (field === "money") {
    g.money = n; line(g, `✨ Your bank balance became ${money(g, n)}.`);
  } else if (field === "fame") {
    g.fame = clamp(n); line(g, `✨ Your fame became ${g.fame}.`);
  } else if (field === "age") {
    if (n < g.age) return fail("You can't get younger. Use the Time Machine.");
    g.age = Math.min(120, n); line(g, `✨ You willed yourself to ${g.age}.`);
  } else return fail("Unknown field.");
  save(g);
  return ok();
}
export function godRevive(g) {
  if (g.alive) return fail("You're already alive.");
  g.alive = true; g.causeOfDeath = null;
  g.stats.health = Math.max(g.stats.health, 55);
  line(g, "✨ You refused to die.", "good");
  save(g);
  return ok();
}

/* ---- Heirlooms ---- */
export function buyHeirloom(g, id) {
  const h = HEIRLOOMS.find(x => x.id === id);
  if (!h) return fail("No such heirloom.");
  if (g.heirlooms.some(x => x.id === id)) return fail("Your family already has one.");
  const price = Math.round(h.price * g.country.mult);
  if (g.money < price) return fail(`That costs ${money(g, price)}.`);
  g.money -= price;
  g.heirlooms.push({ id: h.id, name: h.name, emoji: h.emoji, perk: h.perk, bonus: h.bonus, since: g.age });
  applyResult(g, { text: `${h.emoji} You acquired ${h.name}. It will pass to your heirs.`, stats: { happiness: +10 }, kind: "good" });
  return ok();
}

/* ---- Legacy: carry on as your child ---- */
/* Who gets the company. A parent can say so while they're alive; if they
   never do, the board decides on the day, and the board is not sentimental. */
export function nameSuccessor(g, childId) {
  if (!g.business) return fail("You don't run a company.");
  const kid = g.rels.find(r => r.id === childId && r.type === "child" && r.alive);
  if (!kid) return fail("That isn't one of your children.");
  if (g.business.successor === childId) {
    g.business.successor = null;
    applyResult(g, { text:`You took ${kid.name}'s name off the succession plan.`, stats:{ happiness:-4 } });
    return ok();
  }
  g.business.successor = childId;
  applyResult(g, { text:`✒️ You named ${kid.name} in the succession plan. The board was told.`,
    stats:{ happiness:+6 }, kind:"good" });
  return ok();
}

export function heirs(g) {
  return g.rels.filter(r => r.type === "child" && r.alive);
}
export function continueAsHeir(g, heirId) {
  const kid = g.rels.find(r => r.id === heirId && r.type === "child" && r.alive);
  if (!kid) return null;

  /* Value that transfers as a THING must not also transfer as cash, or the
     heir inherits it twice. Take the entities out of the estate first. */
  const heirCount = Math.max(1, heirs(g).length);
  const empireHeld = (g.assets.empire || []).map(e => ({ ...e }));
  const empireVal = empireHeld.reduce((n, e) => n + e.value, 0);
  const bizVal = g.business ? g.business.valuation : 0;
  const estate = Math.max(0, netWorth(g) - empireVal - bizVal);
  const share = Math.round(estate / heirCount);

  const child = newGame({ gender: kid.gender, last: g.last, country: g.country });
  child.first = kid.name.split(" ")[0];
  child.age = kid.age;
  child.birthYear = g.birthYear + g.age - kid.age;
  child.generation = (g.generation || 1) + 1;
  child.money = share;
  child.heirlooms = (g.heirlooms || []).map(h => ({ ...h }));

  /* Holdings are real things with names. They pass. */
  if (empireHeld.length) child.assets.empire = empireHeld;

  /* And the company. Named in the plan and old enough, you get the chair.
     Named but still a child, it's held in trust. Not named, the board looks
     at how you were regarded and mostly decides you are a shareholder. */
  if (g.business) {
    const named = g.business.successor === kid.id;
    const grown = kid.age >= 18;
    const regarded = kid.rel >= 58;
    const takesOver = named ? grown : (grown && regarded && chance(0.35));
    if (takesOver) {
      child.business = { ...g.business, successor: null, inherited: true };
      child.__succession = { kind:"ceo", name:g.business.name, emoji:g.business.emoji, val:bizVal, named };
    } else {
      const slice = Math.round(bizVal / heirCount);
      child.stake = { name:g.business.name, emoji:g.business.emoji, valuation:slice,
                      inTrust: named && !grown, fromNamed: named };
      child.__succession = { kind: named && !grown ? "trust" : "stake",
                             name:g.business.name, emoji:g.business.emoji, val:slice, named };
    }
  }

  // heirlooms are the point of the whole system
  for (const h of child.heirlooms) {
    if (h.perk === "fame") child.fame = clamp(child.fame + h.bonus);
    else if (child.stats[h.perk] != null) child.stats[h.perk] = clamp(child.stats[h.perk] + h.bonus);
  }

  // the family you actually grew up in
  child.rels = [];
  const dead = mkRel(g.gender === "male" ? "father" : "mother", g.gender, g.last, g.age);
  dead.name = `${g.first} ${g.last}`; dead.alive = false;
  child.rels.push(dead);
  for (const sib of heirs(g)) {
    if (sib.id === kid.id) continue;
    const s2 = mkRel("sibling", sib.gender, g.last, sib.age);
    s2.name = sib.name; s2.rel = sib.rel;
    child.rels.push(s2);
  }
  const partner = g.rels.find(r => r.type === "partner" && r.alive);
  if (partner) {
    const other = mkRel(partner.gender === "male" ? "father" : "mother", partner.gender, null, partner.age);
    other.name = partner.name; other.rel = partner.rel;
    child.rels.push(other);
  }

  child.log = [];
  openYear(child);
  child.log[child.log.length - 1].age = child.age;
  line(child, `🕯️ ${g.first} ${g.last} died at ${g.age}. You carry on as their ${kid.gender === "male" ? "son" : "daughter"}, ${child.first}.`, "good");
  if (share > 0) line(child, `You inherited ${money(child, share)}.`, "good");
  for (const e of (child.assets.empire || []))
    line(child, `${e.emoji} ${e.name} passed to you, valued at ${money(child, e.value)}.`, "good");
  const sc = child.__succession;
  if (sc) {
    if (sc.kind === "ceo")
      line(child, `${sc.emoji} ${sc.named
        ? `Your ${g.gender === "male" ? "father" : "mother"} named you in the succession plan. ${sc.name} is yours to run.`
        : `The board offered you the chair at ${sc.name}, and you took it.`}`, "good");
    else if (sc.kind === "trust")
      line(child, `${sc.emoji} ${sc.name} was left to you but held in trust until you are eighteen. The dividends are not.`, "good");
    else
      line(child, `${sc.emoji} You inherited a stake in ${sc.name} worth ${money(child, sc.val)}, but not the running of it. The board made that clear.`, "good");
    delete child.__succession;
  }
  for (const h of child.heirlooms) line(child, `${h.emoji} You inherited ${h.name}.`, "good");
  line(child, `This is generation ${child.generation} of the ${g.last} family.`);
  save(child);
  return child;
}

/* ---------- persistence ---------- */
/* If storage is full, disabled, or in a private-mode sandbox, setItem throws.
   Swallowing that means a player keeps playing a life that is no longer being
   written down — the worst kind of failure, because it looks fine. The engine
   has no DOM, so it records the fact and main.js does the telling. */
let saveBroken = false;
export const saveIsBroken = () => saveBroken;
export function save(g) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ g, uid }));
    saveBroken = false;
    return true;
  } catch (e) {
    saveBroken = true;
    return false;
  }
}
export function load() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!d || !d.g) return null;
    uid = d.uid || 1;
    if (!d.g.pendingChoices) d.g.pendingChoices = [];
    if (!d.g.flags) d.g.flags = {};
    if (!d.g.seen) d.g.seen = {};
    if (!d.g.fired) d.g.fired = {};
    if (!d.g.acts) d.g.acts = {};
    if (d.g.buzz == null) d.g.buzz = 0;
    if (d.g.lastBig == null) d.g.lastBig = -99;
    if (!d.g.heirlooms) d.g.heirlooms = [];
    if (d.g.generation == null) d.g.generation = 1;
    if (d.g.lineSeq == null) d.g.lineSeq = 0;
    if (d.g.withParents == null) d.g.withParents = d.g.age < 18;
    if (d.g.homeless == null) d.g.homeless = false;
    if (d.g.addiction === undefined) d.g.addiction = null;
    if (d.g.missedRent == null) d.g.missedRent = 0;
    if (d.g.juvieRecord == null) d.g.juvieRecord = 0;
    if (!d.g.licences) d.g.licences = {};
    if (d.g.leave === undefined) d.g.leave = null;
    if (d.g.stake === undefined) d.g.stake = null;
    if (!d.g.habits) d.g.habits = {};
    /* The 58-job table became 519 and 27 ids changed on the way. A save
       pointing at a job that no longer exists doesn't crash — jobDef() is
       guarded everywhere — it just quietly stops promoting you forever, which
       is worse. Point them at their successors. */
    if (d.g.job && d.g.job.id && JOB_ALIASES[d.g.job.id]) d.g.job.id = JOB_ALIASES[d.g.job.id];
    if (d.g.seed == null) d.g.seed = Math.floor(Math.random() * 2147483647);
    if (!d.g.conditions) d.g.conditions = [];
    if (!d.g.citizenships) d.g.citizenships = [];
    if (!d.g.birthCountry) d.g.birthCountry = d.g.country && d.g.country.name;
    if (!d.g.heritage) d.g.heritage = d.g.birthCountry;
    d.g.insertAt = null;
    if (!d.g.assets) d.g.assets = { houses:[], cars:[], luxury:[], empire:[] };
    if (!d.g.assets.empire) d.g.assets.empire = [];
    if (!d.g.legacy) d.g.legacy = [];
    for (const k of ['fighter','mafia','royal','business']) if (d.g[k] === undefined) d.g[k] = null;
    return d.g;
  } catch (e) { return null; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

export function graveyard() {
  try { return JSON.parse(localStorage.getItem(GRAVE_KEY) || "[]"); } catch (e) { return []; }
}
function addToGraveyard(g) {
  try {
    const list = graveyard();
    list.unshift({
      name:`${g.first} ${g.last}`, age:g.age, cause:g.causeOfDeath, net:netWorth(g),
      stars:g.stars, country:g.country.name, ribbons:g.ribbons,
      job: g.special ? g.special.title : g.job ? g.job.title : (g.pension ? "Retired" : "Unemployed"),
      when: Date.now(),
    });
    localStorage.setItem(GRAVE_KEY, JSON.stringify(list.slice(0, 50)));
  } catch (e) {}
}

/* ---------- misc ---------- */
function ok(msg)   { return { ok:true, msg:msg || null }; }
function fail(msg) { return { ok:false, msg }; }
function safe(fn)  { try { return fn(); } catch (e) { console.error(e); return null; } }
