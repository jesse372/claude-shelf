// Cull check (Process shoot, before any editing): the wedding as moments, one tap to drop or restore a whole moment.
//
// Why a check and not a smarter automatic cull (2026-11-06, 21 delivered shoots / 26,649 RAWs, leave-one-wedding-out):
// which photos Jesse delivers is barely predictable from the photo - the app's analysis + burst/pacing features AUC 0.59,
// an image network on the previews 0.55, both 0.62; picking the "best 60 per hour" only 64% are ones he delivered (55% by
// chance). His drops are mostly WHOLE moments (only 18-43% are near-copies of a delivered frame), i.e. story choices.
// So Sculpt shows the moments and he drops the ones he wouldn't deliver; every decision is saved (kind 'cull') to learn
// his taste, the same route that works for exposure.
// His rules (2026-11-05): "60+ images for every hour shot" and "at least one of every clear group/family photo" - the
// counter shows photos per hour against 60, and a group set-up can't lose its last frame.
import { $, photos, S, emit, toast } from './state.js';

const MOMENT_SIM = 0.9, MOMENT_GAP = 60e3;          // frames of one moment: fingerprint >= 0.9, <= 60 s apart (chained)
const SET_SIM = 0.8, SET_GAP = 300e3, SET_MIN = 3;   // a group set-up: posed frames joined while >= 0.8 within 5 min, 3+ frames
const PER_HOUR = 60;

const unit = (e) => { if (!e) return null; let n = 0; for (const v of e) n += v * v; n = Math.sqrt(n) || 1; return Float32Array.from(e, (v) => v / n); };
const dot = (a, b) => { if (!a || !b) return 0; let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** A clear posed group: 3+ roughly front-on faces of similar size (tools: scratch group_check2.py - he delivered from 90%
 * of such set-ups, 100% in most weddings). */
export function isPosedGroup(p) {
  const r = p.raw; if (!r || !r.faces || !r.W || !r.H) return false;
  const A = r.W * r.H, F = r.faces.filter((f) => f && f.box && (f.box.w * f.box.h) / A > 0.0015).map((f) => ({ a: (f.box.w * f.box.h) / A, yaw: Math.abs(f.yaw || 0) }));
  if (F.length < 3 || F.some((f) => f.yaw >= 25)) return false;
  const as = F.map((f) => f.a); return Math.max(...as) / Math.min(...as) <= 4;
}

/** Moments, group set-ups and shooting hours of a shoot. */
export function moments(list) {
  const ps = list.filter((p) => p.raw && !p.failed).sort((a, b) => (a.time ?? 0) - (b.time ?? 0) || a.name.localeCompare(b.name));
  const E = new Map(ps.map((p) => [p, unit(p.raw.emb)]));
  const out = []; let cur = null;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i], q = ps[i - 1];
    if (!cur || !(p.time != null && q.time != null && p.time - q.time <= MOMENT_GAP && dot(E.get(p), E.get(q)) >= MOMENT_SIM)) { cur = { frames: [], setup: -1 }; out.push(cur); }
    cur.frames.push(p);
  }
  // group set-ups
  const setups = [];
  for (const p of ps) {
    if (!isPosedGroup(p)) continue;
    const s = setups.find((s) => { const l = s[s.length - 1]; return p.time != null && l.time != null && p.time - l.time <= SET_GAP && dot(E.get(p), E.get(l)) >= SET_SIM; });
    s ? s.push(p) : setups.push([p]);
  }
  const groups = setups.filter((s) => s.length >= SET_MIN);
  const setupOf = new Map(); groups.forEach((s, k) => s.forEach((p) => setupOf.set(p, k)));
  for (const m of out) { const k = m.frames.map((p) => setupOf.get(p)).find((k) => k != null); if (k != null) m.setup = k; }
  let ms = 0; for (let i = 1; i < ps.length; i++) ms += Math.min(Math.max(0, (ps[i].time ?? 0) - (ps[i - 1].time ?? 0)), 600e3);
  return { moments: out, groups, hours: ms / 3600e3 };
}

const best = (frames) => [...frames].sort((a, b) => (b.flag === 1) - (a.flag === 1) || (b.ai?.score ?? 0) - (a.ai?.score ?? 0))[0];

