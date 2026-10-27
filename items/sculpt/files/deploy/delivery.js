// Deliveries: finished galleries waiting to go into Jesse's Pixieset.
//
//  photographer's browser (signed in)          Jesse's Mac (helper, Bearer HELPER_TOKEN)
//  POST /api/deliveries        → {id}           GET  /api/helper/deliveries            → ready ones
//  PUT  /api/deliveries/:id/files/:name         GET  /api/helper/deliveries/:id/files/:name
//  POST /api/deliveries/:id/done {files}        POST /api/helper/deliveries/:id/status {status, …}
//  GET  /api/deliveries/:id    → status         POST /api/helper/deliveries/:id/purge  (frees the storage)
//
// Photos live in R2 (binding DELIVERY) only until they're in Pixieset; records live in KV (binding STYLE,
// keys "dlv:<id>", with {status, bytes, created} as list metadata so totals need no extra reads).
// Safety: storage is capped (CAP_BYTES) and anything older than MAX_DAYS is cleared by the daily cron.

export const CAP_BYTES = 150 * 1024 ** 3;
export const MAX_DAYS = 14;
const MAX_FILE = 95 * 1024 * 1024;                   // Workers accept up to 100 MB per request
const NAME = /^[\w\-. ()&,']{1,120}\.jpe?g$/i;
const ID = /^[a-z0-9]{10,32}$/;
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const clean = (s, n = 80) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

async function getRec(env, id) { const v = await env.STYLE.get('dlv:' + id); return v ? JSON.parse(v) : null; }
async function putRec(env, rec) {
  rec.updated = Date.now();
  await env.STYLE.put('dlv:' + rec.id, JSON.stringify(rec), { metadata: { status: rec.status, bytes: rec.bytes || 0, created: rec.created } });
  return rec;
}
async function listRecs(env) {
  const out = []; let cursor;
  do { const r = await env.STYLE.list({ prefix: 'dlv:', cursor }); out.push(...r.keys); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  return out.map((k) => ({ id: k.name.slice(4), ...(k.metadata || {}) }));
}
async function purge(env, id) {
  let cursor;
  do {
    const r = await env.DELIVERY.list({ prefix: `d/${id}/`, cursor });
    if (r.objects.length) await env.DELIVERY.delete(r.objects.map((o) => o.key));
    cursor = r.truncated ? r.cursor : null;
  } while (cursor);
}
const pub = (r) => ({ id: r.id, status: r.status, couple: r.couple, weddingDate: r.weddingDate, venue: r.venue, venuePage: r.venuePage, photographer: r.photographer,
  expected: r.expected, files: r.files?.length || 0, bytes: r.bytes || 0, created: r.created, updated: r.updated, pixieset: r.pixieset || null, note: r.note || null });

/** Routes for signed-in users (photographers). Returns a Response, or null if the path isn't ours. */
export async function deliveryRoutes(req, env, url) {
  if (!url.pathname.startsWith('/api/deliveries')) return null;
  if (url.pathname === '/api/deliveries' && req.method === 'GET') return J({ enabled: !!env.DELIVERY });   // is sending switched on?
  if (!env.DELIVERY) return J({ error: 'Delivery storage is not switched on yet (Cloudflare R2).' }, 503);
  const parts = url.pathname.split('/').filter(Boolean);       // api, deliveries, :id, files, :name
  const id = parts[2], rec = id ? (ID.test(id) ? await getRec(env, id) : null) : null;
  if (id && !rec) return J({ error: 'no such delivery' }, 404);

  if (parts.length === 2 && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return J({ error: 'bad json' }, 400); }
    const couple = { a: clean(b.couple?.a, 40), b: clean(b.couple?.b, 40) };
    if (!couple.a || !couple.b || !/^\d{4}-\d{2}-\d{2}$/.test(b.weddingDate || '') || !clean(b.venue)) return J({ error: 'couple, weddingDate and venue are required' }, 400);
    const open = (await listRecs(env)).filter((r) => r.status !== 'purged');
    const used = open.reduce((s, r) => s + (r.bytes || 0), 0);
    if (used > CAP_BYTES) return J({ error: 'Delivery storage is full — Jesse’s Mac needs to catch up first.' }, 507);
    const rec = await putRec(env, {
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 20), status: 'uploading', created: Date.now(),
      couple, weddingDate: b.weddingDate, venue: clean(b.venue), venuePage: b.venuePage ? clean(b.venuePage, 120) : null,
      photographer: clean(b.photographer, 60) || null, jobId: clean(b.jobId, 40), expected: Math.max(0, Math.min(5000, +b.expected || 0)), bytes: 0,
    });
    return J(pub(rec), 201);
  }
  if (parts.length === 3 && req.method === 'GET') return J(pub(rec));
  if (parts.length === 5 && parts[3] === 'files' && req.method === 'PUT') {
    const name = decodeURIComponent(parts[4]);
    if (!NAME.test(name)) return J({ error: 'bad file name' }, 400);
    if (rec.status !== 'uploading') return J({ error: 'this delivery is already ' + rec.status }, 409);
    const len = +req.headers.get('Content-Length') || 0;
    if (!len || len > MAX_FILE) return J({ error: 'file too large or empty' }, 413);
    await env.DELIVERY.put(`d/${id}/${name}`, req.body, { httpMetadata: { contentType: 'image/jpeg' } });
    return J({ ok: true, name });
  }
  if (parts.length === 4 && parts[3] === 'done' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return J({ error: 'bad json' }, 400); }
    const want = (Array.isArray(b.files) ? b.files : []).filter((n) => NAME.test(n));
    const have = new Set(); let cursor, bytes = 0;
    do { const r = await env.DELIVERY.list({ prefix: `d/${id}/`, cursor }); for (const o of r.objects) { have.add(o.key.slice(`d/${id}/`.length)); bytes += o.size; } cursor = r.truncated ? r.cursor : null; } while (cursor);
    const missing = want.filter((n) => !have.has(n));
    if (missing.length) return J({ error: 'some photos have not arrived', missing }, 409);
    Object.assign(rec, { status: 'ready', files: want, bytes, readyAt: Date.now() });
    await putRec(env, rec);
    return J(pub(rec));
  }
  return J({ error: 'not found' }, 404);
}

