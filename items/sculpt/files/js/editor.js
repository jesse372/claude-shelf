// Edit mode: viewer, colour / retouch / shape panels, liquify + remove tools, undo, sync.
import { Renderer, DEFAULT_DEV } from './render.js';
import { detect, initDetectors, sceneEmbedding } from './detect.js';
import { measureNeeds, AUTO_SHAPE, AUTO_RETOUCH } from './needs.js';
import { loadStyle, saveStyle, hasStyle, styleSliders, describeStyle, encodeEmb, COLOUR_KEYS } from './style-store.js';
import { photoStats, autoWhiteBalance, simulate, baseLum } from './style.js';
import { PROFILES, profileLut, profileDev, profileGrain, profileVignette, profileById, profileTone, fitAdaptiveTone, learnedTone, profileKnee } from './profiles.js';
import { SLIDERS, makeField, buildUnitFields, combine, buildChinMask, newManual, brushPush, brushRestore, faceFrame, neckSkin, maskWarpToSkin } from './warp.js';
import { buildSkinMask } from './skin.js';
import { removeStroke, initInpaint, isModelReady } from './inpaint.js';
import { decodeFull, loadPreview } from './io.js';
import { analyzeFaces } from './detect.js';
import { $, $$, photos, S, toast, busy, emit, on, isEdited, visiblePhotos, saveJSON, loadJSON, DEFAULT_RET, zeroShape } from './state.js';

// ------------------------------------------------------------------ definitions
const DEV = [
  ['temp', 'Temperature'], ['tint', 'Tint'], ['exposure', 'Exposure'], ['contrast', 'Contrast'],
  ['highlights', 'Highlights'], ['shadows', 'Shadows'], ['whites', 'Whites'], ['blacks', 'Blacks'],
  ['clarity', 'Clarity'], ['vibrance', 'Vibrance'], ['saturation', 'Saturation'],
];
const RET = [['skin', 'Smooth skin', 0, 100], ['even', 'Even skin tone', 0, 100]];
const LOOKS = {
  'Bright & airy': { exposure: 12, contrast: -10, highlights: -30, shadows: 35, whites: 10, blacks: 10, vibrance: 10, saturation: -5, temp: 4 },
  'Warm glow': { temp: 18, tint: 4, contrast: 10, vibrance: 15, highlights: -15, shadows: 10, clarity: -5 },
  'Clean & crisp': { contrast: 20, clarity: 15, vibrance: 12, whites: 10, blacks: -10, highlights: -15 },
  'Moody': { exposure: -10, contrast: 25, highlights: -40, shadows: -10, saturation: -20, temp: -5, blacks: -15, clarity: 10 },
  'Black & white': { saturation: -100, contrast: 25, clarity: 10, whites: 8, blacks: -8 },
};
const SHAPE_PRESETS = {
  natural: { faceSlim: 25, jaw: 20, chin: 45, body: 20, waist: 25, hips: 0, arms: 25, legs: 15 },
  glam: { faceSlim: 55, jaw: 45, chin: 80, body: 45, waist: 55, hips: 15, arms: 55, legs: 40 },
};

// Capture sharpening for RAW files — calibrated so Sculpt's detail matches Jesse's Lightroom/Pixieset exports
// (measured on 28 RAW+final pairs: 0.5 brings fine/mid detail to ~100%, more overshoots his look).
export const RAW_SHARPEN = 0.5;

// ------------------------------------------------------------------ state
export let renderer;
let cur = null;               // { photo, F, fields, auto, out, faceH }
let tool = 'hand';
let view = { s: 1, tx: 0, ty: 0 };
let compare = false, split = 0.5, holdingBefore = false, openToken = 0;
const decodeCache = new Map();   // id -> Promise<img>  (current + prefetched next)

export const current = () => cur;

