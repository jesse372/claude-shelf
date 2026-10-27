import { ACCIDENT_THRESHOLD } from './accident.js';

// Culling rules (pure — used by the app and by tools/cull-eval.mjs against delivered galleries).
//
// Input: photos with { raw (from analyzePhoto), time, order }. Output on each: p.ai = { ...flags, groupId, best, keep, reason }.
// Decisions (autoCull): flag 1 = keeper, -1 = reject, with a plain-English reason.

const popcnt = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
export const hamming = (a, b) => popcnt(a[0] ^ b[0]) + popcnt(a[1] ^ b[1]);
const med = (arr) => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0; };

/** v0 — the original rules (kept for comparison). */
export function scoreV0(list) {
  const done = list.filter((p) => p.raw);
  if (!done.length) return;
  const medFace = med(done.filter((p) => p.raw.faces.length).map((p) => p.raw.sharp));
  const ordered = done.slice().sort((a, b) => (a.time ?? 0) - (b.time ?? 0) || a.order - b.order);
  const nFace = done.filter((p) => p.raw.faces.length).length;
  let gid = 0, prev = null;
  for (const p of ordered) {
    const r = p.raw;
    const near = prev && hamming(prev.raw.hash, r.hash) <= 12 && (p.time == null || prev.time == null || Math.abs(p.time - prev.time) <= 8000);
    if (!near) gid++;
    const absBlur = r.faces.length ? r.sharp < 15 : r.sharp < 40;
    const shootRel = r.faces.length && nFace >= 6 && medFace > 0 ? r.sharp / medFace : 1;
    p.ai = { faces: r.faces.length, rel: shootRel, blurry: absBlur || shootRel < 0.3, closed: r.mainClosed, maybeClosed: !!r.mainMaybe,
      someClosed: r.anyClosed && !r.mainClosed, over: r.clipHi > 0.08, under: r.mean < 35, groupId: gid, group: 0, best: true, smile: r.faces[0]?.smile ?? 0 };
    prev = p;
  }
  const groups = new Map();
  for (const p of ordered) { const g = groups.get(p.ai.groupId) || []; g.push(p); groups.set(p.ai.groupId, g); }
  for (const g of groups.values()) {
    const top = Math.max(...g.map((p) => p.raw.sharp));
    for (const p of g) {
      p.ai.groupRel = top > 0 ? p.raw.sharp / top : 1;
      if (g.length > 1 && p.ai.groupRel < 0.4) p.ai.blurry = true;
      p.ai.score = Math.log(0.05 + p.ai.groupRel) - (p.ai.closed ? 3 : 0) - (p.ai.maybeClosed ? 1.2 : 0) - (p.ai.someClosed ? 1 : 0) +
        0.6 * p.ai.smile - (p.ai.over || p.ai.under ? 0.5 : 0) - (p.ai.blurry ? 2 : 0);
    }
    if (g.length < 2) continue;
    const best = g.reduce((a, b) => (b.ai.score > a.ai.score ? b : a));
    g.forEach((p) => { p.ai.group = g.length; p.ai.best = p === best; });
  }
}
export function decideV0(p) {
  if (!p.ai) return 0;
  if (p.ai.closed || p.ai.blurry) return -1;
  if (!p.ai.group || p.ai.best) return 1;
  return 0;
}

// ======================================================================== v1
// Principles (tested against Jesse's delivered weddings, where every photo is a keeper):
//  • a blink or a soft frame only loses to a better frame of the same moment — closed eyes in a hug, a kiss, a laugh
//    or someone looking down at the rings are deliberate when there is no better alternative;
//  • every moment / family grouping keeps its best frame (never "all rejected");
//  • a changed head-count starts a new group, so different family combinations are never merged;
//  • sharpness is judged on the sharpest face / part of the frame (the subject), not the biggest face;
//  • accidental frames (lens cap, floor, sky, fabric, total miss-focus, flash misfire) are caught by
//    whole-frame measures that never fire on real photos, including detail shots.
export const ACC = { dark: 10, blown: 0.85, featureEdge: 0.004, featureStd: 9, softTile: 6, softFace: 3 };

export function subjectSharp(r) {
  const fs = (r.faceSharp && r.faceSharp.length) ? Math.max(...r.faceSharp) : (r.faces.length ? r.sharp : 0);
  const tiles = (r.tiles || []).slice().sort((a, b) => b - a);
  return { face: fs, tile: tiles.length ? tiles[1] : r.sharp, top: tiles.length ? tiles[0] : r.sharp };
}

