// Jobs: each gallery is a job you can leave and come back to. Several can run at once (one per browser tab).
//
// Saved on this computer (IndexedDB): the job, every photo's analysis, flags, stars and edits, plus small
// thumbnails/previews so a job reopens instantly. The original RAW files are NOT copied (a wedding is tens of GB):
// we keep a link to them (File System Access handles) and reconnect when the job is opened.
const DB = 'jc-studio', VERSION = 1;
let dbp = null;

function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('jobs')) d.createObjectStore('jobs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: ['job', 'key'] }).createIndex('job', 'job');
      if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: ['job', 'key'] }).createIndex('job', 'job');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function tx(stores, mode, fn) {
  const d = await db(), t = d.transaction(stores, mode);
  const out = await fn(...[].concat(stores).map((s) => t.objectStore(s)));
  await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  return out;
}

// ------------------------------------------------------------------ live updates between tabs
const chan = 'BroadcastChannel' in self ? new BroadcastChannel('jc-studio-jobs') : null;
export function onJobChange(fn) { if (chan) chan.addEventListener('message', (e) => fn(e.data)); }
const announce = (job) => chan && chan.postMessage({ type: 'job', job: summary(job) });
const summary = (j) => { const { handles, ...rest } = j; return rest; };

// ------------------------------------------------------------------ jobs
export const newJobId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export async function listJobs() { return (await tx('jobs', 'readonly', (s) => req(s.getAll()))).sort((a, b) => (b.updated || 0) - (a.updated || 0)); }
export async function getJob(id) { return tx('jobs', 'readonly', (s) => req(s.get(id))); }
export async function saveJob(job) {
  job.updated = Date.now();
  await tx('jobs', 'readwrite', (s) => req(s.put(job)));
  announce(job);
  return job;
}
export async function updateJob(id, patch) {
  const j = await getJob(id);
  if (!j) return null;
  return saveJob(Object.assign(j, patch));
}
export async function createJob(name, handles = []) {
  const d = new Date();
  return saveJob({ id: newJobId(), name: name || `New job · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    created: d.getTime(), status: 'new', count: 0, picks: 0, rejects: 0, edited: 0, handles });
}
export async function deleteJob(id) {
  await tx(['jobs', 'photos', 'images'], 'readwrite', async (j, p, im) => {
    j.delete(id);
    for (const store of [p, im]) {
      const keys = await req(store.index('job').getAllKeys(id));
      for (const k of keys) store.delete(k);
    }
  });
  chan && chan.postMessage({ type: 'deleted', id });
}

// ------------------------------------------------------------------ photos
export async function loadPhotos(jobId) {
  return tx(['photos', 'images'], 'readonly', async (p, im) => {
    const recs = await req(p.index('job').getAll(jobId));
    const imgs = await req(im.index('job').getAll(jobId));
    const byKey = new Map(imgs.map((r) => [r.key, r]));
    return recs.map((r) => ({ ...r, images: byKey.get(r.key) || null }));
  });
}
export async function savePhotos(recs) { if (recs.length) await tx('photos', 'readwrite', (s) => { for (const r of recs) s.put(r); }); }
export async function saveImages(jobId, key, thumb, preview) { await tx('images', 'readwrite', (s) => req(s.put({ job: jobId, key, thumb, preview }))); }

// ------------------------------------------------------------------ the current job (one per tab)
export function jobIdFromURL() { const m = location.hash.match(/job=([\w-]+)/); return m ? m[1] : null; }
export function jobURL(id) { return location.pathname + location.search + '#job=' + id; }

/** Warn if the same job is already open in another tab (two tabs editing one job would fight). */
export async function claimJob(id) {
  if (!navigator.locks) return true;
  return new Promise((resolve) => {
    navigator.locks.request('jc-job-' + id, { ifAvailable: true }, (lock) => {
      resolve(!!lock);
      return lock ? new Promise(() => {}) : undefined;     // hold for the life of the tab
    });
  });
}

// ------------------------------------------------------------------ links to the original files
export const canLink = 'showDirectoryPicker' in window;
export const keyOfFile = (f) => `${f.name}|${f.size}`;

/** Every photo file under a set of handles (folders walked recursively). */
export async function filesFromHandles(handles, accept) {
  const out = [];
  const walk = async (h, path) => {
    if (h.kind === 'file') { const f = await h.getFile(); if (!accept || accept(f)) { f.relPath = path + f.name; out.push(f); } return; }
    for await (const child of h.values()) await walk(child, path + h.name + '/');
  };
  for (const h of handles) { try { await walk(h, ''); } catch (e) { console.warn('could not read', h.name, e); } }
  return out;
}
export async function permissionOf(handles) {
  let state = 'granted';
  for (const h of handles) {
    const s = await h.queryPermission({ mode: 'read' }).catch(() => 'denied');
    if (s !== 'granted') state = s === 'denied' && state === 'granted' ? 'denied' : 'prompt';
  }
  return state;
}
/** Must be called from a click (browsers only ask for permission in response to the user). */
export async function requestAccess(handles) {
  for (const h of handles) if ((await h.requestPermission({ mode: 'read' }).catch(() => 'denied')) !== 'granted') return false;
  return true;
}
/** Handles from a drop (Chrome): folders and files keep a link, so the job can reconnect later. */
export async function handlesFromDrop(dt) {
  const items = [...(dt.items || [])].filter((i) => i.kind === 'file' && i.getAsFileSystemHandle);
  if (!items.length) return null;
  const hs = await Promise.all(items.map((i) => i.getAsFileSystemHandle().catch(() => null)));
  return hs.filter(Boolean);
}