// ------------------------------------------------------------------ init
export function initEditor() {
  try { renderer = new Renderer($('#gl')); }
  catch (e) { document.body.innerHTML = `<p style="padding:40px">${e.message}</p>`; throw e; }
  const devBox = $('#devSliders');
  for (const [title, ids] of [['White balance', ['temp', 'tint']], ['Light', ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks']], ['Presence', ['clarity', 'vibrance', 'saturation']]]) {
    devBox.insertAdjacentHTML('beforeend', `<div class="group-title">${title}</div>`);
    buildSliders(devBox, DEV.filter(([id]) => ids.includes(id)).map(([id, label]) => ({ id, label, min: -100, max: 100 })), 'dev');
  }
  buildSliders('#retSliders', RET.map(([id, label, min, max]) => ({ id, label, min, max })), 'ret');
  let group = null;
  const shapeBox = $('#shapeSliders');
  for (const s of SLIDERS) {
    if (s.group !== group) { group = s.group; shapeBox.insertAdjacentHTML('beforeend', `<div class="group-title">${group}</div>`); }
    buildSliders(shapeBox, [s], 'shape');
  }
  const sel = $('#lookSelect');
  const fillLooks = () => {
    const mine = loadJSON('sculpt.looks', {});
    sel.innerHTML = '<option value="">Looks…</option>' +
      Object.keys(LOOKS).map((k) => `<option>${k}</option>`).join('') +
      (Object.keys(mine).length ? '<optgroup label="My looks">' + Object.keys(mine).map((k) => `<option value="my:${k}">${k}</option>`).join('') + '</optgroup>' : '');
  };
  fillLooks();
  sel.onchange = () => {
    if (!cur || !sel.value) return;
    beginEdit();
    const look = sel.value.startsWith('my:') ? loadJSON('sculpt.looks', {})[sel.value.slice(3)] : LOOKS[sel.value];
    cur.photo.edit.dev = { ...DEFAULT_DEV, ...look };
    sel.value = '';
    applyEdit();
  };
  $('#btnSaveLook').onclick = () => {
    if (!cur) return;
    const name = prompt('Name this look (saved on this computer):');
    if (!name) return;
    const mine = loadJSON('sculpt.looks', {});
    mine[name] = { ...cur.photo.edit.dev };
    saveJSON('sculpt.looks', mine);
    fillLooks();
    toast(`Saved look “${name}”.`);
  };
  $('#btnAuto').onclick = () => { if (cur) { beginEdit(); autoTone(); } };
  initStyleUI();
  initProfileUI();
  $('#btnResetColour').onclick = () => { if (cur) { beginEdit(); cur.photo.edit.dev = { ...DEFAULT_DEV }; applyEdit(); } };
  for (const b of $$('[data-shape-preset]')) b.onclick = () => {
    if (!cur) return; beginEdit();
    cur.photo.edit.shape = { ...zeroShape(), ...(SHAPE_PRESETS[b.dataset.shapePreset] || {}) };
    applyEdit();
  };
  $('#btnSaveDefault').onclick = () => {
    if (!cur) return;
    saveJSON('sculpt.defaults', { dev: cur.photo.edit.dev, ret: cur.photo.edit.ret, shape: cur.photo.edit.shape, look: cur.photo.edit.look });
    toast('Saved — newly added photos will start with these settings.');
  };
  $('#btnClearManual').onclick = () => {
    if (!cur || !cur.F) return;
    beginEdit();
    cur.photo.manual = newManual(cur.F); cur.photo.manualDirty = false;
    uploadField();
  };
  for (const b of $$('[data-tab]')) b.onclick = () => showTab(b.dataset.tab);
  for (const b of $$('[data-tool]')) b.onclick = () => setTool(b.dataset.tool);
  const showVals = () => { $('#vSize').textContent = $('#brushSize').value + 'px'; $('#vStr').textContent = $('#brushStr').value + '%'; };
  $('#brushSize').oninput = showVals; $('#brushStr').oninput = showVals; showVals();
  $('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
  $('#btnFit').onclick = fitView;
  $('#btn100').onclick = () => { const r = vp().getBoundingClientRect(); zoomAt(1 / view.s, r.width / 2, r.height / 2); };
  $('#btnCompare').onclick = toggleCompare;
  const before = (v) => { holdingBefore = v; $('#btnBefore').classList.toggle('on', v); draw(); };
  $('#btnBefore').addEventListener('pointerdown', () => before(true));
  $('#btnBefore').addEventListener('pointerup', () => before(false));
  $('#btnBefore').addEventListener('pointerleave', () => holdingBefore && before(false));
  editorKeys.before = before;
  $('#chkPoints').onchange = drawOverlay;
  $('#removeQuality').value = localStorage.getItem('sculpt.removeQuality') || 'best';
  $('#removeQuality').onchange = (e) => localStorage.setItem('sculpt.removeQuality', e.target.value);
  $('#btnSync').onclick = syncSettings;
  initViewport();
  on('flags', () => renderStrip());
  on('filter', () => renderStrip());
  window.addEventListener('resize', () => { sizeOverlay(); if (cur && S.mode === 'edit') fitView(); });
  initDetectors().catch((e) => toast('Could not load the AI models: ' + e.message, 8000));
}

function buildSliders(box, defs, group) {
  box = typeof box === 'string' ? $(box) : box;
  for (const s of defs) {
    const lab = document.createElement('label');
    lab.className = 'sl';
    lab.innerHTML = `<span>${s.label} <em>0</em></span><input type="range" min="${s.min}" max="${s.max}" value="0" step="1" data-group="${group}" data-id="${s.id}">`;
    const input = lab.querySelector('input');
    input.addEventListener('pointerdown', beginEdit);
    input.addEventListener('keydown', beginEdit);
    input.addEventListener('input', () => {
      if (!cur) return;
      if (group === 'dev' && COLOUR_KEYS.includes(s.id)) cur.photo.userColour = true;
      if (group === 'shape') cur.photo.autoWeights = null;      // hand-set shape applies to everyone equally
      cur.photo.edit[group][s.id] = +input.value;
      lab.querySelector('em').textContent = input.value;
      scheduleApply(group === 'shape');
    });
    input.addEventListener('dblclick', () => { if (!cur) return; beginEdit(); cur.photo.edit[group][s.id] = 0; applyEdit(); });
    box.appendChild(lab);
  }
}

function syncSliderUI() {
  if ($('#profiles') && $('#profiles').children.length) syncProfileUI();
  const e = cur ? cur.photo.edit : { dev: DEFAULT_DEV, ret: DEFAULT_RET, shape: zeroShape() };
  for (const input of $$('input[data-group]')) {
    const v = e[input.dataset.group][input.dataset.id] || 0;
    input.value = v;
    input.parentElement.querySelector('em').textContent = v > 0 && input.min < 0 ? '+' + v : v;
  }
}

function showTab(t) {
  for (const b of $$('[data-tab]')) b.classList.toggle('on', b.dataset.tab === t);
  for (const p of $$('.pane')) p.hidden = p.id !== 'pane-' + t;
  if (t === 'retouch' && tool !== 'remove' && tool !== 'hand') setTool('hand');
  if (t === 'shape' && tool === 'remove') setTool('hand');
}

// ------------------------------------------------------------------ open / render
function getDecoded(p) {
  if (!p.file) { emit('need-files'); return Promise.reject(new Error('Reconnect to the original photos first (button at the top).')); }
  if (!decodeCache.has(p.id)) {
    const pr = decodeFull(p.file).catch((e) => { decodeCache.delete(p.id); throw e; });
    decodeCache.set(p.id, pr);
  }
  // keep at most current + 1 prefetched
  while (decodeCache.size > 2) decodeCache.delete(decodeCache.keys().next().value);
  return decodeCache.get(p.id);
}

const needsAI = (p) => !!p.pendingAuto || Object.values(p.edit.shape).some(Boolean) || Object.values(p.edit.ret).some(Boolean);

/**
 * Load a photo into the GPU pipeline. interactive=false (export) skips the AI when no
 * face/body/skin edits are set.
 */
export async function loadPhoto(p, { interactive = true, fit = true } = {}) {
  const token = ++openToken;
  busy(p.kind === 'raw' ? `Developing RAW ${p.name}…` : `Opening ${p.name}…`);
  try {
    const img = await getDecoded(p);
    if (token !== openToken) return false;
    renderer.setImage(img);
    renderer.sharpen = p.kind === 'raw' ? RAW_SHARPEN : 0;      // camera JPEGs are already sharpened
    p.w = renderer.w; p.h = renderer.h;
    if (img.meta && Object.keys(img.meta).length) p.fullMeta = img.meta;
    cur = { photo: p, F: null, fields: null, auto: null, out: null, faceH: 0 };
    // replay object removals onto the fresh base
    for (const patch of p.patches || []) renderer.writeBase(patch.x, patch.y, patch.w, patch.h, patch.next);
    applyParams();
    if (interactive) { syncSliderUI(); if (fit) fitView(); renderer.buildBlurs(0); draw(); renderLookPreviews(); }

    if (interactive || needsAI(p)) {
      if (!p.det || !p.emb) {
        busy('AI is finding faces & bodies…');
        const t = renderer.thumbnail(3200);
        const bmp = await createImageBitmap(new ImageData(t.data, t.w, t.h));
        if (!p.det) p.det = await detect(bmp, p.w, p.h);
        if (!p.emb) { try { p.emb = await sceneEmbedding(bmp); } catch (e) { console.warn('fingerprint failed', e); } }
        bmp.close();
        if (token !== openToken) return false;
      }
      const F = makeField(p.w, p.h);
      cur.F = F;
      if (p.pendingAuto) await runAuto(p, F);
      cur.fields = buildUnitFields(F, p.det, p.autoWeights || null);
      // the double chin only ever moves/lightens skin: collars, ties, jewellery, hair and background stay put
      const neck = p.det.seg ? neckSkin(F, p.det) : null;
      const fH = Math.max(0, ...p.det.faces.map((lm) => faceFrame(lm).H));
      maskWarpToSkin(F, cur.fields.chin, neck, Math.max(1, Math.round(0.035 * fH / F.sx)));
      if (!p.manual || p.manual.dx.length !== F.fw * F.fh) p.manual = newManual(F);
      cur.out = new Float32Array(F.fw * F.fh * 2);
      const hs = p.det.faces.map((lm) => faceFrame(lm).H).sort((a, b) => a - b);
      cur.faceH = hs.length ? hs[hs.length >> 1] : 0;
      if (p.det.faces.length || p.det.seg) {
        const chin = buildChinMask(F, p.det.faces, neck), skin = buildSkinMask(F, p.det, renderer.thumbnail(1024));
        if (p.childFaces && p.childFaces.length) { eraseFaces(F, skin, p.det.faces, p.childFaces); eraseFaces(F, chin, p.det.faces, p.childFaces); }
        renderer.setMask('uChinMask', F.fw, F.fh, chin);
        renderer.setMask('uSkinMask', F.fw, F.fh, skin);
      }
      describeDetections(p);
    }
    renderer.buildBlurs(cur.faceH);
    recomputeAuto();
    if (interactive) prefetchNext(p);
    return true;
  } catch (e) {
    console.error(e);
    if (token === openToken) toast(`${p.name}: ${e.message || e}`, 7000);
    return false;
  } finally {
    if (token === openToken) busy(null);
  }
}

/** Children are never smoothed or reshaped: clear their face + neck from a mask. */
function eraseFaces(F, mask, faces, idx) {
  for (const i of idx) {
    const fr = faceFrame(faces[i]), c = fr.c, R = fr.H * 0.85;
    const cx = c.x - fr.u.x * fr.H * 0.35, cy = c.y - fr.u.y * fr.H * 0.35;   // reach down over the neck
    for (let j = 0; j < F.fh; j++) for (let k = 0; k < F.fw; k++) {
      const x = (k + 0.5) * F.sx, y = (j + 0.5) * F.sy;
      if ((x - cx) ** 2 / (R * 0.8) ** 2 + (y - cy) ** 2 / (R * 1.25) ** 2 < 1) mask[j * F.fw + k] = 0;
    }
  }
}

/** A trained style's tone for a photo, plus the wedding's brightness check (stops; the job remembers it). */
export function learnedToneFor(id, p, brightness, thumb = null) {
  const tone = learnedTone(id, thumb || renderer.thumbnail(256), p.det && p.det.seg, p);
  const b = brightness ?? S.job?.brightness ?? 0;
  if (tone && b) tone.exposure = Math.max(-200, Math.min(200, Math.round((tone.exposure || 0) + b * 40)));
  return tone;
}

/** Auto-pilot for one photo: your style (colour/tone) + natural polish (skin, subtle shape). */
async function runAuto(p, F) {
  const o = p.pendingAuto;
  p.pendingAuto = null;
  const notes = [];
  if (o.profile && profileById(o.profile)?.learned) {
    // a trained style predicts this photo's exposure & white balance itself, then applies the learned grade
    p.edit.dev = { ...DEFAULT_DEV };
    p.edit.look = { id: o.profile, amount: 100, tone: learnedToneFor(o.profile, p, o.brightness) };
    notes.push(profileById(o.profile).name + ' (trained)');
  } else if (o.profile) {
    // a wedding profile defines the colour; tone is still normalised per photo first
    const st = await loadStyle();
    if (st.finals && st.finals.length >= 10 && p.emb) {
      const r = styleSliders({ ...st, _examples: [], look: null }, renderer.thumbnail(112), p.emb, []);
      const wb = autoWhiteBalance(renderer.thumbnail(96));
      p.edit.dev = { ...DEFAULT_DEV, ...r.dev, temp: wb.temp, tint: wb.tint };
      notes.push('tone from your finished photos');
    } else { autoTone(); }
    p.edit.look = { id: o.profile, amount: 100 };
    const pk = profileById(o.profile);
    if (pk && pk.wbKeep != null) { const wb2 = autoWhiteBalance(renderer.thumbnail(96), pk.wbKeep); p.edit.dev = { ...p.edit.dev, temp: wb2.temp, tint: wb2.tint }; }
    if (profileTone(o.profile)) {
      p.edit.dev = { ...p.edit.dev, exposure: 0, whites: 0, blacks: 0, shadows: 0, highlights: 0, contrast: 0 };
      p.edit.look.tone = fitProfileTone(p, o.profile);
      const i = notes.indexOf('tone from your finished photos'); if (i >= 0) notes.splice(i, 1);
      notes.push('tone fitted to ' + pk.name);
    }
    notes.push(profileById(o.profile).name);
  } else if (o.colour) {
    const st = await loadStyle();
    if (hasStyle(st) && p.emb) {
      const t = renderer.thumbnail(112);
      const sc = t.w / p.w;
      const boxes = p.det.faces.map((lm) => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const q of lm) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        return { x: x0 * sc, y: y0 * sc, w: (x1 - x0) * sc, h: (y1 - y0) * sc };
      });
      const r = styleSliders(st, t, p.emb, boxes);
      if (st._examples.length < 5) {     // colour from a fixed look: correct the scene's cast first
        const wb = autoWhiteBalance(renderer.thumbnail(96));
        r.dev.temp = (r.dev.temp || 0) + wb.temp; r.dev.tint = (r.dev.tint || 0) + wb.tint;
      }
      p.edit.dev = { ...DEFAULT_DEV, ...r.dev };
      notes.push(...r.notes);
    } else { autoTone(); notes.push('auto tone (no style yet)'); }
  }
  if (o.retouch || o.shape) {
    const needs = measureNeeds(F, p.det);
    p.childFaces = needs.childFaces;
    if (o.retouch) p.edit.ret = { ...AUTO_RETOUCH };
    if (o.shape) { p.autoWeights = needs.weights; p.edit.shape = { ...p.edit.shape, ...AUTO_SHAPE }; }
    notes.push(...needs.reasons);
  }
  p.autoNotes = notes;
  p.autoDone = true;
  applyParams();
}

function prefetchNext(p) {
  const vis = visiblePhotos();
  const next = vis[vis.indexOf(p) + 1];
  if (next && !decodeCache.has(next.id)) setTimeout(() => getDecoded(next).catch(() => {}), 300);
}

export async function openInEditor(p) {
  S.current = p;
  renderStrip();
  const ok = await loadPhoto(p);
  if (ok) {
    $('#status').textContent = `${p.name} · ${p.w}×${p.h}`;
    renderStrip();
  }
  return ok;
}

function describeDetections(p) {
  const nf = p.det.faces.length, nb = p.det.poses.length;
  $('#detInfo').textContent = `AI found ${nf ? nf + ' face' + (nf > 1 ? 's' : '') : 'no face'} and ${nb ? nb + ' bod' + (nb > 1 ? 'ies' : 'y') : 'no body'}.` +
    (!nf ? ' Face & skin tools need a visible face.' : '') + (!nb ? ' Body sliders need shoulders & hips in frame.' : '');
}

let lutKey = null;
function applyParams() {
  const e = cur.photo.edit;
  // a profile sits under the sliders: its tone offsets add to the user's
  const look = e.look && profileById(e.look.id) ? e.look : null;
  if (look) {
    const a = (look.amount ?? 100) / 100, off = profileDev(look.id, a), tone = look.tone || {};
    // exposure may go to ±200 (5 EV): trained styles push dark RAWs a long way
    renderer.params.dev = Object.fromEntries(Object.keys(DEFAULT_DEV).map((k) => { const m = k === 'exposure' ? 200 : 100; return [k, Math.max(-m, Math.min(m, (e.dev[k] || 0) + (off[k] || 0) + (tone[k] || 0) * a))]; }));
    const key = look.id + ':' + a.toFixed(2);
    if (key !== lutKey) { renderer.setLut(profileLut(look.id, a)); lutKey = key; }
    renderer.grain = profileGrain(look.id, a);
    renderer.vignette = profileVignette(look.id, a);
    renderer.knee = profileKnee(look.id);
  } else {
    renderer.params.dev = e.dev;
    if (lutKey) { renderer.setLut(null); lutKey = null; }
    renderer.grain = 0;
    renderer.vignette = 0;
    renderer.knee = 0.88;
  }
  renderer.params.skin = (e.ret.skin || 0) / 100;
  renderer.params.even = (e.ret.even || 0) / 100 * 0.8;
  renderer.params.chin = (e.shape.chin || 0) / 100;
}

function applyEdit() { syncSliderUI(); applyParams(); recomputeAuto(); }

let applyQueued = false, shapeDirty = false;
function scheduleApply(shape) {
  shapeDirty = shapeDirty || shape;
  if (applyQueued) return;
  applyQueued = true;
  requestAnimationFrame(() => {
    applyQueued = false;
    applyParams();
    if (shapeDirty) recomputeAuto(); else draw();
    shapeDirty = false;
  });
}

function recomputeAuto() {
  if (!cur) return;
  if (cur.F) {
    cur.auto = combine(cur.F, cur.fields, cur.photo.edit.shape, null, cur.auto);
    uploadField();
  } else draw();
  markEdited();
}

function uploadField() {
  const { F, auto, out, photo } = cur;
  const M = photo.manual;
  for (let i = 0, n = F.fw * F.fh; i < n; i++) {
    out[2 * i] = auto[2 * i] + M.dx[i];
    out[2 * i + 1] = auto[2 * i + 1] + M.dy[i];
  }
  renderer.setField(F.fw, F.fh, out);
  draw();
}

function draw() {
  if (!cur) return;
  renderer.draw({ split: holdingBefore ? 0 : compare ? split : -1 });
  drawOverlay();
}

let markTimer;
function markEdited() {
  clearTimeout(markTimer);
  markTimer = setTimeout(() => { if (cur) { cur.photo.editedOnce = isEdited(cur.photo); updateStripItem(cur.photo); emit('photo-updated', cur.photo); } }, 300);
}

// ------------------------------------------------------------------ auto tone
function autoTone() {
  const t = renderer.thumbnail(400), d = t.data, lum = [];
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  for (let i = 0; i < d.length; i += 4) lum.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
  lum.sort((a, b) => a - b);
  const q = (f) => lum[Math.min(lum.length - 1, Math.floor(f * lum.length))];
  const med = Math.max(1e-4, q(0.5));
  const ev = Math.max(-1.2, Math.min(1.2, Math.log2(0.16 / med) * 0.6));   // gentle: don't flatten moody/dark scenes
  const k = 2 ** ev;
  const hi = q(0.995) * k, lo = q(0.005) * k;
  const whites = hi < 0.9 ? Math.min(60, (1 - hi / 0.95) / 0.35 * 100) : hi > 1.3 ? -25 : 0;
  const blacks = lo > 0.01 ? -Math.min(50, lo / 0.02 * 25) : 0;
  const clip = lum.filter((v) => v * k > 0.95).length / lum.length;
  const wb = autoWhiteBalance(renderer.thumbnail(96));
  cur.photo.edit.dev = {
    ...cur.photo.edit.dev,
    temp: wb.temp, tint: wb.tint,
    exposure: Math.round(ev / 2.5 * 100), whites: Math.round(whites), blacks: Math.round(blacks),
    highlights: clip > 0.02 ? -45 : -20, shadows: med < 0.08 ? 25 : 12, contrast: 8, vibrance: 8,
  };
  if (cur.fields || !cur.F) applyEdit();     // during auto-pilot the fields aren't built yet
}

// ------------------------------------------------------------------ viewport: zoom/pan/tools
const vp = () => $('#viewport');
function applyView() {
  $('#stage').style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
  $('#zoomPct').textContent = cur ? Math.round(view.s * 100) + '%' : '—';
  drawOverlay();
}
export function fitView() {
  if (!cur) return;
  const r = vp().getBoundingClientRect(), pad = 24;
  if (!r.width) return;
  // keep the photo clear of the floating tool bar at the bottom
  const tb = document.querySelector('.toolbar'), bottom = tb && tb.offsetHeight ? tb.offsetHeight + 28 : pad;
  const availH = r.height - pad - bottom;
  view.s = Math.min((r.width - pad * 2) / cur.photo.w, availH / cur.photo.h);
  view.tx = (r.width - cur.photo.w * view.s) / 2;
  view.ty = pad + (availH - cur.photo.h * view.s) / 2;
  applyView();
}
function zoomAt(f, cx, cy) {
  const s = Math.min(16, Math.max(0.02, view.s * f));
  view.tx = cx - (cx - view.tx) * (s / view.s);
  view.ty = cy - (cy - view.ty) * (s / view.s);
  view.s = s;
  applyView();
}
function toImage(e) {
  const r = vp().getBoundingClientRect();
  return { x: (e.clientX - r.left - view.tx) / view.s, y: (e.clientY - r.top - view.ty) / view.s, vx: e.clientX - r.left, vy: e.clientY - r.top };
}

let drag = null, spaceDown = false, removing = null;
const brushTools = ['push', 'restore', 'remove'];
function brushRadius() { return +$('#brushSize').value / 2 / view.s; }
function showBrush(e) {
  const el = $('#brush');
  const show = cur && brushTools.includes(tool) && !spaceDown;
  el.style.display = show ? 'block' : 'none';
  el.classList.toggle('remove', tool === 'remove');
  vp().style.cursor = show ? 'none' : (spaceDown || tool === 'hand') ? (drag ? 'grabbing' : compare ? 'ew-resize' : 'grab') : 'default';
  if (!show || !e) return;
  const p = toImage(e), d = +$('#brushSize').value;
  el.style.left = p.vx + 'px'; el.style.top = p.vy + 'px';
  el.style.width = el.style.height = d + 'px';
}

function initViewport() {
  const v = vp();
  v.addEventListener('wheel', (e) => {
    if (!cur) return;
    e.preventDefault();
    const r = v.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
    const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 100);
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), cx, cy);
    else if (mouseWheel) zoomAt(Math.exp(-Math.sign(e.deltaY) * 0.18), cx, cy);
    else { view.tx -= e.deltaX; view.ty -= e.deltaY; applyView(); }
  }, { passive: false });
  v.addEventListener('pointerdown', (e) => {
    if (!cur) return;
    v.setPointerCapture(e.pointerId);
    const p = toImage(e);
    const panning = spaceDown || e.button === 1 || (tool === 'hand' && !compare);
    if (panning) drag = { mode: 'pan', x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    else if (tool === 'hand' && compare) { drag = { mode: 'split' }; setSplit(p.x); }
    else if (tool === 'remove') { if (!removing) { drag = { mode: 'remove' }; removing = { pts: [p], r: brushRadius() }; drawOverlay(); } }
    else if (cur.F) { beginEdit(); drag = { mode: tool, last: p }; if (tool === 'restore') stroke(p, p); }
    showBrush(e);
  });
  v.addEventListener('pointermove', (e) => {
    showBrush(e);
    if (!drag) return;
    if (drag.mode === 'pan') { view.tx = drag.tx + e.clientX - drag.x; view.ty = drag.ty + e.clientY - drag.y; applyView(); }
    else if (drag.mode === 'split') setSplit(toImage(e).x);
    else if (drag.mode === 'remove') { removing.pts.push(toImage(e)); drawOverlay(); }
    else { const p = toImage(e); stroke(drag.last, p); drag.last = p; }
  });
  const end = () => {
    const was = drag;
    drag = null; showBrush();
    if (was && was.mode === 'remove' && removing) runRemove();
    if (was && (was.mode === 'push' || was.mode === 'restore')) markEdited();
  };
  v.addEventListener('pointerup', end);
  v.addEventListener('pointercancel', end);
  v.addEventListener('pointerleave', () => { if (!drag) $('#brush').style.display = 'none'; });
  sizeOverlay();
}
function setSplit(x) { split = Math.min(1, Math.max(0, x / cur.photo.w)); draw(); }

