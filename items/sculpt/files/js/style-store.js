// Shared "My style" data: lives on the server (/api/style) so every photographer's Sculpt
// edits in the same style; cached locally so it still works offline.
//
// shape: {
//   finals:   [{ e: base64 int8 embedding, s: photoStats }]   ← tone, learned from finished photos
//   look:     { temp, tint, vibrance, saturation, clarity }     ← colour look you set once
//   examples: [{ e, d: {temp,tint,vibrance,saturation,clarity} }] ← colour, learned from edits made in Sculpt
//   updatedAt
// }
import { neighbourTarget, fitSliders } from './style.js';

const LS = 'sculpt.style.v1';
const COLOUR_KEYS = ['temp', 'tint', 'vibrance', 'saturation', 'clarity'];
let cache = null;

export const encodeEmb = (f) => { const q = new Int8Array(f.length); for (let i = 0; i < f.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(f[i] * 400))); let s = ''; for (const b of new Uint8Array(q.buffer)) s += String.fromCharCode(b); return btoa(s); };
export const decodeEmb = (b) => { const u = Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); const q = new Int8Array(u.buffer); const f = new Float32Array(q.length); let n = 0; for (let i = 0; i < q.length; i++) { f[i] = q[i] / 400; n += f[i] * f[i]; } n = Math.sqrt(n) || 1; for (let i = 0; i < f.length; i++) f[i] /= n; return f; };

export async function loadStyle() {
  if (cache) return cache;
  let data = null;
  try {
    const r = await fetch('api/style', { cache: 'no-store' });
    if (r.ok) data = await r.json();
  } catch { /* offline */ }
  if (!data) { try { data = JSON.parse(localStorage.getItem(LS) || 'null'); } catch { /* corrupt */ } }
  cache = normalise(data);
  return cache;
}
function normalise(d) {
  d = d || {};
  d.finals = d.finals || []; d.examples = d.examples || []; d.look = d.look || null;
  d._finals = d.finals.map((f) => ({ emb: decodeEmb(f.e), stats: f.s }));
  d._examples = d.examples.map((x) => ({ emb: decodeEmb(x.e), d: x.d }));
  return d;
}
export async function saveStyle(d) {
  d.updatedAt = Date.now();
  const plain = { finals: d.finals, look: d.look, examples: d.examples, updatedAt: d.updatedAt };
  try { localStorage.setItem(LS, JSON.stringify(plain)); } catch { /* quota: server copy still saved */ }
  let ok = false;
  try { ok = (await fetch('api/style', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plain) })).ok; } catch { /* offline */ }
  cache = normalise(plain);
  return ok;
}

export const hasStyle = (d) => d && (d.finals.length >= 10 || d.look || d.examples.length >= 5);

/** Record a photo edited by hand in Sculpt as a colour example (learning from edits). */
export async function recordExample(emb, dev) {
  const d = await loadStyle();
  if (!COLOUR_KEYS.some((k) => dev[k])) return;
  const ex = { e: encodeEmb(emb), d: Object.fromEntries(COLOUR_KEYS.map((k) => [k, dev[k] || 0])) };
  // append server-side so two photographers editing at once don't overwrite each other
  let ok = false;
  try { ok = (await fetch('api/style/examples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ex) })).ok; } catch { /* offline */ }
  d.examples.push(ex);
  if (d.examples.length > 600) d.examples.splice(0, d.examples.length - 600);
  d._examples = d.examples.map((x) => ({ emb: decodeEmb(x.e), d: x.d }));
  try { localStorage.setItem(LS, JSON.stringify({ finals: d.finals, look: d.look, examples: d.examples, updatedAt: Date.now() })); } catch { /* quota */ }
  if (!ok) await saveStyle(d);
}

/**
 * Develop sliders for a photo in the learned style.
 * thumb: {data,w,h} ≈112px RGBA of the unedited photo; emb: grading-blind scene fingerprint; boxes: faces in thumb coords.
 */
export function styleSliders(d, thumb, emb, boxes = []) {
  const dev = { temp: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, clarity: 0, vibrance: 0, saturation: 0 };
  const notes = [];
  // tone: from finished photos of similar scenes (tested: ~30% closer to the photographer's finish)
  if (d._finals.length >= 10) {
    const tgt = neighbourTarget(emb, d._finals);
    Object.assign(dev, fitSliders(thumb, tgt, { boxes, colour: false }));
    notes.push('tone from your finished photos');
  }
  // colour: from edits made in Sculpt (similar scenes), else your colour look
  if (d._examples.length >= 5) {
    const sc = d._examples.map((x, i) => [x.emb.reduce((s, v, j) => s + v * emb[j], 0), i]).sort((a, b) => b[0] - a[0]).slice(0, 7);
    const ws = sc.map(([c]) => Math.exp((c - sc[0][0]) * 12)), W = ws.reduce((a, b) => a + b, 0);
    for (const k of COLOUR_KEYS) dev[k] = Math.round(sc.reduce((s, [, i], n) => s + ws[n] * (d._examples[i].d[k] || 0), 0) / W);
    notes.push(`colour from ${d._examples.length} of your edits`);
  } else if (d.look) {
    for (const k of COLOUR_KEYS) dev[k] = d.look[k] || 0;
    notes.push('your colour look');
  }
  return { dev, notes };
}

export function describeStyle(d) {
  if (!d) return 'No style yet.';
  const parts = [];
  if (d.finals.length) parts.push(`tone learned from ${d.finals.length} finished photo${d.finals.length > 1 ? 's' : ''}${d.finals.length < 10 ? ' (needs 10+)' : ''}`);
  if (d.look) parts.push('colour look set');
  if (d.examples.length) parts.push(`colour learned from ${d.examples.length} edit${d.examples.length > 1 ? 's' : ''}${d.examples.length < 5 ? ' (needs 5+)' : ''}`);
  return parts.length ? parts.join(' · ') : 'No style yet.';
}
export { COLOUR_KEYS };
