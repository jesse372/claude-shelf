// Warp engine: turns face/body landmarks into smooth displacement fields.
//
// Every slider owns one "unit field" (its effect at 100%). Moving a slider just
// rescales and sums these fields, which is why dragging is instant. Manual
// liquify strokes live in a separate field that is added on top.
//
// Convention (backward mapping): output pixel p shows source pixel p + D(p).
// So to move content by +v we subtract v from D.

export const SLIDERS = [
  { id: 'faceSlim', group: 'Face', label: 'Slim face', min: 0, max: 100 },
  { id: 'jaw', group: 'Face', label: 'Jawline (V-shape)', min: 0, max: 100 },
  { id: 'chin', group: 'Face', label: 'Double chin', min: 0, max: 100 },
  { id: 'body', group: 'Body', label: 'Slim body', min: 0, max: 100 },
  { id: 'waist', group: 'Body', label: 'Waist', min: 0, max: 100 },
  { id: 'hips', group: 'Body', label: 'Hips (− curvier)', min: -100, max: 100 },
  { id: 'arms', group: 'Body', label: 'Slim arms', min: 0, max: 100 },
  { id: 'legs', group: 'Body', label: 'Slim legs', min: 0, max: 100 },
];

// ---------------------------------------------------------------- field basics
export function makeField(W, H, maxSide = 1024) {
  const s = Math.min(1, maxSide / Math.max(W, H));
  const fw = Math.max(2, Math.round(W * s)), fh = Math.max(2, Math.round(H * s));
  return { W, H, fw, fh, sx: W / fw, sy: H / fh };
}
const alloc = (F) => ({ dx: new Float32Array(F.fw * F.fh), dy: new Float32Array(F.fw * F.fh) });

/** Move content near (cx,cy) by (vx,vy) with a smooth compact falloff of radius R. */
export function push(F, f, cx, cy, vx, vy, R, gain = 1) {
  if (!(R > 0) || (!vx && !vy)) return;
  const { fw, fh, sx, sy } = F;
  const i0 = Math.max(0, Math.floor((cx - R) / sx)), i1 = Math.min(fw - 1, Math.ceil((cx + R) / sx));
  const j0 = Math.max(0, Math.floor((cy - R) / sy)), j1 = Math.min(fh - 1, Math.ceil((cy + R) / sy));
  const iR2 = 1 / (R * R), gx = vx * gain, gy = vy * gain;
  for (let j = j0; j <= j1; j++) {
    const py = (j + 0.5) * sy - cy, py2 = py * py;
    let k = j * fw + i0;
    for (let i = i0; i <= i1; i++, k++) {
      const px = (i + 0.5) * sx - cx;
      const t2 = (px * px + py2) * iR2;
      if (t2 < 1) {
        const w = (1 - t2) * (1 - t2);
        f.dx[k] -= gx * w;
        f.dy[k] -= gy * w;
      }
    }
  }
}

/**
 * Pushes along a polyline of control points {x,y,vx,vy,r}. Points are resampled
 * densely and normalised so the summed displacement along the line ≈ v
 * (instead of piling up where the spacing is tight).
 */
export function chain(F, f, pts) {
  pts = pts.filter((p) => p && isFinite(p.x) && isFinite(p.y) && p.r > 0);
  if (pts.length === 0) return;
  if (pts.length === 1) { const p = pts[0]; push(F, f, p.x, p.y, p.vx, p.vy, p.r); return; }
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = lens[lens.length - 1];
  const rmin = Math.min(...pts.map((p) => p.r));
  const step = Math.max(Math.min(F.sx, F.sy), rmin * 0.25);
  const n = Math.max(1, Math.ceil(total / step));
  const ds = total / n;
  let seg = 0;
  for (let s = 0; s <= n; s++) {
    const d = s * ds;
    while (seg < pts.length - 2 && lens[seg + 1] < d) seg++;
    const a = pts[seg], b = pts[seg + 1];
    const L = lens[seg + 1] - lens[seg] || 1;
    const t = Math.min(1, Math.max(0, (d - lens[seg]) / L));
    const lerp = (k) => a[k] + (b[k] - a[k]) * t;
    const r = lerp('r');
    const wEnd = s === 0 || s === n ? 0.5 : 1;          // trapezoid rule
    push(F, f, lerp('x'), lerp('y'), lerp('vx'), lerp('vy'), r, wEnd * ds / (1.0667 * r));
  }
}

// ---------------------------------------------------------------- small helpers
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const len = (a) => Math.hypot(a.x, a.y);
const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const dot = (a, b) => a.x * b.x + a.y * b.y;
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const gauss = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2);

