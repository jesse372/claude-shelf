// Jobs home: every gallery you've started, with live status from the tabs working on them.
import { $, toast } from './state.js';
import * as J from './jobs.js';
import { describe, deliveryStatus } from './delivery.js';

let opts = null, urls = [];

export function initHome(o) {
  opts = o;
  J.onJobChange(() => { if (document.body.classList.contains('home')) render(); });
  $('#btnNewJob').onclick = () => opts.newJob();
  $('#btnNewJobFiles').onclick = () => opts.pickFiles();
}

export async function showHome() {
  $('#jobsView').hidden = false;
  $('#cullView').hidden = true; $('#editView').hidden = true; $('#empty').hidden = true;
  document.title = 'Jesse Chance Studio';
  await render();
}

const fmtDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '');
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
function status(j, held) {
  // processing, but no tab holds the job any more: the tab was closed or crashed part-way
  if (j.status === 'processing' && j.run && held && !held.has('jc-job-' + j.id)) {
    const [i, n] = j.progress || [0, 0];
    return { cls: 'warn', text: `Stopped part-way${n ? ` · ${i} of ${n}` : ''} — open to continue` };
  }
  if (j.delivery && j.status !== 'processing') {
    const t = describe(j);
    if (t) return { cls: j.delivery.status === 'incomplete' || j.delivery.status === 'failed' ? 'warn' : 'delivered', text: t };
  }
  if (j.status === 'processing') {
    const [i, n] = j.progress || [0, 0];
    return { cls: 'processing', text: n ? `Processing · ${i} of ${n}` : 'Processing', pct: n ? i / n : 0 };
  }
  if (j.status === 'delivered') return { cls: 'delivered', text: `Delivered${j.delivered?.count ? ` · ${j.delivered.count} photos` : ''}` };
  if (j.status === 'importing') return { cls: 'importing', text: `Importing · ${j.analysed || 0} of ${j.count || 0}`, pct: j.count ? (j.analysed || 0) / j.count : 0 };
  if (j.status === 'ready') return { cls: 'ready', text: 'Ready to process' };
  return { cls: 'new', text: 'No photos yet' };
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// galleries on their way to Pixieset: pick up the latest from the server (the card re-renders via the job broadcast)
const checked = new Map(), waiting = new Set();
function refreshDeliveries(jobs) {
  for (const j of jobs) {
    const d = j.delivery;
    if (!d?.id || !['ready', 'sending'].includes(d.status) || Date.now() - (checked.get(j.id) || 0) < 60000) continue;
    checked.set(j.id, Date.now());
    deliveryStatus(d.id).then((rec) => { if (rec && rec.status !== d.status) J.updateJob(j.id, { delivery: { ...d, status: rec.status, pixieset: rec.pixieset } }); });
  }
}

async function render() {
  const jobs = await J.listJobs();
  refreshDeliveries(jobs);
  const held = navigator.locks ? new Set(((await navigator.locks.query()).held || []).map((l) => l.name)) : null;
  // a job still marked "processing" by another tab: wait for that tab's lock — it frees the moment the tab closes or
  // crashes (or a just-closed tab finishes letting go), and the card then says "Stopped part-way"
  if (held) for (const j of jobs) {
    const name = 'jc-job-' + j.id;
    if (j.status === 'processing' && j.run && held.has(name) && !waiting.has(name)) {
      waiting.add(name);
      navigator.locks.request(name, async () => {}).then(() => { waiting.delete(name); if (document.body.classList.contains('home')) render(); });
    }
  }
  urls.forEach((u) => URL.revokeObjectURL(u)); urls = [];
  const grid = $('#jobsGrid');
  $('#jobsCount').textContent = jobs.length ? `${jobs.length} job${jobs.length > 1 ? 's' : ''}` : '';
  if (!jobs.length) {
    grid.innerHTML = `<div class="jobs-empty"><div class="hero-mark">JC</div><h2>Start your first job</h2>
      <p class="muted">Choose the folder with a wedding's photos, or drop it anywhere on this page. Each wedding becomes a job you can come back to.</p></div>`;
    return;
  }
  grid.innerHTML = jobs.map((j) => {
    const st = status(j, held);
    let cover = '';
    if (j.cover) { const u = URL.createObjectURL(j.cover); urls.push(u); cover = `<img src="${u}" alt="">`; }
    return `<article class="job" data-id="${j.id}">
      <a class="job-cover" href="${J.jobURL(j.id)}">${cover || '<span class="job-ph">JC</span>'}${st.pct != null ? `<span class="job-bar"><i style="width:${Math.round(st.pct * 100)}%"></i></span>` : ''}</a>
      <div class="job-body">
        <p class="job-date">${fmtDate(j.weddingDate ? new Date(j.weddingDate + 'T12:00').getTime() : j.shootDate || j.created)}</p>
        <h3 class="job-name"><a href="${J.jobURL(j.id)}">${esc(j.name)}</a></h3>
        ${j.venue ? `<p class="job-venue">${esc(j.venue)}</p>` : j.count ? '<p class="job-venue job-needs">Wedding details needed</p>' : ''}
        <p class="job-meta">${j.count || 0} photo${j.count === 1 ? '' : 's'}${j.picks ? ` · ${j.picks} picks` : ''}${j.edited ? ` · ${j.edited} edited` : ''}</p>
        <p class="job-foot"><span class="job-status ${st.cls}">${st.text}</span><span class="muted">${ago(j.updated || j.created)}</span></p>
      </div>
      <div class="job-actions">
        <a class="icon-btn" href="${J.jobURL(j.id)}" target="_blank" rel="noopener" title="Open in a new tab — run several jobs at once"><svg class="ic"><use href="#i-newtab"/></svg></a>
        <button class="icon-btn" data-act="rename" title="Rename"><svg class="ic"><use href="#i-pen"/></svg></button>
        <button class="icon-btn" data-act="delete" title="Remove this job"><svg class="ic"><use href="#i-trash"/></svg></button>
      </div>
    </article>`;
  }).join('');
  for (const el of grid.querySelectorAll('.job')) {
    const id = el.dataset.id;
    for (const a of el.querySelectorAll('a:not([target])')) a.addEventListener('click', async (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;          // let the browser open a new tab
      e.preventDefault();
      const j = await J.getJob(id);
      if (!j) return render();
      // ask for access to the originals now, while we still have the click
      if (J.canLink && j.handles?.length && (await J.permissionOf(j.handles)) !== 'granted') await J.requestAccess(j.handles);
      opts.openJob(j);
    });
    el.querySelector('[data-act=rename]').onclick = async () => {
      const j = await J.getJob(id); const n = prompt('Name this job', j.name);
      if (n && n.trim()) { j.name = n.trim(); await J.saveJob(j); render(); }
    };
    el.querySelector('[data-act=delete]').onclick = async () => {
      const j = await J.getJob(id);
      if (!confirm(`Remove “${j.name}” from Jesse Chance Studio?\n\nThis forgets its picks and edits on this computer. Your original photos and any exported files are not touched.`)) return;
      await J.deleteJob(id); toast('Job removed.'); render();
    };
  }
}