let strokeQueued = false;
function stroke(a, b) {
  const R = brushRadius(), k = +$('#brushStr').value / 100, M = cur.photo.manual;
  const dist = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(dist / (R * 0.15)));
  for (let i = 1; i <= steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
    if (tool === 'push') brushPush(cur.F, M, x, y, (b.x - a.x) / steps * k, (b.y - a.y) / steps * k, R);
    else brushRestore(cur.F, M, x, y, R, 0.12 * k + 0.02);
  }
  cur.photo.manualDirty = true;
  if (!strokeQueued) { strokeQueued = true; requestAnimationFrame(() => { strokeQueued = false; if (cur && cur.F) uploadField(); }); }
}

/** Field displacement at an image point (so remove strokes painted on the warped view hit the right source pixels). */
function fieldAt(x, y) {
  if (!cur.F) return { x: 0, y: 0 };
  const { F, out } = cur;
  const fx = Math.min(F.fw - 1, Math.max(0, x / F.sx - 0.5)), fy = Math.min(F.fh - 1, Math.max(0, y / F.sy - 0.5));
  const i = Math.round(fx), j = Math.round(fy), k = (j * F.fw + i) * 2;
  return { x: out[k], y: out[k + 1] };
}

async function runRemove() {
  const p = cur.photo, st = removing;
  const src = { r: st.r, pts: st.pts.map((q) => { const d = fieldAt(q.x, q.y); return { x: q.x + d.x, y: q.y + d.y }; }) };
  const quality = $('#removeQuality').value;
  try {
    busy('Removing…');
    beginEdit();
    const patch = await removeStroke(renderer, src, {
      quality, onProgress: (f) => busy(`Downloading the removal AI (one time only)… ${Math.round(f * 100)}%`),
    });
    busy('Removing…');
    if (patch && cur && cur.photo === p) {
      (p.patches = p.patches || []).push(patch);
      renderer.buildBlurs(cur.faceH);
      draw(); markEdited();
    }
  } catch (e) {
    console.error(e); toast('Remove failed: ' + (e.message || e), 7000);
    p.undo.pop();
  } finally {
    removing = null; busy(null); drawOverlay();
  }
}

