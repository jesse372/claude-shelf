/* ============================================================
   AnotherLife — the weave

   Measured problem: across 200 played-out lives, outcome text was already
   varied (92% of distinct lines appeared exactly once) but the QUESTIONS
   repeated hard — "Two people have blocked the pavement ahead" turned up 290
   times. A fixed prompt string is the same sentence in every life ever
   played, and that is what makes lives feel identical.

   So prompts get composed instead. An event names a real person from your
   life, puts it somewhere in your actual city, at a time, in weather, with a
   detail — and one authored event becomes hundreds or thousands of distinct
   readings that are still about *you*.

   Rules for anything added here:
     • every slot must read naturally against every other slot
     • prefer somebody the character actually knows over an invented stranger
     • never invent a fact that contradicts the save (no car if they have none)
   ============================================================ */
import { pick, rint, chance } from "./util.js";
import { FIRST_M, FIRST_F } from "./data.js";

/* ---------- people ---------- */
const STRANGERS = [
  "a man in his fifties", "a woman with a pram", "a lad about your age",
  "somebody in a hi-vis", "an older bloke with a dog", "a woman on her phone",
  "a teenager on a bike", "a man in a suit that cost something",
  "someone who has clearly been crying", "a bloke with a carrier bag of tins",
  "a woman carrying too much shopping", "a man who will not make eye contact",
  "a courier who is plainly late", "somebody's grandmother",
  "a student with headphones in", "a man with his arm in a sling",
];
const NEIGHBOURS = [
  "the neighbour with the caravan", "the couple at number 14",
  "the man two doors down", "the woman who feeds every cat on the street",
  "the family who moved in last spring", "the bloke who washes his car on Sundays",
  "your upstairs neighbour", "the woman who runs the street's group chat",
];
export const anyName = () => pick(FIRST_M.concat(FIRST_F));

/* Somebody real if there is somebody real, otherwise a plausible stranger.
   Returns { name, rel } — rel is null when it's a stranger, so callers can
   apply relationship changes only when there's a relationship to change. */
export function someone(g, types) {
  const want = types || ["friend", "bestfriend", "sibling", "cousin", "colleague"];
  const pool = (g.rels || []).filter(r => r.alive && want.indexOf(r.type) >= 0);
  if (pool.length && chance(0.8)) { const r = pick(pool); return { name: r.name, rel: r }; }
  return { name: anyName(), rel: null };
}
export const stranger = () => pick(STRANGERS);
export const neighbour = () => pick(NEIGHBOURS);

/* ---------- places ---------- */
const PUBLIC = [
  "the bus station", "the retail park", "the multi-storey", "the high street",
  "the station platform", "the chip shop queue", "the launderette",
  "the corner shop", "the park by the water", "the underpass",
  "the supermarket car park", "the market", "the taxi rank", "the leisure centre",
  "the library steps", "the industrial estate", "the canal path", "the petrol station",
  "the pier", "the bowling alley car park", "the cathedral square", "the flyover",
];
const INDOOR = [
  "a waiting room", "a stairwell", "the back of a pub", "a lift",
  "somebody's kitchen", "a hotel corridor", "a community hall", "a church porch",
  "the staff room", "a bookshop", "a barber's chair", "a hospital corridor",
];
export const outside = g => pick(PUBLIC) + (chance(0.35) ? ` in ${g.city}` : "");
export const inside = () => pick(INDOOR);

/* ---------- when ---------- */
export const timeOfDay = () => pick([
  "at four in the morning", "just before dawn", "first thing", "mid-morning",
  "at lunchtime", "in the afternoon", "at chucking-out time", "after dark",
  "on a Sunday", "on a wet Tuesday", "the night before a bank holiday",
  "halfway through the afternoon", "at closing time",
]);
export const weather = () => pick([
  "in the rain", "in a wind that is taking the bins over", "in fog",
  "in the kind of heat nobody is dressed for", "under a sky about to open",
  "in sleet", "in the first frost of the year", "in flat grey drizzle",
  "in sunshine that feels like a mistake",
]);
export const season = () => pick(["spring", "summer", "autumn", "winter"]);

/* ---------- things ---------- */
export const smallObject = () => pick([
  "a phone", "a wallet", "a set of keys", "a wedding ring", "a bank card",
  "a dog lead", "a child's shoe", "an envelope", "a laptop bag", "a passport",
  "a hearing aid", "a walking stick", "a bag of shopping",
]);
export const smallSum = () => pick(["a tenner", "forty quid", "a couple of hundred", "loose change", "a few hundred"]);

/* Things that can plausibly HAVE something inside them. A dog lead cannot
   contain an address, and "a bag of shopping with an ID inside" is the exact
   mad-libs failure this module is supposed to prevent. */
export const container = () => pick([
  "a wallet", "a handbag", "a laptop bag", "a purse", "an envelope",
  "a phone in a case", "a rucksack", "a card holder", "a jacket with the pockets full",
]);

/* A living relative by name, or null. Never refer to somebody who is dead. */
export function livingKin(g, types) {
  const want = types || ["mother", "father", "sibling", "partner", "child", "grandmother", "grandfather"];
  const pool = (g.rels || []).filter(r => r.alive && want.indexOf(r.type) >= 0);
  return pool.length ? pick(pool) : null;
}

/* ---------- a life, referred to ----------
   These let content sound like it knows who it's talking to. */
export function ageWord(g) {
  const a = g.age;
  return a < 5 ? "tiny" : a < 13 ? "a kid" : a < 20 ? "a teenager"
       : a < 30 ? "young" : a < 45 ? "not young" : a < 60 ? "middle-aged"
       : a < 75 ? "old enough to know better" : "very old";
}
/* What they do with themselves, from the lifetime habit tally. */
export function pastime(g) {
  const h = g.habits || {};
  const best = Object.keys(h).sort((a, b) => h[b] - h[a])[0];
  return ({ gym:"the gym", library:"the library", party:"going out", meditate:"sitting quietly",
            music:"playing", martial:"training", fishing:"fishing", hunting:"shooting",
            volunteer:"volunteering", cinema:"the pictures", nightclub:"clubbing",
            skydive:"jumping out of things", vacation:"getting away" })[best] || null;
}
export const doesOften = (g, what, n) => ((g.habits || {})[what] || 0) >= (n || 3);

/* Where they're up to in life, for text that should not sound the same at
   nineteen and sixty. */
export function standing(g) {
  if (g.prison) return "inside";
  if (g.leave) return "signed off";
  if (g.job) return g.job.title.toLowerCase();
  if (g.education) return "studying";
  if (g.pension) return "retired";
  return "between things";
}
