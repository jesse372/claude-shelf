// Jesse Chance Studio — boot, jobs, import pipeline, mode switching, keyboard.
import { $, $$, photos, S, toast, emit, on, newEdit, isEdited, visiblePhotos, loadJSON, saveJSON, busy } from './state.js';
import { fileKind, loadPreview } from './io.js';
import { initCull, renderGrid, updateCard, scoreShoot, analyzePhoto, cullKey, select, isLoupeOpen, closeLoupe } from './cull.js';
import { initEditor, openInEditor, editorKeys, onEnterEdit, current } from './editor.js';
import { initExport, openExport } from './exporter.js';
import { initAutopilot } from './autopilot.js';
import * as J from './jobs.js';
import { askDetails, coupleName, hasDetails } from './details.js';
import { resumeDelivery } from './delivery.js';
import { cameraId, estimateOffsets } from './clocksync.js';
import { initHome, showHome } from './home.js';

let nextId = 1, order = 0;

// ------------------------------------------------------------------ the job (saved as you go)
let job = null;
const keyOf = (p) => p.key;
const recOf = (p) => ({ job: job.id, key: p.key, name: p.name, size: p.size, lastModified: p.lastModified || 0, path: p.path || '',
  order: p.order, time: p.time, time0: p.time0 ?? p.time, meta: p.meta, flag: p.flag, stars: p.stars, edit: p.edit, userFlagged: !!p.userFlagged,
  editedOnce: !!p.editedOnce, autoDone: !!p.autoDone, autoNotes: p.autoNotes || null, raw: p.raw, failed: !!p.failed, previewW: p.previewW || 0 });
