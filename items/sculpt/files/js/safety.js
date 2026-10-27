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

/** Brightness / clipping / cast measurements of an RGBA image (seg classes 3 = face skin). */
export function measure(d, w, h, seg) {
  const skinL = [], allL = [], whites = [];
  let skinN = 0, skinClip = 0, clip = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    const [Lv, a, bb] = lab(r, g, b);
    allL.push(Lv);
    if (r >= 253 && g >= 253 && b >= 253) clip++;
    if (Lv > 78 && Math.hypot(a, bb) < 18) whites.push([a, bb]);
    if (seg) {
      const k = seg.data[Math.min(seg.h - 1, Math.floor((y + 0.5) * seg.h / h)) * seg.w + Math.min(seg.w - 1, Math.floor((x + 0.5) * seg.w / w))];
      if (k === 3) { skinN++; skinL.push(Lv); if (r >= 250 || g >= 250 || b >= 250) skinClip++; }
    }
  }
  const n = w * h;
  let wa = 0, wb = 0; for (const [a, b] of whites) { wa += a; wb += b; }
  return { skinL: skinN > n * 0.003 ? median(skinL) : null, skinClip: skinN ? skinClip / skinN : 0, meanL: median(allL), clip: clip / n,
    cast: whites.length > n * 0.02 ? [wa / whites.length, wb / whites.length] : null };
}

/**
 * Judge an edit against the photo it came from. Only damage the EDIT introduced is flagged (Jesse's moody,
 * silhouetted or high-key looks are never second-guessed), plus frames nobody delivers (fully black / white).
 * base = the neutral render ({data,w,h}, e.g. renderer.thumbnail) — optional.
 */
export const LIMITS = { blownFaces: 0.6, blownRise: 0.45, crushDrop: 14, crushed: 28, glare: 92, clipRise: 0.22, black: 2, white: 98, castA: 12, castB: 24, castBlue: -16, castShift: 9 };
export async function inspect(blob, seg = null, base = null, L = LIMITS) {
  const bmp = await createImageBitmap(blob, { resizeWidth: 480, resizeQuality: 'medium' });
  const w = bmp.width, h = bmp.height, c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0); bmp.close();
  const o = measure(g.getImageData(0, 0, w, h).data, w, h, seg);
  const b = base ? measure(base.data, base.w, base.h, seg) : null;
  const problems = [];
  if (o.skinL != null && o.skinClip > L.blownFaces && (!b || o.skinClip - b.skinClip > L.blownRise)) problems.push({ kind: 'skin-clip', msg: 'faces blown out' });
  if (o.skinL != null && b && b.skinL != null && o.skinL < L.crushed && b.skinL - o.skinL > L.crushDrop) problems.push({ kind: 'skin-dark', msg: 'faces crushed into shadow', skinL: o.skinL });
  if (o.skinL != null && o.skinL > L.glare) problems.push({ kind: 'skin-bright', msg: 'faces glaring white', skinL: o.skinL });
  if (b && o.clip - b.clip > L.clipRise) problems.push({ kind: 'clip', msg: 'large areas blown out' });
  if (o.meanL < L.black) problems.push({ kind: 'dark', msg: 'nearly black' });
  if (o.meanL > L.white) problems.push({ kind: 'bright', msg: 'nearly white' });
  if (o.cast && (Math.abs(o.cast[0]) > L.castA || o.cast[1] > L.castB || o.cast[1] < L.castBlue) &&
      (!b || !b.cast || Math.hypot(o.cast[0] - b.cast[0], o.cast[1] - b.cast[1]) > L.castShift)) problems.push({ kind: 'cast', msg: 'colour cast in whites', cast: o.cast });
  return { ok: !problems.length, problems, stats: o, base: b };
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
    if (pr.kind === 'cast') { dev.temp = (dev.temp || 0) * 0.4; dev.tint = (dev.tint || 0) * 0.4; if (e.look) e.look = { ...e.look, amount: Math.min(e.look.amount ?? 100, 60) }; }
  }
  // the last resort is the plainest believable edit: the look at half strength
  if (attempt >= 2 && e.look) e.look = { ...e.look, amount: Math.min(e.look.amount ?? 100, 50) };
  e.dev = dev;
}
