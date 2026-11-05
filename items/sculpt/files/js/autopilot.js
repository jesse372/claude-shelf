// Auto-pilot: one button for photographers — AI cull → colour in your style → natural retouch →
// export the picks. Everything stays editable afterwards in Edit mode.
import { $, photos, S, toast, busy, emit } from './state.js';
import { startDelivery, Uploader, resumeDelivery, sendingAvailable } from './delivery.js';
import { autoCull, renderGrid } from './cull.js';
import { exportOne, pickFolder } from './exporter.js';
import { loadStyle, describeStyle, hasStyle } from './style-store.js';
import { PROFILES, profileById, previewLearned } from './profiles.js';
import { loadPhoto, renderer } from './editor.js';

let cancel = false;

export async function openAutopilot() {
  if (!photos.length) { toast('Add the shoot first (drop the card or folder).'); return; }
  if (photos.some((p) => !p.file && p.flag !== -1)) { emit('need-files'); toast('Reconnect to the original photos first — use the button at the top.'); return; }
  if (S.ensureDetails && !(await S.ensureDetails())) return;          // couple, date & venue name the delivery
  const st = await loadStyle();
  $('#apStyle').textContent = hasStyle(st) ? describeStyle(st) : 'No style learned yet — Auto tone will be used. (Teach it in Edit → Colour → My style.)';
  $('#apSetup').hidden = false; $('#apRun').hidden = true; $('#apDone').hidden = true;
  const canSend = await sendingAvailable();                  // hidden until cloud storage is switched on
  $('#apSend').closest('.opt').hidden = !canSend;
  if (!canSend) $('#apSend').checked = false; else $('#apSend').checked = localStorage.getItem('jc.apSend') !== '0';
  $('#autoDlg').showModal();
}