const dirty = new Set();
let persistTimer, firstDirty = 0;
function persist(p) {
  if (!job) return;
  if (p && p.key) dirty.add(p); else photos.forEach((x) => dirty.add(x));
  clearTimeout(persistTimer);
  if (!firstDirty) firstDirty = Date.now();
  // debounce, but never hold changes back for more than ~2 s (imports keep changing things)
  persistTimer = setTimeout(flush, Date.now() - firstDirty > 1000 ? 0 : 400);
}
async function flush() {
  firstDirty = 0;
  if (!job) return;
  const list = [...dirty]; dirty.clear();
  try { await J.savePhotos(list.map(recOf)); await saveSummary(); } catch (e) { console.warn('could not save the job', e); }
}
let coverKey = null;
async function saveSummary(extra = {}) {
  if (!job) return;
  const analysed = photos.filter((p) => p.raw || p.failed).length;
  const busyStatus = ['processing'].includes(job.status) ? job.status : null;
  const patch = {
    count: photos.length, picks: photos.filter((p) => p.flag === 1).length, rejects: photos.filter((p) => p.flag === -1).length,
    edited: photos.filter((p) => p.editedOnce).length, analysed,
    status: busyStatus || (job.status === 'delivered' ? 'delivered' : photos.length && analysed < photos.length ? 'importing' : photos.length ? 'ready' : 'new'),
    shootDate: photos.find((p) => p.time)?.time || job.shootDate || null, ...extra,
  };
  // cover: first pick, else the first photo
  const c = photos.find((p) => p.flag === 1 && p.thumbBlob) || photos.find((p) => p.thumbBlob);
  if (c && c.key !== coverKey) { coverKey = c.key; patch.cover = c.thumbBlob; }
  Object.assign(job, patch);
  await J.saveJob(job);
  renderJobTitle();
  if (patch.shootDate && $('#detailsDlg').open && !$('#wdDate').value) { const d = new Date(patch.shootDate); $('#wdDate').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
}
S.jobUpdate = (patch) => saveSummary(patch);       // used by auto-pilot / export

// ------------------------------------------------------------------ import
async function addFiles(fileList, handles = []) {
  const files = [...fileList].filter((f) => fileKind(f));
  if (!files.length) { toast('No photos found there (supported: RAW, JPG, HEIC, PNG, TIFF).'); return; }
  if (!job) {
    const dirName = handles.find((h) => h.kind === 'directory')?.name || (files[0].webkitRelativePath || files[0].relPath || '').split('/').filter(Boolean)[0];
    await enterJob(await J.createJob(dirName && !/\.\w+$/.test(dirName) ? dirName : '', handles), true);
    editDetails();                                   // not awaited: the photos import while they fill it in
  } else if (handles.length) { job.handles = [...(job.handles || []), ...handles]; await J.saveJob(job); }
  // RAW+JPEG pairs from the camera: keep the RAW, skip its JPEG twin
  const rawBases = new Set(files.filter((f) => fileKind(f) === 'raw').map((f) => f.name.replace(/\.[^.]+$/, '').toLowerCase()));
  const existing = new Set(photos.map((p) => p.key));
  const fresh = files.filter((f) => !existing.has(`${f.name}|${f.size}`))
    .filter((f) => fileKind(f) === 'raw' || !rawBases.has(f.name.replace(/\.[^.]+$/, '').toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const skipped = files.length - fresh.length;
  const restored = 0;
  for (const file of fresh) {
    const p = {
      id: nextId++, order: order++, file, key: J.keyOfFile(file), name: file.name, size: file.size, lastModified: file.lastModified,
      path: file.relPath || file.webkitRelativePath || '', kind: fileKind(file),
      flag: 0, stars: 0, edit: newEdit(), undo: [], redo: [], patches: [],
      time: null, meta: {}, thumbURL: '', previewURL: '', raw: null, ai: null,
    };
    photos.push(p);
  }
  persist();
  $('#empty').hidden = true;
  updateHeader();
  renderGrid();
  if (!S.current && photos.length) select(photos[0]);
  toast(`Added ${fresh.length} photo${fresh.length === 1 ? '' : 's'}` + (skipped ? ` (skipped ${skipped} duplicate/JPEG-twin)` : '') +
    (restored ? ` — restored your earlier picks & edits on ${restored}` : '') + '. AI is analysing them now…', 5000);
  queueAnalysis(photos.filter((p) => p.file && !p.raw && !p.analysing));
}

let queue = [], running = 0;
function queueAnalysis(list) {
  queue.push(...list);
  list.forEach((p) => (p.analysing = true));
  pump();
}
async function pump() {
  const total = () => photos.length, done = () => photos.filter((p) => p.raw || p.failed).length;
  while (running < 2 && queue.length) {
    const p = queue.shift();
    running++;
    (async () => {
      try {
        const { bitmap, meta } = await loadPreview(p.file, 1600);
        p.meta = meta || {};
        p.time = p.time0 = meta?.time ? meta.time.getTime() : null;      // time0: the camera's own clock
        const pv = await toBlob(bitmap, 1400, 0.82), th = await toBlob(bitmap, 360, 0.8);
        p.previewURL = URL.createObjectURL(pv); p.thumbURL = URL.createObjectURL(th); p.thumbBlob = th;
        p.previewW = bitmap.width;     // face boxes are in this bitmap's pixels
        if (job) J.saveImages(job.id, p.key, th, pv).catch((e) => console.warn('could not save thumbnails', e));
        p.raw = await analyzePhoto(bitmap);
        bitmap.close?.();
      } catch (e) {
        console.warn('analysis failed', p.name, e);
        p.failed = true;
        p.raw = { faces: [], sharp: 0, hash: [0, 0], mean: 128, clipHi: 0, clipLo: 0 };
      } finally {
        running--;
        updateCard(p);
        const d = done();
        $('#aiProgress').textContent = d < total() ? `AI analysing ${d}/${total()}…` : '';
        if (d % 8 === 0 || d === total()) { scoreShoot(); photos.forEach(updateCard); renderGrid(); }
        if (d === total()) finishImport();
        emit('photo-updated', p);
        pump();
      }
    })();
  }
}
/** Second shooter / second body: line every camera's clock up with the main camera (see clocksync.js). */
function syncClocks() {
  const items = photos.filter((p) => p.time0 != null && p.raw?.emb).map((p) => ({ p, cam: cameraId(p.meta, p.name), t: p.time0, emb: p.raw.emb }));
  const { offsets } = estimateOffsets(items);
  const fixes = [];
  for (const it of items) it.p.time = it.t + (offsets[it.cam]?.ms || 0);
  for (const [cam, o] of Object.entries(offsets)) if (o.ms && Math.abs(o.ms) >= 20e3) {
    const s = Math.round(Math.abs(o.ms) / 1000), txt = s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
    fixes.push(`${cam.split('|').slice(0, 2).join(' ').replace(/^(\w+) \1/, '$1').trim() || 'A second camera'}: clock was ${txt} ${o.ms > 0 ? 'behind' : 'ahead'}`);
  }
  if (job) job.clock = { offsets, at: Date.now() };
  return fixes;
}
function finishImport() {
  const fixes = syncClocks();
  if (fixes.length) toast(`Lined up the cameras’ clocks so the timeline is right — ${fixes.join('; ')}.`, 9000);
  // shoot order = capture time (falls back to filename order)
  photos.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.order - b.order);
  scoreShoot();
  renderGrid();
  const flagged = photos.filter((p) => p.ai && (p.ai.accident || p.ai.blurry || (p.ai.group && !p.ai.best && !p.ai.keep))).length;
  persist();
  if (flagged) toast(`AI flagged ${flagged} photo${flagged > 1 ? 's' : ''} (accidental frames, or a blink / soft frame where a better one of the same moment exists). Press “AI cull” to accept, or cull by hand with P / X.`, 6000);
}
async function toBlob(bitmap, maxSide, q) {
  const s = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const c = new OffscreenCanvas(Math.round(bitmap.width * s), Math.round(bitmap.height * s));
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: 'image/jpeg', quality: q });
}

