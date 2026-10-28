import { simulate, baseLum, photoStats } from './style.js';
// Sculpt's built-in wedding profiles. Each is a full colour grade — tone curve, film-style channel
// curves, per-colour hue/saturation/luminance, split toning, matte blacks, highlight roll-off and grain —
// baked into a 3D LUT the GPU applies at full resolution, plus matching tone-slider offsets.
// A profile sits under the sliders (like a Lightroom profile): the sliders still fine-tune on top.

export const PROFILES = [
  {
    id: 'jc', name: 'Jesse Chance Signature', emoji: '🤎',
    blurb: "Jesse Chance's signature: warm, earthy and atmospheric. Muted film-like colour, deep shadows, soft rolled-off highlights — and rich golden skin that glows.",
    // Measured from full Jesse Chance galleries (Shona King 486 + Jessica [redacted] 331): median L* 32, no pure whites
    // (highlights roll off ~L*85), deep warm blacks, warm-brown shadows, overall colour 7, golden skin L*55 a*15 b*19.
    tone: {
      L: [0.1, 3.3, 3.6, 4.1, 5.3, 7.7, 11.7, 16.8, 22.8, 29.1, 35.7, 42.8, 50.1, 57, 63, 67.7, 71.6, 75.1, 78.3, 81.7, 90],
      skinL: 55, blackMax: 6, clipMax: 0.002,
    },
    wbKeep: 0.35,
    dev: { highlights: -20, clarity: -10 },
    curve: [[0, 0.02], [0.15, 0.105], [0.4, 0.38], [0.7, 0.715], [0.88, 0.845], [1, 0.89]],
    rgb: { r: [[0, 0.005], [0.5, 0.505], [1, 1]], g: [[0, 0.004], [1, 0.99]], b: [[0, 0.004], [0.5, 0.49], [1, 0.96]] },
    hsl: {
      red: { s: 0.0 },
      orange: { hue: 2, s: 0.28 },
      yellow: { hue: 0, s: -0.2, l: 0.02 },
      green: { hue: 16, s: -0.48, l: 0.2 },
      aqua: { s: -0.6, l: -0.1 },
      blue: { hue: 10, s: -0.68, l: -0.25 },
      purple: { s: -0.45, l: -0.1 },
      magenta: { s: -0.35 },
    },
    split: { shadows: [32, 0.08], highlights: [40, 0.025] },
    sat: 0.6, grain: 0.12, vignette: 0.22,
  },
  {
    id: 'jcbright', name: 'Jesse Chance Bright', emoji: '☀️',
    blurb: "Jesse Chance's bright style: warm, vivid and true-to-life. Golden skin, sunny greens, crisp contrast with deep blacks.",
    // Measured from full Jesse Chance galleries ([redacted] 802, [redacted] 963, [redacted] 691):
    // median L* 54, skin L*61 a*18 b*19, colour 14.6, warm-brown shadows, near-neutral whites.
    tone: {
      L: [0, 3.1, 7.3, 12.9, 18.8, 24.7, 30.5, 36.3, 41.9, 47.1, 52.4, 57.6, 62.9, 67.9, 72.4, 76.8, 81.3, 86.2, 91.3, 96.6, 99.5],
      skinL: 60, blackMax: 8, clipMax: 0.03,
    },
    wbKeep: 0.4,
    dev: {},
    curve: [[0, 0], [0.25, 0.23], [0.5, 0.52], [0.75, 0.795], [1, 1]],
    rgb: { r: [[0, 0], [0.5, 0.505], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [0.5, 0.495], [1, 0.99]] },
    hsl: {
      red: { s: -0.08 }, orange: { hue: -6, s: -0.25 }, yellow: { s: 0.0 },
      green: { hue: -16, s: -0.15, l: 0.1 }, aqua: { s: -0.1, l: 0.15 }, blue: { s: -0.15, l: 0.3 },
      purple: { s: -0.05 }, magenta: {},
    },
    split: { shadows: [35, 0.12], highlights: [45, 0.035] },
    sat: 1.0, grain: 0.0,
  },
  {
    id: 'airy', name: 'Light & Airy', emoji: '🤍',
    blurb: 'Bright, clean and luminous — tuned against 31 professional fine-art wedding photos. Pure whites, soft peachy skin, fresh greens.',
    // Adaptive: every photo is fitted to these numbers, measured from professional light & airy wedding work
    // (skin L*≈82, median L*≈83, deep neutral blacks, neutral whites, soft colour), so dark and bright shots both land in the look.
    tone: {
      L: [0, 17, 38, 51, 59.6, 66.5, 71.8, 75.6, 78.6, 81, 83.1, 84.8, 86.5, 88.1, 89.8, 91.5, 93.4, 95.3, 97, 98.5, 99.5],
      skinL: 80, blackMax: 17, clipMax: 0.015,
    },
    wbKeep: 0.12,                       // pros fully neutralise mixed/tungsten light for this look
    dev: { highlights: -10 },
    curve: [[0, 0.03], [0.25, 0.265], [0.5, 0.53], [0.75, 0.79], [0.9, 0.925], [1, 0.99]],
    rgb: { r: [[0, 0], [0.5, 0.503], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] },
    hsl: {
      red: { s: -0.18 }, orange: { hue: -3, s: -0.32, l: 0.02 }, yellow: { hue: -5, s: -0.35, l: 0.0 },
      green: { hue: 30, s: -0.28, l: -0.12 }, aqua: { s: -0.2, l: 0.02 }, blue: { s: -0.22, l: 0.05 },
      purple: { s: -0.12 }, magenta: { s: -0.08 },
    },
    split: { shadows: [35, 0.05], highlights: [20, 0.02] },
    sat: 0.9, grain: 0.0,
  },
  {
    id: 'film', name: 'Timeless Film', emoji: '🎞️',
    blurb: 'Warm Portra-style film. Peachy skin, olive greens, creamy highlights, fine grain.',
    dev: { exposure: 6, contrast: 4, highlights: -20, shadows: 12, blacks: 4, temp: 4, vibrance: -4 },
    curve: [[0, 0.04], [0.18, 0.165], [0.5, 0.52], [0.82, 0.855], [1, 0.97]],
    rgb: { r: [[0, 0.015], [0.5, 0.515], [1, 0.995]], g: [[0, 0.01], [0.5, 0.505], [1, 0.98]], b: [[0, 0.03], [0.5, 0.485], [1, 0.965]] },
    hsl: {
      red: { hue: 3, s: -0.08 }, orange: { hue: 2, s: 0.04, l: 0.04 }, yellow: { hue: -10, s: -0.18 },
      green: { hue: -28, s: -0.35, l: -0.04 }, aqua: { hue: 12, s: -0.3 }, blue: { hue: -10, s: -0.25, l: -0.04 },
      purple: { s: -0.25 }, magenta: { s: -0.15 },
    },
    split: { shadows: [165, 0.03], highlights: [38, 0.11] },
    sat: 0.95, grain: 0.45,
  },
  {
    id: 'moody', name: 'Dark & Moody', emoji: '🖤',
    blurb: 'Rich and cinematic. Deep olive greens, inky shadows, warm skin that glows.',
    dev: { exposure: -6, contrast: 12, highlights: -40, shadows: -4, whites: -8, blacks: -6, clarity: 10, vibrance: -6 },
    curve: [[0, 0.04], [0.15, 0.1], [0.35, 0.3], [0.6, 0.6], [0.85, 0.84], [1, 0.94]],
    rgb: { r: [[0, 0.01], [1, 1]], g: [[0, 0.01], [1, 0.99]], b: [[0, 0.03], [0.5, 0.49], [1, 0.975]] },
    hsl: {
      red: { s: -0.1, l: -0.05 }, orange: { s: 0.02, l: 0.1 }, yellow: { hue: -16, s: -0.35, l: -0.12 },
      green: { hue: -32, s: -0.5, l: -0.3 }, aqua: { hue: 8, s: -0.45, l: -0.18 }, blue: { hue: -12, s: -0.4, l: -0.2 },
      purple: { s: -0.45, l: -0.1 }, magenta: { s: -0.3 },
    },
    split: { shadows: [190, 0.07], highlights: [35, 0.08] },
    sat: 0.9, grain: 0.25,
  },
];
export const profileById = (id) => PROFILES.find((p) => p.id === id) || null;