// ---------------------------------------------------------------- face
// MediaPipe face-mesh indices along the face outline (temple → chin), per side.
const OVAL_L = [127, 234, 93, 132, 58, 172, 136, 150, 149, 176, 148];
const OVAL_R = [356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377];
const SLIM_W = [0.15, 0.35, 0.6, 0.85, 1, 1, 0.95, 0.8, 0.55, 0.3, 0.1];
const JAW_L = [58, 172, 136, 150, 149, 176, 148];
const JAW_R = [288, 397, 365, 379, 378, 400, 377];
const JAW_W = [0.3, 0.7, 1, 1, 0.8, 0.5, 0.2];
// Lower jaw edge, ear-to-ear through the chin.
const JAWLINE = [58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288];
const JAWLINE_W = [0.1, 0.3, 0.55, 0.8, 0.95, 1, 1, 1, 1, 1, 0.95, 0.8, 0.55, 0.3, 0.1];

export function faceFrame(lm) {
  const upv = sub(lm[10], lm[152]);
  const H = len(upv);
  const u = norm(upv);                       // up the face (chin → forehead)
  const r = { x: -u.y, y: u.x };             // across the face
  const W = len(sub(lm[454], lm[234]));
  const c = mid(lm[234], lm[454]);
  return { u, r, W, H, c };
}

function inward(fr, p) {
  const s = dot(sub(p, fr.c), fr.r);
  return { x: -Math.sign(s) * fr.r.x, y: -Math.sign(s) * fr.r.y };
}

function buildFace(F, fields, lm) {
  const fr = faceFrame(lm);
  const { u, W, H } = fr;
  if (!(W > 8 && H > 8)) return;

  // Slim face: pull the cheek/jaw outline toward the face's centre line.
  for (const side of [OVAL_L, OVAL_R]) {
    chain(F, fields.faceSlim, side.map((i, k) => {
      const p = lm[i], v = inward(fr, p), m = 0.045 * W * SLIM_W[k];
      return { x: p.x, y: p.y, vx: v.x * m, vy: v.y * m, r: 0.2 * W };
    }));
  }
  // Jawline: tuck the lower jaw in and slightly up for a V-shape.
  for (const side of [JAW_L, JAW_R]) {
    chain(F, fields.jaw, side.map((i, k) => {
      const p = lm[i], v = norm({ x: inward(fr, p).x + 0.5 * u.x, y: inward(fr, p).y + 0.5 * u.y });
      const m = 0.04 * W * JAW_W[k];
      return { x: p.x, y: p.y, vx: v.x * m, vy: v.y * m, r: 0.15 * W };
    }));
  }
  // Double chin: tuck the soft band just under the jaw up beneath it. The jawline itself never moves (that
  // would reshape the face); the lower neck never moves; in between, content is drawn up from below so the
  // fold rises into the jaw shadow. Tapers to nothing toward the ears.
  tuckChin(F, fields.chin, lm, fr);
}

function tuckChin(F, f, lm, fr) {
  const { u, r, c, H } = fr;
  const jaw = JAWLINE.map((i, k) => { const d = sub(lm[i], c); return { s: dot(d, r), v: dot(d, u), w: JAWLINE_W[k] }; }).sort((a, b) => a.s - b.s);
  const s0 = jaw[0].s, s1 = jaw[jaw.length - 1].s;
  if (!(s1 - s0 > 4)) return;
  const at = (s) => {                                   // jaw height + lateral weight at across-face position s
    let k = 0; while (k < jaw.length - 2 && jaw[k + 1].s < s) k++;
    const a = jaw[k], b = jaw[k + 1], t = Math.min(1, Math.max(0, (s - a.s) / ((b.s - a.s) || 1)));
    return { v: a.v + (b.v - a.v) * t, w: a.w + (b.w - a.w) * t };
  };
  // On a double chin the tracker's "jawline" sits on the OUTER fold, so anchor higher (inside the chin, below the
  // lip) and peak just under the tracked outline: the visible lower contour tucks up, lips/mouth never move.
  const TA = -0.10 * H, T1 = 0.03 * H, T2 = 0.30 * H, A = 0.075 * H;
  // image-space box around the under-jaw region
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const i of JAWLINE) for (const d of [TA, T2]) {
    const p = { x: lm[i].x - u.x * d, y: lm[i].y - u.y * d };
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const { fw, fh, sx, sy } = F;
  const i0 = Math.max(0, Math.floor(x0 / sx)), i1 = Math.min(fw - 1, Math.ceil(x1 / sx));
  const j0 = Math.max(0, Math.floor(y0 / sy)), j1 = Math.min(fh - 1, Math.ceil(y1 / sy));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const P = { x: (i + 0.5) * sx, y: (j + 0.5) * sy }, d = sub(P, c), s = dot(d, r);
    if (s <= s0 || s >= s1) continue;
    const J = at(s), t = J.v - dot(d, u);              // distance below the jawline
    if (t <= TA || t >= T2) continue;
    const prof = t < T1 ? smooth(TA, T1, t) : 1 - smooth(T1, T2, t);
    const m = A * prof * J.w * J.w;
    const k = j * fw + i;
    f.dx[k] -= u.x * m; f.dy[k] -= u.y * m;             // show content from further down = tissue moves up
  }
}

