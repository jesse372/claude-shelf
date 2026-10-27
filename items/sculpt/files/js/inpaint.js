// Object / blemish removal, on-device via ONNX Runtime (WebAssembly, multi-threaded when the
// page is cross-origin isolated).
//   • LaMa  (~208 MB, best quality)  — exit signs, people, objects on busy backgrounds
//   • MI-GAN (~28 MB, fast)          — blemishes, small spots, plain backgrounds
// Both see a square crop around the hole resized to 512px (what they were trained on);
// the fill is scaled back and blended into the full-resolution photo.

const VENDOR = new URL('../vendor/', import.meta.url).href;
const MODELS = {
  lama: { local: VENDOR + 'models/lama_fp32.onnx', remote: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx', size: 208e6 },
  migan: { local: VENDOR + 'models/migan_pipeline_v2.onnx', remote: 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx', size: 28e6 },
};
const CACHE = 'sculpt-models-v1';
const N = 512;

let ort = null;
const sessions = {};

async function loadOrt() {
  if (ort) return ort;
  ort = await import(VENDOR + 'ort/ort.wasm.min.mjs');
  ort.env.wasm.wasmPaths = VENDOR + 'ort/';
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) : 1;
  return ort;
}

const IS_LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname);   // the Mac app bundles the models

async function fetchModel(m, onProgress) {
  if (IS_LOCAL) {
    try {
      const r = await fetch(m.local);
      if (r.ok) return new Uint8Array(await r.arrayBuffer());
    } catch { /* not bundled */ }
  }
  let cache = null;
  try { cache = await caches.open(CACHE); } catch { /* Cache API unavailable */ }
  let r = cache && await cache.match(m.remote);
  const cached = !!r;
  if (!r) {
    r = await fetch(m.remote, { mode: 'cors' });
    if (!r.ok) throw new Error('Could not download the removal model (' + r.status + ')');
  }
  const total = +r.headers.get('content-length') || m.size;
  const reader = r.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    if (!cached) onProgress?.(got / total);
  }
  const out = new Uint8Array(got);
  let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  if (cache && !cached) { try { await cache.put(m.remote, new Response(out, { headers: { 'content-length': String(got) } })); } catch { /* quota */ } }
  return out;
}

export const isModelReady = (name) => !!sessions[name]?.ready;

export function initInpaint(name = 'lama', onProgress) {
  if (!sessions[name]) {
    const s = { ready: false };
    s.p = (async () => {
      await loadOrt();
      const bytes = await fetchModel(MODELS[name], onProgress);
      const sess = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      s.ready = true;
      return sess;
    })().catch((e) => { delete sessions[name]; throw e; });
    sessions[name] = s;
  }
  return sessions[name].p;
}

/** Run a model on a 512x512 RGBA8 square. hole: Uint8Array(512*512), 1 = remove. → Uint8ClampedArray RGBA */
async function run512(name, rgba, hole) {
  const session = await initInpaint(name);
  const P = N * N, out = new Uint8ClampedArray(P * 4);
  let res;
  if (name === 'lama') {
    const img = new Float32Array(3 * P), mask = new Float32Array(P);
    for (let i = 0; i < P; i++) {
      img[i] = rgba[i * 4] / 255; img[P + i] = rgba[i * 4 + 1] / 255; img[2 * P + i] = rgba[i * 4 + 2] / 255;
      mask[i] = hole[i];
    }
    const r = await session.run({ image: new ort.Tensor('float32', img, [1, 3, N, N]), mask: new ort.Tensor('float32', mask, [1, 1, N, N]) });
    res = r[session.outputNames[0]].data;             // float 0..255
  } else {
    const img = new Uint8Array(3 * P), mask = new Uint8Array(P);
    for (let i = 0; i < P; i++) {
      img[i] = rgba[i * 4]; img[P + i] = rgba[i * 4 + 1]; img[2 * P + i] = rgba[i * 4 + 2];
      mask[i] = hole[i] ? 0 : 255;                    // MI-GAN: 0 = fill
    }
    const r = await session.run({ image: new ort.Tensor('uint8', img, [1, 3, N, N]), mask: new ort.Tensor('uint8', mask, [1, 1, N, N]) });
    res = r[session.outputNames[0]].data;
  }
  for (let i = 0; i < P; i++) { out[i * 4] = res[i]; out[i * 4 + 1] = res[P + i]; out[i * 4 + 2] = res[2 * P + i]; out[i * 4 + 3] = 255; }
  return out;
}

/**
 * Remove whatever is under a brush stroke (source-image coords) from the renderer's base photo.
 * Returns an undoable patch {x,y,w,h, prev, next} already written to the GPU.
 */