// ------------------------------------------------------------------ colour ops (gamma RGB 0..1)
function spline(pts) {
  // monotone cubic (Fritsch–Carlson): smooth, never overshoots
  const n = pts.length, xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  if (n === 2) return (x) => ys[0] + (ys[1] - ys[0]) * Math.min(1, Math.max(0, (x - xs[0]) / (xs[1] - xs[0])));
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
export function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1) + 1e-9);
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, Math.min(1, s), l];
}
export function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}
// Lightroom-style colour bands (centre hue, degrees)
const BANDS = [['red', 0], ['orange', 30], ['yellow', 60], ['green', 120], ['aqua', 180], ['blue', 225], ['purple', 270], ['magenta', 315]];

/** A trained style (from before/after pairs, tools/learn_pairs.py): trilinear lookup into its LUT. */
function learnedGrade(L) {
  const n = L.N, lut = L.lut;
  return (r, g, b) => {
    const pr = Math.min(1, Math.max(0, r)) * (n - 1), pg = Math.min(1, Math.max(0, g)) * (n - 1), pb = Math.min(1, Math.max(0, b)) * (n - 1);
    const r0 = Math.min(n - 2, Math.floor(pr)), g0 = Math.min(n - 2, Math.floor(pg)), b0 = Math.min(n - 2, Math.floor(pb));
    const fr = pr - r0, fg = pg - g0, fb = pb - b0, out = [0, 0, 0];
    for (let db = 0; db < 2; db++) for (let dg = 0; dg < 2; dg++) for (let dr = 0; dr < 2; dr++) {
      const w = (dr ? fr : 1 - fr) * (dg ? fg : 1 - fg) * (db ? fb : 1 - fb);
      const c = lut[(r0 + dr) + n * (g0 + dg) + n * n * (b0 + db)];
      out[0] += w * c[0]; out[1] += w * c[1]; out[2] += w * c[2];
    }
    return out;
  };
}

