// Accidental-frame score (0..1) from the scene fingerprint + analysis stats — mirrors tools/train-accident.py.
import { ACCIDENT_MODEL as M } from './accident-model.js';

export function accidentFeatures(emb, raw) {
  const e = Array.from(emb); let n = 0; for (const v of e) n += v * v; n = Math.sqrt(n) || 1;
  let t = (raw.tiles && raw.tiles.length ? raw.tiles : new Array(16).fill(raw.sharp)).slice().sort((a, b) => b - a);
  while (t.length < 16) t.push(t[t.length - 1]);
  t = t.slice(0, 16);
  const fs = Math.max(0, ...(raw.faceSharp || []));
  return [...e.map((v) => v / n), ...t.map((v) => Math.log1p(v)), Math.log1p(fs), Math.min(raw.faces.length, 6) / 6,
    (raw.edge || 0) * 10, (raw.lumStd || 0) / 64, raw.mean / 255, raw.clipHi, raw.clipLo];
}
export function accidentScore(emb, raw) {
  if (!emb) return null;
  const x = accidentFeatures(emb, raw);
  if (x.length !== M.w.length) return null;
  let z = M.b;
  for (let i = 0; i < x.length; i++) z += ((x[i] - M.mu[i]) / M.sd[i]) * M.w[i];
  return 1 / (1 + Math.exp(-z));
}
export const ACCIDENT_THRESHOLD = M.threshold;