const fmtTime = (s) => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`);

/** Keep the computer awake while processing (a sleeping laptop stops the browser). */
let lock = null, wantAwake = false;
async function keepAwake(on) {
  wantAwake = on;
  try {
    if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
    if (!on && lock) { const l = lock; lock = null; await l.release(); }
  } catch { /* not allowed here: carry on */ }
}
document.addEventListener('visibilitychange', () => { if (wantAwake && document.visibilityState === 'visible') keepAwake(true); });

/**
 * Process shoot. Progress is saved after every photo (job.run), so if the tab closes, the browser crashes or the
 * laptop dies, "Continue" (resume = the saved job.run) carries on where it stopped: same picks, same folder, same
 * Pixieset delivery — finished photos are not redone.
 */
async function run(resume = null) {
  let o, dir;
  if (resume) ({ o, dir } = resume);
  else {
    const lookSel = $('#apLook').value;
    o = { cull: $('#apCull').checked, colour: $('#apColour').checked && lookSel === 'style', profile: $('#apColour').checked && lookSel !== 'style' ? lookSel : null,
      retouch: $('#apRetouch').checked, shape: $('#apShape').checked };
    try { dir = await pickFolder(); } catch { return; }      // cancelled the folder picker
  }
  if (!$('#autoDlg').open) $('#autoDlg').showModal();
  // brightness check (trained style): the one choice the style can't know — how bright this wedding should be
  let brightness = resume ? (resume.brightness ?? S.job?.brightness ?? 0) : 0;
  if (!resume && o.profile && profileById(o.profile)?.learned?.gbm) {
    const b = await brightnessCheck(o.profile);
    if (b === null) { $('#autoDlg').close(); return; }
    brightness = b;
  }
  $('#apSetup').hidden = true; $('#apCheck').hidden = true; $('#apRun').hidden = false; $('#apDone').hidden = true;
  cancel = false; sending = null;
  keepAwake(true);
  const job = (patch) => (S.jobUpdate ? S.jobUpdate(patch).catch(() => {}) : Promise.resolve());
  // 1. wait for the AI analysis of every photo
  for (;;) {
    const done = photos.filter((p) => p.ai).length;
    if (done >= photos.length) break;
    $('#apStatus').textContent = `Waiting for AI analysis… ${done}/${photos.length}`;
    $('#apBar').value = done / photos.length * 0.1;
    await new Promise((r) => setTimeout(r, 500));
    if (cancel) { await job({ run: null }); return finish([], [], 0, dir, true); }
  }
  // 2. cull (a resumed run keeps the picks it started with)
  let list;
  if (resume) list = resume.keys.map((k) => photos.find((p) => p.key === k)).filter(Boolean);
  else {
    if (o.cull) autoCull();
    list = photos.filter((p) => p.flag === 1);
    if (!list.length) list = photos.filter((p) => p.flag !== -1);
    emit('flags'); renderGrid();
  }
  const R = resume || { o, dir: dir || null, keys: list.map((p) => p.key), done: {}, send: $('#apSend').checked && !!S.job, started: Date.now(), brightness };
  const failed = [], notes = [];
  const names = Object.values(R.done);
  // 3. send to Pixieset as we go (uploads run alongside the editing)
  if (R.send) {
    if (!R.deliveryId) {
      const d = await startDelivery(S.job, list.length);
      if (d && d.id) R.deliveryId = d.id;
      else { R.send = false; notes.unshift(`Not sent to Pixieset: ${d?.error || 'not available'} — drag the folder into Pixieset instead.`); }
    }
    if (R.deliveryId) sending = { id: R.deliveryId, up: new Uploader(R.deliveryId), names };
  }
  await job({ run: { ...R }, status: 'processing', brightness });
  let cur = null;
  const quickOn = !resume && !!(o.profile && profileById(o.profile)?.learned?.unsure);
  const opts = { dir, quality: 0.92, used: new Set(names.map((n) => n.toLowerCase())), safety: true,
    onSaved: (name, blob) => { names.push(name); R.done[cur.key] = name; if (sending) sending.up.add(name, blob); } };
  const todo = list.filter((p) => !R.done[p.key]);
  const before = list.length - todo.length;
  const sendNote = () => (sending ? ` · ${before + sending.up.sent.size} of ${list.length} sent to Pixieset` : '');
  if (before) notes.push(`Continued after an interruption: ${before} photo${before === 1 ? ' was' : 's were'} already finished.`);
  // 4a. the look first (trained styles that can rank their own doubt): every pick's tone from a quick half-size
  // development, then the quick check - so the glance happens up front and each photo is exported once, with the
  // nudges already in (before: the check came after the export and every nudged photo was exported twice)
  if (quickOn) {
    const t1 = performance.now();
    for (let i = 0; i < todo.length; i++) {
      if (cancel) { await job({ run: null }); return finish([], [], 0, dir, true, notes); }
      const p = todo[i];
      const el = (performance.now() - t1) / 1000, eta = i ? el / i * (todo.length - i) : 0;
      $('#apStatus').textContent = `Choosing the look ${i + 1} of ${todo.length} — ${p.name}` + (i ? ` · about ${fmtTime(eta)} left` : '');
      $('#apBar').value = 0.1 + 0.2 * i / todo.length;
      try {
        p.pendingAuto = { profile: o.profile, brightness };
        if (await loadPhoto(p, { interactive: false, quick: true })) p.qthumb = renderer.thumbnail(200);   // base image; the card applies the style
      } catch (e) { console.error(e); }
      busy(null);
    }
    const fixed = await quickCheck(todo.filter((p) => p.qthumb && p.edit.look?.tone), o.profile);
    for (const p of todo) { delete p.qthumb; if (p.edit.look?.tone) p.toneChecked = true; }
    const leans = [quickCheck.lean ? `${quickCheck.lean > 0 ? '+' : '−'}${(Math.abs(quickCheck.lean) / 40).toFixed(2)} stop` : '', quickCheck.tlean ? `${quickCheck.tlean > 0 ? 'warm +' : 'cool −'}${Math.abs(quickCheck.tlean)}` : ''].filter(Boolean).join(', ');
    if (fixed.length) notes.push(leans
      ? `Quick check: your nudges reached ${fixed.length} photo${fixed.length === 1 ? '' : 's'} — carried across each scene, and the wedding's lean (${leans}, from your nudges) went to the scenes you didn't get to — applied before the export, and the nudges saved so the style learns from them.`
      : `Quick check: your nudges reached ${fixed.length} photo${fixed.length === 1 ? '' : 's'} (carried across each scene) — applied before the export, and saved so the style learns from them.`);
    $('#apQuick').hidden = true; $('#apRun').hidden = false;
  }
  // 4. edit + export each pick (skipping any finished before an interruption)
  const b0 = quickOn ? 0.3 : 0.1;
  const t0 = performance.now();
  for (let i = 0; i < todo.length; i++) {
    if (cancel) { await job({ run: null }); return finish(list.slice(0, before + i), failed, before + i, dir, true, notes); }
    const p = todo[i], k = before + i;
    const el = (performance.now() - t0) / 1000, eta = i ? el / i * (todo.length - i) : 0;
    $('#apStatus').textContent = `Editing & exporting ${k + 1} of ${list.length} — ${p.name}` + (i ? ` · about ${fmtTime(eta)} left` : '') + sendNote();
    $('#apBar').value = b0 + (0.97 - b0) * k / list.length;
    try {
      if (o.colour || o.profile || o.retouch || o.shape) p.pendingAuto = { colour: o.colour, profile: o.profile, retouch: o.retouch, shape: o.shape, brightness, keepTone: !!p.toneChecked };
      cur = p;
      await exportOne(p, opts);
      p.editedOnce = true;
      if (p.autoNotes) for (const n of p.autoNotes) if (/child|group/.test(n)) notes.push(`${p.name}: ${n}`);
      if (p.safety) notes.push(`${p.name}: re-edited more gently (${p.safety.fixed.join(', ')})`);
      emit('photo-updated', p);
    } catch (e) { console.error(e); failed.push(p.name); }
    busy(null);
    await job({ run: { ...R }, progress: [k + 1, list.length] });             // saved after every photo
  }
  // 5. let the last uploads finish, then hand the gallery over (anything an interruption lost is re-read from the folder)
  if (sending) {
    const tick = setInterval(() => { $('#apStatus').textContent = `Sending to Pixieset… ${sending.up.sent.size} of ${names.length}`; $('#apBar').value = 0.97 + 0.03 * sending.up.sent.size / Math.max(1, names.length); }, 400);
    await sending.up.drain();
    clearInterval(tick);
    $('#apStatus').textContent = 'Checking every photo arrived…';
    const res = await resumeDelivery({ id: sending.id, files: names, dir }, (n, of) => { $('#apStatus').textContent = `Sending the rest to Pixieset… ${n} of ${of}`; }).catch((e) => ({ ok: false, error: e.message }));
    sending.ok = res.ok;
    await job({ delivery: { id: sending.id, status: res.ok ? 'ready' : 'incomplete', files: names, dir: dir || null, at: Date.now() } });
    if (!res.ok) notes.unshift(`${res.missing?.length || sending.up.failed.size} photo(s) didn't upload — open the job later and choose “Finish sending”.`);
  }
  await job({ run: null });
  finish(list, failed, list.length, dir, false, notes);
}