// ------------------------------------------------------------------ undo / redo
function snapshot(p) {
  return {
    edit: structuredClone(p.edit),
    manual: p.manual ? { dx: p.manual.dx.slice(), dy: p.manual.dy.slice() } : null,
    dirty: p.manualDirty, patches: (p.patches || []).slice(),
  };
}
export function beginEdit() {
  if (!cur) return;
  const p = cur.photo;
  p.undo.push(snapshot(p));
  if (p.undo.length > 30) p.undo.shift();
  p.redo = [];
}
function restore(snap) {
  const p = cur.photo, have = p.patches || [], want = snap.patches;
  let common = 0;
  while (common < have.length && common < want.length && have[common] === want[common]) common++;
  for (let i = have.length - 1; i >= common; i--) renderer.writeBase(have[i].x, have[i].y, have[i].w, have[i].h, have[i].prev);
  for (let i = common; i < want.length; i++) renderer.writeBase(want[i].x, want[i].y, want[i].w, want[i].h, want[i].next);
  const patchesChanged = have.length !== common || want.length !== common;
  p.patches = want.slice();
  p.edit = structuredClone(snap.edit);
  if (snap.manual) p.manual = { dx: snap.manual.dx.slice(), dy: snap.manual.dy.slice() };
  p.manualDirty = snap.dirty;
  if (patchesChanged) renderer.buildBlurs(cur.faceH);
  applyEdit();
}
export function undo() { if (!cur || !cur.photo.undo.length) return; cur.photo.redo.push(snapshot(cur.photo)); restore(cur.photo.undo.pop()); }
export function redo() { if (!cur || !cur.photo.redo.length) return; cur.photo.undo.push(snapshot(cur.photo)); restore(cur.photo.redo.pop()); }

