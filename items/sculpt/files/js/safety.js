import { hlTone } from './profiles.js';
// Safety checks for hands-off delivery: before an auto-edited photo is saved, look at the actual result and make
// sure nothing is off — skin in a believable range, faces / dress not blown, not too dark or bright, no colour cast.
// If a check fails, the auto-pilot re-edits that photo more conservatively and checks again (see exporter.js).

const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fLab = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function lab(r, g, b) {
  r = toLin(r / 255); g = toLin(g / 255); b = toLin(b / 255);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const median = (a) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };

const LIN8 = Float64Array.from({ length: 256 }, (_, v) => toLin(v / 255));   // same values lab() computes, looked up
// hypot(a, b) < r without the slow Math.hypot except right at the edge (identical answers)
const within = (a, b, r) => { const q = a * a + b * b, r2 = r * r; return q < r2 * 0.9999 ? true : q > r2 * 1.0001 ? false : Math.hypot(a, b) < r; };
const median64 = (a, n) => (n ? a.subarray(0, n).sort()[n >> 1] : null);
/** Brightness / clipping / cast measurements of an RGBA image (seg classes 3 = face skin).
 * (Typed buffers + a linearise table instead of pushing to arrays: ~4x faster, same numbers.) */
export function measure(d, w, h, seg) {
  const n = w * h, allL = new Float64Array(n), skinL = new Float64Array(seg ? n : 0), dressL = new Float64Array(seg ? n : 0);
  let skinN = 0, skinClip = 0, clip = 0, dressN = 0, dressClip = 0, whitesN = 0, wa = 0, wb = 0;
  const row = seg ? new Int32Array(w) : null;
  if (seg) for (let x = 0; x < w; x++) row[x] = Math.min(seg.w - 1, Math.floor((x + 0.5) * seg.w / w));
  for (let y = 0, i = 0, j = 0; y < h; y++) {
    const sy = seg ? Math.min(seg.h - 1, Math.floor((y + 0.5) * seg.h / h)) * seg.w : 0;
    for (let x = 0; x < w; x++, i += 4, j++) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const R = LIN8[r], G = LIN8[g], B = LIN8[b];
      const fx = fLab((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), fy = fLab(0.2126 * R + 0.7152 * G + 0.0722 * B), fz = fLab((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
      const Lv = 116 * fy - 16, a = 500 * (fx - fy), bb = 200 * (fy - fz);
      allL[j] = Lv;
      if (r >= 253 && g >= 253 && b >= 253) clip++;
      if (Lv > 78 && within(a, bb, 18)) { whitesN++; wa += a; wb += bb; }
      if (seg) {
        const k = seg.data[sy + row[x]];
        if (k === 3) { skinL[skinN++] = Lv; if (r >= 250 || g >= 250 || b >= 250) skinClip++; }
        if (k === 4 && Lv > 82 && within(a, bb, 10)) { dressL[dressN++] = Lv; if (r >= 252 && g >= 252 && b >= 252) dressClip++; }   // white clothing (a dress)
      }
    }
  }
  const dl = dressN ? dressL.subarray(0, dressN).sort() : null;
  return { skinL: skinN > n * 0.003 ? median64(skinL, skinN) : null, skinClip: skinN ? skinClip / skinN : 0, meanL: median64(allL, n), clip: clip / n,
    cast: whitesN > n * 0.02 ? [wa / whitesN, wb / whitesN] : null, dressWhite: dressN / n, dressClip: dressN ? dressClip / dressN : 0,
    dressL: dl ? dl[dressN >> 1] : null, dressHi: dl ? dl[Math.floor(dressN * 0.9)] - dl[Math.floor(dressN * 0.1)] : null };
}

/**
 * Judge an edit against the photo it came from. Only damage the EDIT introduced is flagged (Jesse's moody,
 * silhouetted or high-key looks are never second-guessed), plus frames nobody delivers (fully black / white).
 * base = the neutral render ({data,w,h}, e.g. renderer.thumbnail) — optional.
 */
export const LIMITS = { dressMin: 0.02, dressL: 93, dressFolds: 6, blownFaces: 0.6, blownRise: 0.45, crushDrop: 14, crushed: 28, glare: 92, clipRise: 0.22, black: 2, white: 98, castA: 12, castB: 24, castBlue: -16, castShift: 9 };
export async function inspect(blob, seg = null, base = null, L = LIMITS) {
  // blob: the exported JPEG, or an ImageBitmap of the render already at 480 px wide (deferred exports; consumed here)
  const bmp = blob instanceof ImageBitmap ? blob : await createImageBitmap(blob, { resizeWidth: 480, resizeQuality: 'medium' });
  const w = bmp.width, h = bmp.height, c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0); bmp.close();
  const o = measure(g.getImageData(0, 0, w, h).data, w, h, seg);
  const b = base ? measure(base.data, base.w, base.h, seg) : null;
  const problems = [];
  if (o.skinL != null && o.skinClip > L.blownFaces && (!b || o.skinClip - b.skinClip > L.blownRise)) problems.push({ kind: 'skin-clip', msg: 'faces blown out' });
  if (o.skinL != null && b && b.skinL != null && o.skinL < L.crushed && b.skinL - o.skinL > L.crushDrop) problems.push({ kind: 'skin-dark', msg: 'faces crushed into shadow', skinL: o.skinL });
  if (o.skinL != null && o.skinL > L.glare) problems.push({ kind: 'skin-bright', msg: 'faces glaring white', skinL: o.skinL });
  if (b && o.clip - b.clip > L.clipRise) problems.push({ kind: 'clip', msg: 'large areas blown out' });
  // a white dress that comes out flat and near-white (Jesse 2026-11-06, Steph & Josh: "the dress blows out" at one bright
  // location; he picked highlights recovered x2 there and the delivered look everywhere else). 80 exports measured: dress
  // L* >= 93 with p10-p90 fold detail <= 6 flags 18/33 photos at that location, 1/22 elsewhere.
  if (o.dressWhite >= L.dressMin && o.dressL >= L.dressL && o.dressHi <= L.dressFolds) problems.push({ kind: 'dress-flat', msg: 'white dress blown flat' });
  else if (o.dressWhite >= L.dressMin && o.dressL >= L.dressL - 1 && o.dressHi <= L.dressFolds + 1.5) problems.push({ kind: 'dress-maybe', msg: 'white dress may be too bright', soft: true });
  if (o.meanL < L.black) problems.push({ kind: 'dark', msg: 'nearly black' });
  if (o.meanL > L.white) problems.push({ kind: 'bright', msg: 'nearly white' });
  if (o.cast && (Math.abs(o.cast[0]) > L.castA || o.cast[1] > L.castB || o.cast[1] < L.castBlue) &&
      (!b || !b.cast || Math.hypot(o.cast[0] - b.cast[0], o.cast[1] - b.cast[1]) > L.castShift)) problems.push({ kind: 'cast', msg: 'colour cast in whites', cast: o.cast });
  const hard = problems.filter((x) => !x.soft);       // soft = only worth asking about (the review), never re-edited
  return { ok: !hard.length, problems: hard, unsure: problems.filter((x) => x.soft), stats: o, base: b };
}

/** A safer edit that fixes what inspect() found (applied to p.edit; slider units). */
export function saferEdit(p, report, attempt) {
  const e = p.edit, dev = { ...e.dev };
  const lin = (Lv) => ((Lv + 16) / 116) ** 3;
  for (const pr of report.problems) {
    if (pr.kind === 'skin-dark' || pr.kind === 'skin-bright') {
      const target = pr.kind === 'skin-dark' ? Math.max(40, (report.base && report.base.skinL) || 40) : 80;   // lift out of the crush / bring down from glare
      const ev = Math.log2(lin(target) / lin(pr.skinL));
      dev.exposure = Math.max(-100, Math.min(100, (dev.exposure || 0) + ev / 2.5 * 100));
    }
    if (pr.kind === 'skin-clip' || pr.kind === 'clip' || pr.kind === 'bright') { dev.exposure = (dev.exposure || 0) - 16; dev.highlights = Math.min(dev.highlights || 0, -30); dev.whites = Math.min(dev.whites || 0, -10); }
    if (pr.kind === 'dark') dev.exposure = (dev.exposure || 0) + 40;
    if (pr.kind === 'dress-flat' && e.look && e.look.tone) {   // his "recovered x2" - topped up to two steps, never stacked on the wedding's own recovery
      const two = hlTone({}, 2); e.look = { ...e.look, tone: { ...e.look.tone, highlights: Math.min(e.look.tone.highlights || 0, two.highlights), whites: Math.min(e.look.tone.whites || 0, two.whites) } };
    }
    if (pr.kind === 'cast') { dev.temp = (dev.temp || 0) * 0.4; dev.tint = (dev.tint || 0) * 0.4; if (e.look) e.look = { ...e.look, amount: Math.min(e.look.amount ?? 100, 60) }; }
  }
  // the last resort is the plainest believable edit: the look at half strength
  if (attempt >= 2 && e.look && report.problems.some((x) => !x.kind.startsWith('dress'))) e.look = { ...e.look, amount: Math.min(e.look.amount ?? 100, 50) };   // never for the dress fix alone
  e.dev = dev;
}
