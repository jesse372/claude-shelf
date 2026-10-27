// Sending a finished gallery to Jesse's Pixieset: each photo is uploaded as soon as it's exported, to private
// cloud storage; Jesse's Mac then creates the (hidden) Pixieset collection and uploads it there.
// If the upload is interrupted, finishing later re-reads the photos from the export folder.

const api = (path, o = {}) => fetch('api/deliveries' + path, { credentials: 'same-origin', ...o });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Is sending to Pixieset switched on for this site? (Cloud storage enabled.) */
export async function sendingAvailable() {
  try { const r = await api(''); return r.ok && !!(await r.json()).enabled; } catch { return false; }
}

/** Start a delivery for a job. Returns null (with a reason) when sending isn't available here. */
export async function startDelivery(job, expected) {
  let r;
  try {
    r = await api('', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ couple: job.couple, weddingDate: job.weddingDate, venue: job.venue, venuePage: job.venuePage || null, expected, jobId: job.id,
        photographer: localStorage.getItem('jc.photographer') || null }) });
  } catch { return { error: 'offline' }; }
  if (!r.ok) { let e = ''; try { e = (await r.json()).error; } catch { /* not ours */ } return { error: e || `not available (${r.status})` }; }
  return r.json();
}

export class Uploader {
  constructor(id, { parallel = 2, onChange = () => {} } = {}) {
    this.id = id; this.parallel = parallel; this.onChange = onChange;
    this.queue = []; this.active = 0; this.sent = new Set(); this.failed = new Map(); this.waiters = [];
  }
  get pending() { return this.queue.length + this.active; }
  add(name, blob) { this.queue.push({ name, blob }); this._pump(); }
  _pump() {
    while (this.active < this.parallel && this.queue.length) {
      const it = this.queue.shift(); this.active++;
      this._send(it).finally(() => { this.active--; this.onChange(this); this._pump(); if (!this.pending) this.waiters.splice(0).forEach((w) => w()); });
    }
  }
  async _send({ name, blob }) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await api(`/${this.id}/files/${encodeURIComponent(name)}`, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
        if (r.ok) { this.sent.add(name); this.failed.delete(name); return; }
        if (r.status < 500 && r.status !== 429) { this.failed.set(name, `refused (${r.status})`); return; }   // retrying won't help
      } catch { /* network blip: retry */ }
      await sleep(1500 * 2 ** attempt);
    }
    this.failed.set(name, 'no connection');
  }
  drain() { return this.pending ? new Promise((r) => this.waiters.push(r)) : Promise.resolve(); }
}

/** Tell the server the gallery is complete. Returns { ok, rec } or { ok: false, missing }. */
export async function finishDelivery(id, names) {
  const r = await api(`/${id}/done`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: names }) });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, rec: j } : { ok: false, missing: j.missing || [], error: j.error };
}

/** Resume an interrupted delivery from the export folder: upload whatever hasn't arrived, then finish. */
export async function resumeDelivery(d, onProgress = () => {}) {
  if (!d?.id || !d.files?.length) return { ok: false, error: 'nothing to send' };
  let res = await finishDelivery(d.id, d.files);
  if (res.ok) return res;
  if (!d.dir) return { ok: false, error: 'the export folder is not linked' };
  if ((await d.dir.queryPermission?.({ mode: 'read' })) !== 'granted' && (await d.dir.requestPermission?.({ mode: 'read' })) !== 'granted') return { ok: false, error: 'no access to the export folder' };
  const up = new Uploader(d.id, { onChange: (u) => onProgress(u.sent.size, res.missing.length) });
  for (const name of res.missing) {
    try { up.add(name, await (await d.dir.getFileHandle(name)).getFile()); } catch { up.failed.set(name, 'missing from the folder'); }
  }
  await up.drain();
  res = await finishDelivery(d.id, d.files);
  return res.ok ? res : { ok: false, error: `${res.missing?.length || 0} photo(s) still not sent`, missing: res.missing };
}

/** Latest status from the server, for the job card. */
export async function deliveryStatus(id) {
  try { const r = await api('/' + id); return r.ok ? r.json() : null; } catch { return null; }
}

export const describe = (job, rec) => {
  const s = rec?.status || job.delivery?.status;
  if (s === 'uploading' || s === 'incomplete') return 'Not all sent — open to finish sending';
  if (s === 'ready' || s === 'sending') return 'Sent · waiting for Pixieset';
  if (s === 'in-pixieset' || s === 'purged') return 'In Pixieset · ready to publish';
  if (s === 'failed') return 'Pixieset upload needs a look';
  return null;
};