/** Resolves when he presses Done (true) or Skip (false); flags are changed in place (flag 1 = processed, -1 = dropped). */
export async function cullCheck(list) {
  const { moments: M, groups, hours } = moments(list);
  if (!M.length) return false;
  const prev = new Map(list.map((p) => [p, p.flag]));
  const auto = new Map(list.map((p) => [p, p.flag]));
  const kept = (m) => m.frames.some((p) => p.flag === 1);
  $('#apSetup').hidden = true; $('#apRun').hidden = true; $('#apCheck').hidden = true; $('#apCullCheck').hidden = false;
  const grid = $('#apCullGrid'); grid.innerHTML = '';
  const cards = new Map();
  const count = () => {
    const n = list.filter((p) => p.flag === 1).length, ph = hours > 0.05 ? n / hours : 0;
    const gk = groups.filter((s) => s.some((p) => p.flag === 1)).length;
    const el = $('#apCullCount');
    el.textContent = `${n} photos kept · ${hours > 0.05 ? Math.round(ph) + ' per hour (goal 60+)' : ''}${groups.length ? ` · ${gk} of ${groups.length} group set-ups` : ''} · ${M.filter(kept).length} of ${M.length} moments`;
    el.classList.toggle('warn', hours > 0.05 && ph < PER_HOUR);
  };
  const draw = (m) => {
    const c = cards.get(m); if (!c) return;
    const on = kept(m); c.el.classList.toggle('off', !on);
    const b = best(m.frames); if (b.thumbURL && c.img.getAttribute('src') !== b.thumbURL) c.img.src = b.thumbURL;
    c.n.textContent = `${m.frames.filter((p) => p.flag === 1).length || 0}/${m.frames.length}`;
  };
  const toggle = (m) => {
    if (kept(m)) {
      // a group set-up never loses its last frame (Jesse: "at least one of every clear group/family photo")
      const g = m.setup >= 0 ? groups[m.setup] : null;
      const keepOne = g && !g.some((p) => p.flag === 1 && !m.frames.includes(p));
      for (const p of m.frames) { prev.set(p, p.flag); p.flag = -1; p.userFlagged = true; }
      if (keepOne) { const b = best(m.frames.filter((p) => g.includes(p))); b.flag = 1; toast('Group photo — its best frame stays in.'); }
    } else {
      let any = false;
      for (const p of m.frames) { const f = prev.get(p); p.flag = f === 1 ? 1 : -1; p.userFlagged = true; any ||= p.flag === 1; }
      if (!any) best(m.frames).flag = 1;                     // nothing was picked here before: its best frame
    }
    draw(m); count();
  };
  let hour = null;
  for (const m of M) {
    const t = m.frames[0].time;
    const h = t != null ? new Date(t).getHours() : null;
    if (h !== hour) { hour = h; const hd = document.createElement('div'); hd.className = 'cull-hour'; hd.textContent = h == null ? 'No time' : `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`; grid.append(hd); }
    const el = document.createElement('button'); el.type = 'button'; el.className = 'cull-moment' + (m.setup >= 0 ? ' grp' : '');
    const img = document.createElement('img'); img.loading = 'lazy'; img.alt = '';
    const n = document.createElement('i'); n.className = 'n';
    el.title = `${m.frames.length} frame${m.frames.length > 1 ? 's' : ''}${m.setup >= 0 ? ' · group photo' : ''} — tap to drop or bring back`;
    el.append(img, n);
    if (m.setup >= 0) { const g = document.createElement('i'); g.className = 'g'; g.textContent = 'group'; el.append(g); }
    el.onclick = () => toggle(m);
    grid.append(el); cards.set(m, { el, img, n }); draw(m);
  }
  count();
  const ok = await new Promise((resolve) => { $('#apCullDone').onclick = () => resolve(true); $('#apCullSkip').onclick = () => resolve(false); });
  $('#apCullCheck').hidden = true; grid.innerHTML = ''; $('#apCullDone').onclick = $('#apCullSkip').onclick = null;
  if (!ok) { for (const p of list) p.flag = auto.get(p); return false; }
  // his decisions, for learning his cull (kind 'cull'; the exposure retraining skips these rows)
  const items = [];
  M.forEach((m, k) => { for (const p of m.frames) items.push({ kind: 'cull', name: p.name, time: p.time ?? null, moment: k, frames: m.frames.length, group: m.setup >= 0, auto: auto.get(p), kept: p.flag === 1, changed: auto.get(p) !== p.flag, job: S.job?.id || null,
    ai: p.ai ? { faces: p.ai.faces, sharpness: p.ai.sharpness, closed: !!p.ai.closed, blurry: !!p.ai.blurry, accident: !!p.ai.accident, best: !!p.ai.best, score: p.ai.score ?? null } : null }); });
  for (let i = 0; i < items.length; i += 1500) fetch('api/corrections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items.slice(i, i + 1500) }) }).catch(() => {});
  emit('flags');
  return true;
}
