// Export: render every chosen photo at full quality → JPEG with original filename + capture date,
// into a folder you then drag into a Pixieset gallery.
import { $, photos, S, toast, busy } from './state.js';
import { loadPhoto, renderer, current, openInEditor } from './editor.js';
import { addExif } from './io.js';
import { inspect, saferEdit } from './safety.js';
import { recordExample } from './style-store.js';

function chosen(which) {
  if (which === 'current') return S.current ? [S.current] : [];
  if (which === 'picks') return photos.filter((p) => p.flag === 1);
  if (which === 'selected') return photos.filter((p) => S.selected.has(p.id));
  return photos.filter((p) => p.flag !== -1);
}

export function openExport() {
  if (!photos.length) { toast('Add some photos first.'); return; }
  const dlg = $('#exportDlg');
  const counts = { picks: chosen('picks').length, keep: chosen('keep').length, selected: chosen('selected').length, current: S.current ? 1 : 0 };
  for (const [k, n] of Object.entries(counts)) {
    const el = dlg.querySelector(`[data-count="${k}"]`); if (el) el.textContent = n;
    const r = dlg.querySelector(`input[name=which][value=${k}]`); if (r) r.disabled = !n;
  }
  const pref = counts.picks ? 'picks' : counts.keep ? 'keep' : 'current';
  dlg.querySelector(`input[name=which][value=${pref}]`).checked = true;
  $('#exportResult').hidden = true;
  $('#exportForm').hidden = false;
  $('#vQuality').textContent = $('#exQuality').value;
  dlg.showModal();
}

async function writeOut(dir, name, blob) {
  if (dir) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(blob); await w.close();
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    await new Promise((r) => setTimeout(r, 350));   // browsers throttle rapid downloads
  }
}

