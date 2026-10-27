// Jesse's Mac: collects finished galleries from Jesse Chance Studio and puts them into Pixieset.
//
//   node helper/helper.mjs            # one pass: every gallery that's ready
//   node helper/helper.mjs --watch    # keep checking (the LaunchAgent runs this)
//
// For each ready gallery: download the photos to a temporary folder → create a HIDDEN Pixieset collection
// named after the couple (pixieset.mjs, through Jesse's own signed-in Pixieset in a real Chrome window) →
// tell Studio it's in Pixieset → free the cloud copy → delete the temporary folder → notify Jesse.
// Nothing is ever published or emailed to the couple: Jesse does that himself in Pixieset.
//
// Config: STUDIO_URL (default the live site) · helper key in Keychain: security add-generic-password -s jc-studio-helper -a jesse -w <key>
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { draftVenue } from './venue-draft.mjs';

const BASE = process.env.STUDIO_URL || 'https://sculpt.madlad-taps.workers.dev';
const TOKEN = process.env.HELPER_TOKEN || execFileSync('security', ['find-generic-password', '-s', 'jc-studio-helper', '-a', 'jesse', '-w']).toString().trim();
const WORK = process.env.HELPER_WORK || path.join(os.homedir(), 'JesseOS/workspace/pixieset/outbox');
const DRY = process.argv.includes('--dry-run');           // download + pretend to upload (testing)
const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);

const api = async (p, o = {}) => {
  const r = await fetch(BASE + p, { ...o, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(o.headers || {}) } });
  if (!r.ok) throw new Error(`${o.method || 'GET'} ${p} → ${r.status} ${await r.text().catch(() => '')}`);
  return r;
};
const setStatus = (id, body) => api(`/api/helper/deliveries/${id}/status`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
export const collectionName = (d) => `${d.couple.a} & ${d.couple.b}`;
const notify = (title, msg) => {
  try { execFileSync('osascript', ['-e', `display notification ${JSON.stringify(msg)} with title ${JSON.stringify(title)} sound name "Glass"`]); } catch { /* not at the Mac */ }
};

async function download(d, dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [i, name] of d.fileNames.entries()) {
    const out = path.join(dir, name);
    if (fs.existsSync(out) && fs.statSync(out).size > 0) continue;            // resumed after an interruption
    const r = await api(`/api/helper/deliveries/${d.id}/files/${encodeURIComponent(name)}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (+r.headers.get('content-length') && buf.length !== +r.headers.get('content-length')) throw new Error('short download: ' + name);
    fs.writeFileSync(out + '.part', buf); fs.renameSync(out + '.part', out);
    if (i % 25 === 0) log(`  downloaded ${i + 1}/${d.fileNames.length}`);
  }
  const have = fs.readdirSync(dir).filter((f) => !f.endsWith('.part'));
  if (d.fileNames.some((n) => !have.includes(n))) throw new Error('some photos did not download');
}

async function handle(d) {
  const name = collectionName(d);
  log(`gallery ${d.id}: ${name} · ${d.weddingDate} · ${d.venue} · ${d.fileNames.length} photos`);
  await setStatus(d.id, { status: 'sending' });
  const dir = path.join(WORK, d.id);
  try {
    await download(d, dir);
    let result;
    if (DRY) result = { url: `https://example.invalid/dry-run/${d.id}/`, uploaded: d.fileNames.length };
    else {
      const { uploadToPixieset } = await import('./pixieset.mjs');
      result = await uploadToPixieset({ name, date: d.weddingDate, dir, files: d.fileNames, log });
    }
    if (result.uploaded !== d.fileNames.length) throw new Error(`Pixieset shows ${result.uploaded} of ${d.fileNames.length} photos`);
    await setStatus(d.id, { status: 'in-pixieset', pixieset: result.url, note: `${result.uploaded} photos · hidden until you publish` });
    // a venue without a page yet: shortlist photos for Jesse to pick from (before the temporary copy goes)
    let draft = null;
    try { draft = draftVenue({ ...d, pixieset: result.url }, dir, log); } catch (e) { log('  venue draft failed:', e.message); }
    await api(`/api/helper/deliveries/${d.id}/purge`, { method: 'POST' });
    fs.rmSync(dir, { recursive: true, force: true });
    if (draft) notify('New venue — pick photos for its page', `${d.venue}: a shortlist from ${name} is ready in venue-drafts.`);
    log(`  ✓ in Pixieset: ${result.url}`);
    notify('Gallery ready in Pixieset', `${name} — ${d.fileNames.length} photos, hidden until you publish.`);
  } catch (e) {
    log('  ✗', e.message);
    await setStatus(d.id, { status: 'failed', note: String(e.message).slice(0, 280) }).catch(() => {});
    notify('Pixieset upload needs a look', `${name}: ${e.message}`);
  }
}

export async function pass() {
  const { deliveries, usedBytes, capBytes } = await (await api('/api/helper/deliveries?status=ready')).json();
  if (usedBytes > capBytes * 0.8) notify('Studio storage nearly full', `${(usedBytes / 1e9).toFixed(0)} GB waiting for Pixieset.`);
  for (const d of deliveries.sort((a, b) => a.created - b.created)) await handle(d);
  return deliveries.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--watch')) {
    log('watching', BASE);
    for (;;) { try { await pass(); } catch (e) { log('pass failed:', e.message); } await new Promise((r) => setTimeout(r, 120000)); }
  } else log('done:', await pass(), 'galleries');
}
