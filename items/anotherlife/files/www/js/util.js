/* Shared pure helpers. Kept in their own module so data/events/engine
   can all use them without forming an import cycle. */
export function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
export function rint(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
export function chance(p){ return Math.random()<p; }
export function money(g,n){
  const c = g && g.country ? g.country.cur : "$";
  return c + Math.round(Math.abs(n)).toLocaleString("en-US");
}
/* Compact form for the header and other read-only figures. Ten digits of
   bank balance pushes everything else off the row once a life goes properly
   rich. Never use this on a row that charges you — a price must always be
   shown to the penny it takes. */
export function moneyShort(g, n) {
  const c = g && g.country ? g.country.cur : "$";
  const a = Math.abs(Math.round(n));
  if (a < 1000000) return money(g, n);
  const [div, suf] = a >= 1e12 ? [1e12, "T"] : a >= 1e9 ? [1e9, "B"] : [1e6, "M"];
  const v = a / div;
  return c + (v >= 100 ? Math.round(v) : v.toFixed(v >= 10 ? 1 : 2).replace(/\.?0+$/, "")) + suf;
}

export const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

/* "a Barista" but "an Apprentice" — job titles hit this constantly. */
export function an(word) {
  return /^[aeiou]/i.test(String(word || "")) ? "an" : "a";
}

/* How much of a voluntary cost you can actually part with.

   This exists because `Math.min(g.money, cost)` is a trap: when you are in
   debt, g.money is negative, so it returns the negative balance, and the
   caller's `money: -that` then CREDITS you — wiping the debt and landing you
   back on exactly zero. Treat an overdrawn balance as nothing to spend. */
export function afford(g, n) {
  const purse = Math.max(0, g && typeof g.money === "number" ? g.money : 0);
  return Math.max(0, Math.min(purse, Math.round(n)));
}

/* Local prices. A 600 fine should not sting the same in Zurich and Hanoi. */
export function local(g, n) {
  return Math.round(n * (g && g.country ? g.country.mult : 1));
}