/**
 * Brightness check: eight photos from across the day in the trained style; Darker / Brighter shift the whole
 * wedding in quarter stops (instant previews on small copies). Resolves to the shift in stops, or null if cancelled.
 */
const stopsLabel = (b) => {
  if (!b) return 'Your usual';
  const n = Math.abs(b), q = Math.round(n * 4), whole = Math.floor(q / 4), frac = ['', '¼', '½', '¾'][q % 4];
  return `${whole || ''}${frac}${!whole && !frac ? '0' : ''} stop${n > 1 ? 's' : ''} ${b > 0 ? 'brighter' : 'darker'}`;
};
async function brightnessCheck(profileId) {
  $('#apSetup').hidden = true; $('#apRun').hidden = true; $('#apDone').hidden = true; $('#apCheck').hidden = false;
  const grid = $('#apCheckGrid'); grid.innerHTML = '';
  const pool = photos.filter((p) => p.file && p.flag !== -1).sort((a, b) => (a.time0 ?? a.time ?? a.order ?? 0) - (b.time0 ?? b.time ?? b.order ?? 0));
  const n = Math.min(8, pool.length), picks = Array.from({ length: n }, (_, i) => pool[Math.floor((i + 0.5) * pool.length / n)]);
  const shots = [];
  let b = 0;
  const draw = () => {
    $('#apCheckLabel').textContent = stopsLabel(b);
    for (const s of shots) { const img = previewLearned(profileId, s.thumb, { ...s.tone, exposure: (s.tone.exposure || 0) + b * 40 }); if (img) s.cv.getContext('2d').putImageData(img, 0, 0); }
  };
  const btns = ['#apDarker', '#apBrighter', '#apCheckOk'];
  btns.forEach((k) => { $(k).disabled = true; });
  for (let i = 0; i < picks.length; i++) {
    $('#apCheckStatus').textContent = `Preparing previews… ${i + 1} of ${picks.length}`;
    const p = picks[i];
    p.pendingAuto = { profile: profileId, brightness: 0 };
    if (!(await loadPhoto(p, { interactive: false, quick: true }))) continue;     // half-size development: enough for a preview
    const thumb = renderer.thumbnail(320), cv = document.createElement('canvas');
    cv.width = thumb.w; cv.height = thumb.h; cv.title = p.name; grid.append(cv);
    shots.push({ p, thumb, tone: { ...(p.edit.look?.tone || {}) }, cv });
    draw();
  }
  $('#apCheckStatus').textContent = shots.length ? '' : 'Couldn’t prepare previews — your usual brightness will be used.';
  btns.forEach((k) => { $(k).disabled = false; });
  return new Promise((resolve) => {
    const step = (d) => { b = Math.max(-3, Math.min(3, b + d)); draw(); };
    $('#apDarker').onclick = () => step(-0.25);
    $('#apBrighter').onclick = () => step(0.25);
    $('#apCheckOk').onclick = () => resolve(b);
    $('#apCheckCancel').onclick = () => resolve(null);
  });
}

