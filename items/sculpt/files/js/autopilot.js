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
  // 4. edit + export each pick (skipping any finished before an interruption)
  let cur = null;
  const opts = { dir, quality: 0.92, used: new Set(names.map((n) => n.toLowerCase())), safety: true,
    onSaved: (name, blob) => { names.push(name); R.done[cur.key] = name; if (sending) sending.up.add(name, blob); } };
  const todo = list.filter((p) => !R.done[p.key]);
  const before = list.length - todo.length;
  const sendNote = () => (sending ? ` · ${before + sending.up.sent.size} of ${list.length} sent to Pixieset` : '');
  if (before) notes.push(`Continued after an interruption: ${before} photo${before === 1 ? ' was' : 's were'} already finished.`);
  const t0 = performance.now();
  for (let i = 0; i < todo.length; i++) {
    if (cancel) { await job({ run: null }); return finish(list.slice(0, before + i), failed, before + i, dir, true, notes); }
    const p = todo[i], k = before + i;
    const el = (performance.now() - t0) / 1000, eta = i ? el / i * (todo.length - i) : 0;
    $('#apStatus').textContent = `Editing & exporting ${k + 1} of ${list.length} — ${p.name}` + (i ? ` · about ${fmtTime(eta)} left` : '') + sendNote();
    $('#apBar').value = 0.1 + 0.87 * k / list.length;
    try {
      if (o.colour || o.profile || o.retouch || o.shape) p.pendingAuto = { colour: o.colour, profile: o.profile, retouch: o.retouch, shape: o.shape, brightness };
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
    if (!(await loadPhoto(p, { interactive: false }))) continue;
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