export async function removeStroke(renderer, stroke, { quality = 'best', onProgress } = {}) {
  const W = renderer.w, H = renderer.h;
  const grow = Math.max(4, stroke.r * 0.15);        // soft object edges leave halos — cover them
  const R = stroke.r + grow;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of stroke.pts) { x0 = Math.min(x0, p.x - R); y0 = Math.min(y0, p.y - R); x1 = Math.max(x1, p.x + R); y1 = Math.max(y1, p.y + R); }
  const holeSize = Math.max(x1 - x0, y1 - y0);
  // square context window ~2.2x the hole, kept inside the photo
  let side = Math.round(Math.min(Math.min(W, H), Math.max(160, holeSize * 2.2), Math.max(2048, holeSize * 1.3)));   // cap memory on huge holes
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const sx = Math.round(Math.min(Math.max(0, cx - side / 2), W - side));
  const sy = Math.round(Math.min(Math.max(0, cy - side / 2), H - side));
  // small blemishes → fast model; real objects → LaMa
  const model = quality === 'fast' || (holeSize < 70 && quality !== 'best-always') ? 'migan' : 'lama';

  await initInpaint(model, onProgress);   // first use downloads the model (cached afterwards)
  const prev = renderer.readBase(sx, sy, side, side);
  const rgba = prev.u8 ? new Uint8ClampedArray(prev.u8) : Uint8ClampedArray.from(prev.f32, (v) => v * 255);

  // hole mask at crop resolution
  const mc = new OffscreenCanvas(side, side), g = mc.getContext('2d');
  g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = g.lineJoin = 'round'; g.lineWidth = R * 2;
  g.beginPath();
  stroke.pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, p.x - sx, p.y - sy));
  g.stroke();
  for (const p of [stroke.pts[0], stroke.pts[stroke.pts.length - 1]]) { g.beginPath(); g.arc(p.x - sx, p.y - sy, R, 0, Math.PI * 2); g.fill(); }
  const md = g.getImageData(0, 0, side, side).data;
  const hole = new Uint8Array(side * side);
  for (let i = 0; i < hole.length; i++) hole[i] = md[i * 4 + 3] > 20 ? 1 : 0;

  // to 512²
  const src = new OffscreenCanvas(side, side); src.getContext('2d').putImageData(new ImageData(rgba, side, side), 0, 0);
  const sm = new OffscreenCanvas(N, N), sg = sm.getContext('2d', { willReadFrequently: true });
  sg.imageSmoothingQuality = 'high'; sg.drawImage(src, 0, 0, N, N);
  const mm = new OffscreenCanvas(N, N), mg = mm.getContext('2d', { willReadFrequently: true });
  mg.drawImage(mc, 0, 0, N, N);
  const mmd = mg.getImageData(0, 0, N, N).data, hole512 = new Uint8Array(N * N);
  for (let i = 0; i < hole512.length; i++) hole512[i] = mmd[i * 4 + 3] > 10 ? 1 : 0;
  const filled512 = await run512(model, sg.getImageData(0, 0, N, N).data, hole512);

  // back to crop size
  const up = new OffscreenCanvas(N, N); up.getContext('2d').putImageData(new ImageData(filled512, N, N), 0, 0);
  const big = new OffscreenCanvas(side, side), bg = big.getContext('2d', { willReadFrequently: true });
  bg.imageSmoothingQuality = 'high'; bg.drawImage(up, 0, 0, side, side);
  const filled = bg.getImageData(0, 0, side, side).data;

  // feathered composite: hole fully replaced, soft ~3px edge outside it
  const a = new Float32Array(side * side);
  for (let i = 0; i < a.length; i++) a[i] = hole[i];
  const F = 3, feather = new Float32Array(a);
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
    const k = j * side + i;
    if (a[k]) continue;
    let m = 0;
    for (let d = 1; d <= F && !m; d++) {
      if ((i >= d && a[k - d]) || (i + d < side && a[k + d]) || (j >= d && a[k - d * side]) || (j + d < side && a[k + d * side])) m = 1 - d / (F + 1);
    }
    feather[k] = m;
  }
  let next;
  if (prev.f32) {
    const f = new Float32Array(prev.f32);
    for (let i = 0; i < a.length; i++) { const k = feather[i]; if (k > 0) for (let c = 0; c < 3; c++) f[i * 4 + c] = f[i * 4 + c] * (1 - k) + filled[i * 4 + c] / 255 * k; }
    next = { f32: f };
  } else {
    const u = new Uint8Array(prev.u8);
    for (let i = 0; i < a.length; i++) { const k = feather[i]; if (k > 0) for (let c = 0; c < 3; c++) u[i * 4 + c] = u[i * 4 + c] * (1 - k) + filled[i * 4 + c] * k; }
    next = { u8: u };
  }
  renderer.writeBase(sx, sy, side, side, next);
  return { x: sx, y: sy, w: side, h: side, prev, next, model };
}
