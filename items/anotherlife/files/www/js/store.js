/* ============================================================
   AnotherLife — in-app purchases and entitlements

   Five packs at $4.99, plus a discounted bundle. Entitlements live in
   localStorage; on a native build they are (re)granted by Google Play /
   the App Store via cordova-plugin-purchase, which is the only payment
   method either store permits for digital goods.

   On the web build there is no billing, so packs show as locked with a
   clearly-marked testing unlock. That unlock is compiled out of native
   builds — see isNative() below.
   ============================================================ */

const KEY = "anotherlife.entitlements.v1";

export const PRODUCTS = [
  { id:"pack_fighter",  sku:"anotherlife.pack.fighter",  emoji:"🥊", price:"$4.99",
    name:"The Fight Game",
    blurb:"Turn professional in boxing, MMA, Muay Thai or wrestling. Train, climb the world rankings, win belts — and carry the damage." },
  { id:"pack_mafia",    sku:"anotherlife.pack.mafia",    emoji:"🕴️", price:"$4.99",
    name:"Underworld",
    blurb:"Get made. Five families, six ranks to Godfather, rackets that earn every year, hits, police heat and RICO." },
  { id:"pack_royalty",  sku:"anotherlife.pack.royalty",  emoji:"👑", price:"$4.99",
    name:"Bloodline",
    blurb:"Be born into a royal house. Succession, a national treasury, royal tours, wars — and revolution if they turn on you." },
  { id:"pack_business", sku:"anotherlife.pack.business", emoji:"🏢", price:"$4.99",
    name:"Founder",
    blurb:"Found a company in six sectors. Inject capital, run campaigns, float it on the market or sell up." },
  { id:"pack_god",      sku:"anotherlife.pack.god",      emoji:"✨", price:"$4.99",
    name:"Rewrite",
    blurb:"Rewrite your life: set any stat, your money, fame or age, refuse to die, and undo the year you just lived." },
];

export const BUNDLE = { id:"pack_all", sku:"anotherlife.pack.everything", emoji:"🎁",
  price:"$14.99", name:"The Full Set", blurb:"Every pack. Cheaper than buying three on their own." };

const ALL_IDS = PRODUCTS.map(p => p.id);

/* ---------- entitlement store ---------- */
function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; }
}
function write(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
}

export function owns(id) {
  const e = read();
  return !!(e[id] || e.pack_all);
}
export function ownsAny() { return ALL_IDS.some(owns); }
export function ownedCount() { return ALL_IDS.filter(owns).length; }

export function grant(id, source) {
  const e = read();
  e[id] = { at: Date.now(), source: source || "purchase" };
  write(e);
}
export function revokeAll() { write({}); }

export function productFor(id) {
  return id === BUNDLE.id ? BUNDLE : PRODUCTS.find(p => p.id === id) || null;
}


/* ---------- comp codes ----------
   Lets you unlock everything for friends without them paying. The check is
   a hash rather than the plain string so the code isn't sitting in the
   bundle in readable form — but understand that this is obfuscation, not
   security. Anyone who unzips the APK and reads this file can work it out.
   For anything you actually care about, use Play/App Store promo codes,
   which are issued and revoked server-side. */
const COMP_HASH = 233890842;

function codeHash(str) {
  let h = 5381;
  for (const ch of String(str).toUpperCase()) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return h;
}

export function redeemCode(code) {
  if (!code || !String(code).trim()) return { ok:false, msg:"Enter a code." };
  if (codeHash(String(code).trim()) !== COMP_HASH) return { ok:false, msg:"That code isn't recognised." };
  PRODUCTS.forEach(p => grant(p.id, "comp"));
  grant(BUNDLE.id, "comp");
  return { ok:true, msg:"Everything unlocked. Enjoy." };
}

/* ---------- platform ---------- */
export function isNative() {
  return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function"
    && window.Capacitor.isNativePlatform());
}

/* ---------- billing ----------
   cordova-plugin-purchase exposes window.CdvPurchase once installed and the
   native project is built. Everything below no-ops safely without it, so the
   web build still runs. */
function billing() {
  return (typeof window !== "undefined" && window.CdvPurchase) ? window.CdvPurchase : null;
}

let initialised = false;
export async function initBilling(onChange) {
  const CdvPurchase = billing();
  if (!CdvPurchase || initialised) return false;
  initialised = true;

  const { store, Platform, ProductType } = CdvPurchase;
  const platform = /android/i.test(navigator.userAgent) ? Platform.GOOGLE_PLAY : Platform.APPLE_APPSTORE;

  store.register([...PRODUCTS, BUNDLE].map(p => ({
    id: p.sku, type: ProductType.NON_CONSUMABLE, platform,
  })));

  store.when()
    .approved(t => t.verify())
    .verified(r => { applyReceipt(r); r.finish(); if (onChange) onChange(); })
    .productUpdated(() => { if (onChange) onChange(); });

  store.error(err => console.warn("[store]", err && err.message));
  await store.initialize([platform]);
  return true;
}

function applyReceipt(receipt) {
  const skus = (receipt.transactions || []).flatMap(t => (t.products || []).map(p => p.id));
  for (const sku of skus) {
    const p = [...PRODUCTS, BUNDLE].find(x => x.sku === sku);
    if (p) grant(p.id, "store");
  }
}

/* Buy. Returns { ok, msg } so the UI can report plainly. */
export async function purchase(id) {
  const p = productFor(id);
  if (!p) return { ok:false, msg:"Unknown item." };
  if (owns(id)) return { ok:false, msg:"You already own that." };

  const CdvPurchase = billing();
  if (!CdvPurchase) {
    return { ok:false, msg: isNative()
      ? "The store isn't available right now. Try again shortly."
      : "Purchases only work in the installed app, not the web preview." };
  }
  try {
    const offer = CdvPurchase.store.get(p.sku) && CdvPurchase.store.get(p.sku).getOffer();
    if (!offer) return { ok:false, msg:"That item isn't available in your region yet." };
    await offer.order();
    return { ok:true };
  } catch (e) {
    return { ok:false, msg: (e && e.message) || "The purchase didn't complete." };
  }
}

export async function restore() {
  const CdvPurchase = billing();
  if (!CdvPurchase) return { ok:false, msg:"Nothing to restore in the web preview." };
  try {
    await CdvPurchase.store.restorePurchases();
    return { ok:true, msg:"Purchases restored." };
  } catch (e) {
    return { ok:false, msg:"Couldn't reach the store." };
  }
}

/* Live price from the store when we have it, otherwise the placeholder. */
export function displayPrice(id) {
  const p = productFor(id);
  if (!p) return "";
  const CdvPurchase = billing();
  if (CdvPurchase) {
    const prod = CdvPurchase.store.get(p.sku);
    const offer = prod && prod.getOffer();
    const price = offer && offer.pricingPhases && offer.pricingPhases[0] && offer.pricingPhases[0].price;
    if (price) return price;
  }
  return p.price;
}