/** Routes for Jesse's Mac. Auth: Authorization: Bearer <HELPER_TOKEN>. */
export async function helperRoutes(req, env, url) {
  if (!url.pathname.startsWith('/api/helper/')) return null;
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!env.HELPER_TOKEN || tok.length < 32 || tok !== env.HELPER_TOKEN) return J({ error: 'unauthorised' }, 401);
  if (!env.DELIVERY) return J({ error: 'Delivery storage is not switched on yet (Cloudflare R2).' }, 503);
  const parts = url.pathname.split('/').filter(Boolean);       // api, helper, deliveries, :id, …
  if (parts[2] !== 'deliveries') return J({ error: 'not found' }, 404);
  if (parts.length === 3 && req.method === 'GET') {
    const all = await listRecs(env), want = url.searchParams.get('status');
    const recs = await Promise.all(all.filter((r) => !want || r.status === want).map((r) => getRec(env, r.id)));
    const used = all.filter((r) => r.status !== 'purged').reduce((s, r) => s + (r.bytes || 0), 0);
    return J({ deliveries: recs.filter(Boolean).map((r) => ({ ...pub(r), fileNames: r.files || [] })), usedBytes: used, capBytes: CAP_BYTES });
  }
  const id = parts[3], rec = ID.test(id || '') ? await getRec(env, id) : null;
  if (!rec) return J({ error: 'no such delivery' }, 404);
  if (parts.length === 6 && parts[4] === 'files' && req.method === 'GET') {
    const name = decodeURIComponent(parts[5]);
    if (!NAME.test(name)) return J({ error: 'bad file name' }, 400);
    const o = await env.DELIVERY.get(`d/${id}/${name}`);
    if (!o) return J({ error: 'gone' }, 404);
    return new Response(o.body, { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(o.size), 'Cache-Control': 'no-store' } });
  }
  if (parts.length === 5 && parts[4] === 'status' && req.method === 'POST') {
    let b; try { b = await req.json(); } catch { return J({ error: 'bad json' }, 400); }
    const ok = ['ready', 'sending', 'in-pixieset', 'failed'];
    if (!ok.includes(b.status)) return J({ error: 'bad status' }, 400);
    Object.assign(rec, { status: b.status, note: b.note ? clean(b.note, 300) : rec.note, pixieset: b.pixieset ? clean(b.pixieset, 300) : rec.pixieset });
    return J(pub(await putRec(env, rec)));
  }
  if (parts.length === 5 && parts[4] === 'purge' && req.method === 'POST') {
    if (rec.status !== 'in-pixieset') return J({ error: 'only purge once it is safely in Pixieset' }, 409);
    await purge(env, id);
    Object.assign(rec, { status: 'purged', bytes: 0, purgedAt: Date.now() });
    return J(pub(await putRec(env, rec)));
  }
  return J({ error: 'not found' }, 404);
}

/** Daily: clear anything older than MAX_DAYS (abandoned uploads, or deliveries nobody collected). */
export async function sweep(env) {
  if (!env.DELIVERY) return;
  const old = Date.now() - MAX_DAYS * 86400e3;
  for (const r of await listRecs(env)) {
    if (r.status === 'purged' || (r.created || 0) > old) continue;
    await purge(env, r.id);
    const rec = await getRec(env, r.id);
    if (rec) await putRec(env, Object.assign(rec, { status: 'purged', bytes: 0, purgedAt: Date.now(), note: `cleared after ${MAX_DAYS} days (was ${rec.status})` }));
  }
}