// ------------------------------------------------------------------ modes
function setMode(m) {
  if (m === 'edit' && !photos.length) return;
  S.mode = m;
  $('#cullView').hidden = m !== 'cull';
  $('#editView').hidden = m !== 'edit';
  for (const b of $$('[data-mode]')) b.classList.toggle('on', b.dataset.mode === m);
  $('#editActions').hidden = m !== 'edit';
  if (m === 'edit') {
    onEnterEdit();
    const p = S.current || visiblePhotos()[0] || photos[0];
    if (p && (!current() || current().photo !== p)) openInEditor(p);
  } else {
    closeLoupe();
    renderGrid();
    $('#status').textContent = '';
  }
}
function updateHeader() {
  $('#btnExport').disabled = !photos.length;
  for (const b of $$('[data-mode]')) b.disabled = !photos.length;
}

// ------------------------------------------------------------------ boot
// a trained style (from your own before/after pairs) is shared via the server and becomes the default look
try {
  const r = await fetch('api/learned', { cache: 'no-store' });
  if (r.ok) { const j = await r.json(); if (j && j.lut) { (await import('./profiles.js')).registerLearned(j); if (!localStorage.getItem('sculpt.apLook')) localStorage.setItem('sculpt.apLook', 'learned'); } }
} catch { /* offline / none yet */ }
initEditor();
initCull();
initExport();
initAutopilot();
on('edit', (p) => { S.current = p; setMode('edit'); openInEditor(p); });
on('flags', () => persist());
on('photo-updated', (p) => persist(p));
on('need-files', () => connectFiles(true));

