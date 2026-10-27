// On-device AI detection (MediaPipe): 478-point face mesh + 33-point body pose
// with a person segmentation mask. Runs entirely in the browser.
import { FilesetResolver, FaceLandmarker, PoseLandmarker, ImageEmbedder, ImageSegmenter } from '../vendor/vision_bundle.mjs';

const DETECT_MAX = 1600;   // long side of the image the detectors see
let face = null, pose = null, seg = null, initPromise = null, fileset = null;
const SEG_MAX = 1024;   // person/skin segmentation resolution

async function make(Cls, opts) {
  // test / batch machines without a real GPU: the CPU path is much faster than an emulated GPU
  if (self.__sculptCPU) return Cls.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } });
  try {
    return await Cls.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'GPU' } });
  } catch (e) {
    console.warn('GPU delegate unavailable, falling back to CPU', e);
    return await Cls.createFromOptions(fileset, { ...opts, baseOptions: { ...opts.baseOptions, delegate: 'CPU' } });
  }
}

export function initDetectors() {
  if (!initPromise) initPromise = (async () => {
    const base = new URL('../vendor/', import.meta.url).href;
    fileset = await FilesetResolver.forVisionTasks(base + 'wasm');
    face = await make(FaceLandmarker, {
      baseOptions: { modelAssetPath: base + 'models/face_landmarker.task' },
      runningMode: 'IMAGE', numFaces: 8, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      // low thresholds find close-up / three-quarter faces; detections are then kept only if they sit on a person
      minFaceDetectionConfidence: 0.2, minFacePresenceConfidence: 0.25,
    });
    pose = await make(PoseLandmarker, {
      baseOptions: { modelAssetPath: base + 'models/pose_landmarker_full.task' },
      runningMode: 'IMAGE', numPoses: 4, outputSegmentationMasks: false,   // GPU mask readback is unreliable; the segmenter below is better anyway
      minPoseDetectionConfidence: 0.4, minPosePresenceConfidence: 0.4,
    });
    // Multi-class person segmentation: background / hair / body-skin / face-skin / clothes / others.
    // CPU: tiny model, ~0.5s, and its mask always reads back correctly.
    seg = await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: base + 'models/selfie_multiclass_256x256.tflite', delegate: 'CPU' },
      runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false,
    });
  })().catch((e) => { initPromise = null; throw e; });
  return initPromise;
}

export const SEG = { BG: 0, HAIR: 1, BODY_SKIN: 2, FACE_SKIN: 3, CLOTHES: 4, OTHER: 5 };

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/**
 * @param source ImageBitmap/canvas, natural size W x H
 * @returns {{faces: Array<Array<{x,y}>>, poses: Array<{lm: Array<{x,y,v}>, mask: {w,h,s,data:Uint8Array}|null}>}}
 *          all coordinates in source-image pixels.
 */
export async function detect(source, W, H) {
  await initDetectors();
  const s = Math.min(1, DETECT_MAX / Math.max(W, H));
  const dw = Math.round(W * s), dh = Math.round(H * s);
  const small = canvas(dw, dh);
  small.getContext('2d').drawImage(source, 0, 0, dw, dh);

  const faces = [];
  const fr = face.detect(small);
  for (const lms of fr.faceLandmarks || []) faces.push(lms.map((p) => ({ x: p.x * W, y: p.y * H })));

  // person / skin segmentation (one map for everyone in the photo)
  const ss = Math.min(1, SEG_MAX / Math.max(W, H));
  const sw = Math.round(W * ss), sh = Math.round(H * ss), segC = canvas(sw, sh);
  segC.getContext('2d').drawImage(source, 0, 0, sw, sh);
  const sr = seg.segment(segC);
  const cat = Uint8Array.from(sr.categoryMask.getAsUint8Array());
  sr.close?.();
  const segMap = { w: sw, h: sh, s: sw / W, data: cat };
  const person = new Uint8Array(cat.length);
  for (let i = 0; i < cat.length; i++) person[i] = cat[i] ? 255 : 0;
  const personMask = { w: sw, h: sh, s: sw / W, data: person };

  // keep a face only if its centre is on a person (segmenter): low thresholds must not find faces in the bushes
  const onPerson = (lm) => {
    const c = lm[1] || lm[0], x = Math.min(sw - 1, Math.max(0, Math.round(c.x * ss))), y = Math.min(sh - 1, Math.max(0, Math.round(c.y * ss)));
    let n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = Math.min(sw - 1, Math.max(0, x + dx)), yy = Math.min(sh - 1, Math.max(0, y + dy)); n += cat[yy * sw + xx] > 0; }
    return n >= 13;
  };
  for (let k = faces.length - 1; k >= 0; k--) if (!onPerson(faces[k])) faces.splice(k, 1);

  const poses = [];
  pose.detect(small, (res) => {
    for (const lms of res.landmarks || []) {
      poses.push({ lm: lms.map((p) => ({ x: p.x * W, y: p.y * H, v: p.visibility ?? 1 })), mask: personMask });
    }
  });

  // Small faces in full-body shots are often missed by the face detector:
  // zoom into each person's head and try again.
  for (const p of poses) {
    const nose = p.lm[0], le = p.lm[7], re = p.lm[8], ls = p.lm[11], rs = p.lm[12];
    if (nose.v < 0.5) continue;
    const span = Math.max(Math.hypot(le.x - re.x, le.y - re.y) * 3.2, Math.hypot(ls.x - rs.x, ls.y - rs.y) * 1.2);
    if (!(span > 20)) continue;
    const covered = faces.some((f) => Math.hypot(f[1].x - nose.x, f[1].y - nose.y) < span * 0.4);
    if (covered) continue;
    for (const zoom of [1, 1.6]) {                  // tight crop first, then a wider one (close-ups, 3/4 views)
      const sp = span * zoom, half = sp / 2, x0 = nose.x - half, y0 = nose.y - half * 0.9;
      const N = 512, c = canvas(N, N);
      const ks = source.width / W;     // source may be a downscaled copy of the W x H photo
      c.getContext('2d').drawImage(source, x0 * ks, y0 * ks, sp * ks, sp * ks, 0, 0, N, N);
      const r = face.detect(c);
      let best = null, bd = Infinity;
      for (const lms of r.faceLandmarks || []) {
        const d = Math.hypot(lms[1].x - 0.5, lms[1].y - 0.45);
        if (d < bd) { bd = d; best = lms; }
      }
      if (best && bd < 0.3) { faces.push(best.map((q) => ({ x: x0 + q.x * sp, y: y0 + q.y * sp }))); break; }
    }
  }
  // the same face found twice (full frame + zoomed head crop): keep one
  const fw = (lm) => Math.hypot(lm[454].x - lm[234].x, lm[454].y - lm[234].y) || 1;
  for (let i = faces.length - 1; i > 0; i--) {
    if (faces.slice(0, i).some((o) => Math.hypot(o[1].x - faces[i][1].x, o[1].y - faces[i][1].y) < 0.3 * Math.min(fw(o), fw(faces[i])))) faces.splice(i, 1);
  }
  return { faces, poses, seg: segMap };
}

