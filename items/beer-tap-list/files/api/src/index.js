/**
 * ontap-api — accounts and per-brewery tap lists.
 *
 * This is a SECOND Worker on purpose. The original one publishes a single board to a
 * GitHub repo and has been running in a shed for days; it must keep working, for free,
 * no matter what happens in here. Nothing in this file touches it.
 *
 * Public
 *   GET  /b/:slug.json            the board's tap list — no auth, cacheable
 *   GET  /health
 *
 * Accounts
 *   POST /v1/signup   { email, authKey, brewery }
 *   POST /v1/login    { email, authKey }         -> { token, expires }
 *   POST /v1/logout
 *   GET  /v1/me
 *
 * Board
 *   GET  /v1/board                               -> { data, updated, rev }
 *   PUT  /v1/board    { data, rev }              rev must match, or 409
 *
 * ---------------------------------------------------------------------------
 * A note on passwords, because the shape here is unusual and deliberate.
 *
 * Workers' free plan allows 10ms of CPU per request. A password hash worth having
 * (PBKDF2 at OWASP's ~600k iterations) costs far more than that, and moving to a paid
 * plan for it would put a fixed monthly cost on a product with no customers yet.
 *
 * So the expensive work happens in the browser: it derives an "authKey" from the
 * password with 250k PBKDF2 iterations, salted with the email address, and only that
 * key is ever sent. The server then applies its own cheap PBKDF2 pass with a random
 * per-user salt before storing.
 *
 * What that buys: the plaintext password never leaves the device, and a stolen
 * database still cannot be cracked without redoing the browser's 250k iterations per
 * guess. What it costs: the client must be trusted to do its part, so the authKey is
 * treated as the password would be — TLS only, never logged.
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

const SESSION_DAYS = 30;
const SERVER_ITERATIONS = 50000;   // ~5ms, inside the 10ms budget with room to spare
const MAX_BOARD_BYTES = 3_000_000;
const LOCKOUT_FAILS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;
const INVITE_DAYS = 14;
const RESET_MINUTES = 45;

/* What a plan allows. Kept here rather than scattered through the routes, so adding a
   tier later is one entry and not an audit. Enforced server side — a limit that only
   exists in the editor is a suggestion. */
const PLANS = {
  free:  { locations: 1, staff: 0 },
  trial: { locations: 1, staff: 2 },
  pro:   { locations: 5, staff: 10 },
};
function limits(plan) { return PLANS[plan] || PLANS.free; }

/* ---------------------------------------------------------------- helpers */

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...JSON_HEADERS, ...(extra || {}) },
  });
}

function cors(env, request) {
  const allowed = (env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim());
  const origin = request.headers.get("Origin") || "";
  // Localhost is always allowed, so the site can be developed against a local Worker
  // without loosening the deployed configuration. CORS is not the security boundary
  // here in any case — every private route requires a bearer token, and a token in
  // one origin's local storage is not readable from another.
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const ok = local ? origin
           : allowed.includes("*") ? "*"
           : (allowed.includes(origin) ? origin : allowed[0] || "");
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const enc = new TextEncoder();

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Comparison whose duration does not depend on where two values differ. */
function safeEqual(a, b) {
  const x = enc.encode(String(a || "")), y = enc.encode(String(b || ""));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function sha256Hex(s) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(String(s))));
}

/** The server's cheap second pass over the browser-derived key. */
async function derive(authKey, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(String(authKey)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(String(salt)), iterations: SERVER_ITERATIONS },
    key, 256,
  );
  return hex(bits);
}

const now = () => Date.now();
const id = () => randomHex(12);

/** Long enough that guessing a board URL is hopeless, short enough to retype. */
const newSlug = () => randomHex(9);

function validEmail(e) {
  return typeof e === "string" && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(e.trim()) && e.length <= 200;
}


/* ---------------------------------------------------------------- email

   Behind a single function on purpose. There is no email account yet, and the whole
   product is meant to cost nothing until it earns something — so with no provider
   configured this logs the message and reports that it could not send.

   What it deliberately does NOT do is return the link to the caller. That would make
   "reset my password" a way for anyone to obtain a reset link for any address. */
async function sendEmail(env, to, subject, text) {
  if (env.RESEND_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.RESEND_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "On Tap <noreply@example.com>",
                             to: [to], subject, text }),
    });
    return r.ok;
  }
  // Visible in `wrangler dev` and `wrangler tail`, nowhere else.
  console.log("[email not sent — no provider configured]", { to, subject, text });
  return false;
}

