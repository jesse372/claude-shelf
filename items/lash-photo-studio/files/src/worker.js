// Luxe Lash Studio: Bec uploads a phone photo of a client's lashes, OpenAI's
// image model retouches it into a pro-looking Instagram shot.
// The OpenAI key never reaches the browser: it lives in a Worker secret.
import PAGE from "../build/index.html";

const STYLES = {
  studio:
    "Soft professional beauty-studio lighting: even, diffused key light like a beauty dish with a soft ring-light catchlight, " +
    "clean neutral white balance, crisp detail, softly blurred neutral background.",
  luxe:
    "Warm luxury-salon look: soft golden-beige tones, gentle glow, creamy blurred cream-and-champagne background, " +
    "elegant and high-end, still natural.",
  bright:
    "Bright, airy, high-key look: clean white or very light background, fresh daylight-balanced light, " +
    "minimal shadows, crisp and modern.",
  editorial:
    "Moody editorial look: richer contrast, deep warm dark background, a single soft directional light sculpting the eye, " +
    "magazine-quality but realistic.",
};

const SIZES = { square: "1024x1024", portrait: "1024x1536", original: "auto" };

function buildPrompt(style, notes) {
  return [
    "Retouch this smartphone photo of a client's eyelash extensions into a professional, high-end beauty-salon portfolio photo for Instagram.",
    "",
    "THE LASH WORK MUST STAY EXACTLY AS PHOTOGRAPHED. This photo shows real work and must be an honest portfolio piece:",
    "- Do not add, remove, lengthen, thicken, curl, separate or re-shape any lash. Keep the exact number, length, curl, thickness, density, mapping, style and colour of every lash.",
    "- Do not change the eye shape, eyelids, eyebrows, eye colour, or the client's identity or facial features.",
    "- Do not add makeup, eyeliner or glitter that is not already there.",
    "",
    "ONLY improve the photography:",
    "- Lighting and colour: " + (STYLES[style] || STYLES.studio),
    "- Pin-sharp focus and fine detail on the lashes; reduce phone noise and blur.",
    "- Remove distracting background clutter (bedding, towels, equipment, room) and replace it with a clean, softly blurred background that matches the look.",
    "- Very light, natural skin retouch only: soften temporary redness, tape marks and small blemishes, but keep real skin texture. No plastic or airbrushed look.",
    "- Keep the same framing and camera angle as the original, centred on the eye(s).",
    "- No text, logos, watermarks, borders or frames.",
    notes ? "\nExtra request from the lash artist (never override the lash rules above): " + notes.slice(0, 400) : "",
  ].join("\n");
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function codeOk(env, given) {
  const want = env.ACCESS_CODE || "";
  if (!want) return true; // no code configured = open
  const a = new TextEncoder().encode(String(given || "").trim().toLowerCase());
  const b = new TextEncoder().encode(want.trim().toLowerCase());
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function callOpenAI(env, image, style, size, notes, fidelity) {
  const fd = new FormData();
  fd.append("model", env.OPENAI_MODEL || "gpt-image-1.5");
  fd.append("image", image, "photo.jpg");
  fd.append("prompt", buildPrompt(style, notes));
  fd.append("size", SIZES[size] || "auto");
  fd.append("quality", env.OPENAI_QUALITY || "high");
  fd.append("output_format", "jpeg");
  fd.append("output_compression", "92");
  if (fidelity) fd.append("input_fidelity", "high");
  return fetch((env.OPENAI_BASE || "https://api.openai.com") + "/v1/images/edits", {
    method: "POST",
    headers: { authorization: "Bearer " + env.OPENAI_API_KEY },
    body: fd,
  });
}

async function enhance(request, env) {
  if (!env.OPENAI_API_KEY) {
    return json({ error: "The site isn't connected to OpenAI yet. Add the OpenAI API key to the Worker." }, 503);
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Couldn't read the upload. Please try again." }, 400);
  }
  if (!codeOk(env, form.get("code"))) return json({ error: "Wrong access code.", badCode: true }, 401);

  const image = form.get("image");
  if (!image || typeof image === "string") return json({ error: "Please choose a photo first." }, 400);
  if (image.size > 20 * 1024 * 1024) return json({ error: "That photo is too big (max 20 MB)." }, 413);

  const style = String(form.get("style") || "studio");
  const size = String(form.get("size") || "original");
  const notes = String(form.get("notes") || "").trim();

  let res = await callOpenAI(env, image, style, size, notes, true);
  if (res.status === 400) {
    // Some models reject input_fidelity; retry once without it.
    const peek = await res.clone().text();
    if (/input_fidelity/i.test(peek)) res = await callOpenAI(env, image, style, size, notes, false);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || "OpenAI returned an error (" + res.status + ").";
    console.log("openai error", res.status, msg);
    let friendly = "Something went wrong making the photo. Please try again.";
    if (res.status === 401) friendly = "The OpenAI key isn't working. Check the Worker's OPENAI_API_KEY.";
    else if (res.status === 429 || /billing|quota|limit/i.test(msg)) friendly = "OpenAI says the account is out of credit or busy. Check the OpenAI billing.";
    else if (/safety|moderation|rejected/i.test(msg)) friendly = "OpenAI wouldn't edit this photo. Try a different shot.";
    return json({ error: friendly, detail: msg }, 502);
  }
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) return json({ error: "No image came back. Please try again." }, 502);
  return json({ image: "data:image/jpeg;base64," + b64 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/enhance" && request.method === "POST") return enhance(request, env);
    if (url.pathname === "/api/check" && request.method === "POST") {
      const { code } = await request.json().catch(() => ({}));
      return json({ ok: codeOk(env, code), connected: Boolean(env.OPENAI_API_KEY) });
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(PAGE, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
          "x-robots-tag": "noindex, nofollow",
        },
      });
    }
    return new Response("Not found", { status: 404 });
  },
};