/**
 * Where the double-chin tool may act (field-res, 0..1): face/neck SKIN from the person segmenter, shrunk away
 * from its edges so collars, ties, necklaces, hair and background are never pulled or lightened.
 */
export function neckSkin(F, det) {
  const { fw, fh, sx, sy } = F, sg = det.seg, a = new Float32Array(fw * fh);
  if (!sg) return null;
  for (let j = 0; j < fh; j++) {
    const my = Math.min(sg.h - 1, Math.floor((j + 0.5) * sy * sg.s));
    for (let i = 0; i < fw; i++) {
      const c = sg.data[my * sg.w + Math.min(sg.w - 1, Math.floor((i + 0.5) * sx * sg.s))];
      a[j * fw + i] = c === 2 || c === 3 ? 1 : 0;
    }
  }
  const hs = det.faces.map((lm) => faceFrame(lm).H).filter((h) => h > 8);
  const faceH = hs.length ? Math.max(...hs) : 0.1 * Math.max(F.W, F.H);
  // erode: blur, then keep only cells well inside the skin; then soften the edge again
  const r = Math.max(1, Math.round(0.03 * faceH / sx));
  blurFloat(a, fw, fh, r);
  for (let k = 0; k < a.length; k++) a[k] = smooth(0.8, 0.98, a[k]);
  blurFloat(a, fw, fh, Math.max(1, Math.round(r / 2)));
  return a;
}

/** Scale a displacement field to zero wherever the pixel - or the place it would pull from - isn't skin. */
export function maskWarpToSkin(F, f, skin, smoothR = 0) {
  if (!skin) return;
  const { fw, fh, sx, sy } = F;
  for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
    const k = j * fw + i, dx = f.dx[k], dy = f.dy[k];
    if (!dx && !dy) continue;
    const a = Math.min(skin[k], bilinear(F, skin, i + dx / sx, j + dy / sy));
    f.dx[k] = dx * a; f.dy[k] = dy * a;
  }
  // the segmenter's edge is ragged: smooth the masked field so skin texture (stubble, pores) doesn't ripple
  if (smoothR > 0) {
    blurFloat(f.dx, fw, fh, smoothR); blurFloat(f.dy, fw, fh, smoothR);
    maskWarpToSkin(F, f, skin, 0);          // and never let the smoothing leak back onto collars / background
  }
}

const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

/**
 * Where slimming of face i may act (field-res, 0..1): that face plus a narrow band around its outline - but never
 * below the jaw (collars, beards, necklaces stay put) and never on anyone else's face.
 */
function faceRegion(F, faces, idx) {
  const { fw, fh, sx, sy } = F, lm = faces[idx], fr = faceFrame(lm);
  const c = document.createElement('canvas'); c.width = fw; c.height = fh;
  const g = c.getContext('2d', { willReadFrequently: true });
  const poly = (L, ids) => { g.beginPath(); ids.forEach((i, k) => (k ? g.lineTo : g.moveTo).call(g, L[i].x / sx, L[i].y / sy)); g.closePath(); };
  g.fillStyle = g.strokeStyle = '#fff'; g.lineJoin = 'round';
  poly(lm, FACE_OVAL); g.fill(); g.lineWidth = 2 * 0.16 * fr.W / sx; g.stroke();          // face + band
  g.globalCompositeOperation = 'destination-out';
  // nothing below the jaw: cut a big region starting just under the jawline
  const { u, H } = fr, d0 = 0.05 * H, d1 = 3 * H;
  g.beginPath();
  JAWLINE.forEach((i, k) => { const p = lm[i]; (k ? g.lineTo : g.moveTo).call(g, (p.x - u.x * d0) / sx, (p.y - u.y * d0) / sy); });
  [...JAWLINE].reverse().forEach((i) => { const p = lm[i]; g.lineTo((p.x - u.x * d1) / sx, (p.y - u.y * d1) / sy); });
  g.closePath(); g.fill();
  // other people's faces (slightly grown) are off limits
  faces.forEach((o, j) => { if (j === idx) return; poly(o, FACE_OVAL); g.fill(); g.lineWidth = 2 * 0.05 * faceFrame(o).W / sx; g.stroke(); });
  const px = g.getImageData(0, 0, fw, fh).data, a = new Float32Array(fw * fh);
  for (let k = 0; k < a.length; k++) a[k] = px[k * 4 + 3] / 255;
  blurFloat(a, fw, fh, Math.max(1, Math.round(0.05 * fr.W / sx)));
  return a;
}