/** Why this frame is an accident (or null). */
export function accident(r, A = ACC) {
  const s = subjectSharp(r), faces = r.faces.length;
  if (r.mean < A.dark && !faces) return 'Black / lens cap';
  if (r.clipHi > A.blown) return 'Flash misfire (blown out)';
  if (!faces && r.edge != null && r.edge < A.featureEdge && r.lumStd < A.featureStd) return 'Nothing in frame (floor, sky or fabric)';
  if (!faces && s.top < A.softTile) return 'Completely out of focus';
  if (faces && s.face < A.softFace && s.top < A.softTile) return 'Completely out of focus';
  // trained detector (scene fingerprint + stats), threshold set so no delivered photo in 5 weddings trips it
  if (r.accidentP != null && r.accidentP >= ACCIDENT_THRESHOLD) return 'Looks accidental (floor, blur or nothing in frame)';
  return null;
}

/** Same people in the same places? (a burst of one grouping vs. the next family combination on the same backdrop) */
export function samePeople(a, b) {
  const fa = a.raw.faces, fb = b.raw.faces;
  if (fa.length !== fb.length) return false;
  const dim = (p) => [p.raw.W || p.w || p.previewW || 1, p.raw.H || p.h || 1];
  const [wa, ha] = dim(a), [wb, hb] = dim(b);
  const pts = (fs, w, h) => fs.map((f) => ({ x: (f.box.x + f.box.w / 2) / w, y: (f.box.y + f.box.h / 2) / h, s: f.box.w / w }));
  const A = pts(fa, wa, ha), B = pts(fb, wb, hb), used = new Set();
  for (const q of A) {
    let best = -1, bd = Infinity;
    B.forEach((r, j) => { if (used.has(j)) return; const d = Math.hypot(q.x - r.x, q.y - r.y); if (d < bd) { bd = d; best = j; } });
    if (best < 0 || bd > 0.8 * Math.max(q.s, B[best].s) || Math.abs(q.s - B[best].s) > 0.5 * Math.max(q.s, B[best].s)) return false;
    used.add(best);
  }
  return true;
}

// eyes can only be judged on a face turned towards us (on a turned face one eye is hidden and reads as closed)
const judgeable = (f) => f.l != null && f.r != null && Math.abs(f.yaw ?? 0) <= 30;
// shut = both eyes closing; a big smile narrows the eyes, so a smiling face needs much stronger evidence (squint ≠ blink)
export const shut = (f) => Math.min(f.l, f.r) >= 0.45 && (f.l + f.r) / 2 >= ((f.smile || 0) >= 0.6 ? 0.75 : 0.5);

export function score(list) {
  const done = list.filter((p) => p.raw);
  if (!done.length) return;
  const ordered = done.slice().sort((a, b) => (a.time ?? 0) - (b.time ?? 0) || a.order - b.order);
  let gid = 0, prev = null;
  for (const p of ordered) {
    const r = p.raw, nf = r.faces.length;
    let near = prev && hamming(prev.raw.hash, r.hash) <= 12 && (p.time == null || prev.time == null || Math.abs(p.time - prev.time) <= 8000);
    // a different family combination is never the same group: different head-count, or people in different places
    if (near && (nf >= 2 || prev.raw.faces.length >= 2) && !samePeople(prev, p)) near = false;
    if (!near) gid++;
    const s = subjectSharp(r);
    const big = r.faces.filter((f) => f.box.w > (r.faces[0]?.box.w || 0) * 0.5);       // the people that matter in the frame
    const judged = big.filter(judgeable);
    const closedN = judged.filter(shut).length;
    const seen = r.faces.filter(judgeable);                                              // everyone, incl. smaller faces
    const closedAny = seen.length ? seen.filter((f) => shut(f) && (f.l + f.r) / 2 >= 0.7).length / seen.length : 0;   // clear blinks only
    p.ai = {
      faces: nf, sharpness: Math.max(s.face, s.tile), closed: r.mainClosed, maybeClosed: !!r.mainMaybe, someClosed: r.anyClosed && !r.mainClosed,
      closedFrac: judged.length ? closedN / judged.length : 0, closedAny, smile: r.faces[0]?.smile ?? 0,
      over: r.clipHi > 0.08, under: r.mean < 35, accident: accident(r), groupId: gid, group: 0, best: true, blurry: false,
    };
    prev = p;
  }
  const groups = new Map();
  for (const p of ordered) { const g = groups.get(p.ai.groupId) || []; g.push(p); groups.set(p.ai.groupId, g); }
  for (const g of groups.values()) {
    const top = Math.max(...g.map((p) => p.ai.sharpness), 1e-6);
    for (const p of g) {
      p.ai.groupRel = p.ai.sharpness / top; p.ai.rel = p.ai.groupRel;
      p.ai.blurry = g.length > 1 && p.ai.groupRel < 0.4;           // soft compared with its siblings
      p.ai.score = Math.log(0.05 + p.ai.groupRel) - 2.5 * p.ai.closedFrac - 1.0 * p.ai.closedAny - (p.ai.maybeClosed ? 0.8 : 0) + 0.6 * p.ai.smile -
        (p.ai.over || p.ai.under ? 0.4 : 0) - (p.ai.accident ? 10 : 0);
    }
    const best = g.reduce((a, b) => (b.ai.score > a.ai.score ? b : a));
    g.forEach((p) => { p.ai.group = g.length > 1 ? g.length : 0; p.ai.best = p === best; p.ai.bestOf = best; p.ai.keep = p === best; });
    // every other good frame that is visibly different from the ones kept is a keeper too (Jesse delivers
    // several frames of a moment); only near-identical burst copies are left out
    const kept = [best];
    for (const p of g.slice().sort((a, b) => b.ai.score - a.ai.score)) {
      if (p === best || p.ai.accident || p.ai.blurry || moreClosed(p.ai, best.ai)) continue;
      if (kept.every((k) => hamming(k.raw.hash, p.raw.hash) >= DUP_HAMMING)) { p.ai.keep = true; kept.push(p); }
    }
  }
}
export const DUP_HAMMING = 6;
// a has more people blinking than b (the people who matter first, then anyone else in the frame)
const moreClosed = (a, b) => a.closedFrac > b.closedFrac || (a.closedFrac === b.closedFrac && a.closedAny > b.closedAny);

