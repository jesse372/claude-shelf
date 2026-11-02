// Culling: AI analysis (closed eyes, blur, duplicate bursts) + grid/loupe UI + picks/rejects/stars.
import { analyzePhoto } from './analyze.js';
import { score as scoreRules, decide } from './cullrules.js';
import { $, $$, photos, S, emit, on, toast, visiblePhotos, fmtShutter } from './state.js';

// ================================================================== analysis (js/analyze.js — also runs in a background worker)
export { analyzePhoto };

/** Shoot-level pass: groups, best frames, accidents (rules live in cullrules.js and are tested against delivered weddings). */
export function scoreShoot() { scoreRules(photos); }

/** Apply AI suggestions to photos the user hasn't flagged yet. */
export function autoCull() {
  let picks = 0, rejects = 0;
  for (const p of photos) {
    if (!p.ai || p.flag !== 0 || p.userFlagged) continue;
    const d = decide(p);
    p.cullReason = d.reason;
    if (d.flag === -1) { p.flag = -1; rejects++; }
    else if (d.flag === 1) { p.flag = 1; picks++; }
  }
  renderGrid();
  return { picks, rejects };
}

/** [short pill label, long description, colour class] */
export function aiNotes(p) {
  if (!p.ai) return [];
  const n = [];
  if (p.ai.accident) { n.push(['Accident', p.ai.accident, 'bad']); return n; }
  if (p.ai.closed) n.push(['Blink', 'Eyes closed', 'bad']);
  else if (p.ai.maybeClosed) n.push(['Eyes?', 'Eyes may be closed / looking down', 'warn']);
  else if (p.ai.someClosed) n.push(['Blink', 'Someone in the group blinked', 'warn']);
  if (p.ai.blurry) n.push(['Blur', 'Out of focus or motion blur', 'bad']);
  if (p.ai.group) n.push(p.ai.best ? ['Best', `Best of ${p.ai.group} similar shots`, 'good'] : p.ai.keep ? ['Keeper', 'Another good, different frame of this moment', 'good'] : ['Similar', `1 of ${p.ai.group} similar shots — a better one exists`, 'muted']);
  if (p.ai.over) n.push(['Bright', 'Blown highlights', 'warn']);
  if (p.ai.under) n.push(['Dark', 'Very dark', 'warn']);
  return n;
}

// ================================================================== UI
const grid = () => $('#grid');
// photo id → its card. Looking cards up with a selector scanned the whole grid each time — on a 2,500-photo shoot one
// grid refresh took ~0.5 s, and import refreshes it every few photos.
const cards = new Map();
const cardOf = (p) => { const d = cards.get(p.id); return d && d.parentNode === grid() ? d : null; };
const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };

function card(p) {
  const d = document.createElement('div');
  d.className = 'card-photo';
  d.dataset.id = p.id;
  d.innerHTML = `<div class="img"><img loading="lazy" alt=""></div>
    <div class="meta"><span class="flag"></span><span class="stars"></span><span class="ai"></span><span class="nm"></span></div>`;
  d.addEventListener('click', (e) => select(p, e));
  d.addEventListener('dblclick', () => openLoupe(p));
  cards.set(p.id, d);
  return d;
}

export function updateCard(p) {
  const d = cardOf(p);
  if (!d) return;
  const img = d.querySelector('img');
  if (p.thumbURL && img.getAttribute('src') !== p.thumbURL) img.src = p.thumbURL;
  d.classList.toggle('pick', p.flag === 1);
  d.classList.toggle('reject', p.flag === -1);
  d.classList.toggle('sel', S.selected.has(p.id));
  d.classList.toggle('cur', S.current === p);
  d.classList.toggle('edited', !!p.editedOnce);
  setText(d.querySelector('.flag'), p.flag === 1 ? '✓' : p.flag === -1 ? '✕' : '');
  setText(d.querySelector('.stars'), p.stars ? '★'.repeat(p.stars) : '');
  const ai = aiNotes(p).map(([s, l, c]) => `<i class="pill ${c}" title="${l}">${s}</i>`).join('');
  if (d._ai !== ai) { d.querySelector('.ai').innerHTML = ai; d._ai = ai; }
  setText(d.querySelector('.nm'), p.name);
}