function maskField(f, a) { for (let k = 0; k < a.length; k++) { f.dx[k] *= a[k]; f.dy[k] *= a[k]; } }

/** Mask (field-res, 0..255) of the area under each jaw, where the shadow fill applies. */
export function buildChinMask(F, faces, skin = null) {
  const c = document.createElement('canvas');
  c.width = F.fw; c.height = F.fh;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  let blurR = 0;
  for (const lm of faces) {
    const fr = faceFrame(lm);
    const { u, H } = fr;
    if (!(H > 8)) continue;
    blurR = Math.max(blurR, 0.05 * H);
    const top = [], bot = [];
    JAWLINE.forEach((i, k) => {
      const p = lm[i], w = JAWLINE_W[k];
      top.push({ x: p.x - u.x * 0.06 * H, y: p.y - u.y * 0.06 * H });   // leave the jaw's own shadow alone
      const d = (0.06 + 0.2 * w) * H;
      bot.push({ x: p.x - u.x * d, y: p.y - u.y * d });
    });
    g.beginPath();
    [...top, ...bot.reverse()].forEach((p, k) => (k ? g.lineTo : g.moveTo).call(g, p.x / F.sx, p.y / F.sy));
    g.closePath();
    g.fill();
  }
  const img = g.getImageData(0, 0, F.fw, F.fh).data;
  const a = new Float32Array(F.fw * F.fh);
  for (let k = 0; k < a.length; k++) a[k] = img[k * 4];
  if (blurR > 0) blurFloat(a, F.fw, F.fh, Math.max(1, Math.round(blurR / F.sx / 1.7)));
  const out = new Uint8Array(a.length);
  for (let k = 0; k < a.length; k++) out[k] = skin ? a[k] * skin[k] : a[k];
  return out;
}

// ---------------------------------------------------------------- body
function maskAt(mask, x, y) {
  const mx = Math.round(x * mask.s), my = Math.round(y * mask.s);
  if (mx < 0 || my < 0 || mx >= mask.w || my >= mask.h) return 0;
  return mask.data[my * mask.w + mx];
}

/** Distance from p along n to where the person's silhouette ends (or null). */
function march(mask, p, n, maxD) {
  if (!mask || maskAt(mask, p.x, p.y) < 128) return null;
  const step = Math.max(1, 1 / mask.s);
  for (let d = step; d <= maxD; d += step) {
    if (maskAt(mask, p.x + n.x * d, p.y + n.y * d) < 128) {
      // need two consecutive "outside" samples so mask speckle doesn't stop us
      if (maskAt(mask, p.x + n.x * (d + step), p.y + n.y * (d + step)) < 128) return d;
    }
  }
  return null;
}

