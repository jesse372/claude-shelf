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
let INV16 = null, BIN16 = null;
/** In place: clean 16-bit LibRaw output → exactly what auto-brighten would have produced. Returns the lift in stops.
 * (Each 16-bit value's histogram bin is precomputed: 4.8x faster on a 24 MP frame, bit-identical output.) */
export function autoBrighten(data, w, h) {
  if (!INV16) { INV16 = new Float32Array(65536); for (let v = 0; v < 65536; v++) INV16[v] = gInv(v / 65536); }
  if (!BIN16) { BIN16 = new Uint16Array(65536); for (let v = 0; v < 65536; v++) BIN16[v] = Math.min(0x1fff, (INV16[v] * 65536) >> 3); }
  const h0 = new Uint32Array(0x2000), h1 = new Uint32Array(0x2000), h2 = new Uint32Array(0x2000), B = BIN16, n = data.length;
  for (let i = 0; i < n; i += 3) { h0[B[data[i]]]++; h1[B[data[i + 1]]]++; h2[B[data[i + 2]]]++; }
  const perc = w * h * 0.01;
  let white = 0;
  for (const hist of [h0, h1, h2]) {
    let val = 0x2000, total = 0;
    while (--val > 32) if ((total += hist[val]) > perc) break;
    if (white < val) white = val;
  }
  const k = 0x2000 / Math.max(white, 1);
  const lut = new Uint16Array(65536);
  for (let v = 0; v < 65536; v++) lut[v] = Math.min(65535, Math.round(65536 * gFwd(INV16[v] * k)));
  for (let i = 0; i < n; i++) data[i] = lut[data[i]];
  return Math.log2(k);
}

/** 3-channel RGB (8- or 16-bit) → RGBA ImageData buffer. */
export function rgbToRGBA(data, w, h) {
  const d = new Uint8ClampedArray(w * h * 4), sh = data.BYTES_PER_ELEMENT === 2 ? 8 : 0;
  for (let i = 0, j = 0, k = 0; i < w * h; i++, j += 3, k += 4) {
    d[k] = data[j] >> sh; d[k + 1] = data[j + 1] >> sh; d[k + 2] = data[j + 2] >> sh; d[k + 3] = 255;
  }
  return d;
}