/**
 * Quick check before the export: every photo of the wedding as a small preview in the trained look, grouped by scene with the
 * least-sure scenes first, with Darker / Brighter in quarter stops and Cooler / Warmer in 15-unit steps. A nudge on a
 * scene's first frame is carried to its other frames; any frame can be nudged on top. Resolves to the photos Jesse
 * changed — their exposure / warmth is updated (the export that follows uses it) and each change is saved as a training
 * example (/api/corrections).
 */
export const quickSettings = { page: 48 };     // cards per page (tests shrink it to exercise an early stop)
async function quickCheck(items, profileId) {
  quickCheck.lean = 0; quickCheck.tlean = 0;
  if (!items.length) return [];
  // Scenes: frames close in time with a similar scene fingerprint. One fix per scene, carried to its frames, lands the
  // whole wedding - how much depends on how tight a scene is. Simulated on unseen weddings (v7 guesses, 14k pairs,
  // scratch scenes95.py): sim 0.65 -> 82.8% within 1/3 stop looking at 0.38 cards per photo; sim 0.75 -> 90.1% at 0.55;
  // sim 0.85 -> 96.3% at 0.75 (> 2/3-stop misses 0.6%). Jesse (2026-11-05): "a minimum of 95% accuracy" -> 0.85.
  // Sculpt's own guesses can't be pooled this way (they share the same mistake across a scene) - the human anchor is
  // what makes it work.
  const DT = 0.15 * 3600e3, SIM = 0.85;
  const unit = (e) => { if (!e) return null; let n = 0; for (const v of e) n += v * v; n = Math.sqrt(n) || 1; return Float32Array.from(e, (v) => v / n); };
  const E = new Map(items.map((p) => [p, unit(p.raw && p.raw.emb)]));
  const sim = (a, b) => { const x = E.get(a), y = E.get(b); if (!x || !y) return 0; let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * y[i]; return s; };
  const byTime = [...items].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  const scenes = [], of = new Map();
  for (const p of byTime) {
    if (of.has(p)) continue;
    const sc = [p]; of.set(p, sc);
    for (const q of byTime) if (!of.has(q) && p.time != null && q.time != null && Math.abs(q.time - p.time) <= DT && sim(p, q) >= SIM) { sc.push(q); of.set(q, sc); }
    scenes.push(sc);
  }
  for (const sc of scenes) sc.anchor = sc[sc.length >> 1];
  scenes.sort((a, b) => Math.max(...b.map((p) => p.edit.look.tone.unsure || 0)) - Math.max(...a.map((p) => p.edit.look.tone.unsure || 0)));
  $('#apRun').hidden = true; $('#apQuick').hidden = false;
  const grid = $('#apQuickGrid'); grid.innerHTML = '';
  // Every photo gets a card (Jesse 2026-11-05: "99.9%" - one nudge per scene tops out near 96% because a few frames of
  // every scene differ from their anchor): grouped by scene, least-sure scene first, the anchor first and its frames after
  // it. A nudge on the anchor is carried to its frames (their cards redraw with it); a nudge on any other card sits on top
  // of what was carried, so most frames need a glance and no tap.
  // Warm/cool too: Jesse's warmth is within ~4 slider units across a scene while the style misses it by ~18 (14k pairs).
  const TSTEP = 15, TMAX = 4 * TSTEP, PAGE = quickSettings.page;
  // Softer / Punchier (Jesse 2026-11-05 on Steph & Josh: "Too much contrast and maybe whites"): one step = contrast -10,
  // highlights -20, whites -12 (render.js sliders, added on top of the style's tone), -2..+3 steps. Per-photo highlights /
  // whites are not predictable from the photo (tools/colour/hiwhites_macbook.py: LOWO no gain), so it is his tap.
  const SOFT = { contrast: -10, highlights: -20, whites: -12 }, SMIN = -2, SMAX = 3;
  const own = new Map();                                           // photo -> { e: stops, t: warmth units } tapped on its card
  const ofScene = new Map(); for (const sc of scenes) for (const p of sc) ofScene.set(p, sc);
  const carry = (p, sc) => (p === sc.anchor ? 1 : Math.max(0, sim(p, sc.anchor)));
  const eff = (p, sc) => { const a = own.get(sc.anchor) || { e: 0, t: 0, s: 0 }, o = own.get(p) || { e: 0, t: 0, s: 0 }, c = p === sc.anchor ? 0 : carry(p, sc); return { e: a.e * c + o.e, t: a.t * c + o.t, s: (a.s || 0) * c + (o.s || 0) }; };
  const order = [];
  for (const sc of scenes) { const byT = [...sc].sort((a, b) => (a.time ?? 0) - (b.time ?? 0)); order.push(sc.anchor, ...byT.filter((p) => p !== sc.anchor)); }
  const cards = new Map(); let shown = 0;
  const label = (d) => { const q = Math.round(Math.abs(d) * 4), w = Math.floor(q / 4), f = ['', '¼', '½', '¾'][q % 4]; return `${d > 0 ? '+' : '−'}${w || ''}${f}`; };
  const tlabel = (n) => (n ? `${n > 0 ? 'warm +' : 'cool −'}${Math.abs(n)}` : '');
  const softOf = (t, sv) => { const n = Math.round(sv * 2) / 2; if (!n) return {}; return Object.fromEntries(Object.entries(SOFT).map(([k, v]) => [k, Math.max(-100, Math.min(100, (t[k] || 0) + Math.round(v * n)))])); };
  const slabel = (sv) => { const n = Math.round(sv); return n ? (n > 0 ? `softer ${n > 1 ? '×' + n : ''}` : `punchier ${n < -1 ? '×' + -n : ''}`).trim() : ''; };
  const draw = (p) => {
    const c = cards.get(p); if (!c || !p.qthumb) return;              // thumbs are released once the check closes
    const sc = ofScene.get(p), { e, t: dt, s: sv } = eff(p, sc), t = p.edit.look.tone, dtt = Math.round(dt), soft = softOf(t, sv);
    const img = previewLearned(profileId, p.qthumb, { ...t, exposure: Math.max(-200, Math.min(200, (t.exposure || 0) + e * 40)), temp: Math.max(-100, Math.min(100, (t.temp || 0) + dtt)), ...soft });
    if (img) { c.cv.width = img.width; c.cv.height = img.height; c.cv.getContext('2d').putImageData(img, 0, 0); }
    const from = p === sc.anchor ? (sc.length > 1 ? `, carried to the ${sc.length - 1} other frame${sc.length > 2 ? 's' : ''} of this scene` : '') : (own.has(p) ? ' (your tap on top of the scene nudge)' : ' (carried from the first frame of this scene)');
    c.lab.textContent = Math.abs(e) >= 0.125 ? label(e) : ''; c.lab.title = e ? `${label(e)} stop${from}` : '';
    c.slab.textContent = slabel(sv); c.slab.title = Math.abs(sv) >= 0.5 ? `${slabel(sv)}: contrast, highlights and whites${from}` : '';
    c.tlab.textContent = tlabel(dtt); c.tlab.title = dtt ? `warmth ${dtt > 0 ? '+' : ''}${dtt}${from}` : '';
  };
  const redraw = (sc) => { for (const p of sc) draw(p); };
  const more = () => {
    for (const p of order.slice(shown, shown + PAGE)) {
      const sc = ofScene.get(p), first = p === sc.anchor;
      const card = document.createElement('div'); card.className = 'qcard' + (first ? '' : ' qfollow');
      const cv = document.createElement('canvas'); cv.title = p.name;
      if (sc.length > 1) { const b = document.createElement('i'); b.className = 'qmore'; b.textContent = first ? `scene of ${sc.length}` : '↳ same scene'; b.title = first ? `nudge this one and the ${sc.length - 1} other frame${sc.length > 2 ? 's' : ''} of this scene follow` : 'follows the first frame of its scene; a tap here adds to that'; card.append(b); }
      const row = document.createElement('div'); row.className = 'qrow';
      const dn = document.createElement('button'), up = document.createElement('button'), lab = document.createElement('span');
      dn.type = up.type = 'button'; dn.className = up.className = 'ghost qbtn'; dn.textContent = 'Darker'; up.textContent = 'Brighter'; dn.dataset.q = 'dn'; up.dataset.q = 'up';
      const row2 = document.createElement('div'); row2.className = 'qrow';
      const cool = document.createElement('button'), warm = document.createElement('button'), tlab = document.createElement('span');
      cool.type = warm.type = 'button'; cool.className = warm.className = 'ghost qbtn'; cool.textContent = 'Cooler'; warm.textContent = 'Warmer'; cool.dataset.q = 'cool'; warm.dataset.q = 'warm';
      const row3 = document.createElement('div'); row3.className = 'qrow';
      const punch = document.createElement('button'), softB = document.createElement('button'), slab = document.createElement('span');
      punch.type = softB.type = 'button'; punch.className = softB.className = 'ghost qbtn'; punch.textContent = 'Punchier'; softB.textContent = 'Softer'; punch.dataset.q = 'punch'; softB.dataset.q = 'soft';
      softB.title = 'less contrast, gentler highlights and whites'; punch.title = 'more contrast, brighter highlights and whites';
      const tap = (de, dt, ds = 0) => { const o = own.get(p) || { e: 0, t: 0, s: 0 }; o.e = Math.max(-3, Math.min(3, o.e + de)); o.t = Math.max(-TMAX, Math.min(TMAX, o.t + dt)); o.s = Math.max(SMIN, Math.min(SMAX, (o.s || 0) + ds)); own.set(p, o); first ? redraw(sc) : draw(p); };
      dn.onclick = () => tap(-0.25, 0); up.onclick = () => tap(0.25, 0); cool.onclick = () => tap(0, -TSTEP); warm.onclick = () => tap(0, TSTEP);
      punch.onclick = () => tap(0, 0, -1); softB.onclick = () => tap(0, 0, 1);
      row.append(dn, lab, up); row2.append(cool, tlab, warm); row3.append(punch, slab, softB); card.append(cv, row, row2, row3); grid.append(card); cards.set(p, { cv, lab, tlab, slab }); draw(p);
    }
    shown = Math.min(order.length, shown + PAGE);
    $('#apQuickMore').hidden = shown >= order.length;
    $('#apQuickCount').textContent = `${shown} of ${order.length} photos shown (${scenes.length} scene${scenes.length === 1 ? '' : 's'}) — least sure scenes first`;
  };
  more();
  const ok = await new Promise((resolve) => {
    $('#apQuickMore').onclick = more;
    $('#apQuickDone').onclick = () => resolve(true);
    $('#apQuickSkip').onclick = () => resolve(false);
  });
  $('#apQuick').hidden = true; $('#apRun').hidden = false;
  grid.innerHTML = ''; $('#apQuickMore').onclick = $('#apQuickDone').onclick = $('#apQuickSkip').onclick = null;   // nothing can redraw after this
  if (!ok) return [];
  const fixed = new Set(), ex = [];
  for (const sc of scenes) {
    for (const p of sc) {
      const { e, t: dt, s: sv } = eff(p, sc), dd = Math.round(e * 40), dtt = Math.round(dt), ds = Math.round(sv * 2) / 2; if (!dd && !dtt && !ds) continue;
      const t = p.edit.look.tone, c = carry(p, sc);
      const chosen = Math.max(-200, Math.min(200, (t.exposure || 0) + dd)), chosenTemp = Math.max(-100, Math.min(100, (t.temp || 0) + dtt));
      // dExp / dTemp say which slider changed (0 = left as predicted; retraining learns only from the changed one);
      // anchor = his own hand set this card (the scene's first frame, or a frame he tapped) - a true label; carried
      // frames count less in retraining (0.5 x carry).
      ex.push({ name: p.name, x: p.toneX || null, net: p.netStops ?? null, predicted: t.exposure, chosen, dExp: dd, predictedTemp: t.temp ?? 0, chosenTemp, dTemp: dtt,
        unsure: t.unsure ?? null, anchor: p === sc.anchor || own.has(p), carry: +c.toFixed(2), job: S.job?.id || null,
        dSoft: ds, softSteps: SOFT });                     // Softer/Punchier steps (not used by retraining yet)
      Object.assign(t, softOf(t, ds));
      t.exposure = chosen; t.temp = chosenTemp; p.pendingAuto = null; fixed.add(p);
    }
  }
  if (ex.length) fetch('api/corrections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: ex }) }).catch(() => {});
  // The wedding's own lean: every wedding carries a brightness offset the style can't know from the photos (leave-one-
  // wedding-out: a constant per wedding is worth +5 points within 1/3 stop; estimated from ~20 nudges, +3-4 and fewer
  // dark misses). The median of the scene nudges over the scenes he looked at (untouched = 0), shrunk towards 0, goes to
  // every scene he did NOT see (he stopped before its page). A scene he saw and left alone looked right to him - the
  // 150-frame held-out harness (2026-11-05) lost 1.3 points when the lean also moved those. Not saved as training
  // examples - they are not his judgement.
  // The same for warmth (leave-one-wedding-out: 20 warmth nudges shrunk this way take the untouched scenes' median miss
  // from 18 to 15.6 slider units).
  const looked = scenes.filter((sc) => cards.has(sc.anchor));
  if (looked.length >= 4) {
    const median = (vals) => { const ds = [...vals].sort((a, b) => a - b), m = ds.length >> 1; return ds.length % 2 ? ds[m] : (ds[m - 1] + ds[m]) / 2; };
    const shrink = looked.length / (looked.length + 5), at = (sc) => own.get(sc.anchor) || { e: 0, t: 0 };
    const off = Math.round(median(looked.map((sc) => at(sc).e)) * shrink * 40);
    const toff = Math.round(median(looked.map((sc) => at(sc).t)) * shrink);
    const unseen = scenes.filter((sc) => !cards.has(sc.anchor));   // seen scenes: his call stands, nudged or not
    if (unseen.length) { quickCheck.lean = off; quickCheck.tlean = toff; }   // (the summary names a lean only if it reached photos)
    for (const sc of unseen) {
      const e = off, w = toff;
      if (!e && !w) continue;
      for (const p of sc) {
        const t = p.edit.look.tone;
        if (e) t.exposure = Math.max(-200, Math.min(200, (t.exposure || 0) + e));
        if (w) t.temp = Math.max(-100, Math.min(100, (t.temp || 0) + w));
        p.pendingAuto = null; fixed.add(p);
      }
    }
  }
  return [...fixed];
}

/** Carry on with an interrupted Process shoot (called from the job's "Continue" bar, within the click). */
export async function resumeAutopilot(R) {
  if (photos.some((p) => !p.file && R.keys.includes(p.key))) { emit('need-files'); toast('Reconnect to the original photos first — use the button at the top.'); return false; }
  if (R.dir && (await R.dir.queryPermission?.({ mode: 'readwrite' })) !== 'granted' && (await R.dir.requestPermission?.({ mode: 'readwrite' })) !== 'granted') {
    toast('Allow access to the export folder to continue.'); return false;
  }
  run(R);
  return true;
}
let sending = null;

function finish(list, failed, n, dir, cancelled, notes = []) {
  busy(null); keepAwake(false);
  if (S.jobUpdate) {
    const ok0 = n - failed.length;
    S.job.status = cancelled ? 'ready' : 'delivered';
    S.jobUpdate(cancelled ? { status: 'ready', progress: null } : { status: 'delivered', progress: null, delivered: { at: Date.now(), count: ok0, folder: dir ? dir.name : 'Downloads' } }).catch(() => {});
  }
  $('#apRun').hidden = true; $('#apDone').hidden = false;
  $('#apNext').textContent = sending && !cancelled
    ? (sending.ok ? 'Sent to Pixieset — it will appear there as a hidden collection for Jesse to check and publish.' : 'Not everything reached Pixieset yet — see below.')
    : 'Next: drag the folder into the client’s Pixieset gallery.';
  const ok = n - failed.length;
  const rej = photos.filter((p) => p.flag === -1).length;
  $('#apSummary').innerHTML =
    `<b>${cancelled ? 'Stopped. ' : ''}${ok} photo${ok === 1 ? '' : 's'} finished</b>${dir ? ` in “${dir.name}”` : ' in Downloads'}.` +
    `<br>${photos.length} in the shoot · ${list.length} picked · ${rej} rejected by the cull.` +
    (failed.length ? `<br><span class="warn">Couldn’t finish: ${failed.join(', ')}</span>` : '') +
    (notes.length ? `<br><span class="muted small">${notes.slice(0, 8).join('<br>')}</span>` : '');
}

export function initAutopilot() {
  const sel = $('#apLook');
  sel.innerHTML = PROFILES.map((p) => `<option value="${p.id}">${p.name}</option>`).join('') + '<option value="style">My style (learned)</option>';
  sel.value = localStorage.getItem('sculpt.apLook') || 'jc';
  sel.onchange = () => localStorage.setItem('sculpt.apLook', sel.value);
  $('#btnProcess').onclick = openAutopilot;
  $('#apSend').checked = localStorage.getItem('jc.apSend') !== '0';
  $('#apSend').onchange = () => localStorage.setItem('jc.apSend', $('#apSend').checked ? '1' : '0');
  $('#apStart').onclick = (e) => { e.preventDefault(); run(); };
  $('#apCancel').onclick = () => { cancel = true; $('#apStatus').textContent = 'Stopping after this photo…'; };
  $('#apClose').onclick = () => $('#autoDlg').close();
  $('#apClose2').onclick = () => $('#autoDlg').close();
  $('#apReview').onclick = () => { $('#autoDlg').close(); S.filter = 'picks'; emit('filter'); const p = photos.find((x) => x.flag === 1); if (p) emit('edit', p); };
}