/* Stripe signs its webhooks: t=<timestamp>,v1=<hmac of "t.body">. Verifying it is the
   only thing standing between this endpoint and anyone who can POST, so it is done
   properly — and compared in constant time. */
async function stripeSigned(env, rawBody, header) {
  if (!env.STRIPE_WEBHOOK_SECRET || !header) return false;
  const parts = {};
  String(header).split(",").forEach((kv) => {
    const i = kv.indexOf("=");
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  if (!parts.t || !parts.v1) return false;
  // Reject anything older than five minutes, so a captured request cannot be replayed.
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;

  const key = await crypto.subtle.importKey("raw", enc.encode(env.STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(parts.t + "." + rawBody));
  return safeEqual(hex(mac), parts.v1);
}

/* ------------------------------------------------------------------ auth */

async function sessionUser(env, request) {
  const auth = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (!m) return null;
  const th = await sha256Hex(m[1]);
  const row = await env.DB.prepare(
    `SELECT s.user_id, s.expires, u.email
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`).bind(th).first();
  if (!row) return null;
  if (Number(row.expires) < now()) {
    // Tidy up as we go, so expired rows do not accumulate without a cron job.
    await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(th).run();
    return null;
  }
  return { id: row.user_id, email: row.email, tokenHash: th };
}

/** Every brewery this user can reach, oldest first. */
async function breweriesFor(env, userId) {
  const r = await env.DB.prepare(
    `SELECT b.id, b.slug, b.name, b.plan, m.role
       FROM members m JOIN breweries b ON b.id = m.brewery_id
      WHERE m.user_id = ? ORDER BY m.created`).bind(userId).all();
  return (r && r.results) || [];
}

/** The one being worked on: asked for by id or slug, otherwise the first. */
async function pickBrewery(env, userId, want) {
  const list = await breweriesFor(env, userId);
  if (!list.length) return null;
  if (!want) return list[0];
  return list.find((b) => b.id === want || b.slug === want) || null;
}

/** Owners can invite and remove; staff can only edit the board. */
function isOwner(b) { return b && b.role === "owner"; }

/* ---------------------------------------------------------------- routes */

export default {
  async fetch(request, env) {
    const co = cors(env, request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: co });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/health") return json({ ok: true }, 200, co);

    // ---- public board read -------------------------------------------------
    // Static, cacheable, no auth. This is what keeps a board free to serve and
    // able to survive the venue's wifi dropping.
    const board = /^\/b\/([A-Za-z0-9_-]{6,64})\.json$/.exec(path);
    if (board && request.method === "GET") {
      const row = await env.DB.prepare(
        `SELECT bo.data, bo.updated FROM boards bo
           JOIN breweries br ON br.id = bo.brewery_id
          WHERE br.slug = ?`).bind(board[1]).first();
      if (!row) return json({ error: "No such board" }, 404, co);
      return new Response(row.data, {
        headers: {
          ...JSON_HEADERS, ...co,
          // Short cache: the board polls every 60s, so a minute of staleness is
          // invisible, and it keeps D1 reads down as screens multiply.
          "Cache-Control": "public, max-age=30",
          "Last-Modified": new Date(row.updated).toUTCString(),
        },
      });
    }

    // Stripe's signature covers the exact bytes it sent, so this must read the raw body
    // itself — and therefore must come before anything parses it. Reading a request
    // body twice is not possible, and putting this after the JSON parse made the whole
    // endpoint unreachable while looking, from the outside, like it was rejecting
    // things correctly.
    // ---- stripe webhook ------------------------------------------------------
    // Unauthenticated by necessity; the signature is what makes it safe.
    if (path === "/v1/stripe/webhook" && request.method === "POST") {
      const raw = await request.text();
      if (!(await stripeSigned(env, raw, request.headers.get("Stripe-Signature")))) {
        return json({ error: "Bad signature" }, 400, co);
      }
      let ev = {};
      try { ev = JSON.parse(raw); } catch (e) { return json({ error: "Bad JSON" }, 400, co); }

      const o = (ev.data && ev.data.object) || {};
      // The brewery is carried in metadata at checkout, so a subscription can always be
      // traced back to what it pays for.
      const bid = (o.metadata && o.metadata.brewery_id) || null;
      const status = o.status || null;
      const until = o.current_period_end ? Number(o.current_period_end) * 1000 : null;

      if (ev.type === "checkout.session.completed" && bid) {
        await env.DB.prepare(
          `UPDATE breweries SET plan='pro', sub_status='active',
                  stripe_customer=?, stripe_subscription=? WHERE id=?`)
          .bind(o.customer || null, o.subscription || null, bid).run();
      } else if (/^customer\.subscription\./.test(ev.type || "")) {
        // Find it by subscription id when metadata is absent, which it is on updates.
        const where = bid ? "id = ?" : "stripe_subscription = ?";
        const key = bid || o.id;
        const lapsed = ev.type === "customer.subscription.deleted" ||
                       status === "canceled" || status === "unpaid";
        await env.DB.prepare(
          `UPDATE breweries SET plan = ?, sub_status = ?, sub_until = ? WHERE ` + where)
          .bind(lapsed ? "free" : "pro", lapsed ? "canceled" : (status || "active"), until, key).run();
      }
      return json({ ok: true, handled: ev.type || null }, 200, co);
    }

    let body = {};
    if (request.method === "POST" || request.method === "PUT") {
      try { body = await request.json(); }
      catch (e) { return json({ error: "Bad JSON" }, 400, co); }
    }

    // ---- signup ------------------------------------------------------------
    if (path === "/v1/signup" && request.method === "POST") {
      const email = String(body.email || "").trim().toLowerCase();
      const authKey = String(body.authKey || "");
      const name = String(body.brewery || "").trim();

      if (!validEmail(email)) return json({ error: "That email doesn't look right" }, 400, co);
      // 64 hex chars = the 256-bit key the browser is expected to derive. Rejecting
      // anything else stops a client sending a raw password by mistake.
      if (!/^[0-9a-f]{64}$/.test(authKey)) return json({ error: "Bad authKey" }, 400, co);
      if (!name || name.length > 120) return json({ error: "Name your brewery" }, 400, co);

      const existing = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first();
      if (existing) return json({ error: "There's already an account for that email" }, 409, co);

      const salt = randomHex(16);
      const hash = await derive(authKey, salt);
      const uid = id(), bid = id(), slug = newSlug(), t = now();

      // A signup that half-succeeded would be worse than one that failed, so the
      // account, the brewery, the membership and an empty board go in together.
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO users (id,email,pw_salt,pw_hash,created) VALUES (?,?,?,?,?)`)
          .bind(uid, email, salt, hash, t),
        env.DB.prepare(`INSERT INTO breweries (id,slug,name,plan,created) VALUES (?,?,?,?,?)`)
          .bind(bid, slug, name, "trial", t),
        env.DB.prepare(`INSERT INTO members (user_id,brewery_id,role,created) VALUES (?,?,?,?)`)
          .bind(uid, bid, "owner", t),
        env.DB.prepare(`INSERT INTO boards (brewery_id,data,updated,rev) VALUES (?,?,?,1)`)
          .bind(bid, JSON.stringify(starterBoard(name)), new Date(t).toISOString()),
      ]);

      const { token, expires } = await startSession(env, uid);
      return json({ ok: true, token, expires, brewery: { slug, name, plan: "trial" } }, 200, co);
    }

    // ---- login -------------------------------------------------------------
    if (path === "/v1/login" && request.method === "POST") {
      const email = String(body.email || "").trim().toLowerCase();
      const authKey = String(body.authKey || "");
      if (!email || !authKey) return json({ error: "Email and password, please" }, 400, co);

      const att = await env.DB.prepare(`SELECT fails, last FROM login_attempts WHERE key = ?`)
        .bind(email).first();
      if (att && Number(att.fails) >= LOCKOUT_FAILS && now() - Number(att.last) < LOCKOUT_MS) {
        return json({ error: "Too many attempts — try again in a few minutes" }, 429, co);
      }

      const u = await env.DB.prepare(`SELECT id, pw_salt, pw_hash FROM users WHERE email = ?`)
        .bind(email).first();

      // Derive either way, so a missing account and a wrong password take the same
      // time and cannot be told apart from the outside.
      const candidate = await derive(authKey, u ? u.pw_salt : "absent");
      const good = !!u && safeEqual(candidate, u.pw_hash);

      if (!good) {
        await env.DB.prepare(
          `INSERT INTO login_attempts (key,fails,last) VALUES (?,1,?)
           ON CONFLICT(key) DO UPDATE SET fails = fails + 1, last = excluded.last`)
          .bind(email, now()).run();
        return json({ error: "Wrong email or password" }, 401, co);
      }

      await env.DB.batch([
        env.DB.prepare(`DELETE FROM login_attempts WHERE key = ?`).bind(email),
        env.DB.prepare(`UPDATE users SET last_login = ? WHERE id = ?`).bind(now(), u.id),
      ]);
      const { token, expires } = await startSession(env, u.id);
      const list = await breweriesFor(env, u.id);
      return json({ ok: true, token, expires, brewery: list[0] || null, breweries: list }, 200, co);
    }

    // ---- password reset ------------------------------------------------------
    if (path === "/v1/reset/request" && request.method === "POST") {
      const email = String(body.email || "").trim().toLowerCase();
      const u = validEmail(email)
        ? await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first()
        : null;

      if (u) {
        const token = randomHex(24);
        await env.DB.prepare(
          `INSERT INTO resets (token_hash,user_id,created,expires) VALUES (?,?,?,?)`)
          .bind(await sha256Hex(token), u.id, now(), now() + RESET_MINUTES * 60 * 1000).run();
        const link = (env.SITE_BASE || "") + "/reset.html?token=" + token;
        await sendEmail(env, email, "Reset your On Tap password",
          "Someone asked to reset the password for this address.\n\n" + link +
          "\n\nThe link works once and expires in " + RESET_MINUTES + " minutes. " +
          "If it wasn't you, ignore this — nothing has changed.");
      }
      // Always the same answer, whether or not that address has an account. Otherwise
      // this becomes a way to find out who your customers are.
      return json({ ok: true, sent: true }, 200, co);
    }

    if (path === "/v1/reset/confirm" && request.method === "POST") {
      const token = String(body.token || "").trim();
      const authKey = String(body.authKey || "");
      if (!/^[0-9a-f]{64}$/.test(authKey)) return json({ error: "Bad authKey" }, 400, co);

      const th = await sha256Hex(token);
      const row = await env.DB.prepare(
        `SELECT user_id, expires, used FROM resets WHERE token_hash = ?`).bind(th).first();
      if (!row || row.used || Number(row.expires) < now()) {
        return json({ error: "That reset link has expired or been used" }, 410, co);
      }

      const salt = randomHex(16);
      const hash = await derive(authKey, salt);
      await env.DB.batch([
        env.DB.prepare(`UPDATE users SET pw_salt = ?, pw_hash = ? WHERE id = ?`)
          .bind(salt, hash, row.user_id),
        env.DB.prepare(`UPDATE resets SET used = ? WHERE token_hash = ?`).bind(now(), th),
        // Changing a password should end other sessions — that is usually the point.
        env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(row.user_id),
        env.DB.prepare(`DELETE FROM login_attempts WHERE key = (SELECT email FROM users WHERE id = ?)`)
          .bind(row.user_id),
      ]);
      return json({ ok: true }, 200, co);
    }

    // ---- everything below needs a session ----------------------------------
    const me = await sessionUser(env, request);

    if (path === "/v1/logout" && request.method === "POST") {
      if (me) await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(me.tokenHash).run();
      return json({ ok: true }, 200, co);
    }

    if (!me) return json({ error: "Not signed in" }, 401, co);

    if (path === "/v1/me" && request.method === "GET") {
      const list = await breweriesFor(env, me.id);
      return json({ ok: true, email: me.email,
                    brewery: list[0] || null, breweries: list }, 200, co);
    }

    if (path === "/v1/board") {
      const br = await pickBrewery(env, me.id, url.searchParams.get("b") || body.brewery);
      if (!br) return json({ error: "No such brewery on this account" }, 404, co);

      if (request.method === "GET") {
        const row = await env.DB.prepare(
          `SELECT data, updated, rev FROM boards WHERE brewery_id = ?`).bind(br.id).first();
        if (!row) return json({ error: "No board" }, 404, co);
        return json({ ok: true, slug: br.slug, rev: row.rev, updated: row.updated,
                      data: JSON.parse(row.data) }, 200, co);
      }

      if (request.method === "PUT") {
        if (typeof body.data !== "object" || body.data === null) {
          return json({ error: "Nothing to save" }, 400, co);
        }
        const text = JSON.stringify(body.data);
        if (text.length > MAX_BOARD_BYTES) return json({ error: "That's too big" }, 413, co);

        const cur = await env.DB.prepare(`SELECT rev FROM boards WHERE brewery_id = ?`)
          .bind(br.id).first();
        // Conflict detection belongs here, not only in the browser: two people with
        // the page open should not be able to silently overwrite each other, which is
        // exactly what kept happening on the single-file version.
        if (cur && Number(body.rev) !== Number(cur.rev)) {
          return json({ error: "Someone else saved first", rev: cur.rev }, 409, co);
        }

        const stamp = new Date().toISOString();
        const rev = (cur ? Number(cur.rev) : 0) + 1;
        await env.DB.prepare(
          `INSERT INTO boards (brewery_id,data,updated,rev) VALUES (?,?,?,?)
           ON CONFLICT(brewery_id) DO UPDATE SET data=excluded.data, updated=excluded.updated, rev=excluded.rev`)
          .bind(br.id, text, stamp, rev).run();
        return json({ ok: true, rev, updated: stamp, slug: br.slug }, 200, co);
      }
    }

    // ---- locations -----------------------------------------------------------
    if (path === "/v1/locations" && request.method === "POST") {
      const name = String(body.name || "").trim();
      if (!name || name.length > 120) return json({ error: "Name the location" }, 400, co);

      const mine = await breweriesFor(env, me.id);
      const owned = mine.filter(isOwner);
      // Judge the allowance by the best plan they own, so adding a second venue does
      // not depend on which one happens to be first in the list.
      const best = owned.reduce((a, b) => (limits(b.plan).locations > limits(a.plan).locations ? b : a),
                                owned[0] || { plan: "free" });
      const allowed = limits(best.plan).locations;
      if (owned.length >= allowed) {
        return json({ error: `Your plan covers ${allowed} location${allowed === 1 ? "" : "s"}.`,
                      code: "plan_limit", limit: allowed }, 402, co);
      }

      const bid = id(), slug = newSlug(), t = now();
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO breweries (id,slug,name,plan,created) VALUES (?,?,?,?,?)`)
          .bind(bid, slug, name, best.plan || "trial", t),
        env.DB.prepare(`INSERT INTO members (user_id,brewery_id,role,created) VALUES (?,?,?,?)`)
          .bind(me.id, bid, "owner", t),
        env.DB.prepare(`INSERT INTO boards (brewery_id,data,updated,rev) VALUES (?,?,?,1)`)
          .bind(bid, JSON.stringify(starterBoard(name)), new Date(t).toISOString()),
      ]);
      return json({ ok: true, brewery: { id: bid, slug, name, plan: best.plan, role: "owner" } }, 200, co);
    }

    // ---- team ----------------------------------------------------------------
    if (path === "/v1/team" && request.method === "GET") {
      const br = await pickBrewery(env, me.id, url.searchParams.get("b"));
      if (!br) return json({ error: "No such brewery" }, 404, co);
      const members = await env.DB.prepare(
        `SELECT u.id, u.email, m.role, m.created
           FROM members m JOIN users u ON u.id = m.user_id
          WHERE m.brewery_id = ? ORDER BY m.created`).bind(br.id).all();
      const pending = await env.DB.prepare(
        `SELECT email, role, created, expires FROM invites
          WHERE brewery_id = ? AND accepted IS NULL AND expires > ?`)
        .bind(br.id, now()).all();
      return json({ ok: true, brewery: br,
                    members: (members && members.results) || [],
                    invites: (pending && pending.results) || [] }, 200, co);
    }

    if (path === "/v1/invites" && request.method === "POST") {
      const br = await pickBrewery(env, me.id, body.brewery);
      if (!br) return json({ error: "No such brewery" }, 404, co);
      if (!isOwner(br)) return json({ error: "Only an owner can invite people" }, 403, co);

      const email = String(body.email || "").trim().toLowerCase();
      if (!validEmail(email)) return json({ error: "That email doesn't look right" }, 400, co);
      const role = body.role === "owner" ? "owner" : "staff";

      const seats = limits(br.plan).staff;
      const used = await env.DB.prepare(
        `SELECT (SELECT COUNT(*) FROM members WHERE brewery_id = ?) - 1
              + (SELECT COUNT(*) FROM invites WHERE brewery_id = ? AND accepted IS NULL AND expires > ?)
           AS n`).bind(br.id, br.id, now()).first();
      if (Number(used.n) >= seats) {
        return json({ error: `Your plan covers ${seats} extra ${seats === 1 ? "person" : "people"}.`,
                      code: "plan_limit", limit: seats }, 402, co);
      }

      const token = randomHex(24);
      await env.DB.prepare(
        `INSERT INTO invites (token_hash,brewery_id,email,role,invited_by,created,expires)
         VALUES (?,?,?,?,?,?,?)`)
        .bind(await sha256Hex(token), br.id, email, role, me.id, now(),
              now() + INVITE_DAYS * 86400 * 1000).run();

      // The link is returned rather than emailed: there is no email service yet, and
      // an owner can paste it to their staff. Sending is a later swap, not a redesign.
      return json({ ok: true, email, role, token,
                    expiresDays: INVITE_DAYS }, 200, co);
    }

    if (path === "/v1/invites/accept" && request.method === "POST") {
      const token = String(body.token || "").trim();
      if (!token) return json({ error: "No invitation" }, 400, co);
      const th = await sha256Hex(token);
      const inv = await env.DB.prepare(
        `SELECT brewery_id, email, role, expires, accepted FROM invites WHERE token_hash = ?`)
        .bind(th).first();
      if (!inv) return json({ error: "That invitation isn't valid" }, 404, co);
      if (inv.accepted) return json({ error: "That invitation has already been used" }, 409, co);
      if (Number(inv.expires) < now()) return json({ error: "That invitation has expired" }, 410, co);
      // Tie it to the address it was sent to, so a forwarded link cannot be redeemed
      // by somebody the owner never invited.
      if (String(inv.email) !== String(me.email).toLowerCase()) {
        return json({ error: "That invitation was sent to a different email address" }, 403, co);
      }

      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO members (user_id,brewery_id,role,created) VALUES (?,?,?,?)
           ON CONFLICT(user_id,brewery_id) DO UPDATE SET role = excluded.role`)
          .bind(me.id, inv.brewery_id, inv.role, now()),
        env.DB.prepare(`UPDATE invites SET accepted = ? WHERE token_hash = ?`).bind(now(), th),
      ]);
      const br = await pickBrewery(env, me.id, inv.brewery_id);
      return json({ ok: true, brewery: br }, 200, co);
    }

    if (path === "/v1/members/remove" && request.method === "POST") {
      const br = await pickBrewery(env, me.id, body.brewery);
      if (!br) return json({ error: "No such brewery" }, 404, co);
      if (!isOwner(br)) return json({ error: "Only an owner can remove people" }, 403, co);
      const who = String(body.userId || "");
      if (who === me.id) return json({ error: "You can't remove yourself" }, 400, co);

      // Never leave a brewery with nobody who can administer it.
      const owners = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM members WHERE brewery_id = ? AND role = 'owner'`)
        .bind(br.id).first();
      const target = await env.DB.prepare(
        `SELECT role FROM members WHERE brewery_id = ? AND user_id = ?`).bind(br.id, who).first();
      if (!target) return json({ error: "They're not on this brewery" }, 404, co);
      if (target.role === "owner" && Number(owners.n) <= 1) {
        return json({ error: "That's the last owner — make someone else an owner first" }, 400, co);
      }
      await env.DB.prepare(`DELETE FROM members WHERE brewery_id = ? AND user_id = ?`)
        .bind(br.id, who).run();
      return json({ ok: true }, 200, co);
    }

    return json({ error: "Unknown route" }, 404, co);
  },
};

async function startSession(env, userId) {
  const token = randomHex(32);
  const expires = now() + SESSION_DAYS * 86400 * 1000;
  await env.DB.prepare(`INSERT INTO sessions (token_hash,user_id,created,expires) VALUES (?,?,?,?)`)
    .bind(await sha256Hex(token), userId, now(), expires).run();
  return { token, expires };
}

/** A new board should show something, not an empty screen. */
function starterBoard(name) {
  return {
    brewery: name,
    tagline: "",
    showClock: true,
    perPage: "auto",
    rotateSeconds: 15,
    hideKicked: false,
    dimAtNight: false,
    bg: "charcoal",
    updated: new Date().toISOString(),
    taps: [
      { num: 1, name: "", style: "", abv: "", ibu: "", srm: 6,
        color: "#e0a63a", icon: "pint", level: 100, status: "pouring", notes: "" },
    ],
  };
}
