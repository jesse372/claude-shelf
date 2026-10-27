/**
 * ontap-publish — lets the tap-list editor save without holding a GitHub token.
 *
 * Why this exists: the token used to live in the browser's local storage, so
 * clearing browsing history wiped it and publishing broke. Now the token is a
 * server-side secret here, and the only thing the browser holds is a password
 * he can simply retype.
 *
 * Routes (all POST, JSON):
 *   /check    { password }                    -> { ok }
 *   /publish  { password, message, files[] }  -> { ok }   files: [{ path, content }]
 *
 * Everything else — the board, taps.json, GitHub Pages, the Fire TV app — is
 * untouched. This only replaces the editor's save path.
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

const LB_TO_KG = 0.45359237;

/**
 * Work a percentage out of whatever a device is able to measure.
 *
 * Deliberately forgiving about names, because every ecosystem spells these
 * differently and the alternative is a support conversation per brand. Returns
 * null when there is not enough to go on — a wrong level is worse than none.
 */
function toPercent(r) {
  const num = (...keys) => {
    for (const k of keys) {
      if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "") {
        const n = Number(r[k]);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };

  const pct = num("percent", "pct", "level", "remaining_percent");
  if (pct !== null) return pct;

  // Volume left, against the keg's size.
  const litres = num("litres", "liters", "l", "remaining_l");
  const capL = num("capacity_l", "capacity", "keg_l", "size_l");
  if (litres !== null && capL) return (litres / capL) * 100;

  const ml = num("ml", "millilitres", "milliliters", "remaining_ml");
  const capMl = num("capacity_ml", "keg_ml", "size_ml");
  if (ml !== null && capMl) return (ml / capMl) * 100;

  // Weight, against the empty and full weights of that keg. This is what a load
  // cell under a keg actually knows.
  let kg = num("kg", "weight_kg", "weight");
  let empty = num("empty_kg", "tare_kg", "tare");
  let full = num("full_kg", "gross_kg");
  const lb = num("lb", "lbs", "pounds", "weight_lb");
  if (kg === null && lb !== null) {
    kg = lb * LB_TO_KG;
    const eLb = num("empty_lb", "tare_lb"), fLb = num("full_lb");
    if (empty === null && eLb !== null) empty = eLb * LB_TO_KG;
    if (full === null && fLb !== null) full = fLb * LB_TO_KG;
  }
  if (kg !== null && empty !== null && full !== null && full > empty) {
    return ((kg - empty) / (full - empty)) * 100;
  }

  return null;
}

/** Store readings against tap numbers. Shared by the GET and POST forms. */
async function storeLevels(env, cors, readings, token) {
  // Fails closed: with no DEVICE_TOKEN set, nothing can write levels at all.
  if (!env.DEVICE_TOKEN) {
    return json({ ok: false, error: "Levels are not enabled — set the DEVICE_TOKEN secret" }, 503, cors);
  }
  if (!safeEqual(token, env.DEVICE_TOKEN)) {
    await sleep(1000);
    return json({ ok: false, error: "Bad token" }, 401, cors);
  }
  if (!Array.isArray(readings) || !readings.length) {
    return json({ ok: false, error: "No readings" }, 400, cors);
  }

  const raw = (await env.SIGNAL.get("levels")) || "{}";
  let taps = {};
  try { taps = JSON.parse(raw); } catch (e) {}

  const now = Date.now();
  const stored = [];
  for (const r of readings) {
    if (!r || typeof r !== "object") continue;
    const tapRaw = r.tap ?? r.num ?? r.tap_number ?? r.id;
    const tap = Number(tapRaw);
    if (!Number.isInteger(tap) || tap < 1 || tap > 99) continue;

    let pct = toPercent(r);
    if (pct === null) continue;
    // A keg cannot be more than full or less than empty, whatever the scale drifts to.
    pct = Math.max(0, Math.min(100, Math.round(pct * 10) / 10));

    taps[String(tap)] = {
      pct,
      at: now,
      src: String(r.src || r.source || r.device || "sensor").slice(0, 32),
    };
    stored.push({ tap, pct });
  }

  if (!stored.length) {
    return json({ ok: false, error: "Nothing usable — see SENSORS.md for the fields" }, 400, cors);
  }
  await env.SIGNAL.put("levels", JSON.stringify(taps));
  return json({ ok: true, stored }, 200, cors);
}

function corsHeaders(env, request) {
  const allowed = env.ALLOWED_ORIGIN || "*";
  const origin = request.headers.get("Origin") || "";
  return {
    // Echo the origin only when it matches, so this can't be driven from elsewhere.
    "Access-Control-Allow-Origin": origin === allowed ? origin : allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...JSON_HEADERS, ...(extra || {}) },
  });
}

