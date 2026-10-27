// Sculpt on Cloudflare: serves the static app behind a simple password.
// Photos never touch this server — all processing happens in the visitor's browser.
//
// Secrets:  PASSWORD  (wrangler secret put PASSWORD)
//           HELPER_TOKEN  (Jesse's Mac: collects finished galleries for Pixieset — see delivery.js)
import { deliveryRoutes, helperRoutes, sweep } from './delivery.js';

const COOKIE = 'sculpt_auth';
const MAX_AGE = 60 * 60 * 24 * 120; // stay signed in ~4 months

async function token(env) {
  const data = new TextEncoder().encode('sculpt-v1:' + env.PASSWORD);
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function getCookie(req, name) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? m[1] : '';
}
function isolate(res, { noStore = false } = {}) {
  const h = new Headers(res.headers);
  // cross-origin isolation → multi-threaded WebAssembly AI in the browser
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'require-corp');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'no-referrer');
  if (noStore) h.set('Cache-Control', 'no-store');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)[\w\-./]*$/.test(n) ? n : '/');
const loginPage = (msg = '', next = '/') => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Jesse Chance Studio — sign in</title>
<link rel="icon" href="/icons/jc-favicon.png" type="image/png"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#FBF8F4"><meta name="robots" content="noindex">
<style>@font-face{font-family:'Cormorant Garamond';font-weight:300 500;src:url(/fonts/cormorant-garamond-300-latin.woff2) format('woff2')}
@font-face{font-family:'Cormorant Garamond';font-style:italic;font-weight:300 500;src:url(/fonts/cormorant-garamond-300-italic-latin.woff2) format('woff2')}
@font-face{font-family:'Jost';font-weight:300 500;src:url(/fonts/jost-300-latin.woff2) format('woff2')}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#FBF8F4;color:#17130F;
font:300 15px/1.6 'Jost',-apple-system,BlinkMacSystemFont,sans-serif;-webkit-font-smoothing:antialiased}
form{width:min(380px,90vw);text-align:center;padding:20px}
.mark{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:58px;line-height:1;margin-bottom:22px}
.eyebrow{font-size:10.5px;letter-spacing:.34em;text-transform:uppercase;color:#7A6E63;display:flex;align-items:center;justify-content:center;gap:14px;margin:0 0 14px}
.eyebrow:before,.eyebrow:after{content:'';width:30px;height:1px;background:#A9895E}
h1{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:46px;line-height:1;margin:0 0 30px;letter-spacing:-.02em}h1 em{color:#B8536D}
input{width:100%;padding:14px 2px;border:0;border-bottom:1px solid #D9CDBE;background:transparent;color:#17130F;font:300 16px 'Jost',sans-serif;outline:none;text-align:center;letter-spacing:.06em;transition:border-color .4s}
input:focus{border-bottom-color:#17130F}
button{margin-top:26px;width:100%;padding:16px;border:1px solid #17130F;background:#17130F;color:#FBF8F4;font:400 11px 'Jost',sans-serif;letter-spacing:.24em;text-transform:uppercase;cursor:pointer;transition:background .5s,color .5s}
button:hover{background:transparent;color:#17130F}
.err{color:#B8536D;margin-top:14px;min-height:1em;font-size:13px}.m{color:#A99D90;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;margin-top:26px}</style></head>
<body><form method="POST" action="/login"><div class="mark">JC</div><p class="eyebrow">Jesse Chance Studio</p>
<h1>Welcome <em>back</em></h1>
<input type="hidden" name="next" value="${safeNext(next)}"><input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password">
<button>Sign in</button><div class="err">${msg}</div><div class="m">Photos stay on your computer</div></form></body></html>`;

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(sweep(env)); },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!env.PASSWORD) return new Response('Jesse Chance Studio is not configured (PASSWORD secret missing).', { status: 500 });
    // icons are public so the login page / home-screen icon look right
    if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/fonts/') || url.pathname === '/manifest.webmanifest') return isolate(await env.ASSETS.fetch(req));

    // Jesse's Mac collects finished galleries with its own key (no site password involved)
    const helper = await helperRoutes(req, env, url);
    if (helper) return helper;

    const good = await token(env);
    if (url.pathname === '/login' && req.method === 'POST') {
      const form = await req.formData();
      const pw = String(form.get('password') || ''), next = safeNext(String(form.get('next') || '/'));
      if (safeEqual(pw, env.PASSWORD)) {
        return new Response(null, {
          status: 303,
          headers: { Location: next, 'Set-Cookie': `${COOKIE}=${good}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax` },
        });
      }
      await new Promise((r) => setTimeout(r, 1200));   // slow down guessing
      return isolate(new Response(loginPage('Wrong password', next), { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } }), { noStore: true });
    }
    if (url.pathname === '/logout') {
      return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax` } });
    }
    if (!safeEqual(getCookie(req, COOKIE), good)) {
      const html = req.headers.get('Accept')?.includes('text/html');
      return isolate(html
        ? new Response(loginPage('', url.pathname), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        : new Response('Sign in first', { status: 401 }), { noStore: true });
    }
    // ---- finished galleries on their way to Pixieset ----
    const dlv = await deliveryRoutes(req, env, url);
    if (dlv) return isolate(dlv);
    // ---- trained style (from before/after pairs) ----
    if (url.pathname === '/api/learned') {
      const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
      if (req.method === 'GET') {
        const v = await env.STYLE.get('learned');
        return isolate(new Response(v || '{}', { headers: H }));
      }
      if (req.method === 'PUT') {
        const body = await req.text();
        if (body.length > 10 * 1024 * 1024) return new Response('too large', { status: 413 });
        try { JSON.parse(body); } catch { return new Response('bad json', { status: 400 }); }
        await env.STYLE.put('learned', body);
        return isolate(new Response('{"ok":true}', { headers: H }));
      }
      return new Response('method not allowed', { status: 405 });
    }
    // ---- shared "My style" (KV) ----
    if (url.pathname === '/api/style') {
      const H = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
      if (req.method === 'GET') {
        const v = await env.STYLE.get('style');
        return isolate(new Response(v || '{}', { headers: H }));
      }
      if (req.method === 'PUT') {
        const body = await req.text();
        if (body.length > 20 * 1024 * 1024) return new Response('too large', { status: 413 });
        try { JSON.parse(body); } catch { return new Response('bad json', { status: 400 }); }
        await env.STYLE.put('style', body);
        return isolate(new Response('{"ok":true}', { headers: H }));
      }
      return new Response('method not allowed', { status: 405 });
    }
    if (url.pathname === '/api/style/examples' && req.method === 'POST') {
      const ex = await req.text();
      if (ex.length > 64 * 1024) return new Response('too large', { status: 413 });
      let item; try { item = JSON.parse(ex); } catch { return new Response('bad json', { status: 400 }); }
      const cur = JSON.parse((await env.STYLE.get('style')) || '{"finals":[],"examples":[],"look":null}');
      cur.examples = [...(cur.examples || []), item].slice(-600);
      cur.updatedAt = Date.now();
      await env.STYLE.put('style', JSON.stringify(cur));
      return isolate(new Response(JSON.stringify({ ok: true, n: cur.examples.length }), { headers: { 'Content-Type': 'application/json' } }));
    }
    const res = await env.ASSETS.fetch(req);
    // app code always fresh; big AI files cache for a week
    const big = /\/vendor\//.test(url.pathname);
    const out = isolate(res, { noStore: !big });
    if (big && res.ok) out.headers.set('Cache-Control', 'private, max-age=604800');
    return out;
  },
};
