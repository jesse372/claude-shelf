// Automatic "natural polish": how much face/body reshaping each person gets in auto-pilot.
//
// Tested on ~100 real photos: geometry alone (neck width, face roundness, waist/shoulder ratio)
// could NOT reliably tell who has a double chin or a fuller figure — clothing, smiles and poses
// dominate. So instead of a shaky detector, auto-pilot uses effects that limit themselves:
//   • the double-chin fill only lightens a crease shadow if there is one,
//   • skin smoothing only removes blemish-scale texture,
//   • reshaping is tiny and uniform (≈1–2%) — invisible on slim people, softening on fuller ones.
// Children (head large relative to shoulders) get no reshaping or smoothing at all.
import { faceFrame } from './warp.js';

// Auto-pilot amounts (slider units, 0..100). Deliberately subtle.
export const AUTO_SHAPE = { faceSlim: 12, jaw: 10, chin: 45, body: 12, waist: 15, hips: 0, arms: 15, legs: 0 };
export const AUTO_RETOUCH = { skin: 35, even: 25 };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * @returns {{weights, children:number, reasons:string[]}} weights in the shape buildUnitFields() expects.
 */
export function measureNeeds(F, det) {
  const faceH = det.faces.map((lm) => faceFrame(lm).H);
  // match each pose to the face nearest its nose
  const poseFace = det.poses.map((p) => {
    let best = -1, bd = Infinity;
    det.faces.forEach((lm, i) => { const d = dist(lm[1], p.lm[0]); if (d < bd) { bd = d; best = i; } });
    return best >= 0 && bd < faceH[best] * 0.8 ? best : -1;
  });
  const childFace = new Set(), childPose = new Set();
  det.poses.forEach((p, i) => {
    const f = poseFace[i];
    if (f < 0 || p.lm[11].v < 0.5 || p.lm[12].v < 0.5) return;
    const ratio = dist(p.lm[11], p.lm[12]) / faceH[f];      // adults ≈ 1.4–2.0, young children ≈ 0.9–1.2
    if (ratio < 1.3) { childFace.add(f); childPose.add(i); }
  });
  const group = det.faces.length > 4 ? 0.5 : 1;
  const weights = {
    faces: det.faces.map((_, i) => (childFace.has(i) ? {} : { faceSlim: group, jaw: group, chin: group })),
    // a body whose face we can't see can't be confirmed as an adult: never reshape it
    poses: det.poses.map((_, i) => (childPose.has(i) || poseFace[i] < 0 ? {} : { body: group, waist: group, arms: group })),
  };
  const reasons = [];
  const unseen = poseFace.filter((f) => f < 0).length;
  if (unseen) reasons.push(`${unseen} ${unseen > 1 ? 'people' : 'person'} not reshaped (face not visible)`);
  if (childFace.size) reasons.push(`${childFace.size} child${childFace.size > 1 ? 'ren' : ''} left untouched`);
  if (group < 1) reasons.push('big group: lighter touch');
  return { weights, children: childFace.size, childFaces: [...childFace], reasons };
}