export function renderGrid() {
  const g = grid();
  const vis = visiblePhotos();
  const want = new Set(vis.map((p) => p.id));
  for (const el of [...g.children]) if (!want.has(+el.dataset.id)) { el.remove(); cards.delete(+el.dataset.id); }
  let prevEl = null;
  for (const p of vis) {
    let el = cardOf(p);
    if (!el) el = card(p);
    if (prevEl ? prevEl.nextSibling !== el : g.firstChild !== el) g.insertBefore(el, prevEl ? prevEl.nextSibling : g.firstChild);
    prevEl = el;
    updateCard(p);
  }
  updateCounts();
  updatePanel();
  $('#gridEmpty').hidden = vis.length > 0 || photos.length === 0;
}

export function updateCounts() {
  const c = { all: photos.length, picks: 0, rejects: 0, unflagged: 0, ai: 0, stars: 0 };
  for (const p of photos) {
    if (p.flag === 1) c.picks++; else if (p.flag === -1) c.rejects++; else c.unflagged++;
    if (p.stars) c.stars++;
    if (p.ai && (p.ai.closed || p.ai.maybeClosed || p.ai.blurry || (p.ai.group && !p.ai.best))) c.ai++;
  }
  for (const b of $$('[data-filter]')) {
    b.querySelector('b').textContent = c[b.dataset.filter];
    b.classList.toggle('on', b.dataset.filter === S.filter);
  }
}

let anchor = null;
export function select(p, e = {}) {
  const vis = visiblePhotos();
  if (e.shiftKey && anchor) {
    const a = vis.indexOf(anchor), b = vis.indexOf(p);
    if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) S.selected.add(vis[i].id);
  } else if (e.metaKey || e.ctrlKey) {
    S.selected.has(p.id) ? S.selected.delete(p.id) : S.selected.add(p.id);
    anchor = p;
  } else {
    S.selected = new Set([p.id]);
    anchor = p;
  }
  const prev = S.current;
  S.current = p;
  if (prev) updateCard(prev);
  for (const q of vis) updateCard(q);
  cardOf(p)?.scrollIntoView({ block: 'nearest' });
  updatePanel();
  if (loupeOpen) showLoupe(p);
}

function targets() {
  const sel = photos.filter((p) => S.selected.has(p.id));
  return sel.length ? sel : S.current ? [S.current] : [];
}
export function setFlag(v) {
  const t = targets(), before = visiblePhotos().indexOf(S.current);
  for (const p of t) { p.flag = v; p.userFlagged = true; }
  afterFlag(t, before);
}
export function setStars(n) {
  const t = targets(), before = visiblePhotos().indexOf(S.current);
  for (const p of t) p.stars = n;
  afterFlag(t, before);
}
function afterFlag(t, before) {
  t.forEach(updateCard);
  updateCounts();
  emit('flags');
  const vis = visiblePhotos();
  if (S.current && !vis.includes(S.current)) {
    // it left the current filter (e.g. rejected while viewing Picks): show the next one
    renderGrid();
    if (vis.length) select(vis[Math.min(Math.max(0, before), vis.length - 1)]);
  } else if (t.length === 1 && $('#autoAdvance').checked) move(1);
  else updatePanel();
  if (loupeOpen && S.current) showLoupe(S.current);
}
export function move(d) {
  const vis = visiblePhotos();
  if (!vis.length) return;
  let i = S.current ? vis.indexOf(S.current) : -1;
  i = Math.min(vis.length - 1, Math.max(0, i + d));
  select(vis[i]);
}
function gridCols() {
  const g = grid(), first = g.firstElementChild;
  if (!first) return 1;
  return Math.max(1, Math.round(g.clientWidth / first.getBoundingClientRect().width));
}

// ------------------------------------------------------------------ side panel
function updatePanel() {
  const p = S.current, box = $('#cullInfo');
  if (!p) { box.innerHTML = '<p class="muted">Select a photo.</p>'; return; }
  const m = p.meta || {};
  const notes = aiNotes(p);
  box.innerHTML = `
    <div class="info-img"><img src="${p.previewURL || p.thumbURL || ''}" alt=""></div>
    <div class="faces"></div>
    <div class="nm">${p.name}</div>
    <div class="muted small">${[m.make && m.model ? `${m.make} ${m.model}` : '', m.iso ? 'ISO ' + m.iso : '', fmtShutter(m.shutter), m.aperture ? 'f/' + (+m.aperture).toFixed(1) : '', m.focal ? Math.round(m.focal) + 'mm' : ''].filter(Boolean).join(' · ')}</div>
    <div class="muted small">${p.time ? new Date(p.time).toLocaleString() : ''}</div>
    <div class="notes">${p.ai ? (notes.length ? notes.map(([sh, t, c]) => `<div><i class="pill ${c}">${sh}</i> ${t}</div>`).join('') : '<div><i class="pill good">OK</i> Sharp, eyes open</div>') : '<div class="muted">Analysing…</div>'}</div>`;
  // eye-check crops: each face, big
  if (p.raw && p.raw.faces.length && p.previewURL) {
    const img = new Image();
    img.onload = () => {
      const fbox = box.querySelector('.faces');
      if (!fbox || S.current !== p) return;
      const sc = img.naturalWidth / (p.previewW || img.naturalWidth);
      for (const f of p.raw.faces.slice(0, 6)) {
        const c = document.createElement('canvas'), b = f.box;
        c.width = 120; c.height = 120;
        const s = Math.max(b.w, b.h) * 1.15 * sc;
        c.getContext('2d').drawImage(img, (b.x + b.w / 2) * sc - s / 2, (b.y + b.h / 2) * sc - s / 2, s, s, 0, 0, 120, 120);
        c.title = f.l > 0.5 && f.r > 0.5 ? 'Eyes closed' : 'Eyes open';
        if (f.l > 0.5 && f.r > 0.5) c.className = 'closed';
        fbox.appendChild(c);
      }
    };
    img.src = p.previewURL;
  }
}