// ------------------------------------------------------------------ tools, compare
export function setTool(t) {
  tool = t;
  for (const b of $$('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
  if (t !== 'hand' && compare) toggleCompare();
  $('#brushStrRow').hidden = t === 'remove' || t === 'hand';
  if (t === 'remove') {
    toast('Paint over the thing to remove (exit sign, blemish, stray hair…) and let go.');
    // warm up the models in the background so the first removal is quicker
    initInpaint('migan').catch(() => {});
    if ($('#removeQuality').value !== 'fast' && !isModelReady('lama')) {
      initInpaint('lama', (f) => { $('#removeStatus').textContent = `Downloading removal AI… ${Math.round(f * 100)}% (one time only)`; })
        .then(() => { $('#removeStatus').textContent = 'Removal AI ready.'; }).catch((e) => { $('#removeStatus').textContent = 'Removal AI failed to load: ' + e.message; });
    }
  }
  showBrush();
}
function toggleCompare() {
  compare = !compare;
  $('#btnCompare').classList.toggle('on', compare);
  if (compare) { setTool('hand'); if (cur) toast('Drag across the photo to move the split. Left = after, right = before.'); }
  draw(); showBrush();
}

// ------------------------------------------------------------------ overlay
const ov = () => $('#overlay');
function sizeOverlay() {
  const r = vp().getBoundingClientRect(), d = devicePixelRatio || 1;
  ov().width = Math.round(r.width * d); ov().height = Math.round(r.height * d);
}
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
function drawOverlay() {
  const c = ov(), g = c.getContext('2d'), d = devicePixelRatio || 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, c.width, c.height);
  if (!cur || S.mode !== 'edit') return;
  g.setTransform(d * view.s, 0, 0, d * view.s, d * view.tx, d * view.ty);
  if (removing) {
    g.strokeStyle = 'rgba(255,60,90,.55)'; g.fillStyle = g.strokeStyle;
    g.lineCap = g.lineJoin = 'round'; g.lineWidth = removing.r * 2;
    g.beginPath(); removing.pts.forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, p.x, p.y));
    if (removing.pts.length === 1) { g.arc(removing.pts[0].x, removing.pts[0].y, removing.r, 0, 7); g.fill(); } else g.stroke();
  }
  if (!$('#chkPoints').checked || !cur.photo.det) return;
  g.lineWidth = 1.5 / view.s;
  for (const p of cur.photo.det.poses) {
    g.strokeStyle = 'rgba(120,200,255,.9)';
    for (const [a, b] of BONES) {
      if (p.lm[a].v < 0.4 || p.lm[b].v < 0.4) continue;
      g.beginPath(); g.moveTo(p.lm[a].x, p.lm[a].y); g.lineTo(p.lm[b].x, p.lm[b].y); g.stroke();
    }
  }
  for (const lm of cur.photo.det.faces) {
    g.strokeStyle = 'rgba(231,180,106,.95)';
    g.beginPath(); FACE_OVAL.forEach((i, k) => (k ? g.lineTo : g.moveTo).call(g, lm[i].x, lm[i].y)); g.stroke();
  }
}