/** Register a trained style as a profile (shown first, default for Process shoot). */
export function registerLearned(json) {
  if (!json || !json.lut || !json.model) return null;
  const i = PROFILES.findIndex((p) => p.id === 'learned');
  if (i >= 0) PROFILES.splice(i, 1);
  const prof = {
    id: 'learned', name: json.name || 'My trained style', emoji: '⭐',
    blurb: `Trained on ${json.trained_on} of your own before/after photos` + (json.heldout_de && json.heldout_de.sculpt != null
      ? ` — on held-back photos it landed ${Math.round(100 - 100 * json.heldout_de.sculpt / json.heldout_de.before)}% closer to your real edits.` : '.'),
    // Jesse's preset carries a slight clarity
    learned: json, dev: { clarity: json.clarity ?? 20 }, curve: [[0, 0], [1, 1]], rgb: { r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] },
    hsl: {}, split: { shadows: [0, 0], highlights: [0, 0] }, sat: 1, grain: 0,
  };
  PROFILES.unshift(prof);
  for (const k of [...lutCache.keys()]) if (k.startsWith('learned:')) lutCache.delete(k);
  return prof;
}

/** Highlight knee the profile was trained with (learned v2 profiles use more headroom). */
export function profileKnee(id) {
  const p = profileById(id);
  return (p && p.learned && p.learned.knee) || 0.88;
}

