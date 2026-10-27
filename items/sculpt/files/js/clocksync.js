// Second shooter / second body: camera clocks are rarely in sync, which scrambles the timeline (bursts, family
// groupings and the delivered order all follow capture time). Each camera's clock offset is found by matching
// the same moments across cameras: every photo votes for the offsets implied by its most similar-looking photos
// from the main camera, and a clear winner becomes the correction. No clear winner → no change.

/** Identity of the camera body that took a photo (serial when known; owner name and file prefix tell same-model bodies apart). */
export function cameraId(meta = {}, name = '') {
  const prefix = (name.match(/^[A-Za-z_]*\d{0,3}[A-Za-z_]+(?=\d)/) || [''])[0];   // 026A3251 → 026A, IMG_0001 → IMG_, DSC01 → DSC
  return [meta.make || '', meta.model || '', meta.serial || '', meta.artist || '', meta.serial ? '' : prefix].join('|');
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const unit = (e) => { const n = Math.sqrt(dot(e, e)) || 1; return Float32Array.from(e, (v) => v / n); };

/**
 * items: [{ cam, t (ms), emb }]. Returns { ref, offsets: { cam: { ms, confidence, votes } } } — add ms to a camera's times.
 * opts: range (ms searched either way), step (histogram bin), topK (matches per photo), minConfidence, minMoments (separate
 * 10-minute stretches that must agree).
 */
export function estimateOffsets(items, { range = 3 * 3600e3, step = 10e3, topK = 6, minConfidence = 3, minMoments = 3, minPhotos = 8 } = {}) {
  const byCam = new Map();
  for (const it of items) if (it.t != null && it.emb) { if (!byCam.has(it.cam)) byCam.set(it.cam, []); byCam.get(it.cam).push({ t: it.t, e: unit(it.emb) }); }
  const cams = [...byCam.entries()].sort((a, b) => b[1].length - a[1].length);
  const out = { ref: cams[0]?.[0] ?? null, offsets: {} };
  if (cams.length < 2) return out;
  const A = cams[0][1];
  for (const [cam, B] of cams.slice(1)) {
    if (B.length < minPhotos) { out.offsets[cam] = { ms: 0, confidence: 0, votes: 0, reason: 'too few photos' }; continue; }
    const bins = Math.round(range / step), hist = new Float64Array(2 * bins + 1);
    for (const b of B) {
      const sims = A.map((a) => dot(a.e, b.e));
      const sorted = Float64Array.from(sims).sort(), med = sorted[sorted.length >> 1];
      const top = sims.map((s, i) => [s, i]).sort((x, y) => y[0] - x[0]).slice(0, topK);
      for (const [s, i] of top) {
        const w = s - med; if (w <= 0) continue;
        const k = Math.round((A[i].t - b.t) / step) + bins;
        if (k >= 0 && k < hist.length) hist[k] += w;
      }
    }
    // smooth over ±3 bins (shots of one moment span a few seconds either side)
    const sm = hist.map((_, k) => { let s = 0; for (let j = -3; j <= 3; j++) s += hist[k + j] || 0; return s; });
    let best = 0; for (let k = 1; k < sm.length; k++) if (sm[k] > sm[best]) best = k;
    // confidence: the peak against the typical level of the other offsets (robust: median + spread)
    const rest = Float64Array.from(sm.filter((_, k) => Math.abs(k - best) > 12)).sort();
    const med = rest[rest.length >> 1], q9 = rest[Math.floor(rest.length * 0.99)], spread = Math.max(1e-9, q9 - med);
    const confidence = (sm[best] - med) / spread;
    // refine within the peak: weighted centre of the raw votes
    let num = 0, den = 0; for (let j = -3; j <= 3; j++) { const v = hist[best + j] || 0; num += v * (best + j - bins) * step; den += v; }
    const ms = den ? num / den : (best - bins) * step;
    // a real clock error is confirmed by many separate moments through the day; a coincidence by one cluster of
    // look-alike photos — count the distinct 10-minute stretches whose best match agrees with this offset
    const moments = new Set();
    for (const b of B) {
      let bi = -1, bs = -2; for (let i = 0; i < A.length; i++) { const v = dot(A[i].e, b.e); if (v > bs) { bs = v; bi = i; } }
      if (Math.abs(A[bi].t - b.t - ms) <= 30e3) moments.add(Math.floor((b.t + ms) / 600e3));
    }
    const ok = confidence >= minConfidence && (moments.size >= minMoments || confidence >= minConfidence + 1);   // or a very clear match in one stretch
    out.offsets[cam] = ok ? { ms: Math.round(ms), confidence: +confidence.toFixed(2), moments: moments.size, votes: B.length }
      : { ms: 0, confidence: +confidence.toFixed(2), moments: moments.size, votes: B.length, reason: 'no clear match', guess: Math.round(ms) };
  }
  return out;
}
