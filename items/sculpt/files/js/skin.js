// Skin mask: where skin smoothing is allowed.
//   face oval (minus eyes, brows, lips) ∪ skin-coloured pixels inside the person silhouette,
//   with the skin colour learned from each photo's own faces.
import { blurFloat, faceFrame } from './warp.js';

const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const L_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const R_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const L_BROW = [276, 283, 282, 295, 285, 336, 296, 334, 293, 300];
const R_BROW = [46, 53, 52, 65, 55, 107, 66, 105, 63, 70];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];

// Shading-invariant chromaticity (proportions of R,G,B ×100) + luma: a shadowed neck matches a lit cheek.
const ycc = (r, g, b) => { const s = r + g + b + 1e-3; return [100 * r / s, 100 * g / s, 0.299 * r + 0.587 * g + 0.114 * b]; };

/**
 * @param F     warp field geometry {fw,fh,sx,sy,W,H}
 * @param det   detections {faces, poses}
 * @param thumb {data,w,h} small RGBA8 copy of the photo
 * @returns Uint8Array(fw*fh) 0..255
 */
export function buildSkinMask(F, det, thumb) {
  if (det.seg) return segSkinMask(F, det);
  const { fw, fh, sx, sy } = F;
  const out = new Uint8Array(fw * fh);
  if (!det.faces.length) return out;

  // 1. face regions minus features
  const c = document.createElement('canvas');
  c.width = fw; c.height = fh;
  const g = c.getContext('2d', { willReadFrequently: true });
  const poly = (lm, ids) => { g.beginPath(); ids.forEach((i, k) => (k ? g.lineTo : g.moveTo).call(g, lm[i].x / sx, lm[i].y / sy)); g.closePath(); };
  let faceH = 0;
  g.fillStyle = '#fff';
  for (const lm of det.faces) { poly(lm, FACE_OVAL); g.fill(); faceH = Math.max(faceH, faceFrame(lm).H); }
  g.globalCompositeOperation = 'destination-out';
  g.lineJoin = 'round';
  for (const lm of det.faces) {
    const fr = faceFrame(lm);
    for (const [ids, grow] of [[L_EYE, 0.05], [R_EYE, 0.05], [L_BROW, 0.03], [R_BROW, 0.03], [LIPS, 0.02]]) {
      poly(lm, ids); g.fill();
      g.lineWidth = grow * fr.H / sx * 2; g.stroke();
    }
  }
  const face = g.getImageData(0, 0, fw, fh).data;

  // 2. learn skin colour from the (feature-free) face pixels
  const tx = thumb.w / fw, ty = thumb.h / fh;
  const px = (i, j) => (Math.min(thumb.h - 1, Math.floor((j + 0.5) * ty)) * thumb.w + Math.min(thumb.w - 1, Math.floor((i + 0.5) * tx))) * 4;
  let n = 0, m0 = 0, m1 = 0, s00 = 0, s01 = 0, s11 = 0, lumLo = [], step = Math.max(1, Math.floor(Math.sqrt(fw * fh / 40000)));
  for (let j = 0; j < fh; j += step) for (let i = 0; i < fw; i += step) {
    if (face[(j * fw + i) * 4 + 3] < 250) continue;
    const p = px(i, j), [cb, cr, y] = ycc(thumb.data[p], thumb.data[p + 1], thumb.data[p + 2]);
    if (y < 30 || y > 250) continue;           // ignore deep shadow / specular
    n++; m0 += cb; m1 += cr; s00 += cb * cb; s01 += cb * cr; s11 += cr * cr; lumLo.push(y);
  }
  if (n < 20) return out;
  m0 /= n; m1 /= n;
  let c00 = s00 / n - m0 * m0 + 0.6, c01 = s01 / n - m0 * m1, c11 = s11 / n - m1 * m1 + 0.6;
  const det2 = c00 * c11 - c01 * c01, i00 = c11 / det2, i01 = -c01 / det2, i11 = c00 / det2;
  lumLo.sort((a, b) => a - b);
  const yMin = lumLo[Math.floor(lumLo.length * 0.02)] * 0.6;

  // 3. person silhouette (pose segmentation) to keep skin-coloured walls/wood out
  const masks = det.poses.map((p) => p.mask).filter(Boolean);
  const person = (x, y) => {
    if (!masks.length) return 1;
    let v = 0;
    for (const m of masks) {
      const mx = Math.round(x * m.s), my = Math.round(y * m.s);
      if (mx >= 0 && my >= 0 && mx < m.w && my < m.h) v = Math.max(v, m.data[my * m.w + mx]);
    }
    return v / 255;
  };

  const a = new Float32Array(fw * fh);
  for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
    const k = j * fw + i, p = px(i, j);
    const [cb, cr, y] = ycc(thumb.data[p], thumb.data[p + 1], thumb.data[p + 2]);
    const d0 = cb - m0, d1 = cr - m1;
    const d2 = d0 * d0 * i00 + 2 * d0 * d1 * i01 + d1 * d1 * i11;
    let lik = Math.exp(-0.5 * Math.max(0, d2 - 2) / 3);   // ~1 inside 2σ, falls off after
    if (y < yMin) lik *= y / yMin;
    const f = face[k * 4 + 3] / 255;
    const body = person((i + 0.5) * sx, (j + 0.5) * sy);
    a[k] = 255 * Math.max(f * Math.min(1, lik * 1.6), body * (lik > 0.35 ? lik : 0));
  }
  blurFloat(a, fw, fh, Math.max(1, Math.round(0.012 * faceH / sx)));
  for (let k = 0; k < a.length; k++) out[k] = a[k];
  return out;
}

/** Skin from the person segmenter (face-skin + body-skin classes), minus eyes/brows/lips, softly feathered. */
function segSkinMask(F, det) {
  const { fw, fh, sx, sy } = F, sg = det.seg;
  const a = new Float32Array(fw * fh);
  for (let j = 0; j < fh; j++) {
    const my = Math.min(sg.h - 1, Math.floor((j + 0.5) * sy * sg.s));
    for (let i = 0; i < fw; i++) {
      const c = sg.data[my * sg.w + Math.min(sg.w - 1, Math.floor((i + 0.5) * sx * sg.s))];
      a[j * fw + i] = c === 2 || c === 3 ? 255 : 0;
    }
  }
  let faceH = 0;
  if (det.faces.length) {
    const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.fillStyle = g.strokeStyle = '#fff'; g.lineJoin = 'round';
    const poly = (lm, ids) => { g.beginPath(); ids.forEach((i, k) => (k ? g.lineTo : g.moveTo).call(g, lm[i].x / sx, lm[i].y / sy)); g.closePath(); };
    for (const lm of det.faces) {
      const fr = faceFrame(lm); faceH = Math.max(faceH, fr.H);
      for (const [ids, grow] of [[L_EYE, 0.05], [R_EYE, 0.05], [L_BROW, 0.03], [R_BROW, 0.03], [LIPS, 0.02]]) {
        poly(lm, ids); g.fill(); g.lineWidth = grow * fr.H / sx * 2; g.stroke();
      }
    }
    const feat = g.getImageData(0, 0, fw, fh).data;
    for (let k = 0; k < a.length; k++) if (feat[k * 4 + 3] > 0) a[k] *= 1 - feat[k * 4 + 3] / 255;
  }
  blurFloat(a, fw, fh, Math.max(1, Math.round((faceH ? 0.006 * faceH : 0.003 * Math.max(F.W, F.H)) / sx)));
  const out = new Uint8Array(fw * fh);
  for (let k = 0; k < a.length; k++) out[k] = a[k];
  return out;
}