/** A lone frame whose subject simply blinked (vs a deliberate closed-eyes moment: a hug, kiss, laugh, looking down). */
export const LONE_BLINK = { eyes: 0.6, smileMax: 0.3, maxFaces: 2, near: 1.6, pitchMax: 12, yawMax: 35 };
export function loneBlink(r, B = LONE_BLINK) {
  const f = r.faces[0];
  if (!f || f.l == null || f.r == null) return false;
  if ((f.l + f.r) / 2 < B.eyes || Math.min(f.l, f.r) < B.eyes * 0.85) return false;     // both eyes properly shut
  if ((f.smile || 0) >= B.smileMax) return false;                                         // laughing / beaming
  // a blink happens looking at the camera: head level and facing us (looking down at rings / signing / makeup ≠ blink)
  // (head tipped back laughing, or down at the rings, is a moment — not a blink)
  if (f.pitch == null || Math.abs(f.pitch) > B.pitchMax || Math.abs(f.yaw ?? 90) > B.yawMax) return false;
  // others' eyes closing too = a shared moment (a prayer, a toast, a tearful speech), not one person's blink
  if (r.faces.some((o) => o !== f && judgeable(o) && (o.l + o.r) / 2 >= 0.5)) return false;
  const big = r.faces.filter((o) => o.box.w > f.box.w * 0.5);
  if (big.length > B.maxFaces) return false;                                              // groups: someone's eyes always closing
  const cx = f.box.x + f.box.w / 2, cy = f.box.y + f.box.h / 2;
  if (big.some((o) => o !== f && Math.hypot(o.box.x + o.box.w / 2 - cx, o.box.y + o.box.h / 2 - cy) < B.near * f.box.w)) return false; // kiss / hug
  return true;
}     // closer than this to a kept frame = a burst copy

/** { flag: 1 keep | -1 reject | 0 leave, reason } */
export function decide(p) {
  const a = p.ai;
  if (!a) return { flag: 0, reason: '' };
  if (a.accident) return { flag: -1, reason: a.accident };
  if (!a.group && p.raw && loneBlink(p.raw)) return { flag: -1, reason: 'Blink (eyes shut, no other frame of this moment)' };
  if (!a.group || a.best) return { flag: 1, reason: a.group ? `Best of ${a.group} similar` : '' };
  if (a.keep) return { flag: 1, reason: 'Another good moment from this sequence' };
  const b = a.bestOf.ai;
  if (moreClosed(a, b)) return { flag: -1, reason: 'Blink — a better frame of this moment is kept' };
  if (a.blurry) return { flag: -1, reason: 'Softer than another frame of this moment' };
  return { flag: 0, reason: 'Similar to a better frame' };
}