/** Fill gaps by linear interpolation, drop outliers, then smooth. */
function cleanSeries(vals, maxRatio = 1.8) {
  const ok = vals.filter((v) => v != null).sort((a, b) => a - b);
  if (ok.length < 3) return vals.map(() => null);
  const med = ok[ok.length >> 1];
  const v = vals.map((x) => (x != null && x < med * maxRatio && x > med / maxRatio ? x : null));
  const idx = v.map((x, i) => (x != null ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 3) return vals.map(() => null);
  const out = v.slice();
  for (let i = 0; i < out.length; i++) {
    if (out[i] != null) continue;
    const lo = [...idx].reverse().find((k) => k < i), hi = idx.find((k) => k > i);
    if (lo == null || hi == null) continue;          // don't extrapolate past the ends
    out[i] = v[lo] + (v[hi] - v[lo]) * (i - lo) / (hi - lo);
  }
  const K = [1, 2, 3, 2, 1];
  return out.map((x, i) => {
    if (x == null) return null;
    let s = 0, w = 0;
    K.forEach((kw, k) => { const y = out[i + k - 2]; if (y != null) { s += y * kw; w += kw; } });
    return s / w;
  });
}

const visible = (lm, ids, t = 0.5) => ids.every((i) => lm[i] && lm[i].v >= t);

function buildTorso(F, fields, lm, mask) {
  if (!visible(lm, [11, 12, 23, 24], 0.4)) return;
  const S = mid(lm[11], lm[12]), Hp = mid(lm[23], lm[24]);
  const a = norm(sub(Hp, S)), n = { x: -a.y, y: a.x };
  const T = len(sub(Hp, S)), sw = len(sub(lm[11], lm[12])), hw = len(sub(lm[23], lm[24]));
  if (!(T > 10)) return;
  const ts = [];
  for (let t = 0.2; t <= 1.701; t += 0.05) ts.push(t);
  const ctr = ts.map((t) => ({ x: S.x + a.x * t * T, y: S.y + a.y * t * T }));
  let eL, eR;
  if (mask) {
    eL = cleanSeries(ctr.map((c) => march(mask, c, { x: -n.x, y: -n.y }, 1.3 * sw)));
    eR = cleanSeries(ctr.map((c) => march(mask, c, n, 1.3 * sw)));
  }
  if (!mask || eL.every((x) => x == null)) {      // no silhouette: estimate from joints
    const est = ts.map((t) => (t < 1 ? 0.42 * sw + (0.8 * hw - 0.42 * sw) * t : 0.8 * hw));
    eL = est; eR = est;
  }
  const profiles = {
    body: (t) => 0.065 * smooth(0.2, 0.45, t) * (1 - smooth(1.3, 1.7, t)),
    waist: (t) => 0.1 * gauss(t, 0.7, 0.16),
    hips: (t) => 0.075 * gauss(t, 1.05, 0.15),
  };
  for (const [id, prof] of Object.entries(profiles)) {
    for (const [edges, sgn] of [[eL, -1], [eR, 1]]) {
      const pts = ts.map((t, i) => {
        const e = edges[i], e2 = (eL[i] ?? e) + (eR[i] ?? e);
        if (e == null || !(e2 > 0)) return null;
        const half = e2 / 2, m = prof(t) * half;
        const p = { x: ctr[i].x + sgn * n.x * e, y: ctr[i].y + sgn * n.y * e };
        return { x: p.x, y: p.y, vx: -sgn * n.x * m, vy: -sgn * n.y * m, r: 0.6 * half };
      });
      // chain() needs contiguous runs
      let run = [];
      for (const p of [...pts, null]) {
        if (p && p.r > 0) run.push(p);
        else { if (run.length) chain(F, fields[id], run); run = []; }
      }
    }
  }
}

/** Slim a limb (arm/leg) given its joint chain. */
function buildLimb(F, f, lm, mask, ids, segs, maxD, strength) {
  if (!visible(lm, ids.slice(0, 2), 0.5)) return;
  const joints = ids.filter((i, k) => k < 2 || lm[i].v >= 0.5).map((i) => lm[i]);
  const samples = [];
  for (let s = 0; s < joints.length - 1; s++) {
    const A = joints[s], B = joints[s + 1];
    const a = norm(sub(B, A)), n = { x: -a.y, y: a.x };
    const [u0, u1, wgt] = segs[s];
    for (let u = u0; u <= u1 + 1e-6; u += 0.06) {
      samples.push({ p: { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u }, n, w: wgt });
    }
  }
  if (!samples.length || !mask) return;
  let d1 = samples.map((s) => march(mask, s.p, s.n, maxD));
  let d2 = samples.map((s) => march(mask, s.p, { x: -s.n.x, y: -s.n.y }, maxD));
  // A side that runs far further than the other is merged into the torso or
  // the other leg — ignore it rather than dragging the neighbour along.
  d1 = d1.map((x, i) => (x != null && d2[i] != null && x > 1.7 * d2[i] ? null : x));
  d2 = d2.map((x, i) => (x != null && d1[i] != null && x > 1.7 * d1[i] ? null : x));
  d1 = cleanSeries(d1); d2 = cleanSeries(d2);
  for (const [ds, sgn] of [[d1, 1], [d2, -1]]) {
    let run = [];
    samples.forEach((s, i) => {
      const e = ds[i];
      if (e == null) { if (run.length) chain(F, f, run); run = []; return; }
      const other = (sgn > 0 ? d2[i] : d1[i]) ?? e;
      const half = Math.min(e, other * 1.3);
      const m = strength * s.w * half;
      run.push({
        x: s.p.x + sgn * s.n.x * e, y: s.p.y + sgn * s.n.y * e,
        vx: -sgn * s.n.x * m, vy: -sgn * s.n.y * m, r: 0.9 * half,
      });
    });
    if (run.length) chain(F, f, run);
  }
}

function buildBody(F, fields, pose) {
  const { lm, mask } = pose;
  buildTorso(F, fields, lm, mask);
  const sw = len(sub(lm[11], lm[12])), hw = len(sub(lm[23], lm[24]));
  for (const ids of [[11, 13, 15], [12, 14, 16]]) {
    buildLimb(F, fields.arms, lm, mask, ids, [[0.15, 1, 1], [0, 0.85, 0.5]], 0.35 * sw, 0.14);
  }
  if (visible(lm, [23, 24], 0.4)) {
    for (const ids of [[23, 25, 27], [24, 26, 28]]) {
      buildLimb(F, fields.legs, lm, mask, ids, [[0.2, 1, 1], [0, 0.9, 0.7]], 1.0 * hw, 0.1);
    }
  }
}

// ---------------------------------------------------------------- per-person zone for body tools
const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28]];

