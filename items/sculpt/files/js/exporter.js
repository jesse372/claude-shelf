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

/** Render + save one photo. Returns the file name. */
export async function exportOne(p, { dir, maxSide = 0, quality = 0.92, suffix = '', used = new Set(), safety = false, onSaved = null }) {
  if (!(await loadPhoto(p, { interactive: false }))) throw new Error('could not open');
  let blob = await renderJpeg(maxSide, quality);
  // hands-off safety: check the actual result; if anything is off, re-edit more conservatively and check again
  if (safety) {
    p.safety = null;
    const base = renderer.thumbnail(480);               // the photo before any edit
    for (let attempt = 1; attempt <= 2; attempt++) {
      const rep = await inspect(blob, p.det && p.det.seg, base);
      if (rep.ok) break;
      p.safety = { fixed: rep.problems.map((x) => x.msg), attempts: attempt };
      saferEdit(p, rep, attempt);
      if (!(await loadPhoto(p, { interactive: false }))) break;
      blob = await renderJpeg(maxSide, quality);
    }
  }
  const m = { ...(p.meta || {}), ...(p.fullMeta || {}) };
  blob = await addExif(blob, { make: m.make, model: m.model, time: p.time ? new Date(p.time) : m.time || null });
  const base = p.name.replace(/\.[^.]+$/, '') + suffix;
  let name = base + '.jpg', n = 2;
  while (used.has(name.toLowerCase())) name = `${base}-${n++}.jpg`;   // e.g. IMG_1.CR3 + IMG_1.JPG
  used.add(name.toLowerCase());
  await writeOut(dir, name, blob);
  if (onSaved) onSaved(name, blob);
  // learning from edits: colour fixed by hand becomes an example of your style
  if (p.userColour && p.emb && !p.exampleRecorded) { p.exampleRecorded = true; recordExample(p.emb, p.edit.dev).catch(() => {}); }
  return name;
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