/** Per-photo exposure / temperature / tint the trained style predicts (slider units). thumb: RGBA8 ≈256px. */
export function learnedTone(id, thumb, seg = null, photo = null) {
  const p = profileById(id), L = p && p.learned;
  if (!L) return null;
  const { data, w, h } = thumb, n = w * h;
  const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lums = new Float32Array(n), Cs = [];
  let na = 0, nb = 0, nn = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    lums[i] = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
    const [l, a, bb] = labOf(r, g, b), C = Math.hypot(a, bb);
    Cs.push(C); sa += a; sb += bb;
    if (C < 15 && l > 20 && l < 92) { na += a; nb += bb; nn++; }
  }
  const sorted = Float32Array.from(lums).sort(), q = (f) => sorted[Math.min(n - 1, Math.floor(f * (n - 1)))];
  Cs.sort((x, y) => x - y);
  const neutral = nn > n * 0.03 ? [na / nn, nb / nn] : [0.5 * sa / n, 0.5 * sb / n];
  let dark = 0; for (let i = 0; i < n; i++) if (lums[i] < 0.01) dark++;
  const all = [Math.log2(Math.max(q(0.5), 1e-4)), Math.log2(Math.max(q(0.95), 1e-4)), Math.log2(Math.max(q(0.10), 1e-5)), neutral[0], neutral[1], Cs[n >> 1],
    Math.log2(Math.max(q(0.99), 1e-4)), dark / n];
  if (L.gbm) {
    // boosted trees over the photo's brightness spread, backlight, skin and the camera's settings + time of day —
    // computed exactly as in training (tools/brightness-model.py)
    const x = learnedFeatures(all, lums, sorted, thumb, seg, photo), out = {};
    learnedTone.lastFeatures = x;                      // (tests compare these with training)
    const lim = { exposure: [-(L.expMax || 100), L.expMax || 100], temp: [-100, 100], tint: [-100, 100] };
    L.gbm.targets.forEach((name, j) => { out[name] = Math.round(Math.max(lim[name][0], Math.min(lim[name][1], gbmPredict(L.gbm.models[j], x)))); });
    return out;
  }
  const { mu, sd, W } = L.model, f = all.slice(0, mu.length), z = [1, ...f.map((v, k) => (v - mu[k]) / sd[k])];
  // controls the profile predicts (v1/v2: exposure, temp, tint; v3 adds local shadows / highlights)
  const names = L.controls || ['exposure', 'temp', 'tint'];
  const lim = { exposure: [-(L.expMax || 100), L.expMax || 100], temp: [-100, 100], tint: [-100, 100], shadows: [0, 100], highlights: [-100, 0] };
  const out = {};
  names.forEach((name, j) => { const v = z.reduce((s, x, k) => s + x * W[k][j], 0); out[name] = Math.max(lim[name][0], Math.min(lim[name][1], v)); });
  // skin-anchored: photographers expose (and colour) for skin — solve exposure (and WB) so the graded skin
  // lands on the trained target. Needs the photo's skin map (editor detection); otherwise the regression stands.
  if (L.skin && seg) {
    const px = skinPixels(thumb, seg);
    if (px) {
      const grade = learnedGrade(L), knee = L.knee || 0.88;
      const statsAt = (t) => {
        const tt = t.temp / 100, ti = t.tint / 100;
        let gr = Math.exp(0.32 * tt), gg = Math.exp(-0.22 * ti), gb = Math.exp(-0.32 * tt);
        const lum = 0.2126 * gr + 0.7152 * gg + 0.0722 * gb, k = 2 ** (t.exposure / 100 * 2.5) / lum;
        gr *= k; gg *= k; gb *= k;
        const Ls = [], As = [], Bs = [];
        for (let i = 0; i < px.length; i += 3) {
          const o = grade(finishK(toLin(px[i]) * gr, knee), finishK(toLin(px[i + 1]) * gg, knee), finishK(toLin(px[i + 2]) * gb, knee));
          const c = labOf(o[0], o[1], o[2]); Ls.push(c[0]); As.push(c[1]); Bs.push(c[2]);
        }
        return [median(Ls), median(As), median(Bs)];
      };
      const tgt = L.skin.target;
      // 'shade' mode (Jesse 2026-10-28, two review photos "a bit dark": people in open shade, sunlit background):
      // only anchor to skin when the faces sit well below the rest of the frame, and only if that BRIGHTENS -
      // never darker than the regression's guess. Tested on 558 pairs: dark misses 24% -> 20% (tools/colour/eval_shade.py).
      let anchor = true;
      const regression = { ...out };
      if (L.skin.mode === 'shade') {
        const tt = out.temp / 100, ti = out.tint / 100;
        let gr = Math.exp(0.32 * tt), gg = Math.exp(-0.22 * ti), gb = Math.exp(-0.32 * tt);
        const lum = 0.2126 * gr + 0.7152 * gg + 0.0722 * gb, k = 2 ** (out.exposure / 100 * 2.5) / lum;
        gr *= k; gg *= k; gb *= k;
        const fr = [], d = thumb.data, step = Math.max(1, Math.floor(d.length / 4 / 4000));
        for (let i = 0; i < d.length; i += 4 * step) {
          const o = grade(finishK(toLin(d[i] / 255) * gr, knee), finishK(toLin(d[i + 1] / 255) * gg, knee), finishK(toLin(d[i + 2] / 255) * gb, knee));
          fr.push(labOf(o[0], o[1], o[2])[0]);
        }
        anchor = statsAt(out)[0] - median(fr) < -(L.skin.gap || 15);
      }
      for (let rep = 0; anchor && rep < (L.skin.wb ? 3 : 1); rep++) {
        let lo = lim.exposure[0], hi = lim.exposure[1];
        for (let it = 0; it < 16; it++) { const m = (lo + hi) / 2; if (statsAt({ ...out, exposure: m })[0] < tgt[0]) lo = m; else hi = m; }
        out.exposure = (lo + hi) / 2;
        if (L.skin.wb) {
          const err = (t) => { const st = statsAt(t); return (st[1] - tgt[1]) ** 2 + (st[2] - tgt[2]) ** 2; };
          for (const step of [16, 8, 4, 2]) for (const key of ['temp', 'tint']) for (const d of [1, -1]) {
            const t2 = { ...out, [key]: Math.max(-100, Math.min(100, out[key] + d * step)) };
            if (err(t2) < err(out)) Object.assign(out, t2);
          }
        }
      }
      if (L.skin.mode === 'shade' && out.exposure < regression.exposure) Object.assign(out, regression);   // never darker
    }
  }
  for (const k in out) out[k] = Math.round(out[k]);
  return out;
}
/** The guesser's inputs (same order and maths as tools/brightness-model.py features()). */
export function learnedFeatures(base8, lums, sorted, thumb, seg, photo) {
  const { data, w: Wd, h: H } = thumb, n = Wd * H, lg = (v) => Math.log2(Math.max(v, 1e-5));
  const q = (f) => sorted[Math.min(n - 1, Math.floor(f * (n - 1)))];
  const pc = [0.01, 0.05, 0.25, 0.5, 0.75, 0.9, 0.99].map((f) => lg(q(f)));
  const med = (a) => { const t = Float32Array.from(a).sort(); return t[t.length >> 1]; };
  const cen = [], bor = [], top = [], bot = [], h6 = Math.floor(H / 6), w6 = Math.floor(Wd / 6), h3 = Math.floor(H / 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < Wd; x++) {
    const v = lums[y * Wd + x];
    if (y >= Math.floor(H / 4) && y < Math.floor(3 * H / 4) && x >= Math.floor(Wd / 4) && x < Math.floor(3 * Wd / 4)) cen.push(v);
    if (y < h3) top.push(v); if (y >= H - h3) bot.push(v);
  }
  for (let y = 0; y < h6; y++) for (let x = 0; x < Wd; x++) bor.push(lums[y * Wd + x]);
  for (let y = H - h6; y < H; y++) for (let x = 0; x < Wd; x++) bor.push(lums[y * Wd + x]);
  for (let y = 0; y < H; y++) { for (let x = 0; x < w6; x++) bor.push(lums[y * Wd + x]); for (let x = Wd - w6; x < Wd; x++) bor.push(lums[y * Wd + x]); }
  let bright = 0; for (let i = 0; i < n; i++) if (lums[i] > 0.95) bright++;
  let sk = [NaN, NaN, NaN, NaN];
  if (seg) {
    const Ls = [], As = [], Bs = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < Wd; x++) {
      const c = seg.data[Math.min(seg.h - 1, Math.floor((y + 0.5) * seg.h / H)) * seg.w + Math.min(seg.w - 1, Math.floor((x + 0.5) * seg.w / Wd))];
      if (c !== 2 && c !== 3) continue;
      const i = (y * Wd + x) * 4, l = labOf(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
      Ls.push(l[0]); As.push(l[1]); Bs.push(l[2]);
    }
    if (Ls.length > 0.003 * n) sk = [med(Ls), med(As), med(Bs), Ls.length / n];
  }
  const m = (photo && { ...(photo.meta || {}), ...(photo.fullMeta || {}) }) || {};
  const t = +m.shutter || 0, f = +m.aperture || 0, iso = +m.iso || 0;
  const cam = [t > 0 ? Math.log2(t) : NaN, f || NaN, iso > 0 ? Math.log2(iso) : NaN, t > 0 && f > 0 && iso > 0 ? Math.log2(f * f / t) - Math.log2(iso / 100) : NaN];
  const tm = photo && (photo.time0 ?? photo.time), d = tm != null ? new Date(tm) : null;
  const hr = d && !isNaN(d) ? d.getHours() + d.getMinutes() / 60 : NaN;
  // index 29: how many stops LibRaw-style auto-brighten lifted this RAW (io.js autoBrighten) - the camera's real exposure
  const ab = m.autoBrightEv != null ? +m.autoBrightEv : NaN;
  return [...base8, ...pc, lg(med(cen)) - lg(med(bor)), lg(med(top)) - lg(med(bot)), bright / n, ...sk, ...cam,
    Math.sin(hr / 24 * 2 * Math.PI), Math.cos(hr / 24 * 2 * Math.PI), hr, ab];
}
/** One boosted-trees regressor (scikit-learn HistGradientBoosting, exported node lists). */
export function gbmPredict(model, x) {
  let s = model.base;
  for (const nodes of model.trees) {
    let k = 0;
    for (;;) {
      const [f, thr, l, r, leaf, val, missLeft] = nodes[k];
      if (leaf) { s += val; break; }
      const v = x[f];
      k = Number.isNaN(v) ? (missLeft ? l : r) : (v <= thr ? l : r);
    }
  }
  return s;
}
/** Quick preview of a trained style on a thumbnail (exposure / temp / tint + its look) — for the brightness check. */
export function previewLearned(id, thumb, tone) {
  const L = profileById(id)?.learned; if (!L) return null;
  const grade = learnedGrade(L), knee = L.knee || 0.88, { data, w, h } = thumb, out = new ImageData(w, h);
  const tt = (tone.temp || 0) / 100, ti = (tone.tint || 0) / 100;
  let gr = Math.exp(0.32 * tt), gg = Math.exp(-0.22 * ti), gb = Math.exp(-0.32 * tt);
  const lum = 0.2126 * gr + 0.7152 * gg + 0.0722 * gb, k = 2 ** ((tone.exposure || 0) / 100 * 2.5) / lum;
  gr *= k; gg *= k; gb *= k;
  const lin = new Float32Array(256); for (let i = 0; i < 256; i++) lin[i] = toLin(i / 255);
  for (let i = 0; i < w * h * 4; i += 4) {
    const o = grade(finishK(lin[data[i]] * gr, knee), finishK(lin[data[i + 1]] * gg, knee), finishK(lin[data[i + 2]] * gb, knee));
    out.data[i] = o[0] * 255; out.data[i + 1] = o[1] * 255; out.data[i + 2] = o[2] * 255; out.data[i + 3] = 255;
  }
  return out;
}
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGam = (v) => (v <= 0.0031308 ? Math.max(0, v) * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
/** gamma + soft highlight knee — mirrors finish() in render.js */
const finishK = (l, knee) => { const g = toGam(l); return g <= knee ? g : knee + (1 - knee) * (1 - Math.exp(-(g - knee) / (1 - knee))); };
const median = (a) => { const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
/** Skin pixels (gamma RGB triples) of a thumbnail, from the segmenter's map: face skin, else face + body skin. */
function skinPixels(thumb, seg) {
  const { data, w, h } = thumb, face = [], both = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = seg.data[Math.min(seg.h - 1, Math.floor((y + 0.5) * seg.h / h)) * seg.w + Math.min(seg.w - 1, Math.floor((x + 0.5) * seg.w / w))];
    if (c !== 2 && c !== 3) continue;
    const i = (y * w + x) * 4, p = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
    both.push(...p); if (c === 3) face.push(...p);
  }
  const n = w * h;
  if (face.length / 3 >= 0.003 * n) return face;
  if (both.length / 3 >= 0.005 * n) return both;
  return null;
}
function labOf(r, g, b) {
  const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  r = toLin(r); g = toLin(g); b = toLin(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** The colour-grade function of a profile: gamma RGB → gamma RGB. */
export function gradeFn(p) {
  if (p.learned) return learnedGrade(p.learned);
  const master = spline(p.curve), cr = spline(p.rgb.r), cg = spline(p.rgb.g), cb = spline(p.rgb.b);
  const bands = BANDS.map(([name, c]) => ({ c, hue: 0, s: 0, l: 0, ...(p.hsl[name] || {}) }));
  const tint = (h, s) => { const c = hsl2rgb(h, 1, 0.5); return [(c[0] - 0.5) * s, (c[1] - 0.5) * s, (c[2] - 0.5) * s]; };
  const sh = tint(...p.split.shadows), hi = tint(...p.split.highlights);
  return (r, g, b) => {
    // 1. tone: master curve, then film-style channel curves
    r = cr(master(r)); g = cg(master(g)); b = cb(master(b));
    // 2. per-colour hue / saturation / luminance, blended smoothly between neighbouring bands
    let [h, s, l] = rgb2hsl(r, g, b);
    if (s > 0.02) {
      let dh = 0, ds = 0, dl = 0;
      for (const bd of bands) {
        let dist = Math.abs(h - bd.c); dist = Math.min(dist, 360 - dist);
        const span = bd.c >= 120 && bd.c <= 225 ? 60 : 35;     // cool bands are wider apart
        const w = Math.max(0, 1 - dist / span);
        dh += bd.hue * w; ds += bd.s * w; dl += bd.l * w;
      }
      const sw = Math.min(1, s / 0.25);                    // greys & near-greys stay put
      h = h + dh * sw;
      s = Math.min(1, Math.max(0, s * (1 + ds * sw)));
      l = Math.min(1, Math.max(0, l + dl * 0.2 * sw * (1 - Math.abs(2 * l - 1) * 0.6)));
      [r, g, b] = hsl2rgb(h, s, l);
    }
    // 3. global saturation
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = y + (r - y) * p.sat; g = y + (g - y) * p.sat; b = y + (b - y) * p.sat;
    // 4. split toning — highlight tone peaks in the upper mids and fades out near pure white,
    //    so wedding dresses stay clean white / ivory instead of turning yellow
    const sm = (a, b2, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b2 - a))); return t * t * (3 - 2 * t); };
    const ws = (1 - sm(0, 0.55, y)) * (0.6 + 0.4 * sm(0, 0.12, y));
    const wh = sm(0.3, 0.75, y) * (1 - 0.8 * sm(0.82, 1.0, y));
    r += sh[0] * ws + hi[0] * wh; g += sh[1] * ws + hi[1] * wh; b += sh[2] * ws + hi[2] * wh;
    return [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))];
  };
}

