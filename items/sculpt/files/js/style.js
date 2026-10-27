// "My style": learn a photographer's colour grade from their finished photos.
//
// With finished photos only (no before/after pairs) we can't see each edit, but we can see
// the *population*: how the tones and colours of everything you deliver differ from unedited
// photos from a camera (ideally your own current shoot — same camera, same light). That
// difference is your style. It's captured as one colour grade — tone curve, colour toning by
// brightness, per-hue saturation — baked into a 3D lookup table (LUT) that the GPU applies
// to every photo. Exposure/WB differences between photos are left to Auto / the sliders.

// ------------------------------------------------------------------ colour maths
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGam = (v) => { v = Math.max(0, v); return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055; };
const fLab = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const fInv = (t) => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787);

export function rgb2lab(r, g, b) {
  r = toLin(r); g = toLin(g); b = toLin(b);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export function lab2rgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = fInv(fx) * 0.95047, Y = fInv(fy), Z = fInv(fz) * 1.08883;
  return [toGam(3.2406 * X - 1.5372 * Y - 0.4986 * Z), toGam(-0.9689 * X + 1.8758 * Y + 0.0415 * Z), toGam(0.0557 * X - 0.2040 * Y + 1.0570 * Z)];
}

// ------------------------------------------------------------------ statistics
const NQ = 21;                                         // tone-curve knots (every 5th percentile)
const BAND_L = [18, 50, 82];                           // shadows / mids / highlights centres
const median = (a) => { if (!a.length) return 0; const s = Float32Array.from(a).sort(); return s[s.length >> 1]; };

/** Subsample an RGBA8 image into Lab samples (equal weight per photo when pooled). */
export function samples(data, w, h, k = 3000) {
  const n = w * h, step = Math.max(1, Math.floor(n / k)), L = [], A = [], B = [];
  for (let i = 0; i < n; i += step) {
    const [l, a, b] = rgb2lab(data[i * 4] / 255, data[i * 4 + 1] / 255, data[i * 4 + 2] / 255);
    L.push(l); A.push(a); B.push(b);
  }
  const chroma = median(A.map((a, i) => Math.hypot(a, B[i])));
  return { L, A, B, bw: chroma < 3 };
}

/** Pool many photos' samples into a compact summary (this is what gets stored). */
export function summarize(list) {
  list = list.filter((s) => s && !s.bw);
  const L = [], A = [], B = [];
  for (const s of list) { L.push(...s.L); A.push(...s.A); B.push(...s.B); }
  const Ls = Float32Array.from(L).sort();
  const Lq = Array.from({ length: NQ }, (_, i) => Ls[Math.min(Ls.length - 1, Math.floor(i / (NQ - 1) * (Ls.length - 1)))]);
  // colour cast by brightness (soft bands around 18/50/82 L)
  const band = BAND_L.map((c) => {
    let sa = 0, sb = 0, sw = 0;
    for (let i = 0; i < L.length; i++) {
      const wgt = Math.exp(-(((L[i] - c) / 16) ** 2));
      const ch = Math.hypot(A[i], B[i]);
      const wc = wgt / (1 + ch / 25);                  // lean on near-neutral pixels: they reveal the grade, not the subject
      sa += A[i] * wc; sb += B[i] * wc; sw += wc;
    }
    return sw > 0 ? [sa / sw, sb / sw] : [0, 0];
  });
  const hues = Array.from({ length: 8 }, () => []);
  for (let i = 0; i < L.length; i++) {
    const c = Math.hypot(A[i], B[i]);
    if (c > 6 && L[i] > 10 && L[i] < 95) hues[Math.floor(((Math.atan2(B[i], A[i]) / (2 * Math.PI) + 1) % 1) * 8) % 8].push(c);
  }
  return {
    n: list.length, Lq, band,
    hue: hues.map((h) => (h.length > L.length / 300 ? median(h) : null)),
    chroma: median(A.map((a, i) => Math.hypot(a, B[i]))),
  };
}

