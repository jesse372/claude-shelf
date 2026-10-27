// File import/export: camera RAW (LibRaw), HEIC (libheif / native Safari), TIFF (UTIF),
// JPEG/PNG/WebP (native). Plus fast previews for culling and a tiny EXIF reader/writer
// so exports keep their capture date (Pixieset sorts galleries by date taken).

const VENDOR = new URL('../vendor/', import.meta.url).href;
export const RAW_RE = /\.(cr2|cr3|crw|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|dng|srw|3fr|iiq|erf|kdc|mef|mos|mrw|x3f|rwl|raw)$/i;
export const HEIC_RE = /\.(heic|heif|hif)$/i;
export const TIFF_RE = /\.(tiff?)$/i;

export function fileKind(f) {
  if (RAW_RE.test(f.name)) return 'raw';
  if (HEIC_RE.test(f.name) || /hei[cf]/i.test(f.type)) return 'heic';
  if (TIFF_RE.test(f.name) || /tiff/i.test(f.type)) return 'tiff';
  if (f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|bmp)$/i.test(f.name)) return 'image';
  return null;
}

// ------------------------------------------------------------------ LibRaw
// Auto-brighten, done here instead of inside LibRaw, so we know HOW MUCH it lifted each photo. LibRaw rescales every RAW
// so its brightest 1% clips; that hides the camera's real exposure, and a trained style needs it (measured: the
// brightness Jesse adds tracks his Lightroom Exposure at r = 0.71-0.88 once the lift is known, ~0 when it is hidden).
// We decode clean (noAutoBright), apply LibRaw's exact rule (dcraw write_ppm_tiff + gamma_curve), and keep the lift
// as meta.autoBrightEv. The image the app works on is unchanged.
const GAMMA = (() => {                       // LibRaw default output curve: gamm = (0.45, 4.5), BT.709
  const g = [0.45, 4.5, 0, 0, 0, 0], bnd = [0, 0];
  bnd[g[1] >= 1 ? 1 : 0] = 1;
  if (g[1] && (g[1] - 1) * (g[0] - 1) <= 0) {
    for (let i = 0; i < 48; i++) { g[2] = (bnd[0] + bnd[1]) / 2; bnd[((g[2] / g[1]) ** -g[0] - 1) / g[0] - 1 / g[2] > -1 ? 1 : 0] = g[2]; }
    g[3] = g[2] / g[1]; g[4] = g[2] * (1 / g[0] - 1);
  }
  return g;
})();
const gFwd = (r) => (r >= 1 ? 1 : r < GAMMA[3] ? r * GAMMA[1] : r ** GAMMA[0] * (1 + GAMMA[4]) - GAMMA[4]);
const gInv = (o) => (o < GAMMA[2] ? o / GAMMA[1] : ((o + GAMMA[4]) / (1 + GAMMA[4])) ** (1 / GAMMA[0]));
let INV16 = null;
/** In place: clean 16-bit LibRaw output → exactly what auto-brighten would have produced. Returns the lift in stops. */
export function autoBrighten(data, w, h) {
  if (!INV16) { INV16 = new Float32Array(65536); for (let v = 0; v < 65536; v++) INV16[v] = gInv(v / 65536); }
  const hist = [new Uint32Array(0x2000), new Uint32Array(0x2000), new Uint32Array(0x2000)];
  for (let i = 0; i < data.length; i += 3)
    for (let c = 0; c < 3; c++) hist[c][Math.min(0x1fff, (INV16[data[i + c]] * 65536) >> 3)]++;
  const perc = w * h * 0.01;
  let white = 0;
  for (let c = 0; c < 3; c++) {
    let val = 0x2000, total = 0;
    while (--val > 32) if ((total += hist[c][val]) > perc) break;
    if (white < val) white = val;
  }
  const k = 0x2000 / Math.max(white, 1);
  const lut = new Uint16Array(65536);
  for (let v = 0; v < 65536; v++) lut[v] = Math.min(65535, Math.round(65536 * gFwd(INV16[v] * k)));
  for (let i = 0; i < data.length; i++) data[i] = lut[data[i]];
  return Math.log2(k);
}
let LibRawCls = null;
async function libraw() {
  if (!LibRawCls) LibRawCls = (await import(VENDOR + 'libraw/index.js')).default;
  return new LibRawCls();
}
// One long-lived worker for previews (cheap: no demosaic).
let previewRaw = null, previewQueue = Promise.resolve();
function withPreviewRaw(fn) {
  const run = previewQueue.then(async () => {
    if (!previewRaw) previewRaw = await libraw();
    try { return await fn(previewRaw); }
    catch (e) { try { previewRaw.dispose(); } catch {} previewRaw = null; throw e; }
  });
  previewQueue = run.catch(() => {});
  return run;
}