export const LUT_N = 33;
const lutCache = new Map();
/** RGBA8 LUT_N³ for a profile at amount 0..1 (cached). */
export function profileLut(id, amount = 1, override = null) {
  const key = id + ':' + amount.toFixed(2);
  if (!override && lutCache.has(key)) return lutCache.get(key);
  const p = override || profileById(id);
  if (!p) return null;
  const f = gradeFn(p), N = LUT_N, out = new Uint8Array(N * N * N * 4);
  let o = 0;
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    const r = ri / (N - 1), g = gi / (N - 1), b = bi / (N - 1), c = f(r, g, b);
    out[o++] = Math.round((r + (c[0] - r) * amount) * 255);
    out[o++] = Math.round((g + (c[1] - g) * amount) * 255);
    out[o++] = Math.round((b + (c[2] - b) * amount) * 255);
    out[o++] = 255;
  }
  if (!override) {
    if (lutCache.size > 12) lutCache.delete(lutCache.keys().next().value);
    lutCache.set(key, out);
  }
  return out;
}

/** Tone-slider offsets the profile adds (scaled by amount 0..1). */
export function profileDev(id, amount = 1, override = null) {
  const p = override || profileById(id);
  if (!p) return {};
  return Object.fromEntries(Object.entries(p.dev).map(([k, v]) => [k, v * amount]));
}
export const profileGrain = (id, amount = 1, override = null) => ((override || profileById(id))?.grain || 0) * amount;