// pickers: keep a link to the originals where the browser allows it (Chrome / Edge)
const PHOTO_EXT = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.hif', '.tif', '.tiff', '.dng', '.cr2', '.cr3', '.crw', '.nef', '.nrw', '.arw', '.srf', '.sr2', '.raf', '.orf', '.rw2', '.pef', '.srw', '.3fr', '.iiq', '.erf', '.kdc', '.mef', '.mos', '.mrw', '.x3f', '.rwl', '.raw', '.webp', '.avif'];
async function pickFiles() {
  if (!window.showOpenFilePicker) return $('#fileInput').click();
  let hs; try { hs = await window.showOpenFilePicker({ multiple: true, id: 'jc-import', types: [{ description: 'Photos', accept: { 'image/*': PHOTO_EXT } }] }); } catch { return; }
  addFiles(await Promise.all(hs.map((h) => h.getFile())), hs);
}
async function pickFolder() {
  if (!J.canLink) return $('#folderInput').click();
  let d; try { d = await window.showDirectoryPicker({ id: 'jc-import', mode: 'read' }); } catch { return; }
  busy('Reading the folder…');
  const files = await J.filesFromHandles([d], fileKind);
  busy(null);
  addFiles(files, [d]);
}
$('#btnOpen').onclick = pickFiles;
$('#btnOpenFolder').onclick = pickFolder;
$('#emptyOpen').onclick = pickFiles;
$('#emptyFolder').onclick = pickFolder;
for (const id of ['#fileInput', '#folderInput']) $(id).onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
for (const b of $$('[data-mode]')) b.onclick = () => setMode(b.dataset.mode);
$('#btnExport').onclick = openExport;

window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio'].includes(t.type))) return;
  if ($('#exportDlg').open || $('#autoDlg').open || $('#detailsDlg').open) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFiles(); return; }
  if (!job) return;
  if (mod && (e.key.toLowerCase() === 's' || e.key.toLowerCase() === 'e')) { e.preventDefault(); openExport(); return; }
  if (!mod && e.key === 'Tab') { e.preventDefault(); setMode(S.mode === 'cull' ? 'edit' : 'cull'); return; }
  if (t.type === 'range' && e.key.startsWith('Arrow')) return;
  if (S.mode === 'cull') { if (cullKey(e)) e.preventDefault(); }
  else {
    // flags work in edit mode too
    if (!mod && ['p', 'x', 'u'].includes(e.key.toLowerCase()) && S.current) {
      S.current.flag = { p: 1, x: -1, u: 0 }[e.key.toLowerCase()]; S.current.userFlagged = true;
      emit('flags'); toast({ 1: '✓ Picked', '-1': '✕ Rejected', 0: 'Unflagged' }[S.current.flag], 1200); return;
    }
    if (editorKeys.down(e)) e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => editorKeys.up(e));
window.addEventListener('blur', () => editorKeys.blur());

// drag & drop (files or whole folders)
async function filesFromDrop(dt) {
  const items = [...(dt.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!items.length) return [...dt.files];
  const out = [];
  const walk = async (entry) => {
    if (entry.isFile) out.push(await new Promise((res, rej) => entry.file(res, rej)));
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    }
  };
  for (const e of items) await walk(e);
  return out;
}
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
  if (!e.dataTransfer) return;
  // both must start synchronously inside the drop event
  const hp = J.canLink ? J.handlesFromDrop(e.dataTransfer) : Promise.resolve(null);
  const fp = filesFromDrop(e.dataTransfer);
  const hs = await hp.catch(() => null);
  if (hs && hs.length) { busy('Reading the folder…'); const files = await J.filesFromHandles(hs, fileKind); busy(null); addFiles(files, hs); }
  else addFiles(await fp);
});

window.addEventListener('beforeunload', (e) => {
  if (photos.some((p) => p.patches?.length || p.manualDirty)) { e.preventDefault(); e.returnValue = ''; }
});