// Typical unedited camera rendering (pooled from varied straight-from-camera JPEG/RAW previews).
// Used as the "before" reference when there aren't enough photos in the current shoot.
export const DEFAULT_PRIOR = {"n":10,"Lq":[0,2.7,7,12.2,16.5,20.3,23.8,27.2,30.7,34,37.8,42.1,46.4,50.5,54.5,58.7,64.7,71.5,79.4,87.8,100],"band":[[1.5,5.3],[2.1,9],[1.2,-0.2]],"hue":[32.4,17,16.2,10.8,7.9,18.1,20.4,7.2],"chroma":12};

/** Reference "before" look: your current shoot (same camera & light) blended with the generic one.
 *  The more photos in the shoot, the more it counts (40 photos ≈ 73% shoot). */
export function blendPrior(shoot, generic = DEFAULT_PRIOR) {
  if (!shoot || !shoot.n) return generic;
  const w = shoot.n / (shoot.n + 15), mix = (a, b) => a * w + b * (1 - w);
  return {
    n: shoot.n, Lq: shoot.Lq.map((v, i) => mix(v, generic.Lq[i])),
    band: shoot.band.map((b, i) => [mix(b[0], generic.band[i][0]), mix(b[1], generic.band[i][1])]),
    hue: shoot.hue.map((v, i) => (v == null ? generic.hue[i] : generic.hue[i] == null ? v : mix(v, generic.hue[i]))),
    chroma: mix(shoot.chroma, generic.chroma),
  };
}

// ------------------------------------------------------------------ the grade
function curveFrom(prior, style) {
  // monotone tone curve: prior percentile → style percentile
  const xs = prior.Lq.slice(), ys = style.Lq.slice();
  for (let i = 1; i < xs.length; i++) { xs[i] = Math.max(xs[i], xs[i - 1] + 0.01); ys[i] = Math.max(ys[i], ys[i - 1]); }
  return (L) => {
    if (L <= xs[0]) return ys[0] + (L - xs[0]) * ((ys[1] - ys[0]) / (xs[1] - xs[0]) || 1);
    if (L >= xs[xs.length - 1]) return Math.min(100, ys[ys.length - 1] + (L - xs[xs.length - 1]));
    let k = 1; while (xs[k] < L) k++;
    const t = (L - xs[k - 1]) / (xs[k] - xs[k - 1]);
    return ys[k - 1] + (ys[k] - ys[k - 1]) * t;
  };
}

/**
 * The learned grade as a function Lab → Lab.
 * Smoothing: the tone curve is averaged over neighbours so noisy percentiles can't create kinks.
 */
export function gradeFn(style, prior = DEFAULT_PRIOR, strength = 1) {
  const curve = curveFrom(prior, style);
  const sm = (L) => (curve(L - 4) + 2 * curve(L) + curve(L + 4)) / 4;
  const dBand = style.band.map((b, i) => [b[0] - prior.band[i][0], b[1] - prior.band[i][1]]);
  const hueK = style.hue.map((v, i) => {
    const p = prior.hue[i];
    if (v == null || p == null) return style.chroma / prior.chroma;
    return Math.min(1.6, Math.max(0.5, v / p));
  });
  const k = strength;
  return (L, a, b) => {
    const L2 = L + (sm(L) - L) * k;
    // colour cast for this brightness (interpolate between band centres)
    let da, db;
    if (L2 <= BAND_L[0]) [da, db] = dBand[0];
    else if (L2 >= BAND_L[2]) [da, db] = dBand[2];
    else {
      const j = L2 < BAND_L[1] ? 0 : 1, t = (L2 - BAND_L[j]) / (BAND_L[j + 1] - BAND_L[j]);
      da = dBand[j][0] + (dBand[j + 1][0] - dBand[j][0]) * t; db = dBand[j][1] + (dBand[j + 1][1] - dBand[j][1]) * t;
    }
    // per-hue chroma scale (interpolated around the hue circle)
    const C = Math.hypot(a, b);
    let s = 1;
    if (C > 0.5) {
      const hb = ((Math.atan2(b, a) / (2 * Math.PI) + 1) % 1) * 8 - 0.5;
      const i0 = ((Math.floor(hb) % 8) + 8) % 8, t = hb - Math.floor(hb);
      s = hueK[i0] + (hueK[(i0 + 1) % 8] - hueK[i0]) * t;
      s = 1 + (s - 1) * Math.min(1, C / 6);            // greys stay grey
    }
    s = 1 + (s - 1) * k;
    return [L2, a * s + da * k, b * s + db * k];
  };
}