/** Brightness distribution (21 quantiles of L*) an adaptive profile fits each photo to, or null. */
export const profileTone = (id) => profileById(id)?.tone || null;

/**
 * Adaptive tone for a profile: find the extra exposure/contrast/whites/shadows/highlights a photo needs so that —
 * with the user's sliders, the profile's offsets and its colour grade applied — it lands in the profile's look.
 * Priorities (from measuring professional work): skin brightness first, then the overall brightness spread,
 * deep blacks kept deep, and no blown highlights.
 * thumb: {data,w,h} ≈112px RGBA8 of the unedited photo; boxes: face boxes in thumb coords.
 */
export function fitAdaptiveTone(thumb, userDev, id, override = null, boxes = []) {
  const prof = override || profileById(id), T = prof && prof.tone;
  if (!T) return null;
  const grade = gradeFn(prof), { data, w, h } = thumb, n = w * h, base = baseLum(data, w, h);
  const keys = ['temp', 'tint', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'clarity', 'vibrance', 'saturation'];
  const start = Object.fromEntries(keys.map((k) => [k, (userDev[k] || 0) + (prof.dev[k] || 0)]));
  const lim = prof.toneLimits || { exposure: [-40, 65], contrast: [-30, 10], highlights: [-60, 10], shadows: [0, 35], whites: [-20, 25], blacks: [-30, 0] };
  const render = (d) => {
    const dd = Object.fromEntries(keys.map((k) => [k, Math.max(-100, Math.min(100, start[k] + (d[k] || 0)))]));
    const px = simulate(data, base, n, dd);
    for (let i = 0; i < n; i++) { const c = grade(px[i * 4] / 255, px[i * 4 + 1] / 255, px[i * 4 + 2] / 255); px[i * 4] = c[0] * 255; px[i * 4 + 1] = c[1] * 255; px[i * 4 + 2] = c[2] * 255; }
    return px;
  };
  const loss = (d) => {
    const px = render(d), st = photoStats(px, w, h, boxes);
    let e = 0;
    // overall brightness spread (mid & upper quantiles matter most; lower ones lightly)
    for (let k = 1; k < 20; k++) e += (k <= 4 ? 0.15 : k === 10 ? 1.5 : 0.6) * (st.Lq[k] - T.L[k]) ** 2 / 10;
    // skin brightness is the anchor when there are faces
    if (T.skinL && st.skin) e += 6 * (st.skin[0] - T.skinL) ** 2;
    // keep blacks deep: penalise the darkest 5% rising above the look's black level
    e += 3 * Math.max(0, st.Lq[1] - T.blackMax) ** 2;
    // no blown highlights beyond what the look allows
    let clip = 0; for (let i = 0; i < n; i++) if (px[i * 4] > 252 && px[i * 4 + 1] > 252 && px[i * 4 + 2] > 252) clip++;
    e += 400 * Math.max(0, clip / n - T.clipMax) ** 2 * 100;
    // prefer small moves
    for (const k of Object.keys(lim)) e += 0.004 * (d[k] || 0) ** 2;
    return e;
  };
  const d = {};
  for (const k of Object.keys(lim)) d[k] = 0;
  let best = loss(d);
  for (let step = 16; step >= 2; step /= 2) for (let it = 0; it < 6; it++) {
    let moved = false;
    for (const k of Object.keys(lim)) for (const dir of [1, -1]) {
      const v = Math.max(lim[k][0], Math.min(lim[k][1], d[k] + dir * step));
      if (v === d[k]) continue;
      const old = d[k]; d[k] = v;
      const e = loss(d);
      if (e < best - 1e-6) { best = e; moved = true; break; }
      d[k] = old;
    }
    if (!moved) break;
  }
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v).map(([k, v]) => [k, Math.round(v)]));
}

export const profileVignette = (id, amount = 1, override = null) => ((override || profileById(id))?.vignette || 0) * amount;