// ------------------------------------------------------------------ jobs: open / reconnect
function photoFromRec(r) {
  const p = {
    id: nextId++, order: r.order, file: null, key: r.key, name: r.name, size: r.size, lastModified: r.lastModified, path: r.path,
    kind: fileKind({ name: r.name, type: '' }), flag: r.flag || 0, stars: r.stars || 0, edit: r.edit || newEdit(), undo: [], redo: [], patches: [],
    time: r.time, time0: r.time0 ?? r.time, meta: r.meta || {}, thumbURL: '', previewURL: '', raw: r.raw || null, ai: null, failed: r.failed,
    userFlagged: r.userFlagged, editedOnce: r.editedOnce, autoDone: r.autoDone, autoNotes: r.autoNotes, previewW: r.previewW,
  };
  if (r.images) {
    if (r.images.thumb) { p.thumbBlob = r.images.thumb; p.thumbURL = URL.createObjectURL(r.images.thumb); }
    if (r.images.preview) p.previewURL = URL.createObjectURL(r.images.preview);
  }
  order = Math.max(order, (r.order || 0) + 1);
  return p;
}
async function enterJob(j, fresh = false) {
  job = j; S.job = j;
  if (location.hash !== '#job=' + j.id) history.replaceState(null, '', J.jobURL(j.id));
  document.body.classList.remove('home'); document.body.classList.add('in-job');
  $('#jobsView').hidden = true;
  document.title = j.name + ' — Jesse Chance Studio';
  if (!(await J.claimJob(j.id))) toast('This job is also open in another tab — keep working in just one of them.', 8000);
  renderJobTitle(); renderSendBar(); renderResumeBar();
  if (fresh) { setMode('cull'); updateHeader(); return; }
  const recs = (await J.loadPhotos(j.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const r of recs) photos.push(photoFromRec(r));
  $('#empty').hidden = photos.length > 0;
  updateHeader();
  setMode('cull');
  if (photos.length) {
    photos.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.order - b.order);
    scoreShoot(); photos.forEach(updateCard); renderGrid(); select(photos[0]);
    coverKey = null;
  }
  await connectFiles(false);
}
/** Link the job's photos back to the original files (needed to edit and export). */
async function connectFiles(fromClick) {
  if (!job) return;
  const missing = () => photos.filter((p) => !p.file);
  if (!missing().length) return reconnectBar(null);
  const hs = job.handles || [];
  if (J.canLink && hs.length) {
    let st = await J.permissionOf(hs);
    if (st !== 'granted' && fromClick) st = (await J.requestAccess(hs)) ? 'granted' : 'denied';
    if (st === 'granted') {
      busy('Reconnecting to the original photos…');
      attachFiles(await J.filesFromHandles(hs, fileKind));
      busy(null);
      if (!missing().length) return reconnectBar(null);
      return reconnectBar('missing');
    }
    return reconnectBar('permission');
  }
  reconnectBar('relink');
}
function attachFiles(files) {
  const byKey = new Map(files.map((f) => [J.keyOfFile(f), f]));
  let n = 0;
  for (const p of photos) if (!p.file) { const f = byKey.get(p.key); if (f) { p.file = f; n++; } }
  if (n) queueAnalysis(photos.filter((p) => p.file && !p.raw && !p.analysing));
  return n;
}
async function relink() {
  if (J.canLink) {
    let d; try { d = await window.showDirectoryPicker({ id: 'jc-import', mode: 'read' }); } catch { return; }
    busy('Looking for the photos…');
    const n = attachFiles(await J.filesFromHandles([d], fileKind));
    busy(null);
    if (n) { job.handles = [...(job.handles || []), d]; await J.saveJob(job); }
    toast(n ? `Found ${n} photo${n > 1 ? 's' : ''}.` : 'None of this job’s photos are in that folder.');
  } else $('#folderInput').click();
  connectFiles(false);
}
function reconnectBar(kind) {
  const bar = $('#reconnect');
  if (!kind) { bar.hidden = true; return; }
  const n = photos.filter((p) => !p.file).length;
  $('#reconnectText').textContent = kind === 'permission'
    ? 'Reconnect to the original photos to edit and export this job.'
    : kind === 'missing' ? `${n} photo${n > 1 ? 's are' : ' is'} not where they were (moved or renamed?).`
    : 'Choose the folder with this job’s original photos to edit and export.';
  $('#btnReconnect').textContent = kind === 'permission' ? 'Reconnect' : 'Find the folder…';
  $('#btnReconnect').onclick = () => (kind === 'permission' ? connectFiles(true) : relink());
  bar.hidden = false;
}
function renderResumeBar() {
  const R = job && job.run, bar = $('#resumeBar');
  bar.hidden = !R;
  if (!R) return;
  const n = Object.keys(R.done || {}).length;
  $('#resumeText').textContent = `Process shoot stopped part-way — ${n} of ${R.keys.length} photos finished.`;
}
$('#btnResume').onclick = async () => {
  const { resumeAutopilot } = await import('./autopilot.js');
  if (await resumeAutopilot(job.run)) $('#resumeBar').hidden = true;
};
function renderSendBar() {
  $('#sendBar').hidden = !(job && job.delivery && job.delivery.status === 'incomplete');
}
$('#btnSendFinish').onclick = async () => {
  const b = $('#btnSendFinish'); b.disabled = true;
  $('#sendText').textContent = 'Sending the rest to Pixieset…';
  const r = await resumeDelivery(job.delivery, (n, of) => { $('#sendText').textContent = `Sending the rest to Pixieset… ${n} of ${of}`; });
  b.disabled = false;
  if (r.ok) { job.delivery = { ...job.delivery, status: 'ready' }; await J.saveJob(job); toast('Sent — it will appear in Pixieset as a hidden collection.'); }
  else $('#sendText').textContent = `Still not sent: ${r.error}. Check the connection and try again.`;
  renderSendBar();
};
function renderJobTitle() {
  const t = $('#jobTitle');
  if (!job) { t.hidden = true; return; }
  t.hidden = false;
  $('#jobName').textContent = job.name;
  $('#jobName').title = hasDetails(job) ? `${job.venue} · ${new Date(job.weddingDate + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} — edit wedding details` : 'Add the wedding details';
}
/** Ask (or edit) the couple, date and venue; the job is named after the couple. Resolves true once saved. */
async function editDetails(required = false) {
  if (!job) return false;
  const d = await askDetails(job, { required, shootDate: photos.find((p) => p.time)?.time });
  if (!d) return hasDetails(job);
  Object.assign(job, d, { name: coupleName(d.couple) });
  document.title = job.name + ' — Jesse Chance Studio';
  await J.saveJob(job); renderJobTitle();
  return true;
}
S.ensureDetails = () => (hasDetails(job) ? Promise.resolve(true) : editDetails(true));   // used before delivery
$('#jobName').onclick = () => editDetails();
$('#btnHome').onclick = (e) => { e.preventDefault(); flush().finally(() => { location.hash = ''; location.reload(); }); };
window.addEventListener('pagehide', () => { if (dirty.size) flush(); });
// a job link / back-forward changes only the #job= part: load that job (or home) properly
window.addEventListener('hashchange', () => { if ((J.jobIdFromURL() || null) !== (job?.id || null)) flush().finally(() => location.reload()); });
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty.size) flush(); });

// jobs live in this browser's storage: ask it never to clear them to make room
navigator.storage?.persist?.().catch(() => {});
initHome({ openJob: (j) => enterJob(j), newJob: pickFolder, pickFiles });
const startId = J.jobIdFromURL();
const startJob = startId ? await J.getJob(startId).catch(() => null) : null;
if (startJob) await enterJob(startJob);
else { document.body.classList.add('home'); updateHeader(); setMode('cull'); showHome(); }
// Automation hook for the self-check script.
window.__sculpt = { addFiles, photos, S, setMode, get cur() { return current(); }, emit, get job() { return job; } };