// ------------------------------------------------------------------ loupe (big view for culling)
let loupeOpen = false;
export function openLoupe(p) { loupeOpen = true; $('#loupe').hidden = false; select(p); showLoupe(p); }
export function closeLoupe() { loupeOpen = false; $('#loupe').hidden = true; }
export const isLoupeOpen = () => loupeOpen;
function showLoupe(p) {
  $('#loupeImg').src = p.previewURL || p.thumbURL || '';
  $('#loupeBadge').textContent = (p.flag === 1 ? '✓ Pick  ' : p.flag === -1 ? '✕ Reject  ' : '') + (p.stars ? '★'.repeat(p.stars) + '  ' : '') + aiNotes(p).map((n) => n[1]).join(' · ');
  $('#loupeBadge').className = 'loupe-badge ' + (p.flag === 1 ? 'pick' : p.flag === -1 ? 'reject' : '');
}

// ------------------------------------------------------------------ wiring
export function initCull() {
  for (const b of $$('[data-filter]')) b.onclick = () => { S.filter = b.dataset.filter; renderGrid(); emit('filter'); };
  $('#btnAutoCull').onclick = () => {
    const pending = photos.filter((p) => !p.ai).length;
    if (pending) { toast(`Still analysing ${pending} photo${pending > 1 ? 's' : ''} — try again in a moment.`); return; }
    const r = autoCull();
    toast(`AI picked ${r.picks} and rejected ${r.rejects}. Photos you'd already flagged were left alone. Check the Rejects filter before exporting.`, 6000);
    emit('flags');
  };
  $('#thumbSize').oninput = (e) => grid().style.setProperty('--thumb', e.target.value + 'px');
  $('#loupe').addEventListener('click', (e) => { if (e.target.id === 'loupe' || e.target.id === 'loupeImg') closeLoupe(); });
  $('#btnLoupePrev').onclick = (e) => { e.stopPropagation(); move(-1); };
  $('#btnLoupeNext').onclick = (e) => { e.stopPropagation(); move(1); };
  for (const b of $$('[data-flag]')) b.onclick = () => setFlag(+b.dataset.flag);
  for (const b of $$('[data-stars]')) b.onclick = () => setStars(+b.dataset.stars);
  $('#btnEditThis').onclick = () => S.current && emit('edit', S.current);
  on('photo-updated', (p) => { updateCard(p); if (S.current === p) updatePanel(); updateCounts(); });
}

export function cullKey(e) {
  const k = e.key;
  if (k === 'p' || k === 'P') setFlag(1);
  else if (k === 'x' || k === 'X') setFlag(-1);
  else if (k === 'u' || k === 'U') setFlag(0);
  else if (/^[0-5]$/.test(k)) setStars(+k);
  else if (k === 'ArrowRight') move(1);
  else if (k === 'ArrowLeft') move(-1);
  else if (k === 'ArrowDown' && !loupeOpen) move(gridCols());
  else if (k === 'ArrowUp' && !loupeOpen) move(-gridCols());
  else if (k === ' ' || k === 'Enter' && !e.metaKey) { if (S.current) loupeOpen ? closeLoupe() : openLoupe(S.current); }
  else if (k === 'Escape') closeLoupe();
  else if ((k === 'e' || k === 'E') && S.current) emit('edit', S.current);
  else if ((k === 'a' || k === 'A') && (e.metaKey || e.ctrlKey)) { visiblePhotos().forEach((p) => S.selected.add(p.id)); renderGrid(); }
  else return false;
  return true;
}
