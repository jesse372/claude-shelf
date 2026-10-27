// Every face in a wedding photo — including small ones in family groups, crowds and profiles.
// 1. YuNet (OpenCV, MIT) finds faces anywhere in the frame (down to ~10 px at 640 px).
// 2. each face is enlarged and checked with MediaPipe's face model for closed eyes and a smile.
import { analyzeFaces } from './detect.js';

const VENDOR = new URL('../vendor/', import.meta.url).href;
// The graphics-card build of the runtime is too big for our host (26 MB file limit), so its engine loads from the
// public npm CDN; the processor build stays local and is the fallback (and what tests / old machines use).
const ORT_GPU_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
const N = 640, STRIDES = [8, 16, 32];
let sessP = null, ort = null, runQueue = Promise.resolve();
export let faceBackend = null;            // 'webgpu' | 'wasm' — which one is running

async function session() {
  if (!sessP) sessP = (async () => {
    const bytes = await (await fetch(VENDOR + 'models/face_detection_yunet_2023mar.onnx')).arrayBuffer();
    const wantGPU = self.navigator?.gpu && !self.__sculptCPU && !self.__sculptNoGPU;
    if (wantGPU) {
      try {
        const o = await import(VENDOR + 'ort-gpu/ort.webgpu.min.mjs');
        o.env.wasm.wasmPaths = self.__ortGpuPath || ORT_GPU_CDN;
        o.env.wasm.numThreads = 1;
        const s = await o.InferenceSession.create(bytes, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' });
        ort = o; faceBackend = 'webgpu';
        return s;
      } catch (e) { console.warn('face finder: graphics card not available, using the processor', e); }
    }
    ort = await import(VENDOR + 'ort/ort.wasm.min.mjs');
    ort.env.wasm.wasmPaths = VENDOR + 'ort/';
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1)) : 1;
    faceBackend = 'wasm';
    return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })().catch((e) => { sessP = null; throw e; });
  return sessP;
}

const iou = (a, b) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return i / (a.w * a.h + b.w * b.h - i || 1);
};

/** Raw YuNet detections on one 640x640 letterboxed view: [{box:{x,y,w,h}, kps:[10], score}] in source pixels. */
async function yunet(source, region = null, thr = 0.6) {
  const sess = await session();
  const rx = region ? region.x : 0, ry = region ? region.y : 0, rw = region ? region.w : source.width, rh = region ? region.h : source.height;
  const s = Math.min(N / rw, N / rh);
  const c = new OffscreenCanvas(N, N), g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  g.drawImage(source, rx, ry, rw, rh, 0, 0, rw * s, rh * s);
  const px = g.getImageData(0, 0, N, N).data, x = new Float32Array(3 * N * N);
  for (let i = 0; i < N * N; i++) { x[i] = px[i * 4 + 2]; x[N * N + i] = px[i * 4 + 1]; x[2 * N * N + i] = px[i * 4]; }   // BGR
  // one run at a time: the graphics-card engine hangs when two photos are searched at once (import analyses several
  // in parallel). Outputs are read inside the same turn so the next run can't reuse their buffers.
  const job = runQueue.then(async () => {
    const o = await sess.run({ input: new ort.Tensor('float32', x, [1, 3, N, N]) }), r = {};
    for (const k in o) { const t = o[k]; r[k] = t.location && t.location !== 'cpu' ? await t.getData() : t.data; }
    return r;
  });
  runQueue = job.catch(() => {});
  const out = await job;
  const dets = [];
  for (const st of STRIDES) {
    const cols = N / st, cls = out['cls_' + st], obj = out['obj_' + st], bb = out['bbox_' + st], kp = out['kps_' + st];
    for (let i = 0; i < cols * cols; i++) {
      const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
      if (score < thr) continue;
      const r = Math.floor(i / cols), col = i % cols;
      const cx = (col + bb[i * 4]) * st, cy = (r + bb[i * 4 + 1]) * st, w = Math.exp(bb[i * 4 + 2]) * st, h = Math.exp(bb[i * 4 + 3]) * st;
      const kps = []; for (let k = 0; k < 5; k++) kps.push(rx + (kp[i * 10 + 2 * k] + col) * st / s, ry + (kp[i * 10 + 2 * k + 1] + r) * st / s);
      dets.push({ box: { x: rx + (cx - w / 2) / s, y: ry + (cy - h / 2) / s, w: w / s, h: h / s }, kps, score });
    }
  }
  return dets;
}

function nms(dets, t = 0.3) {
  dets.sort((a, b) => b.score - a.score);
  const keep = [];
  for (const d of dets) if (keep.every((k) => iou(k.box, d.box) < t)) keep.push(d);
  return keep;
}

/**
 * All faces in a bitmap/canvas: [{box, l, r, smile, score}] in source pixels, biggest first.
 * l / r = eye-closed score (0 open … 1 closed) — null when the face is too small to judge.
 */
export async function findFaces(source, { maxFaces = 30, minEyePx = 22, rescan = 'always', rescanMinFaces = 3, rescanSmall = 0.035 } = {}) {
  const W = source.width, H = source.height;
  let dets = await yunet(source);
  await new Promise((r) => setTimeout(r, 0));
  // a large frame with small faces (family groups): look again at each half in more detail — only when the first look
  // suggests a group or small faces (most wedding frames are one to three people and don't need it)
  const looksCrowded = (ds) => ds.length >= rescanMinFaces || ds.some((d) => d.box.w < Math.max(W, H) * rescanSmall);
  if (Math.max(W, H) > 1200 && (rescan === 'always' || (rescan === 'auto' && looksCrowded(nms(dets.slice()))))) {
    const halves = W >= H ? [{ x: 0, y: 0, w: W * 0.55, h: H }, { x: W * 0.45, y: 0, w: W * 0.55, h: H }]
      : [{ x: 0, y: 0, w: W, h: H * 0.55 }, { x: 0, y: H * 0.45, w: W, h: H * 0.55 }];
    for (const r of halves) dets = dets.concat(await yunet(source, r));
  }
  dets = nms(dets).filter((d) => d.box.w > 8).slice(0, maxFaces);
  // eyes & smile: enlarge each face and ask the face model
  const out = [];
  const breathe = () => new Promise((r) => setTimeout(r, 0));   // let the page repaint / take clicks between faces
  for (const d of dets) {
    await breathe();
    const f = { box: d.box, score: d.score, l: null, r: null, smile: 0, down: null, pitch: null, yaw: null };
    if (d.box.w >= minEyePx) {
      const side = Math.max(d.box.w, d.box.h) * 1.9, cx = d.box.x + d.box.w / 2, cy = d.box.y + d.box.h / 2;
      const c = new OffscreenCanvas(256, 256);
      c.getContext('2d').drawImage(source, cx - side / 2, cy - side / 2, side, side, 0, 0, 256, 256);
      try {
        const res = await analyzeFaces(c);
        const best = res.sort((a, b) => Math.hypot(a.box.x + a.box.w / 2 - 128, a.box.y + a.box.h / 2 - 128) - Math.hypot(b.box.x + b.box.w / 2 - 128, b.box.y + b.box.h / 2 - 128))[0];
        if (best && Math.hypot(best.box.x + best.box.w / 2 - 128, best.box.y + best.box.h / 2 - 128) < 60) { f.l = best.l; f.r = best.r; f.smile = best.smile || 0; f.down = best.down; f.pitch = best.pitch; f.yaw = best.yaw; }
      } catch { /* leave eyes unknown */ }
    }
    out.push(f);
  }
  return out.sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
}