function rawMeta(m) {
  if (!m) return {};
  const t = m.timestamp instanceof Date ? m.timestamp : (m.timestamp ? new Date(m.timestamp) : null);
  return {
    time: t && !isNaN(t) && t.getFullYear() > 1990 ? t : null,
    make: m.camera_make || '', model: m.camera_model || '', artist: m.artist || '',
    iso: m.iso_speed, shutter: m.shutter, aperture: m.aperture, focal: m.focal_len, flip: m.flip,
  };
}

/** LibRaw flip → rotate an ImageBitmap/canvas (embedded previews are stored unrotated). */
async function applyFlip(src, flip) {
  if (!flip) return src;
  const w = src.width, h = src.height, swap = flip === 5 || flip === 6;
  const c = new OffscreenCanvas(swap ? h : w, swap ? w : h);
  const g = c.getContext('2d');
  if (flip === 3) { g.translate(w, h); g.rotate(Math.PI); }
  else if (flip === 6) { g.translate(h, 0); g.rotate(Math.PI / 2); }
  else if (flip === 5) { g.translate(0, w); g.rotate(-Math.PI / 2); }
  g.drawImage(src, 0, 0);
  return createImageBitmap(c);
}

// ------------------------------------------------------------------ helpers
async function loadScript(src) {
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}
async function resizeBitmap(bmp, maxSide) {
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  if (s >= 1) return bmp;
  const out = await createImageBitmap(bmp, {
    resizeWidth: Math.max(1, Math.round(bmp.width * s)), resizeHeight: Math.max(1, Math.round(bmp.height * s)), resizeQuality: 'high',
  });
  bmp.close?.();
  return out;
}

async function decodeHeic(file) {
  try { return { bitmap: await createImageBitmap(file, { imageOrientation: 'from-image' }) }; } catch { /* not Safari */ }
  const mod = await import(VENDOR + 'libheif-bundle.mjs');
  const lh = mod.default?.HeifDecoder ? mod.default : (mod.default ? await mod.default() : mod);
  const dec = new lh.HeifDecoder();
  const imgs = dec.decode(new Uint8Array(await file.arrayBuffer()));
  if (!imgs || !imgs.length) throw new Error('Could not read this HEIC file');
  const im = imgs[0], w = im.get_width(), h = im.get_height();
  const id = new ImageData(w, h);
  await new Promise((res, rej) => im.display(id, (d) => (d ? res() : rej(new Error('HEIC decode failed')))));
  imgs.forEach((i) => i.free?.());
  return { bitmap: await createImageBitmap(id) };
}

async function decodeTiff(file) {
  if (!self.UTIF) { await loadScript(VENDOR + 'pako.min.js'); await loadScript(VENDOR + 'UTIF.js'); }
  const buf = await file.arrayBuffer();
  const ifds = self.UTIF.decode(buf);
  const page = ifds.filter((i) => i.width && i.height).sort((a, b) => b.width * b.height - a.width * a.height)[0] || ifds[0];
  self.UTIF.decodeImage(buf, page, ifds);
  const rgba = self.UTIF.toRGBA8(page);
  return { bitmap: await createImageBitmap(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), page.width, page.height)) };
}

// ------------------------------------------------------------------ EXIF (read)
function readExif(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return {};
  let p = 2;
  while (p + 4 < v.byteLength) {
    const marker = v.getUint16(p), len = v.getUint16(p + 2);
    if (marker === 0xffe1 && v.getUint32(p + 4) === 0x45786966) return parseTiff(v, p + 10);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    p += 2 + len;
  }
  return {};
}
function parseTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o) => v.getUint16(t + o, le), u32 = (o) => v.getUint32(t + o, le);
  const out = {};
  const str = (e) => {
    const n = u32(e + 4), off = n <= 4 ? e + 8 : u32(e + 8);
    let s = ''; for (let i = 0; i < n - 1 && t + off + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(t + off + i));
    return s.trim();
  };
  const walk = (ifd, cb) => { const n = u16(ifd); for (let i = 0; i < n; i++) cb(ifd + 2 + i * 12); };
  try {
    let exifPtr = 0;
    walk(u32(4), (e) => {
      const tag = u16(e);
      if (tag === 0x010f) out.make = str(e);
      else if (tag === 0x0110) out.model = str(e);
      else if (tag === 0x013b) out.artist = str(e);
      else if (tag === 0x0112) out.orientation = u16(e + 8);
      else if (tag === 0x8769) exifPtr = u32(e + 8);
    });
    if (exifPtr) walk(exifPtr, (e) => { const g = u16(e); if (g === 0x9003) out.dateStr = str(e); else if (g === 0xa431) out.serial = str(e); });
  } catch { /* truncated EXIF — ignore */ }
  if (out.dateStr) {
    const m = out.dateStr.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
    if (m) out.time = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  }
  return out;
}