/** Blink scores (0..1, 1 = closed) from a face-landmarker result entry. */
function blink(res, i) {
  const cats = res.faceBlendshapes?.[i]?.categories || [];
  const get = (n) => cats.find((c) => c.categoryName === n)?.score ?? 0;
  // head angle from the face transform (degrees): pitch = nodding down/up, yaw = turned away
  let pitch = null, yaw = null;
  const m = res.facialTransformationMatrixes?.[i]?.data;
  if (m && m.length >= 11) { pitch = Math.atan2(m[6], m[10]) * 180 / Math.PI; yaw = Math.asin(Math.max(-1, Math.min(1, -m[2]))) * 180 / Math.PI; }
  return { l: get('eyeBlinkLeft'), r: get('eyeBlinkRight'), smile: (get('mouthSmileLeft') + get('mouthSmileRight')) / 2,
    down: (get('eyeLookDownLeft') + get('eyeLookDownRight')) / 2, pitch, yaw };
}

/**
 * Lightweight face analysis for culling (no pose): face boxes, eye state, smile.
 * @param source canvas/bitmap (already small, e.g. 1024px)
 */
export async function analyzeFaces(source) {
  await initDetectors();
  const res = face.detect(source);
  const W = source.width, H = source.height;
  return (res.faceLandmarks || []).map((lms, i) => {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const p of lms) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const b = blink(res, i);
    return { box: { x: x0 * W, y: y0 * H, w: (x1 - x0) * W, h: (y1 - y0) * H }, ...b };
  });
}

// ------------------------------------------------------------------ scene fingerprint (for "My style")
let embedderP = null;
function initEmbedder() {
  if (!embedderP) embedderP = (async () => {
    await initDetectors();
    const base = new URL('../vendor/', import.meta.url).href;
    return make(ImageEmbedder, { baseOptions: { modelAssetPath: base + 'models/mobilenet_v3_small.tflite' }, runningMode: 'IMAGE', l2Normalize: true, quantize: false });
  })().catch((e) => { embedderP = null; throw e; });
  return embedderP;
}

/**
 * Grading-blind scene fingerprint: the embedding of a contrast-equalised greyscale copy,
 * so the same scene edited differently gets (nearly) the same fingerprint.
 */
export async function sceneEmbedding(source) {
  const emb = await initEmbedder();
  const N = 224, c = canvas(N, N), g = c.getContext('2d', { willReadFrequently: true });
  const s = Math.max(N / source.width, N / source.height);       // centre-crop to square
  g.drawImage(source, (N - source.width * s) / 2, (N - source.height * s) / 2, source.width * s, source.height * s);
  const id = g.getImageData(0, 0, N, N), d = id.data, hist = new Uint32Array(256), gray = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) { const v = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]); gray[i] = v; hist[v]++; }
  const cdf = new Float32Array(256); let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; cdf[v] = acc / (N * N); }
  for (let i = 0; i < N * N; i++) { const v = Math.round(cdf[gray[i]] * 255); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
  g.putImageData(id, 0, 0);
  const r = emb.embed(c);
  return Float32Array.from(r.embeddings[0].floatEmbedding);
}