/** Length-independent comparison, so timing can't leak the password. */
function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a || ""));
  const y = new TextEncoder().encode(String(b || ""));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gh(env, path, init) {
  const res = await fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + env.GH_TOKEN,
      Accept: "application/vnd.github+json",
      "User-Agent": "ontap-publish",
      "Content-Type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
  });
  return res;
}

/** Write one file, looking up its sha first (GitHub needs it to replace). */
async function putFile(env, path, content, message) {
  const base =
    "/repos/" + env.GH_OWNER + "/" + env.GH_REPO + "/contents/" + path;

  const head = await gh(env, base + "?ref=" + encodeURIComponent(env.GH_BRANCH), {
    method: "GET",
  });
  if (head.status !== 200 && head.status !== 404) {
    return { ok: false, status: head.status, error: "Could not read " + path };
  }
  let sha = null;
  if (head.status === 200) {
    const j = await head.json();
    sha = j && j.sha;
  }

  // Base64 of UTF-8, chunked so large backgrounds don't blow the call stack.
  const bytes = new TextEncoder().encode(content);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }

  const body = {
    message: message || "Update tap list",
    content: btoa(bin),
    branch: env.GH_BRANCH,
  };
  if (sha) body.sha = sha;

  const put = await gh(env, base, { method: "PUT", body: JSON.stringify(body) });
  if (put.status === 200 || put.status === 201) return { ok: true };

  let msg = "GitHub said " + put.status;
  try {
    const j = await put.json();
    if (j && j.message) msg += ": " + j.message;
  } catch (e) {}
  return { ok: false, status: put.status, error: msg };
}