// ------------------------------------------------------------------ EXIF (write)
const pad2 = (n) => String(n).padStart(2, '0');
const exifDate = (d) => `${d.getFullYear()}:${pad2(d.getMonth() + 1)}:${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

/** Insert a minimal EXIF block (camera, capture date, orientation=1) into a JPEG blob. */
export async function addExif(jpegBlob, meta = {}) {
  const ifd0 = [], exif = [];
  const asc = (tag, s) => ({ tag, type: 2, data: new TextEncoder().encode(s + '\0') });
  if (meta.make) ifd0.push(asc(0x010f, meta.make));
  if (meta.model) ifd0.push(asc(0x0110, meta.model));
  ifd0.push({ tag: 0x0112, type: 3, value: 1 });
  ifd0.push(asc(0x0131, 'Jesse Chance Studio'));
  if (meta.time) { exif.push(asc(0x9003, exifDate(meta.time))); exif.push(asc(0x9004, exifDate(meta.time))); }
  if (exif.length) ifd0.push({ tag: 0x8769, type: 4, value: 0 }); // patched below
  ifd0.sort((a, b) => a.tag - b.tag);

  const size = (ents) => 2 + ents.length * 12 + 4 + ents.reduce((s, e) => s + (e.data && e.data.length > 4 ? e.data.length + (e.data.length & 1) : 0), 0);
  const ifd0Off = 8, exifOff = ifd0Off + size(ifd0);
  const total = exifOff + (exif.length ? size(exif) : 0);
  const buf = new Uint8Array(total), dv = new DataView(buf.buffer);
  buf.set([0x49, 0x49, 0x2a, 0x00]); dv.setUint32(4, ifd0Off, true);
  const writeIfd = (ents, off) => {
    dv.setUint16(off, ents.length, true);
    let data = off + 2 + ents.length * 12 + 4;
    ents.forEach((e, i) => {
      const p = off + 2 + i * 12;
      dv.setUint16(p, e.tag, true); dv.setUint16(p + 2, e.type, true);
      if (e.data) {
        dv.setUint32(p + 4, e.data.length, true);
        if (e.data.length <= 4) buf.set(e.data, p + 8);
        else { dv.setUint32(p + 8, data, true); buf.set(e.data, data); data += e.data.length + (e.data.length & 1); }
      } else {
        dv.setUint32(p + 4, 1, true);
        if (e.type === 3) dv.setUint16(p + 8, e.value, true);
        else dv.setUint32(p + 8, e.tag === 0x8769 ? exifOff : e.value, true);
      }
    });
    dv.setUint32(off + 2 + ents.length * 12, 0, true);
  };
  writeIfd(ifd0, ifd0Off);
  if (exif.length) writeIfd(exif, exifOff);

  const app1 = new Uint8Array(2 + 2 + 6 + total);
  app1.set([0xff, 0xe1, ((app1.length - 2) >> 8) & 0xff, (app1.length - 2) & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0]);
  app1.set(buf, 10);
  const jpg = new Uint8Array(await jpegBlob.arrayBuffer());
  return new Blob([jpg.subarray(0, 2), app1, jpg.subarray(2)], { type: 'image/jpeg' });
}

// ------------------------------------------------------------------ public: preview + full decode
/** Fast preview for culling: embedded JPEG for RAW, downscaled decode otherwise. */
export async function loadPreview(file, maxSide = 1600) {
  const kind = fileKind(file);
  if (kind === 'raw') {
    return withPreviewRaw(async (lr) => {
      await lr.open(new Uint8Array(await file.arrayBuffer()), {});
      const meta = rawMeta(await lr.metadata());
      let bmp = null;
      try {
        const th = await lr.thumbnailData();
        if (th && th.format === 'jpeg') bmp = await applyFlip(await createImageBitmap(new Blob([th.data], { type: 'image/jpeg' })), meta.flip);
        else if (th && th.format === 'bitmap') {
          const id = new ImageData(th.width, th.height);
          for (let i = 0, j = 0; i < th.width * th.height; i++, j += 3) { id.data.set([th.data[j], th.data[j + 1], th.data[j + 2], 255], i * 4); }
          bmp = await applyFlip(await createImageBitmap(id), meta.flip);
        }
      } catch { /* no thumbnail */ }
      if (!bmp) {   // fall back to a quick half-size decode
        const tmp = await libraw();
        try {
          await tmp.open(new Uint8Array(await file.arrayBuffer()), { halfSize: true, useCameraWb: true, outputBps: 8 });
          const im = await tmp.imageData();
          bmp = await rgbToBitmap(im.data, im.width, im.height);
        } finally { tmp.dispose(); }
      }
      return { bitmap: await resizeBitmap(bmp, maxSide), meta };
    });
  }
  let meta = {};
  if (kind === 'image' && /jpe?g/i.test(file.type + file.name)) meta = readExif(await file.slice(0, 256 * 1024).arrayBuffer());
  const full = await decodeFull(file, { forPreview: true });
  meta = { ...full.meta, ...meta };
  return { bitmap: await resizeBitmap(full.bitmap, maxSide), meta };
}

async function rgbToBitmap(data, w, h) {
  const id = new ImageData(w, h), d = id.data;
  const sh = data.BYTES_PER_ELEMENT === 2 ? 8 : 0;
  for (let i = 0, j = 0, k = 0; i < w * h; i++, j += 3, k += 4) {
    d[k] = data[j] >> sh; d[k + 1] = data[j + 1] >> sh; d[k + 2] = data[j + 2] >> sh; d[k + 3] = 255;
  }
  return createImageBitmap(id);
}

/**
 * Full-quality decode for editing/export.
 * @returns {{w,h, bitmap?:ImageBitmap, rgb16?:Uint16Array, meta}}
 *   RAW files come back as 16-bit RGB so colour edits have real headroom.
 */
export async function decodeFull(file, { maxSide = 8192, forPreview = false } = {}) {
  const kind = fileKind(file);
  if (kind === 'raw') {
    const lr = await libraw();
    try {
      await lr.open(new Uint8Array(await file.arrayBuffer()), {
        // Fuji X-Trans: quality 2 = 1-pass X-Trans demosaic (~3x faster than 3-pass, visually near-identical)
        useCameraWb: true, outputBps: 16, outputColor: 1, userQual: /\.raf$/i.test(file.name) ? 2 : 3, highlight: 2, halfSize: forPreview, noAutoBright: true,
      });
      const meta = rawMeta(await lr.metadata());
      const im = await lr.imageData();
      if (!im) throw new Error('This RAW file could not be decoded');
      let { width: w, height: h, data } = im;
      if (data.BYTES_PER_ELEMENT !== 2) { const d16 = new Uint16Array(data.length); for (let i = 0; i < data.length; i++) d16[i] = data[i] * 257; data = d16; }
      meta.autoBrightEv = +autoBrighten(data, w, h).toFixed(3);     // same image as LibRaw's auto-brighten, plus how much it lifted
      if (forPreview) return { bitmap: await rgbToBitmap(data, w, h), w, h, meta };
      if (Math.max(w, h) > maxSide) {          // rare: >8K sensors — downscale via 8-bit path
        const bmp = await resizeBitmap(await rgbToBitmap(data, w, h), maxSide);
        return { bitmap: bmp, w: bmp.width, h: bmp.height, meta };
      }
      return { rgb16: data, w, h, meta };
    } finally { lr.dispose(); }
  }
  let r;
  if (kind === 'heic') r = await decodeHeic(file);
  else if (kind === 'tiff') r = await decodeTiff(file);
  else r = { bitmap: await createImageBitmap(file, { imageOrientation: 'from-image' }) };
  const bmp = await resizeBitmap(r.bitmap, maxSide);
  let meta = {};
  if (/jpe?g/i.test(file.type + file.name)) meta = readExif(await file.slice(0, 256 * 1024).arrayBuffer());
  if (!meta.time && file.lastModified) meta.time = null;
  return { bitmap: bmp, w: bmp.width, h: bmp.height, meta };
}