/**
 * Where body slimming of person i may act (field-res, 0..1): their own silhouette plus a narrow band of background
 * (so walls, door and window frames further out never bend), and never on anyone else's body.
 */
function personRegion(F, det, i) {
  const { fw, fh, sx, sy } = F, sg = det.seg, lm = det.poses[i].lm;
  const sw = len(sub(lm[11], lm[12])) || 0.1 * Math.max(F.W, F.H);
  const zone = (L) => {                                   // rough area of one person from their skeleton
    const c = document.createElement('canvas'); c.width = fw; c.height = fh;
    const g = c.getContext('2d', { willReadFrequently: true });
    const w = len(sub(L[11], L[12])) || sw;
    g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 0.75 * w / sx;
    for (const [a, b] of BONES) {
      if ((L[a].v ?? 1) < 0.3 || (L[b].v ?? 1) < 0.3) continue;
      g.beginPath(); g.moveTo(L[a].x / sx, L[a].y / sy); g.lineTo(L[b].x / sx, L[b].y / sy); g.stroke();
    }
    if ([11, 12, 24, 23].every((k) => (L[k].v ?? 1) >= 0.3)) {
      g.beginPath(); [11, 12, 24, 23].forEach((k, n) => (n ? g.lineTo : g.moveTo).call(g, L[k].x / sx, L[k].y / sy)); g.closePath(); g.fill();
    }
    g.beginPath(); g.arc(L[0].x / sx, L[0].y / sy, 0.55 * w / sx, 0, 7); g.fill();
    const d = g.getImageData(0, 0, fw, fh).data, z = new Uint8Array(fw * fh);
    for (let k = 0; k < z.length; k++) z[k] = d[k * 4 + 3] > 127 ? 1 : 0;
    return z;
  };
  const mine = zone(lm);
  const others = new Uint8Array(fw * fh);
  det.poses.forEach((p, j) => { if (j !== i) { const z = zone(p.lm); for (let k = 0; k < z.length; k++) others[k] |= z[k]; } });
  const own = new Float32Array(fw * fh), foreign = new Float32Array(fw * fh);
  for (let j = 0; j < fh; j++) {
    const my = sg ? Math.min(sg.h - 1, Math.floor((j + 0.5) * sy * sg.s)) : 0;
    for (let x = 0; x < fw; x++) {
      const k = j * fw + x;
      const person = sg ? sg.data[my * sg.w + Math.min(sg.w - 1, Math.floor((x + 0.5) * sx * sg.s))] > 0 : mine[k];
      if (!person) continue;
      if (mine[k] && !others[k]) own[k] = 1;
      else if (mine[k]) own[k] = 1;                      // overlap (hugging): allowed, both people move together
      else foreign[k] = 1;
    }
  }
  // own silhouette grown by a narrow band (the background that has to stretch as the edge moves in)
  const band = Math.max(1, Math.round(0.14 * sw / sx));
  blurFloat(own, fw, fh, Math.max(1, Math.round(band / 2)));
  for (let k = 0; k < own.length; k++) own[k] = Math.min(1, own[k] * 4);
  blurFloat(own, fw, fh, Math.max(1, Math.round(band / 3)));
  blurFloat(foreign, fw, fh, Math.max(1, Math.round(0.03 * sw / sx)));
  for (let k = 0; k < own.length; k++) own[k] *= 1 - Math.min(1, foreign[k] * 2);
  return own;
}

// ---------------------------------------------------------------- public API
/**
 * weights (optional, from needs.js): per-person scale 0..1 for each slider, so in a group
 * photo only the people who need it are adjusted: { faces: [{faceSlim,jaw,chin}], poses: [{body,waist,hips,arms,legs}] }
 */
