// Shared app state + tiny UI helpers.
import { DEFAULT_DEV } from './render.js';
import { SLIDERS } from './warp.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** @type {Array<Photo>} */
export const photos = [];
export const S = { mode: 'cull', filter: 'all', selected: new Set(), current: null };

export const zeroShape = () => Object.fromEntries(SLIDERS.map((s) => [s.id, 0]));
export const DEFAULT_RET = { skin: 0, even: 0 };

export function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; }
}
export const saveJSON = (key, v) => localStorage.setItem(key, JSON.stringify(v));

export function newEdit() {
  const d = loadJSON('sculpt.defaults', {});
  return {
    dev: { ...DEFAULT_DEV, ...(d.dev || {}) },
    ret: { ...DEFAULT_RET, ...(d.ret || {}) },
    shape: { ...zeroShape(), ...(d.shape || loadJSON('sculpt.default', {})) },
    look: d.look || null,
  };
}

export const isEdited = (p) =>
  Object.values(p.edit.dev).some(Boolean) || Object.values(p.edit.ret).some(Boolean) ||
  Object.values(p.edit.shape).some(Boolean) || !!p.edit.look || !!p.manualDirty || (p.patches && p.patches.length > 0);

// ------------------------------------------------------------------ events
const bus = new EventTarget();
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

// ------------------------------------------------------------------ feedback
let toastTimer;
export function toast(msg, ms = 3200) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), ms);
}
export function busy(text) {
  $('#busy').hidden = !text;
  if (text) $('#busyText').textContent = text;
}

/** Photos visible under the current filter, in shoot order. */
export function visiblePhotos(filter = S.filter) {
  return photos.filter((p) => {
    if (filter === 'picks') return p.flag === 1;
    if (filter === 'rejects') return p.flag === -1;
    if (filter === 'unflagged') return p.flag === 0;
    if (filter === 'ai') return p.ai && (p.ai.accident || p.ai.blurry || (p.ai.group && !p.ai.best && !p.ai.keep));
    if (filter === 'stars') return p.stars > 0;
    return true;
  });
}

export function fmtShutter(s) { if (!s) return ''; return s >= 1 ? s + 's' : '1/' + Math.round(1 / s) + 's'; }
