// Off-main-thread RAW auto-brighten and RGB→ImageBitmap for io.js (same functions, so identical output).
import { autoBrighten, rgbToRGBA } from './brighten.js';
self.onmessage = async (e) => {
  const { id, op, data, w, h } = e.data;
  try {
    if (op === 'brighten') { const ev = autoBrighten(data, w, h); self.postMessage({ id, data, ev }, [data.buffer]); }
    else { const bitmap = await createImageBitmap(new ImageData(rgbToRGBA(data, w, h), w, h)); self.postMessage({ id, bitmap }, [bitmap]); }
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};
self.postMessage({ ready: true });