export function buildUnitFields(F, det, weights = null) {
  const fields = {};
  for (const s of SLIDERS) fields[s.id] = alloc(F);
  const addScaled = (build, w) => {
    if (!w) { build(fields); return; }
    const tmp = {};
    for (const s of SLIDERS) tmp[s.id] = alloc(F);
    build(tmp);
    for (const s of SLIDERS) {
      const k = w[s.id] ?? 0;
      if (!k) continue;
      const a = fields[s.id], b = tmp[s.id];
      for (let i = 0; i < a.dx.length; i++) { a.dx[i] += b.dx[i] * k; a.dy[i] += b.dy[i] * k; }
    }
  };
  det.faces.forEach((lm, i) => {
    const w = weights ? (weights.faces[i] || {}) : { faceSlim: 1, jaw: 1, chin: 1 };
    addScaled((f) => {
      buildFace(F, f, lm);
      const fr = faceFrame(lm);
      if (fr.W > 8 && fr.H > 8 && typeof document !== 'undefined') {
        const region = faceRegion(F, det.faces, i);
        maskField(f.faceSlim, region); maskField(f.jaw, region);
      }
    }, w);
  });
  det.poses.forEach((p, i) => {
    const w = weights ? (weights.poses[i] || {}) : { body: 1, waist: 1, hips: 1, arms: 1, legs: 1 };
    addScaled((f) => {
      buildBody(F, f, p);
      if (typeof document !== 'undefined' && p.lm && p.lm.length > 28) {
        const region = personRegion(F, det, i);
        for (const id of ['body', 'waist', 'hips', 'arms', 'legs']) maskField(f[id], region);
      }
    }, w);
  });
  return fields;
}