// The laugh signal is JSON {t, n, text?, secs?}; older writes were "t:n".
function readLaugh(raw) {
  if (raw.charAt(0) === "{") {
    try {
      const j = JSON.parse(raw);
      const out = { t: Number(j.t) || 0, n: Number(j.n) || 0 };
      if (typeof j.text === "string" && j.text) out.text = j.text;
      if (j.img) out.img = 1;
      if (typeof j.fx === "string" && j.fx) out.fx = j.fx;
      if (out.text || out.img || out.fx) out.secs = Number(j.secs) || 30;
      return out;
    } catch (e) {}
  }
  const [t, n] = raw.split(":");
  return { t: Number(t) || 0, n: Number(n || 0) || 0 };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env, request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    const url = new URL(request.url);
    const route = url.pathname.replace(/\/+$/, "");

    // The TV polls this a few times a minute; it only ever reads a timestamp.
    if (route === "/laugh" && request.method === "GET") {
      const sig = readLaugh((await env.SIGNAL.get("laugh")) || "0:0");
      return json(sig, 200, {
        ...cors,
        "Cache-Control": "no-store",
      });
    }

    // The picture for the photo gag. Lives in KV, not the public repo.
    if (route === "/laughimg" && request.method === "GET") {
      const uri = await env.SIGNAL.get("laughimg");
      const m = uri && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(uri);
      if (!m) return new Response("no picture", { status: 404, headers: cors });
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Response(bytes, { status: 200, headers: { ...cors, "Content-Type": m[1], "Cache-Control": "no-store" } });
    }

    // ---- keg levels -------------------------------------------------------
    // Anyone's sensors are welcome: load cells, flow meters, a Plaato, Home
    // Assistant, a bare ESP32. The contract is a percentage — and where a device
    // can only report what it actually measures (litres, kilograms), the sum is
    // done here so the firmware stays dumb. See SENSORS.md.
    if (route === "/levels" && request.method === "GET") {
      const raw = (await env.SIGNAL.get("levels")) || "{}";
      let taps = {};
      try { taps = JSON.parse(raw); } catch (e) {}
      return json({ taps, now: Date.now() }, 200, { ...cors, "Cache-Control": "no-store" });
    }

    // GET is allowed for reporting too: plenty of small firmwares can manage a URL
    // with a query string and nothing more.
    if (route === "/level" && request.method === "GET") {
      return storeLevels(env, cors, [Object.fromEntries(url.searchParams)],
                         url.searchParams.get("token"));
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "POST only" }, 405, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "Bad JSON" }, 400, cors);
    }

    // A password is optional. Leave the APP_PASSWORD secret unset and the editor
    // needs no sign-in at all; set it later and the editor adapts on its own.
    if (env.APP_PASSWORD) {
      if (!safeEqual(body.password, env.APP_PASSWORD)) {
        await sleep(1000); // blunt the value of guessing
        return json({ ok: false, error: "Wrong password" }, 401, cors);
      }
    }

    if (route === "/check") return json({ ok: true }, 200, cors);

    // POST form: one reading, or a batch. Its own token, so a sensor on the shed
    // wall can never publish a beer list even if someone pulls the device apart.
    if (route === "/level") {
      const readings = Array.isArray(body.readings) ? body.readings
                     : Array.isArray(body) ? body : [body];
      return storeLevels(env, cors, readings, body.token);
    }

    // Stage a picture for the photo gag: {"image": "data:image/jpeg;base64,..."}.
    // {"image": null} deletes it.
    if (route === "/laughimg") {
      if (body.image === null) { await env.SIGNAL.delete("laughimg"); return json({ ok: true }, 200, cors); }
      if (typeof body.image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(body.image)) {
        return json({ ok: false, error: "image must be a jpeg/png/webp data URI" }, 400, cors);
      }
      if (body.image.length > 3000000) return json({ ok: false, error: "Picture too big" }, 400, cors);
      await env.SIGNAL.put("laughimg", body.image);
      return json({ ok: true }, 200, cors);
    }

    // Fired from the laptop; the TV picks it up on its next poll.
    if (route === "/laugh") {
      // Bump a counter alongside the timestamp so every screen runs the same gag.
      let n;
      if (Number.isInteger(body.n) && body.n >= 0 && body.n < 1000) {
        n = body.n;                       // fire a specific gag
      } else {
        const prev = readLaugh((await env.SIGNAL.get("laugh")) || "0:0");
        n = (prev.n + 1) % 1000;
      }
      // Optional: a word for the TV to handwrite across the screen.
      const sig = { t: Date.now(), n };
      if (typeof body.text === "string" && body.text.trim()) sig.text = body.text.trim().slice(0, 40);
      if (body.img === true) sig.img = 1;      // show the staged picture
      // A screen effect by name, e.g. {"fx":"jumble","secs":2}. Short ones allowed.
      if (typeof body.fx === "string" && /^[a-z]{1,20}$/.test(body.fx)) sig.fx = body.fx;
      if (sig.text || sig.img) {
        const secs = Number(body.secs);
        sig.secs = Number.isFinite(secs) ? Math.max(5, Math.min(120, Math.round(secs))) : 30;
      } else if (sig.fx) {
        const secs = Number(body.secs);
        sig.secs = Number.isFinite(secs) ? Math.max(1, Math.min(30, secs)) : 2;
      }
      await env.SIGNAL.put("laugh", JSON.stringify(sig));
      return json({ ok: true, ...sig }, 200, cors);
    }

    if (route === "/publish") {
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) return json({ ok: false, error: "Nothing to publish" }, 400, cors);

      for (const f of files) {
        if (!f || typeof f.path !== "string" || typeof f.content !== "string") {
          return json({ ok: false, error: "Bad file entry" }, 400, cors);
        }
        // Only ever touch the tap list's own files.
        if (!/^(taps\.json|bgphoto\.json)$/.test(f.path)) {
          return json({ ok: false, error: "Not allowed: " + f.path }, 400, cors);
        }
        if (f.content.length > 3_000_000) {
          return json({ ok: false, error: "Too big: " + f.path }, 413, cors);
        }
      }

      for (const f of files) {
        const r = await putFile(env, f.path, f.content, body.message);
        if (!r.ok) return json({ ok: false, error: r.error }, 502, cors);
      }
      return json({ ok: true }, 200, cors);
    }

    return json({ ok: false, error: "Unknown route" }, 404, cors);
  },
};
