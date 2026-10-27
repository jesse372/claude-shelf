// WebGL2 render pipeline (all on the GPU, full resolution):
//
//   base photo (8-bit, or 16-bit half-float for RAW; object removals are baked in)
//     → reshape warp (displacement field)                     [Shape tools]
//     → skin smoothing + even tone (skin mask)                [Retouch]
//     → double-chin shadow fill (chin mask)                   [Shape]
//     → develop: WB, exposure, highlights/shadows, whites/blacks,
//                contrast, clarity, vibrance/saturation        [Colour]
//
// Field convention (backward mapping): output pixel p shows source pixel p + D(p).

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
uniform vec4 uRect;   // sub-rectangle of the source to cover (x,y,w,h in uv)
uniform bool uToFbo;  // textures keep row 0 = top of the image; only the on-screen canvas is bottom-up
void main() {
  vec2 t = vec2(aPos.x * 0.5 + 0.5, uToFbo ? aPos.y * 0.5 + 0.5 : 0.5 - aPos.y * 0.5);
  vUv = uRect.xy + t * uRect.zw;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FS_MAIN = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uImg, uDisp, uBS, uBM, uBL, uChinMask, uSkinMask, uBG, uBX;
uniform float uSharpen;   // capture sharpening for RAW files (like Lightroom's default), luminance only
uniform vec2 uSize;
uniform float uSplit, uChin, uSkin, uEven;
uniform bool uDev;
uniform vec3 uWB;          // white-balance gains (linear)
uniform float uExp, uContrast, uHi, uSh, uWhites, uBlacks, uClarity, uVib, uSat;
uniform highp sampler3D uLut;
uniform bool uLutOn;
uniform float uGrain;
uniform float uVignette;
uniform float uKnee;       // highlight shoulder start (gamma); learned profiles use a lower knee = more headroom
const float LUT_N = 33.0;
const vec3 LW = vec3(0.2126, 0.7152, 0.0722);

vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toGam(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

// White balance + exposure + local highlights/shadows in linear light.
vec3 tone(vec3 g, float baseL) {
  vec3 l = toLin(g) * uWB * exp2(uExp);
  float b = max(baseL, 1e-4);
  // local adaptation: lift shadows / pull highlights based on the surrounding brightness
  float sh = uSh * 1.6 * (1.0 - smoothstep(0.0, 0.22, b));
  float hi = uHi * 1.4 * smoothstep(0.12, 0.85, b);
  l *= exp2(sh + hi);
  // levels (whites / blacks)
  float wp = 1.0 - uWhites * 0.35, bp = -uBlacks * 0.02;
  l = (l - bp) / max(wp - bp, 1e-3);
  return l;
}
vec3 finish(vec3 l) {
  vec3 g = toGam(l);
  // soft shoulder instead of hard clipping
  vec3 over = max(g - uKnee, 0.0);
  g = min(g, uKnee) + (1.0 - uKnee) * (1.0 - exp(-over / (1.0 - uKnee)));
  return g;
}

void main() {
  if (uSplit >= 0.0 && vUv.x > uSplit) {                 // before/after compare
    outColor = vec4(texture(uImg, vUv).rgb, 1.0);
    if (abs(vUv.x - uSplit) * uSize.x < 1.5) outColor = vec4(1.0);
    return;
  }
  vec2 d = texture(uDisp, vUv).rg;
  vec2 src = clamp(vUv + d / uSize, vec2(0.0), vec2(1.0));
  vec3 c = texture(uImg, src).rgb;

  // ---- skin retouch: drop the blemish/uneven-texture band, keep pores
  if (uSkin > 0.0 || uEven > 0.0) {
    float m = texture(uSkinMask, src).r;
    if (m > 0.002) {
      vec3 bs = texture(uBS, src).rgb, bm = texture(uBM, src).rgb, bl = texture(uBL, src).rgb;
      c -= m * uSkin * (bs - bm);
      vec3 dl = bm - bl;                                  // blotchy colour (redness) only
      c -= m * uEven * (dl - dot(dl, LW));
    }
  }
  // ---- double chin: lift the broad fold shadow under the jaw (brightness only: keeps skin texture & colour,
  //      never darkens, capped so it can't go flat or glowy)
  if (uChin > 0.0) {
    float m = texture(uChinMask, src).r * uChin;
    if (m > 0.002) {
      float lm = max(dot(texture(uBM, src).rgb, LW), 0.02), ll = dot(texture(uBL, src).rgb, LW);
      float gain = clamp(ll / lm, 1.0, 1.3);
      c *= mix(1.0, gain, m * 0.85);
    }
  }
  c = clamp(c, 0.0, 1.0);

  // ---- develop
  if (uDev) {
    vec3 bg = texture(uBG, src).rgb;
    float baseL = dot(toLin(bg) * uWB * exp2(uExp), LW);
    vec3 g = finish(tone(c, baseL));
    // capture sharpening (RAW): the detail a RAW converter restores, on brightness only, gentler on skin
    if (uSharpen > 0.0) {
      vec3 gx = finish(tone(texture(uBX, src).rgb, baseL));
      float sk = texture(uSkinMask, src).r;
      g += vec3(uSharpen * (1.0 - 0.5 * sk) * dot(g - gx, LW));
    }
    // clarity: local contrast against the surrounding tone, strongest in the midtones
    vec3 gb = finish(tone(bg, baseL));
    float y = dot(g, LW);
    g += uClarity * 0.7 * (g - gb) * (1.0 - abs(2.0 * y - 1.0));
    // contrast S-curve around mid grey
    vec3 s = g * g * (3.0 - 2.0 * g);
    g = uContrast >= 0.0 ? mix(g, s, uContrast) : mix(g, vec3(0.5) + (g - 0.5) * 0.6, -uContrast);
    // vibrance (protects already-saturated colours) + saturation
    y = dot(g, LW);
    float sat = max(g.r, max(g.g, g.b)) - min(g.r, min(g.g, g.b));
    // skin-tone protection: orange hues (r > g > b) get much less vibrance boost
    float skinish = smoothstep(0.02, 0.12, g.r - g.g) * smoothstep(0.0, 0.08, g.g - g.b);
    g = mix(vec3(y), g, 1.0 + uVib * (1.0 - sat) * 0.9 * (1.0 - 0.7 * skinish * step(0.0, uVib)));
    g = mix(vec3(y), g, 1.0 + uSat);
    g = clamp(g, 0.0, 1.0);
    c = clamp(g, 0.0, 1.0);
  }
  // ---- My style: learned colour grade (3D LUT)
  if (uLutOn) c = texture(uLut, c * ((LUT_N - 1.0) / LUT_N) + 0.5 / LUT_N).rgb;
  // ---- vignette (profiles): darken the edges smoothly, aspect-aware
  if (uVignette > 0.0) {
    vec2 q = (vUv - 0.5) * vec2(uSize.x / max(uSize.x, uSize.y), uSize.y / max(uSize.x, uSize.y)) * 2.0;
    float r2 = dot(q, q);
    c *= 1.0 - uVignette * smoothstep(0.25, 1.4, r2);
  }
  // ---- film grain (luminance, strongest in the midtones; per output pixel so exports match)
  if (uGrain > 0.0) {
    vec2 q = floor(gl_FragCoord.xy);
    float n = fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453) + fract(sin(dot(q + 17.0, vec2(39.346, 11.135))) * 24634.6345) - 1.0;
    float yy = dot(c, LW);
    c = clamp(c + n * uGrain * 0.045 * (0.3 + 2.8 * yy * (1.0 - yy)), 0.0, 1.0);
  }
  outColor = vec4(c, 1.0);
}`;

// 2x2 box downsample (one bilinear tap at the shared corner)
const FS_DOWN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc;
void main() { o = texture(uSrc, vUv); }`;

// separable Gaussian
const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc;
uniform vec2 uDir;      // texel step in uv
uniform float uSigma;   // in texels
void main() {
  float r = ceil(uSigma * 3.0);
  vec4 acc = vec4(0.0); float wsum = 0.0;
  for (float i = -48.0; i <= 48.0; i += 1.0) {
    if (abs(i) > r) continue;
    float w = exp(-0.5 * i * i / (uSigma * uSigma));
    acc += texture(uSrc, vUv + uDir * i) * w; wsum += w;
  }
  o = acc / wsum;
}`;

function halfLUT() {
  // u16 (0..65535) → IEEE half bits for v/65535
  const lut = new Uint16Array(65536), f = new Float32Array(1), i = new Uint32Array(f.buffer);
  for (let v = 0; v < 65536; v++) {
    f[0] = v / 65535;
    const x = i[0], e = ((x >> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
    if (f[0] === 0) lut[v] = 0;
    else if (e <= 0) lut[v] = (m | 0x800000) >> (14 - e);   // subnormal
    else lut[v] = (e << 10) | (m >> 13);
  }
  return lut;
}
let LUT = null;

export const DEFAULT_DEV = { temp: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, clarity: 0, vibrance: 0, saturation: 0 };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('This browser does not support WebGL2. Please use a recent Chrome, Safari or Edge.');
    this.gl = gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.floatRT = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    this.main = this._program(FS_MAIN, ['uImg', 'uDisp', 'uBS', 'uBM', 'uBL', 'uChinMask', 'uSkinMask', 'uBG',
      'uSize', 'uSplit', 'uChin', 'uSkin', 'uEven', 'uDev', 'uBX', 'uSharpen', 'uWB', 'uExp', 'uContrast', 'uHi', 'uSh', 'uWhites', 'uBlacks', 'uClarity', 'uVib', 'uSat', 'uRect', 'uLut', 'uLutOn', 'uToFbo', 'uGrain', 'uVignette', 'uKnee']);
    this.down = this._program(FS_DOWN, ['uSrc', 'uRect', 'uToFbo']);
    this.blur = this._program(FS_BLUR, ['uSrc', 'uDir', 'uSigma', 'uRect', 'uToFbo']);
    const buf = this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.fbo = gl.createFramebuffer();
    // texture slots used by the main program
    this.slots = ['uImg', 'uDisp', 'uBS', 'uBM', 'uBL', 'uChinMask', 'uSkinMask', 'uBG', 'uBX'];
    this.tex = {};
    for (const s of this.slots) this.tex[s] = null;
    this._one = { r8: this._tex(1, 1, gl.R8, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1)),
      rg: this._tex(1, 1, gl.RG16F, gl.RG, gl.FLOAT, new Float32Array(2)) };
    this.tex.uDisp = this._one.rg; this.tex.uChinMask = this._one.r8; this.tex.uSkinMask = this._one.r8;
    this.params = { chin: 0, skin: 0, even: 0, dev: { ...DEFAULT_DEV } };
    this.lut = null;
    this.split = -1;
  }

  _program(fs, names) {
    const gl = this.gl, prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    }
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(prog));
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(prog, n);
    return { prog, u };
  }

  _tex(w, h, ifmt, fmt, type, data) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
    this._params();
    return t;
  }
  _params() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  _free(t) { if (t && t !== this._one.r8 && t !== this._one.rg) this.gl.deleteTexture(t); }
  _rtFormat() { return this.floatRT ? [this.gl.RGBA16F, this.gl.RGBA, this.gl.HALF_FLOAT] : [this.gl.RGBA8, this.gl.RGBA, this.gl.UNSIGNED_BYTE]; }
  _rt(w, h) { const [i, f, t] = this._rtFormat(); return { tex: this._tex(w, h, i, f, t, null), w, h }; }

  _drawTo(target, prog, setup, rect = [0, 0, 1, 1]) {
    const gl = this.gl;
    gl.useProgram(prog.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.tex, 0);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
    }
    gl.uniform4f(prog.u.uRect, ...rect);
    gl.uniform1i(prog.u.uToFbo, target ? 1 : 0);
    setup();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (target) gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ------------------------------------------------------------------ image
  /** img: {bitmap} or {rgb16, w, h} */
  setImage(img) {
    const gl = this.gl;
    const w = img.w ?? img.bitmap.width, h = img.h ?? img.bitmap.height;
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    this._free(this.tex.uImg);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (img.rgb16 && this.floatRT) {
      this.hdr = true;
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, w, h);
      LUT = LUT || halfLUT();
      const rows = Math.max(1, Math.floor(4e6 / w)), buf = new Uint16Array(rows * w * 4);
      for (let y = 0; y < h; y += rows) {
        const n = Math.min(rows, h - y);
        for (let i = 0, src = y * w * 3, dst = 0; i < n * w; i++, src += 3, dst += 4) {
          buf[dst] = LUT[img.rgb16[src]]; buf[dst + 1] = LUT[img.rgb16[src + 1]]; buf[dst + 2] = LUT[img.rgb16[src + 2]]; buf[dst + 3] = 0x3c00;
        }
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y, w, n, gl.RGBA, gl.HALF_FLOAT, buf.subarray(0, n * w * 4));
      }
    } else if (img.rgb16) {
      this.hdr = false;
      const d = new Uint8Array(w * h * 4);
      for (let i = 0, s = 0; i < w * h; i++, s += 3) { d[i * 4] = img.rgb16[s] >> 8; d[i * 4 + 1] = img.rgb16[s + 1] >> 8; d[i * 4 + 2] = img.rgb16[s + 2] >> 8; d[i * 4 + 3] = 255; }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    } else {
      this.hdr = false;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img.bitmap);
    }
    this._params();
    this.tex.uImg = t;
    this.setField(1, 1, new Float32Array(2));
    this.setMask('uChinMask', 1, 1, new Uint8Array(1));
    this.setMask('uSkinMask', 1, 1, new Uint8Array(1));
  }

  /** interleaved Float32Array (dx,dy) in image-pixel units */
  setField(fw, fh, data) {
    const gl = this.gl;
    if (!this.tex.uDisp || this.tex.uDisp === this._one.rg || this._fieldSize !== fw + 'x' + fh) {
      this._free(this.tex.uDisp);
      this.tex.uDisp = this._tex(fw, fh, gl.RG16F, gl.RG, gl.FLOAT, data);
      this._fieldSize = fw + 'x' + fh;
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.tex.uDisp);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, fw, fh, gl.RG, gl.FLOAT, data);
    }
  }
  setMask(slot, w, h, data) {
    this._free(this.tex[slot]);
    this.tex[slot] = this._tex(w, h, this.gl.R8, this.gl.RED, this.gl.UNSIGNED_BYTE, data);
  }

  // ------------------------------------------------------------------ style LUT
  _lut1() {
    if (!this._lutDummy) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, t);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      this._lutDummy = t;
    }
    return this._lutDummy;
  }
  /** data: RGBA8 N³ (r fastest) or null to turn the style off */
  setLut(data, N = 33) {
    const gl = this.gl;
    if (!data) { this.lut = null; return; }
    if (!this.lut) this.lut = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this.lut);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, N, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, k, v);
  }

  // ------------------------------------------------------------------ blurs
  /** Gaussian blur of the base photo with sigma in image pixels → {tex,w,h} */
  _blurBase(sigma, maxTexels = 6) {
    let src = { tex: this.tex.uImg, w: this.w, h: this.h }, made = [];
    // halve resolution until sigma is ≤ ~6 texels (each halving is an exact 2x2 box)
    let s = sigma;
    while (s > maxTexels && src.w > 8 && src.h > 8) {
      const dst = this._rt(Math.ceil(src.w / 2), Math.ceil(src.h / 2));
      const from = src;
      this._drawTo(dst, this.down, () => this._bindTex(this.down.u.uSrc, 0, from.tex));
      made.push(dst); src = dst; s /= 2;
    }
    s = Math.max(0.5, s);
    const a = this._rt(src.w, src.h), b = this._rt(src.w, src.h);
    const run = (from, to, dx, dy) => this._drawTo(to, this.blur, () => {
      this._bindTex(this.blur.u.uSrc, 0, from.tex);
      this.gl.uniform2f(this.blur.u.uDir, dx / src.w, dy / src.h);
      this.gl.uniform1f(this.blur.u.uSigma, Math.min(s, 16));
    });
    run(src, a, 1, 0); run(a, b, 0, 1);
    this.gl.deleteTexture(a.tex);
    for (const m of made) this.gl.deleteTexture(m.tex);
    return b;
  }

  /** (Re)build the blur pyramid. faceH: typical face height in px (for skin scales). */
  buildBlurs(faceH) {
    for (const k of ['uBS', 'uBM', 'uBL', 'uBG', 'uBX']) { this._free(this.tex[k]); this.tex[k] = null; }
    const longSide = Math.max(this.w, this.h);
    const fh = faceH || longSide * 0.2;
    this.tex.uBS = this._blurBase(Math.max(0.7, 0.0035 * fh)).tex;
    this.tex.uBM = this._blurBase(Math.max(1.5, 0.024 * fh)).tex;
    this.tex.uBL = this._blurBase(Math.max(3, 0.07 * fh)).tex;
    this.tex.uBG = this._blurBase(Math.max(3, 0.012 * longSide)).tex;
    // capture-sharpening base: ~0.06% of the long side (≈3.4 px on a 24 MP RAW), built at reduced size to save memory
    this.tex.uBX = this._blurBase(Math.max(0.8, 0.00057 * longSide), 2).tex;
  }

  _bindTex(loc, unit, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc, unit);
  }

  // ------------------------------------------------------------------ region IO (object removal)
  /** Read a rectangle of the *base* photo as RGBA8 (for the inpainting model). */
  readBase(x, y, w, h) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex.uImg, 0);
    let out;
    if (this.hdr) {
      const f = new Float32Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.FLOAT, f);
      out = { f32: f };
    } else {
      const u = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, u);
      out = { u8: u };
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }
  /** Write a rectangle back into the base photo ({u8} or {f32} as returned by readBase). */
  writeBase(x, y, w, h, px) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex.uImg);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (this.hdr) {
      const f = px.f32 || Float32Array.from(px.u8, (v) => v / 255);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.FLOAT, f);
    } else {
      const u = px.u8 || Uint8Array.from(px.f32, (v) => Math.max(0, Math.min(255, Math.round(v * 255))));
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, u);
    }
  }

  /** Small RGBA8 copy of the base photo (for skin colour sampling / auto tone). */
  thumbnail(maxSide = 1024) {
    let src = { tex: this.tex.uImg, w: this.w, h: this.h }, made = [];
    while (Math.max(src.w, src.h) > maxSide * 1.5) {
      const dst = this._rt(Math.ceil(src.w / 2), Math.ceil(src.h / 2)), from = src;
      this._drawTo(dst, this.down, () => this._bindTex(this.down.u.uSrc, 0, from.tex));
      made.push(dst); src = dst;
    }
    const gl = this.gl, w = src.w, h = src.h;
    const t8 = { tex: this._tex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null), w, h }, from = src;
    this._drawTo(t8, this.down, () => this._bindTex(this.down.u.uSrc, 0, from.tex));
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t8.tex, 0);
    const data = new Uint8ClampedArray(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(t8.tex);
    for (const m of made) gl.deleteTexture(m.tex);
    return { data, w, h };
  }

  // ------------------------------------------------------------------ draw
  draw({ split = this.split, plain = false } = {}) {
    if (!this.tex.uImg) return;
    const gl = this.gl, p = this.params, d = p.dev, u = this.main.u;
    this._drawTo(null, this.main, () => {
      this.slots.forEach((s, i) => this._bindTex(u[s], i, this.tex[s] || this.tex.uImg));
      gl.uniform2f(u.uSize, this.w, this.h);
      gl.uniform1f(u.uSplit, split);
      gl.uniform1f(u.uChin, plain ? 0 : p.chin);
      gl.uniform1f(u.uSkin, plain ? 0 : p.skin);
      gl.uniform1f(u.uEven, plain ? 0 : p.even);
      const devOn = !plain && (Object.keys(DEFAULT_DEV).some((k) => d[k]) || !!this.lut || this.sharpen > 0);
      gl.uniform1i(u.uDev, devOn ? 1 : 0);
      gl.activeTexture(gl.TEXTURE9);
      gl.bindTexture(gl.TEXTURE_3D, this.lut || this._lut1());
      gl.uniform1i(u.uLut, 9);
      gl.uniform1i(u.uLutOn, !plain && this.lut ? 1 : 0);
      gl.uniform1f(u.uGrain, plain ? 0 : this.grain || 0);
      gl.uniform1f(u.uVignette, plain ? 0 : this.vignette || 0);
      gl.uniform1f(u.uKnee, plain ? 0.88 : this.knee || 0.88);
      gl.uniform1f(u.uSharpen, plain || !this.tex.uBX ? 0 : this.sharpen || 0);
      // temperature/tint → RGB gains, normalised to keep brightness
      const t = d.temp / 100, ti = d.tint / 100;
      let r = Math.exp(0.32 * t), g = Math.exp(-0.22 * ti), b = Math.exp(-0.32 * t);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      gl.uniform3f(u.uWB, r / lum, g / lum, b / lum);
      gl.uniform1f(u.uExp, d.exposure / 100 * 2.5);
      gl.uniform1f(u.uContrast, d.contrast / 100);
      gl.uniform1f(u.uHi, d.highlights / 100);
      gl.uniform1f(u.uSh, d.shadows / 100);
      gl.uniform1f(u.uWhites, d.whites / 100);
      gl.uniform1f(u.uBlacks, d.blacks / 100);
      gl.uniform1f(u.uClarity, d.clarity / 100);
      gl.uniform1f(u.uVib, d.vibrance / 100);
      gl.uniform1f(u.uSat, d.saturation / 100);
    });
  }

  /** Render the final image (no compare split) and return a Blob. */
  async exportBlob(type = 'image/jpeg', quality = 0.95) {
    this.draw({ split: -1 });
    const blob = await new Promise((res) => this.canvas.toBlob(res, type, quality));
    this.draw();
    if (!blob) throw new Error('Export failed (image too large for this browser?)');
    return blob;
  }
}
