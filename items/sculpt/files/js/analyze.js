// Per-photo analysis for culling: faces + eyes, sharpness, burst fingerprint, exposure, accidental-frame score.
// No page access, so it runs in the background worker (js/analysis-worker.js) as well as on the page.
import { findFaces } from './faces.js';
import { sceneEmbedding } from './detect.js';
import { accidentScore } from './accident.js';

function laplacianVar(g, w, h) {
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    s += v; s2 += v * v; n++;
  }
  const m = s / n;
  return s2 / n - m * m;
}
function grayOf(canvas, sx, sy, sw, sh, W) {
  const H = Math.max(8, Math.round(W * sh / sw));
  const c = new OffscreenCanvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, sx, sy, sw, sh, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, out = new Float32Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return { g: out, w: W, h: H };
}

/** Analyse one preview bitmap. */
export async function analyzePhoto(bitmap) {
  const s = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const W = Math.round(bitmap.width * s), H = Math.round(bitmap.height * s);
  const c = new OffscreenCanvas(W, H);
  // NB: leave this canvas as the browser makes it — a memory-backed one ({ willReadFrequently }) downscales differently
  // and shifts sharpness / burst fingerprints (measured 2026-11-02: sharpness median 6% off, 64/150 hashes changed),
  // and the cull thresholds are calibrated on this behaviour.
  c.getContext('2d').drawImage(bitmap, 0, 0, W, H);
  // every face, including small ones in groups (YuNet), eyes checked on each enlarged face
  let faces = [];
  try {
    faces = (await findFaces(bitmap)).map((f) => ({ ...f, box: { x: f.box.x * s, y: f.box.y * s, w: f.box.w * s, h: f.box.h * s } }));
  } catch (e) { console.warn('face analysis failed', e); }
  faces = faces.filter((f) => f.box.w > W * 0.012).sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);

  // sharpness: on the main face if there is one (normalised size), else the centre
  let sharp;
  if (faces.length) {
    const b = faces[0].box, pad = 0.1 * b.w;
    const { g, w, h } = grayOf(c, b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad, 256);
    sharp = laplacianVar(g, w, h);
  } else {
    // No face: judge the sharpest part of the frame (the subject), not the centre —
    // shallow depth-of-field backgrounds are meant to be soft.
    const { g, w, h } = grayOf(c, 0, 0, W, H, 768);
    const T = 4, tw = Math.floor(w / T), th = Math.floor(h / T), vals = [];
    for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) {
      const tile = new Float32Array(tw * th);
      for (let y = 0; y < th; y++) tile.set(g.subarray((ty * th + y) * w + tx * tw, (ty * th + y) * w + tx * tw + tw), y * tw);
      vals.push(laplacianVar(tile, tw, th));
    }
    vals.sort((a, b) => b - a);
    sharp = vals[1];      // 2nd sharpest tile: robust to one noisy/specular tile
  }
  // every face's sharpness (the subject may not be the biggest face) + the whole frame in 4x4 tiles
  const faceSharp = faces.slice(0, 8).map((f) => {
    const b = f.box, pad = 0.1 * b.w;
    const { g, w, h } = grayOf(c, b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad, 256);
    return laplacianVar(g, w, h);
  });
  const tiles = [];
  let lumStd = 0, edge = 0;
  {
    const { g, w, h } = grayOf(c, 0, 0, W, H, 512);
    const T = 4, tw = Math.floor(w / T), th = Math.floor(h / T);
    for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) {
      const tile = new Float32Array(tw * th);
      for (let y = 0; y < th; y++) tile.set(g.subarray((ty * th + y) * w + tx * tw, (ty * th + y) * w + tx * tw + tw), y * tw);
      tiles.push(laplacianVar(tile, tw, th));
    }
    let m = 0; for (const v of g) m += v; m /= g.length;
    let v2 = 0; for (const v of g) v2 += (v - m) ** 2; lumStd = Math.sqrt(v2 / g.length);
    let e = 0; for (let y = 1; y < h; y++) for (let x = 1; x < w; x++) { const i = y * w + x; if (Math.abs(g[i] - g[i - 1]) + Math.abs(g[i] - g[i - w]) > 24) e++; }
    edge = e / (w * h);
  }
  // perceptual hash (dHash 9x8)
  const { g: hg } = grayOf(c, 0, 0, W, H, 9);
  let hash = [0, 0];
  for (let y = 0, bit = 0; y < 8; y++) for (let x = 0; x < 8; x++, bit++) {
    if (hg[y * 9 + x] < hg[y * 9 + x + 1]) hash[bit >> 5] |= 1 << (bit & 31);
  }
  // exposure
  const { g: eg } = grayOf(c, 0, 0, W, H, 128);
  let sum = 0, hi = 0, lo = 0;
  for (const v of eg) { sum += v; if (v > 250) hi++; if (v < 5) lo++; }
  // calibrated on test photos: open eyes avg ≤ 0.2, closed ≈ 0.6, looking-down/half-shut ≈ 0.4
  const known = (f) => f.l != null && f.r != null;                    // tiny faces: eyes can't be judged
  const eyes = (f) => (f.l + f.r) / 2;
  const closedFace = (f) => known(f) && (eyes(f) >= 0.5 || Math.min(f.l, f.r) >= 0.45);
  const maybeClosed = (f) => known(f) && !closedFace(f) && eyes(f) >= 0.38;
  const out = {
    faces: faces.map((f) => ({ box: { x: f.box.x / s, y: f.box.y / s, w: f.box.w / s, h: f.box.h / s }, l: f.l, r: f.r, smile: f.smile, down: f.down, pitch: f.pitch, yaw: f.yaw })),
    W: bitmap.width, H: bitmap.height,
    sharp, hash, mean: sum / eg.length, clipHi: hi / eg.length, clipLo: lo / eg.length,
    faceSharp, tiles, lumStd, edge,
    mainClosed: faces.length ? closedFace(faces[0]) : false,
    mainMaybe: faces.length ? maybeClosed(faces[0]) : false,
    anyClosed: faces.some(closedFace),
  };
  // scene fingerprint (made exactly as in training: 512 px wide) → the trained accidental-frame score
  await new Promise((r) => setTimeout(r, 0));
  try {
    const b = await createImageBitmap(bitmap, { resizeWidth: 512, resizeQuality: 'high' });
    const emb = await sceneEmbedding(b); b.close();
    out.emb = emb;
    out.accidentP = accidentScore(emb, out);
  } catch (e) { console.warn('scene fingerprint failed', e); }
  return out;
}
