// Background worker for importing a shoot: decode the preview, make the thumbnails and run the culling AI off the
// page, so the grid stays smooth while thousands of photos are analysed. The page falls back to doing the same work
// itself if this worker can't start (see analyseFile in app.js).
import { loadPreview } from './io.js';
import { analyzePhoto } from './analyze.js';
import { analyzeFaces, sceneEmbedding } from './detect.js';
import { estimateOffsets } from './clocksync.js';

// MediaPipe's engine prints routine start-up lines ("INFO: Created TensorFlow Lite XNNPACK delegate…") as errors;
// keep those as info so real errors stand out.
const logError = console.error.bind(console);
console.error = (...a) => (typeof a[0] === 'string' && /^INFO:/.test(a[0]) ? console.info(...a) : logError(...a));

async function toBlob(bitmap, maxSide, q) {
  const s = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const c = new OffscreenCanvas(Math.round(bitmap.width * s), Math.round(bitmap.height * s));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: 'image/jpeg', quality: q });
}

// analyzePhoto() carries on without the eye model / scene fingerprint if they fail (eyes "unknown"); in a worker that
// would quietly make culling worse, so check both models load here first — if not, the page does the analysis instead.
let ready = null;
const selfCheck = () => (ready ||= (async () => {
  const c = new OffscreenCanvas(64, 64);
  await analyzeFaces(c);
  if (!(await sceneEmbedding(c))?.length) throw new Error('scene fingerprint unavailable');
})());

self.onmessage = async ({ data: m }) => {
  if (m.flags) { Object.assign(self, m.flags); return; }      // test switches (__sculptCPU …) from the page
  if (m.clock) {                                               // camera clock sync over the whole shoot (js/clocksync.js)
    try { self.postMessage({ id: m.id, ok: true, offsets: estimateOffsets(m.clock).offsets }); }
    catch (e) { self.postMessage({ id: m.id, ok: false, error: String(e?.message || e) }); }
    return;
  }
  try { await selfCheck(); } catch (e) { self.postMessage({ id: m.id, ok: false, fatal: true, error: 'AI models unavailable in the worker: ' + (e?.message || e) }); return; }
  try {
    const { bitmap, meta } = await loadPreview(m.file, 1600);
    const pv = await toBlob(bitmap, 1400, 0.82), th = await toBlob(bitmap, 360, 0.8);
    const w = bitmap.width;
    const raw = await analyzePhoto(bitmap);
    bitmap.close?.();
    self.postMessage({ id: m.id, ok: true, meta: meta || {}, raw, pv, th, w });
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, error: String(e?.message || e) });
  }
};