/** Body proportions from the silhouette (for deciding whether slimming is needed). */
export function measureBody(pose) {
  const { lm, mask } = pose;
  if (!mask || !visible(lm, [11, 12, 23, 24], 0.5)) return null;
  const S = mid(lm[11], lm[12]), Hp = mid(lm[23], lm[24]);
  const a = norm(sub(Hp, S)), n = { x: -a.y, y: a.x };
  const T = len(sub(Hp, S)), sw = len(sub(lm[11], lm[12]));
  if (!(T > 20 && sw > 10)) return null;
  // arm segments (shoulder→elbow→wrist): the torso edge is where we meet an arm, not the outer silhouette
  const segs = [];
  for (const [s0, e0, w0] of [[11, 13, 15], [12, 14, 16]]) {
    if (lm[s0].v > 0.5 && lm[e0].v > 0.5) segs.push([lm[s0], lm[e0]]);
    if (lm[e0].v > 0.5 && lm[w0].v > 0.5) segs.push([lm[e0], lm[w0]]);
  }
  const nearArm = (p) => segs.some(([A, B]) => {
    const ab = sub(B, A), t = Math.max(0, Math.min(1, ((p.x - A.x) * ab.x + (p.y - A.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
    return Math.hypot(p.x - (A.x + ab.x * t), p.y - (A.y + ab.y * t)) < 0.16 * sw;
  });
  const edge = (c, dir) => {
    const step = Math.max(1, 1 / mask.s);
    if (maskAt(mask, c.x, c.y) < 128) return null;
    for (let d = step; d <= 1.3 * sw; d += step) {
      const p = { x: c.x + dir.x * d, y: c.y + dir.y * d };
      if (nearArm(p)) return { d, arm: true };
      if (maskAt(mask, p.x, p.y) < 128) return { d, arm: false };
    }
    return null;
  };
  const widths = [];
  let armTouch = 0;
  for (const t of [0.6, 0.65, 0.7, 0.75, 0.8]) {
    const c = { x: S.x + a.x * t * T, y: S.y + a.y * t * T };
    const l = edge(c, { x: -n.x, y: -n.y }), r = edge(c, n);
    if (l && r) { widths.push(l.d + r.d); if (l.arm || r.arm) armTouch++; }
  }
  const arms = [];
  for (const [s0, e0] of [[11, 13], [12, 14]]) {
    if (!visible(lm, [s0, e0], 0.6)) continue;
    const A = lm[s0], B = lm[e0], ax = norm(sub(B, A)), nn = { x: -ax.y, y: ax.x };
    for (const u of [0.4, 0.5, 0.6]) {
      const p = { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u };
      const d1 = march(mask, p, nn, 0.35 * sw), d2 = march(mask, p, { x: -nn.x, y: -nn.y }, 0.35 * sw);
      if (d1 != null && d2 != null && Math.max(d1, d2) < 1.7 * Math.min(d1, d2)) arms.push(d1 + d2);
    }
  }
  const med = (v) => v.slice().sort((x, y) => x - y)[v.length >> 1];
  return {
    waistRatio: widths.length >= 3 ? med(widths) / sw : null,
    armsAtSides: armTouch >= 3,       // width is then a lower bound (arm hides the true edge)
    armRatio: arms.length >= 2 ? med(arms) / sw : null,
  };
}

/** Sum unit fields * slider values (+ manual) into interleaved (dx,dy) for the GPU. */
export function combine(F, fields, values, manual, out) {
  const n = F.fw * F.fh;
  out = out || new Float32Array(n * 2);
  out.fill(0);
  for (const s of SLIDERS) {
    const k = (values[s.id] || 0) / 100;
    if (!k) continue;
    const f = fields[s.id];
    for (let i = 0; i < n; i++) { out[2 * i] += f.dx[i] * k; out[2 * i + 1] += f.dy[i] * k; }
  }
  if (manual) for (let i = 0; i < n; i++) { out[2 * i] += manual.dx[i]; out[2 * i + 1] += manual.dy[i]; }
  return out;
}

// ---------------------------------------------------------------- manual liquify
export function newManual(F) { return alloc(F); }

function bilinear(F, arr, x, y) {   // x,y in field cells
  const { fw, fh } = F;
  x = Math.min(fw - 1, Math.max(0, x)); y = Math.min(fh - 1, Math.max(0, y));
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(fw - 1, x0 + 1), y1 = Math.min(fh - 1, y0 + 1);
  const tx = x - x0, ty = y - y0;
  const a = arr[y0 * fw + x0], b = arr[y0 * fw + x1], c = arr[y1 * fw + x0], d = arr[y1 * fw + x1];
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

/** Forward-warp brush: drag content under the brush by (vx,vy) image px. */
export function brushPush(F, M, cx, cy, vx, vy, R) {
  const { fw, fh, sx, sy } = F;
  const i0 = Math.max(0, Math.floor((cx - R) / sx)), i1 = Math.min(fw - 1, Math.ceil((cx + R) / sx));
  const j0 = Math.max(0, Math.floor((cy - R) / sy)), j1 = Math.min(fh - 1, Math.ceil((cy + R) / sy));
  const odx = M.dx.slice(), ody = M.dy.slice();
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const px = (i + 0.5) * sx - cx, py = (j + 0.5) * sy - cy;
    const t2 = (px * px + py * py) / (R * R);
    if (t2 >= 1) continue;
    const w = (1 - t2) * (1 - t2);
    const ddx = -vx * w, ddy = -vy * w;                   // Δ(q)
    const qx = i + ddx / sx, qy = j + ddy / sy;            // q + Δ(q) in cells
    const k = j * fw + i;
    M.dx[k] = ddx + bilinear(F, odx, qx, qy);
    M.dy[k] = ddy + bilinear(F, ody, qx, qy);
  }
}

/** Restore brush: fade manual edits back toward the original. */
export function brushRestore(F, M, cx, cy, R, amount) {
  const { fw, fh, sx, sy } = F;
  const i0 = Math.max(0, Math.floor((cx - R) / sx)), i1 = Math.min(fw - 1, Math.ceil((cx + R) / sx));
  const j0 = Math.max(0, Math.floor((cy - R) / sy)), j1 = Math.min(fh - 1, Math.ceil((cy + R) / sy));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const px = (i + 0.5) * sx - cx, py = (j + 0.5) * sy - cy;
    const t2 = (px * px + py * py) / (R * R);
    if (t2 >= 1) continue;
    const k = j * fw + i, f = 1 - amount * (1 - t2) * (1 - t2);
    M.dx[k] *= f; M.dy[k] *= f;
  }
}

// ---------------------------------------------------------------- blur
/** In-place ~Gaussian blur (3 box passes) of a single-channel float image. */
export function blurFloat(a, w, h, r) {
  r = Math.max(1, Math.round(r));
  const tmp = new Float32Array(Math.max(w, h));
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) boxLine(a, y * w, 1, w, r, tmp);
    for (let x = 0; x < w; x++) boxLine(a, x, w, h, r, tmp);
  }
}
function boxLine(a, off, stride, n, r, tmp) {
  for (let i = 0; i < n; i++) tmp[i] = a[off + i * stride];
  const inv = 1 / (2 * r + 1);
  let acc = 0;
  for (let i = -r; i <= r; i++) acc += tmp[Math.min(n - 1, Math.max(0, i))];
  for (let i = 0; i < n; i++) {
    a[off + i * stride] = acc * inv;
    acc += tmp[Math.min(n - 1, i + r + 1)] - tmp[Math.max(0, i - r)];
  }
}

/** Blur an RGBA image (Uint8ClampedArray) into a new Uint8Array. */
export function blurRGBA(px, w, h, r) {
  const out = new Uint8Array(px.length);
  const ch = new Float32Array(w * h);
  for (let c = 0; c < 3; c++) {
    for (let k = 0; k < w * h; k++) ch[k] = px[k * 4 + c];
    blurFloat(ch, w, h, r);
    for (let k = 0; k < w * h; k++) out[k * 4 + c] = ch[k];
  }
  for (let k = 0; k < w * h; k++) out[k * 4 + 3] = 255;
  return out;
}
