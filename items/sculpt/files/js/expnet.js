// The image network's exposure guess (tools/colour/cnn_final.py): a small pretrained network that LOOKS at the whole
// photo (the base RAW render, letterboxed into a square) and says how many stops Jesse would add. Its guess is one more
// input to the trained style's boosted trees (profile gbm feature 'network stops'), never the answer by itself.
const VENDOR = new URL('../vendor/', import.meta.url).href;
let sessP = null, ort = null;
async function session(file) {
  if (!sessP) sessP = (async () => {
    ort = await import(VENDOR + 'ort/ort.wasm.min.mjs');
    ort.env.wasm.wasmPaths = VENDOR + 'ort/';
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)) : 1;
    const bytes = await (await fetch(VENDOR + 'models/' + file)).arrayBuffer();
    return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })().catch((e) => { sessP = null; throw e; });
  return sessP;
}
/** Letterbox a thumbnail {data,w,h} into RES x RES: exact area averaging (Pillow's BOX filter, as training did), black
 * borders, centred. Deterministic - no browser resampling involved. Returns RGBA bytes. */
export function letterbox(thumb, RES) {
  const { data, w, h } = thumb, tw = w >= h ? RES : Math.max(1, Math.round(w * RES / h)), th = w >= h ? Math.max(1, Math.round(h * RES / w)) : RES;
  const sx = w / tw, sy = h / th, tmp = new Float32Array(tw * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < tw; x++) {                 // horizontal pass
    const a = x * sx, b = (x + 1) * sx; let r = 0, g = 0, bl = 0;
    for (let i = Math.floor(a), e = Math.min(w, Math.ceil(b)); i < e; i++) {
      const wt = Math.min(b, i + 1) - Math.max(a, i), k = (y * w + i) * 4; r += data[k] * wt; g += data[k + 1] * wt; bl += data[k + 2] * wt;
    }
    const o = (y * tw + x) * 3; tmp[o] = r / sx; tmp[o + 1] = g / sx; tmp[o + 2] = bl / sx;
  }
  const out = new Uint8ClampedArray(RES * RES * 4), x0 = (RES - tw) >> 1, y0 = (RES - th) >> 1;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {                 // vertical pass
    const a = y * sy, b = (y + 1) * sy; let r = 0, g = 0, bl = 0;
    for (let j = Math.floor(a), e = Math.min(h, Math.ceil(b)); j < e; j++) {
      const wt = Math.min(b, j + 1) - Math.max(a, j), k = (j * tw + x) * 3; r += tmp[k] * wt; g += tmp[k + 1] * wt; bl += tmp[k + 2] * wt;
    }
    const o = ((y0 + y) * RES + x0 + x) * 4; out[o] = Math.round(r / sy); out[o + 1] = Math.round(g / sy); out[o + 2] = Math.round(bl / sy); out[o + 3] = 255;
  }
  return out;
}
/** Stops the network thinks the photo wants. `net` = the profile's {file, res}; thumb = base image (unstyled). */
export async function netStops(thumb, net) {
  const RES = net.res || 192, s = await session(net.file || 'exposure-net.onnx'), px = letterbox(thumb, RES);
  const x = new Float32Array(3 * RES * RES), n = RES * RES;
  for (let i = 0; i < n; i++) { x[i] = px[i * 4] / 255; x[n + i] = px[i * 4 + 1] / 255; x[2 * n + i] = px[i * 4 + 2] / 255; }
  const out = await s.run({ image: new ort.Tensor('float32', x, [1, 3, RES, RES]) });
  return +out.stops.data[0];
}