export const LUT_N = 33;
/** Bake the grade into an RGBA8 3D LUT (LUT_N³), indexed r fastest. */
export function buildLut(style, prior, strength = 1) {
  const f = gradeFn(style, prior, strength), N = LUT_N, out = new Uint8Array(N * N * N * 4);
  let o = 0;
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    const [L, a, b] = rgb2lab(ri / (N - 1), gi / (N - 1), bi / (N - 1));
    const [L2, a2, b2] = f(L, a, b);
    const c = lab2rgb(Math.max(0, Math.min(100, L2)), a2, b2);
    out[o++] = Math.round(Math.min(1, Math.max(0, c[0])) * 255);
    out[o++] = Math.round(Math.min(1, Math.max(0, c[1])) * 255);
    out[o++] = Math.round(Math.min(1, Math.max(0, c[2])) * 255);
    out[o++] = 255;
  }
  return out;
}

/** Plain-language summary of a learned style (shown in the UI). */
export function describe(style, prior = DEFAULT_PRIOR) {
  const out = [];
  const mid = style.Lq[10] - prior.Lq[10];
  if (Math.abs(mid) > 3) out.push(mid > 0 ? 'brighter' : 'darker');
  const blk = style.Lq[1] - prior.Lq[1];
  if (blk > 4) out.push('soft matte blacks');
  else if (blk < -4) out.push('deep blacks');
  const spread = (style.Lq[18] - style.Lq[2]) - (prior.Lq[18] - prior.Lq[2]);
  if (spread > 5) out.push('more contrast'); else if (spread < -5) out.push('softer contrast');
  const warm = style.band[1][1] - prior.band[1][1];
  if (warm > 2) out.push('warm'); else if (warm < -2) out.push('cool');
  const sh = style.band[0][1] - prior.band[0][1], hi = style.band[2][1] - prior.band[2][1];
  if (hi - sh > 3) out.push('warm highlights / cool shadows');
  const ch = style.chroma / prior.chroma;
  if (ch > 1.12) out.push('richer colour'); else if (ch < 0.88) out.push('muted colour');
  const g = style.hue[3] && prior.hue[3] ? style.hue[3] / prior.hue[3] : 1;
  if (g < 0.8) out.push('muted greens');
  return out.length ? out.join(', ') : 'close to the camera’s own look';
}

// ================================================================== similar-scene matching
// For each new photo: find your finished photos of the most similar scenes (grading-blind
// fingerprint), and fit the develop sliders so this photo's tones & colours land where yours did.

/** Per-photo statistics used for matching (Lab). boxes: face boxes in pixel coords. */
export function photoStats(data, w, h, boxes = []) {
  const s = summarize([samples(data, w, h, 2500)]);
  let skin = null;
  if (boxes.length) {
    const sl = [], sa = [], sb = [];
    for (const bx of boxes) {
      const x0 = Math.max(0, Math.round(bx.x + bx.w * 0.3)), x1 = Math.min(w, Math.round(bx.x + bx.w * 0.7));
      const y0 = Math.max(0, Math.round(bx.y + bx.h * 0.3)), y1 = Math.min(h, Math.round(bx.y + bx.h * 0.65));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4, [l, a, b] = rgb2lab(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
        // skin-coloured pixels only: sunglasses, eyes, brows, lips and hair don't count
        if (l > 22 && a > 2 && a < 32 && b > 4 && b < 40 && b > 0.4 * a) { sl.push(l); sa.push(a); sb.push(b); }
      }
    }
    if (sl.length > 12) skin = [median(sl), median(sa), median(sb)];
  }
  return { Lq: s.Lq, band: s.band, chroma: s.chroma, skin };
}