// ------------------------------------------------------------------ filmstrip
export function renderStrip() {
  const box = $('#strip');
  const vis = visiblePhotos();
  box.innerHTML = '';
  for (const p of vis) {
    const d = document.createElement('div');
    d.className = 'thumb'; d.dataset.id = p.id; d.title = p.name;
    d.innerHTML = `<img alt="" src="${p.thumbURL || ''}"><span class="dot"></span><span class="fl"></span>`;
    d.onclick = () => openInEditor(p);
    box.appendChild(d);
    updateStripItem(p);
  }
  box.querySelector('.thumb.sel')?.scrollIntoView({ block: 'nearest' });
}
function updateStripItem(p) {
  const el = $(`#strip .thumb[data-id="${p.id}"]`);
  if (!el) return;
  el.classList.toggle('sel', S.current === p);
  el.classList.toggle('edited', !!p.editedOnce);
  el.querySelector('.fl').textContent = p.flag === 1 ? '✓' : p.flag === -1 ? '✕' : '';
  const img = el.querySelector('img');
  if (p.thumbURL && img.getAttribute('src') !== p.thumbURL) img.src = p.thumbURL;
}

// ------------------------------------------------------------------ sync
function syncSettings() {
  if (!cur) return;
  const parts = $$('[data-sync]:checked').map((c) => c.dataset.sync);
  const target = $('#syncTarget').value;
  if (!parts.length) { toast('Tick what to copy (Colour / Retouch / Shape).'); return; }
  const list = photos.filter((p) => p !== cur.photo && (target === 'all' ? p.flag !== -1 : target === 'picks' ? p.flag === 1 : S.selected.has(p.id)));
  for (const p of list) {
    for (const k of parts) p.edit[k] = structuredClone(cur.photo.edit[k]);
    if (parts.includes('dev')) p.edit.look = cur.photo.edit.look ? { ...cur.photo.edit.look } : null;
    p.editedOnce = isEdited(p);
    emit('photo-updated', p);
  }
  renderStrip();
  toast(`Copied ${parts.join(' + ')} to ${list.length} photo${list.length === 1 ? '' : 's'}. Hand edits and removals stay on this photo only.`, 5000);
}