async function renderJpeg(maxSide, quality) {
  const blob = await renderer.exportBlob('image/jpeg', quality);
  const W = renderer.w, H = renderer.h;
  if (!maxSide || Math.max(W, H) <= maxSide) return blob;
  const s = maxSide / Math.max(W, H);
  const bmp = await createImageBitmap(renderer.canvas, { resizeWidth: Math.round(W * s), resizeHeight: Math.round(H * s), resizeQuality: 'high' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext('2d').drawImage(bmp, 0, 0); bmp.close();
  return c.convertToBlob({ type: 'image/jpeg', quality });
}

// background encoder (deferred exports): one worker, jobs by id
let encW = null, encN = 0;
const encJobs = new Map();
function encodeInWorker(bmp, quality) {
  if (!encW) {
    encW = new Worker(new URL('./encode-worker.js', import.meta.url), { type: 'module' });
    encW.onmessage = (e) => { const j = encJobs.get(e.data.id); if (!j) return; encJobs.delete(e.data.id); e.data.blob ? j.res(e.data.blob) : j.rej(new Error(e.data.error || 'encode failed')); };
    encW.onerror = (e) => { for (const j of encJobs.values()) j.rej(new Error('encoder stopped')); encJobs.clear(); encW = null; e.preventDefault?.(); };
  }
  const id = ++encN;
  return new Promise((res, rej) => { encJobs.set(id, { res, rej }); encW.postMessage({ id, bmp, quality }, [bmp]); });
}

/** A snapshot of the finished render (full size or scaled to maxSide), for the background encoder. */
async function snapshot(maxSide) {
  renderer.draw({ split: -1 });
  const W = renderer.w, H = renderer.h, s = maxSide && Math.max(W, H) > maxSide ? maxSide / Math.max(W, H) : 1;
  const bmp = await (s < 1 ? createImageBitmap(renderer.canvas, { resizeWidth: Math.round(W * s), resizeHeight: Math.round(H * s), resizeQuality: 'high' }) : createImageBitmap(renderer.canvas));
  renderer.draw();
  return bmp;
}

/** Render + save one photo. Returns the file name.
 * defer (Process shoot): returns once the render is captured - { name, done } - and the JPEG is encoded in a worker,
 * safety-checked and written in the background while the caller starts the next photo. done resolves to { redo } when
 * the check wants a gentler edit: the caller then calls exportOne(p, { ...opts, name, prior: redo }) without defer.
 * The check always measures the real JPEG (the raw render reads up to ~1 L* different on a white dress). */
export async function exportOne(p, { dir, maxSide = 0, quality = 0.92, suffix = '', used = new Set(), safety = false, onSaved = null, defer = false, name = null, prior = null }) {
  if (!(await loadPhoto(p, { interactive: false }))) throw new Error('could not open');
  let first = 1;
  if (safety && prior) {                                 // a deferred check found problems: its gentler edit, then check again
    p.safety = { fixed: prior.problems.map((x) => x.msg), attempts: 1 };
    saferEdit(p, prior, 1);
    if (!(await loadPhoto(p, { interactive: false }))) throw new Error('could not open');
    first = 2;
  }
  if (!name) {
    const stem = p.name.replace(/\.[^.]+$/, '') + suffix;
    let n = 2; name = stem + '.jpg';
    while (used.has(name.toLowerCase())) name = `${stem}-${n++}.jpg`;   // e.g. IMG_1.CR3 + IMG_1.JPG
    used.add(name.toLowerCase());
  }
  const m = { ...(p.meta || {}), ...(p.fullMeta || {}) }, exif = { make: m.make, model: m.model, time: p.time ? new Date(p.time) : m.time || null };
  const save = async (b) => {
    b = await addExif(b, exif);
    await writeOut(dir, name, b);
    if (onSaved) onSaved(name, b, p);
    // learning from edits: colour fixed by hand becomes an example of your style
    if (p.userColour && p.emb && !p.exampleRecorded) { p.exampleRecorded = true; recordExample(p.emb, p.edit.dev).catch(() => {}); }
    return name;
  };
  const seg = p.det && p.det.seg, base = safety ? renderer.thumbnail(480) : null;   // the photo before any edit
  if (defer) {
    if (safety) p.safety = null;
    const snap = await snapshot(maxSide);
    const done = encodeInWorker(snap, quality).then(async (blob) => {
      if (safety) {
        const rep = await inspect(blob, seg, base);
        if (rep.unsure && rep.unsure.length) p.unsure = { ...(p.unsure || {}), dress: true };   // borderline: for the review, not re-edited
        if (!rep.ok) return { redo: rep };
      }
      await save(blob);
      return { name };
    });
    return { name, done };
  }
  let blob = await renderJpeg(maxSide, quality);
  // hands-off safety: check the actual result; if anything is off, re-edit more conservatively and check again
  if (safety) {
    if (!prior) p.safety = null;
    for (let attempt = first; attempt <= 2; attempt++) {
      const rep = await inspect(blob, seg, base);
      if (attempt === 1 && rep.unsure && rep.unsure.length) p.unsure = { ...(p.unsure || {}), dress: true };   // borderline: for the review, not re-edited
      if (attempt === 2 && rep.problems.every((x) => x.kind.startsWith('dress'))) break;                          // the dress fix is applied once
      if (rep.ok) break;
      p.safety = { fixed: [...new Set([...(p.safety?.fixed || []), ...rep.problems.map((x) => x.msg)])], attempts: attempt };
      saferEdit(p, rep, attempt);
      if (!(await loadPhoto(p, { interactive: false }))) break;
      blob = await renderJpeg(maxSide, quality);
    }
  }
  return save(blob);
}

export async function pickFolder() {
  if (!window.showDirectoryPicker) return null;
  try { return await window.showDirectoryPicker({ mode: 'readwrite', id: 'sculpt-export', startIn: 'pictures' }); }
  catch (e) { if (e.name === 'AbortError') throw e; return null; }
}

export async function runExport() {
  const which = $('input[name=which]:checked').value;
  const list = chosen(which);
  const opts = { maxSide: +$('#exSize').value || 0, quality: +$('#exQuality').value / 100, suffix: $('#exSuffix').checked ? '-edit' : '', used: new Set() };
  try { opts.dir = await pickFolder(); } catch { return; }
  $('#exportDlg').close();
  const back = S.mode === 'edit' ? current()?.photo : null;
  const failed = [];
  let ok = 0;
  for (let i = 0; i < list.length; i++) {
    busy(`Exporting ${i + 1} of ${list.length} — ${list[i].name}`);
    try { await exportOne(list[i], opts); ok++; } catch (e) { console.error(e); failed.push(list[i].name); }
  }
  busy(null);
  if (ok && S.jobUpdate) { S.job.status = 'delivered'; S.jobUpdate({ status: 'delivered', delivered: { at: Date.now(), count: ok, folder: opts.dir ? opts.dir.name : 'Downloads' } }).catch(() => {}); }
  if (back) await openInEditor(back);
  $('#exportForm').hidden = true;
  $('#exportResult').hidden = false;
  $('#exportResultText').innerHTML =
    `<b>Exported ${ok} photo${ok === 1 ? '' : 's'}</b>${opts.dir ? ` to the folder “${opts.dir.name}”` : ' to your Downloads folder'}.` +
    (failed.length ? `<br><span class="warn">Couldn’t export: ${failed.join(', ')}</span>` : '');
  $('#exportDlg').showModal();
}

export function initExport() {
  $('#exQuality').oninput = (e) => { $('#vQuality').textContent = e.target.value; };
  $('#btnDoExport').onclick = (e) => { e.preventDefault(); runExport(); };
  $('#btnExportClose').onclick = () => $('#exportDlg').close();
  $('#btnExportDone').onclick = () => $('#exportDlg').close();
}