const cos = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Weighted target from the k most similar finished photos. finals: [{emb, stats}] */
export function neighbourTarget(emb, finals, k = 7) {
  const sc = finals.map((f, i) => [cos(emb, f.emb), i]).sort((a, b) => b[0] - a[0]).slice(0, k);
  const ws = sc.map(([c]) => Math.exp((c - sc[0][0]) * 12));        // closer scenes count more
  const W = ws.reduce((a, b) => a + b, 0);
  const avg = (get, len) => Array.from({ length: len }, (_, j) => sc.reduce((s, [, i], n) => s + ws[n] * get(finals[i].stats)[j], 0) / W);
  const withSkin = sc.map(([, i], n) => [finals[i].stats.skin, ws[n]]).filter(([s]) => s);
  const sw = withSkin.reduce((a, [, w]) => a + w, 0);
  return {
    Lq: avg((s) => s.Lq, NQ),
    band: [0, 1, 2].map((b) => avg((s) => s.band[b], 2)),
    chroma: avg((s) => [s.chroma], 1)[0],
    skin: sw > 0 ? [0, 1, 2].map((j) => withSkin.reduce((a, [s, w]) => a + w * s[j], 0) / sw) : null,
    similarity: sc[0][0],
  };
}

const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** CPU replica of render.js develop (sliders) on an RGBA8 thumbnail → RGBA8. base: blurred linear luminance. */
export function simulate(data, base, n, d) {
  const out = new Uint8ClampedArray(n * 4);
  const t = d.temp / 100, ti = d.tint / 100;
  let wr = Math.exp(0.32 * t), wg = Math.exp(-0.22 * ti), wb = Math.exp(-0.32 * t);
  const lum = 0.2126 * wr + 0.7152 * wg + 0.0722 * wb; wr /= lum; wg /= lum; wb /= lum;
  const ex = 2 ** (d.exposure / 100 * 2.5), C = d.contrast / 100, HI = d.highlights / 100, SH = d.shadows / 100;
  const wp = 1 - d.whites / 100 * 0.35, bp = -d.blacks / 100 * 0.02, VIB = d.vibrance / 100, SAT = d.saturation / 100;
  const fin = (v) => { let g = toGam(v); if (g > 0.88) g = 0.88 + 0.12 * (1 - Math.exp(-(g - 0.88) / 0.12)); return g; };
  for (let i = 0; i < n; i++) {
    const bl = Math.max(base[i] * ex, 1e-4);
    const k = 2 ** (SH * 1.6 * (1 - smoothstep(0, 0.22, bl)) + HI * 1.4 * smoothstep(0.12, 0.85, bl)) * ex;
    let r = fin((toLin(data[i * 4] / 255) * wr * k - bp) / (wp - bp));
    let g = fin((toLin(data[i * 4 + 1] / 255) * wg * k - bp) / (wp - bp));
    let b = fin((toLin(data[i * 4 + 2] / 255) * wb * k - bp) / (wp - bp));
    if (C >= 0) { r += C * (r * r * (3 - 2 * r) - r); g += C * (g * g * (3 - 2 * g) - g); b += C * (b * b * (3 - 2 * b) - b); }
    else { const m = -C * 0.4; r += m * (0.5 - r); g += m * (0.5 - g); b += m * (0.5 - b); }
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const skinish = smoothstep(0.02, 0.12, r - g) * smoothstep(0, 0.08, g - b);
    const f = (1 + VIB * (1 - sat) * 0.9 * (1 - 0.7 * skinish * (VIB >= 0 ? 1 : 0))) * (1 + SAT);
    out[i * 4] = (y + (r - y) * f) * 255; out[i * 4 + 1] = (y + (g - y) * f) * 255; out[i * 4 + 2] = (y + (b - y) * f) * 255; out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * Fit develop sliders so the photo's stats approach the target.
 * thumb: {data,w,h} small RGBA8 (≈96–128px) of the unedited photo. boxes: faces in thumb coords.
 * strength 0..1 damps how far it moves.
 */
export function fitSliders(thumb, target, { boxes = [], strength = 1, colour = true, post = null, limits = null, weights = null, base: startDev = null } = {}) {
  const { data, w, h } = thumb, n = w * h;
  const base = baseLum(data, w, h);
  const s0 = photoStats(data, w, h, boxes);
  const tL = target.Lq.map((v, k) => s0.Lq[k] + (v - s0.Lq[k]) * strength);
  const tMid = target.band[1].map((v, k) => s0.band[1][k] + (v - s0.band[1][k]) * strength);
  const tSkin = target.skin && s0.skin ? target.skin.map((v, k) => s0.skin[k] + (v - s0.skin[k]) * strength) : null;
  const tChroma = s0.chroma + (target.chroma - s0.chroma) * strength;
  const wq = weights || Array.from({ length: NQ }, (_, k) => (k === 0 || k === NQ - 1 ? 0 : k === 10 ? 3 : 1));
  const loss = (d) => {
    const dd = startDev ? Object.fromEntries(Object.keys(d).map((k) => [k, Math.max(-100, Math.min(100, (startDev[k] || 0) + d[k]))])) : d;
    let px = simulate(data, base, n, dd);
    if (post) for (let i = 0; i < n; i++) { const c = post(px[i * 4] / 255, px[i * 4 + 1] / 255, px[i * 4 + 2] / 255); px[i * 4] = c[0] * 255; px[i * 4 + 1] = c[1] * 255; px[i * 4 + 2] = c[2] * 255; }
    const st = photoStats(px, w, h, boxes);
    let e = 0;
    for (let k = 0; k < NQ; k++) e += wq[k] * (st.Lq[k] - tL[k]) ** 2;
    e /= 4;
    if (colour) {
      if (tSkin && st.skin) e += 2 * ((st.skin[1] - tSkin[1]) ** 2 + (st.skin[2] - tSkin[2]) ** 2);
      else e += 2 * ((st.band[1][0] - tMid[0]) ** 2 + (st.band[1][1] - tMid[1]) ** 2);
      e += 2 * (st.chroma - tChroma) ** 2;
    }
    // mild preference for small moves (keeps results natural when the target is uncertain)
    e += (colour ? 0.002 : 0.006) * (d.exposure ** 2 + d.contrast ** 2 + d.temp ** 2 + d.tint ** 2 + d.whites ** 2 + d.blacks ** 2 + d.saturation ** 2 + d.shadows ** 2 + d.highlights ** 2);
    return e;
  };
  const d = { temp: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, clarity: 0, vibrance: 0, saturation: 0 };
  const lim = limits || (colour
    ? { exposure: 60, contrast: 50, whites: 50, blacks: 50, temp: 50, tint: 40, saturation: 50, shadows: 50, highlights: 50 }
    : { exposure: 50, contrast: 30, whites: 30, blacks: 30, shadows: 35, highlights: 35 });   // tone only, gentle
  let best = loss(d);
  for (let step = 16; step >= 2; step /= 2) {
    for (let iter = 0; iter < 5; iter++) {
      let moved = false;
      for (const key of Object.keys(lim)) {
        for (const dir of [1, -1]) {
          const v = Math.max(-lim[key], Math.min(lim[key], d[key] + dir * step));
          if (v === d[key]) continue;
          const old = d[key]; d[key] = v;
          const e = loss(d);
          if (e < best - 1e-6) { best = e; moved = true; break; }
          d[key] = old;
        }
      }
      if (!moved) break;
    }
  }
  for (const key of Object.keys(d)) d[key] = Math.round(d[key]);
  return d;
}

/** Linear-light luminance blurred like the shader's uBG (σ ≈ 1.2% of the long side). */
export function baseLum(data, w, h, sigmaFrac = 0.012) {
  const n = w * h, a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = 0.2126 * toLin(data[i * 4] / 255) + 0.7152 * toLin(data[i * 4 + 1] / 255) + 0.0722 * toLin(data[i * 4 + 2] / 255);
  const r = Math.max(1, Math.round(sigmaFrac * Math.max(w, h))), tmp = new Float32Array(Math.max(w, h));
  const line = (off, stride, len) => {
    for (let i = 0; i < len; i++) tmp[i] = a[off + i * stride];
    let acc = 0; for (let i = -r; i <= r; i++) acc += tmp[Math.min(len - 1, Math.max(0, i))];
    for (let i = 0; i < len; i++) { a[off + i * stride] = acc / (2 * r + 1); acc += tmp[Math.min(len - 1, i + r + 1)] - tmp[Math.max(0, i - r)]; }
  };
  for (let p = 0; p < 3; p++) { for (let y = 0; y < h; y++) line(y * w, 1, w); for (let x = 0; x < w; x++) line(x, w, h); }
  return a;
}

/**
 * Automatic white balance: finds near-neutral pixels (greys/whites: walls, dresses, shirts), measures
 * their colour cast and returns temp/tint that remove most of it. keep: fraction of the cast to keep (mood).
 * thumb: {data,w,h} small RGBA8 of the unedited photo.
 */
export function autoWhiteBalance(thumb, keep = 0.3) {
  const { data, w, h } = thumb, n = w * h;
  const base = baseLum(data, w, h);
  const zero = { temp: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, clarity: 0, vibrance: 0, saturation: 0 };
  // candidates: mid/bright, low-ish chroma in the original
  // prefer truly grey pixels; never count skin-coloured ones (they'd pull skin towards grey/green)
  const lab = [];
  for (let i = 0; i < n; i++) lab.push(rgb2lab(data[i * 4] / 255, data[i * 4 + 1] / 255, data[i * 4 + 2] / 255));
  const skinish = ([L, a, b]) => a > 6 && b > 8 && b < 3.2 * a + 10 && L > 20 && L < 90;
  let idx = [];
  for (let i = 0; i < n; i++) { const c = lab[i]; if (c[0] > 25 && c[0] < 97 && Math.hypot(c[1], c[2]) < 12 && !skinish(c)) idx.push(i); }
  if (idx.length < n * 0.03) {
    idx = [];
    for (let i = 0; i < n; i++) { const c = lab[i]; if (c[0] > 25 && c[0] < 97 && Math.hypot(c[1], c[2]) < 22 && !skinish(c)) idx.push(i); }
  }
  if (idx.length < n * 0.03) return { temp: 0, tint: 0, cast: null };
  const castOf = (d) => {
    const px = simulate(data, base, n, d), A = [], B = [];
    for (const i of idx) { const [, a, b] = rgb2lab(px[i * 4] / 255, px[i * 4 + 1] / 255, px[i * 4 + 2] / 255); A.push(a); B.push(b); }
    return [median(A), median(B)];
  };
  const c0 = castOf(zero);
  if (Math.hypot(c0[0], c0[1]) < 4) return { temp: 0, tint: 0, cast: c0 };      // already neutral enough
  let best = { temp: 0, tint: 0, e: Math.hypot(...c0) };
  for (let t = -60; t <= 60; t += 6) for (let ti = -40; ti <= 40; ti += 8) {
    const c = castOf({ ...zero, temp: t, tint: ti }), e = Math.hypot(c[0], c[1]);
    if (e < best.e) best = { temp: t, tint: ti, e };
  }
  // tint (green↔magenta) mistakes look worst on skin: keep that correction modest
  return { temp: Math.round(Math.max(-35, Math.min(35, best.temp * (1 - keep)))), tint: Math.round(Math.max(-15, Math.min(15, best.tint * (1 - keep)))), cast: c0 };
}