// ------------------------------------------------------------------ keys
export const editorKeys = {
  before: null,
  down(e) {
    const k = e.key.toLowerCase(), mod = e.metaKey || e.ctrlKey;
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return true; }
    if (mod) return false;
    if (e.key === ' ') { if (!spaceDown) { spaceDown = true; showBrush(); } e.preventDefault(); return true; }
    if (k === 'b' && !e.repeat) this.before(true);
    else if (k === 'c') toggleCompare();
    else if (k === 'w') setTool('push');
    else if (k === 'r') setTool('restore');
    else if (k === 'q') { showTab('retouch'); setTool('remove'); }
    else if (k === 'h') setTool('hand');
    else if (k === '0') fitView();
    else if (k === '1') $('#btn100').click();
    else if (k === '[' || k === ']') { const s = $('#brushSize'); s.value = +s.value * (k === ']' ? 1.15 : 1 / 1.15); s.oninput(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const vis = visiblePhotos(), i = cur ? vis.indexOf(cur.photo) : -1, j = i + (e.key === 'ArrowRight' ? 1 : -1);
      if (vis[j]) openInEditor(vis[j]);
    } else return false;
    return true;
  },
  up(e) {
    if (e.key === ' ') { spaceDown = false; showBrush(); }
    if (e.key.toLowerCase() === 'b') this.before(false);
  },
  blur() { spaceDown = false; if (holdingBefore) this.before(false); },
};

export function onEnterEdit() { sizeOverlay(); renderStrip(); if (cur) fitView(); }

// ------------------------------------------------------------------ My style UI
async function refreshStyleInfo() {
  const st = await loadStyle();
  $('#styleInfo').textContent = describeStyle(st);
  $('#btnApplyStyle').disabled = !hasStyle(st);
}

function initStyleUI() {
  refreshStyleInfo();
  $('#btnApplyStyle').onclick = async () => {
    if (!cur || !cur.F) return;
    beginEdit();
    cur.photo.pendingAuto = { colour: true };
    await runAuto(cur.photo, cur.F);
    applyEdit();
    toast('Applied your style: ' + (cur.photo.autoNotes || []).join(', '));
  };
  $('#btnSetLook').onclick = async () => {
    if (!cur) return;
    const st = await loadStyle();
    st.look = Object.fromEntries(COLOUR_KEYS.map((k) => [k, cur.photo.edit.dev[k] || 0]));
    const ok = await saveStyle(st);
    refreshStyleInfo();
    toast(ok ? 'Saved this colour (temperature, tint, vibrance, saturation, clarity) as your look — shared with the whole team.' : 'Saved on this computer (server not reachable).', 5000);
  };
  $('#btnTeachStyle').onclick = () => $('#teachInput').click();
  $('#teachInput').onchange = async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    const st = await loadStyle();
    let done = 0;
    for (const f of files) {
      busy(`Learning your style… ${++done}/${files.length}`);
      try {
        const { bitmap } = await loadPreview(f, 1024);
        const emb = await sceneEmbedding(bitmap);
        const s = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
        const c = new OffscreenCanvas(Math.round(bitmap.width * s), Math.round(bitmap.height * s));
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bitmap, 0, 0, c.width, c.height);
        let boxes = [];
        try { boxes = (await analyzeFaces(bitmap)).map((x) => ({ x: x.box.x * s, y: x.box.y * s, w: x.box.w * s, h: x.box.h * s })); } catch { /* no faces */ }
        st.finals.push({ e: encodeEmb(emb), s: photoStats(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, boxes) });
        bitmap.close?.();
      } catch (err) { console.warn('teach failed', f.name, err); }
    }
    if (st.finals.length > 1500) st.finals.splice(0, st.finals.length - 1500);
    busy('Saving your style…');
    const ok = await saveStyle(st);
    busy(null);
    refreshStyleInfo();
    toast(`Learned from ${done} finished photo${done > 1 ? 's' : ''}. ${ok ? 'Shared with the whole team.' : 'Saved on this computer only (server not reachable).'}`, 6000);
  };
}

// ------------------------------------------------------------------ wedding profiles UI
function syncProfileUI() {
  const look = cur && cur.photo.edit.look;
  for (const b of $$('[data-profile]')) b.classList.toggle('on', (look ? look.id : '') === b.dataset.profile);
  $('#profileAmount').disabled = !look;
  $('#profileAmount').value = look ? look.amount ?? 100 : 100;
  $('#vProfileAmount').textContent = look ? (look.amount ?? 100) : '—';
  const p = look && profileById(look.id);
  $('#profileBlurb').textContent = p ? p.blurb : 'Pick a look to start from — the sliders below fine-tune on top.';
}
function initProfileUI() {
  const box = $('#profiles');
  const tile = (id, name, title) => `<button data-profile="${id}" title="${title}"><span class="lp"><canvas></canvas></span><span class="ln">${name}</span></button>`;
  box.innerHTML = tile('', 'Original', 'No look — just your sliders') + PROFILES.map((p) => tile(p.id, p.name, p.blurb.replace(/"/g, '&quot;'))).join('');
  for (const b of $$('[data-profile]')) b.onclick = () => {
    if (!cur) return;
    beginEdit();
    cur.photo.edit.look = b.dataset.profile ? { id: b.dataset.profile, amount: cur.photo.edit.look?.amount ?? 100 } : null;
    if (cur.photo.edit.look && profileTone(b.dataset.profile)) cur.photo.edit.look.tone = fitProfileTone(cur.photo, b.dataset.profile);
    if (cur.photo.edit.look && profileById(b.dataset.profile)?.learned) cur.photo.edit.look.tone = learnedToneFor(b.dataset.profile, cur.photo);
    applyEdit(); syncProfileUI();
  };
  $('#profileAmount').addEventListener('pointerdown', beginEdit);
  $('#profileAmount').oninput = (e) => {
    if (!cur || !cur.photo.edit.look) return;
    cur.photo.edit.look.amount = +e.target.value;
    $('#vProfileAmount').textContent = e.target.value;
    scheduleApply(false);
  };
  syncProfileUI();
}

/** Live mini previews of every look on the current photo (CPU: develop sim + the look's grade on a small thumbnail). */
let previewToken = 0;
function renderLookPreviews() {
  if (!cur) return;
  const token = ++previewToken, photo = cur.photo;
  setTimeout(() => {
    if (token !== previewToken || !cur || cur.photo !== photo) return;
    const t = renderer.thumbnail(150), n = t.w * t.h, base = baseLum(t.data, t.w, t.h);
    for (const b of $$('[data-profile]')) {
      const c = b.querySelector('canvas'); if (!c) continue;
      const id = b.dataset.profile;
      let dev = { ...DEFAULT_DEV };
      if (id) {
        const off = profileDev(id, 1);
        for (const k in off) dev[k] = (dev[k] || 0) + off[k];
        if (profileTone(id)) { const tn = fitProfileTone(photo, id) || {}; for (const k in tn) dev[k] = (dev[k] || 0) + tn[k]; }
        if (profileById(id)?.learned) Object.assign(dev, learnedToneFor(id, photo, undefined, t) || {});
      }
      const px = simulate(t.data, base, n, dev);
      if (id) {
        const L = profileLut(id, 1), N = 33, q = (v) => Math.min(N - 1.0001, v / 255 * (N - 1));
        for (let i = 0; i < n; i++) {
          const r = q(px[i * 4]), g = q(px[i * 4 + 1]), bb = q(px[i * 4 + 2]);
          const r0 = r | 0, g0 = g | 0, b0 = bb | 0, fr = r - r0, fg = g - g0, fb = bb - b0;
          for (let ch = 0; ch < 3; ch++) {
            const at = (dr, dg, db) => L[(((b0 + db) * N + (g0 + dg)) * N + (r0 + dr)) * 4 + ch];
            const c00 = at(0, 0, 0) + (at(1, 0, 0) - at(0, 0, 0)) * fr, c10 = at(0, 1, 0) + (at(1, 1, 0) - at(0, 1, 0)) * fr;
            const c01 = at(0, 0, 1) + (at(1, 0, 1) - at(0, 0, 1)) * fr, c11 = at(0, 1, 1) + (at(1, 1, 1) - at(0, 1, 1)) * fr;
            const c0 = c00 + (c10 - c00) * fg, c1 = c01 + (c11 - c01) * fg;
            px[i * 4 + ch] = c0 + (c1 - c0) * fb;
          }
        }
      }
      // square centre crop
      const s = Math.min(t.w, t.h), full = new OffscreenCanvas(t.w, t.h);
      full.getContext('2d').putImageData(new ImageData(px, t.w, t.h), 0, 0);
      c.width = c.height = s;
      c.getContext('2d').drawImage(full, (t.w - s) / 2, (t.h - s) / 2, s, s, 0, 0, s, s);
    }
  }, 60);
}

/** Adaptive profiles: fit this photo's tone to the profile's brightness distribution (with its grade applied). */
function fitProfileTone(p, id) {
  if (!profileTone(id)) return null;
  const t = renderer.thumbnail(112), sc = t.w / p.w;
  const boxes = (p.det ? p.det.faces : []).map((lm) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of lm) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    return { x: x0 * sc, y: y0 * sc, w: (x1 - x0) * sc, h: (y1 - y0) * sc };
  });
  return fitAdaptiveTone(t, p.edit.dev, id, null, boxes);
}
