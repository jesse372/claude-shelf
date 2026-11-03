# Lash Photo Studio

A one-page phone website for a lash or beauty artist. Choose a photo of a client's lashes, pick a look
(Soft studio, Warm luxe, Bright & airy or Moody editorial) and a shape, and OpenAI's image model retouches
the lighting, background and sharpness into an Instagram-ready shot. The prompt forbids changing the
lashes, eyes, brows or the client's face, so the photo stays an honest example of the work. Edited
"results" photos that misrepresent work can breach consumer law, and the page reminds the artist to
check before posting.

Runs as a single Cloudflare Worker. The OpenAI key stays on the server, and an access code keeps strangers
from using up your credit.

## Deploy (about 5 minutes)
```bash
npm i -g wrangler && wrangler login
wrangler deploy                          # prints your https://<name>.<you>.workers.dev URL
wrangler secret put OPENAI_API_KEY       # platform.openai.com → API keys (needs billing)
wrangler secret put ACCESS_CODE          # what you type once on your phone
```
Open the URL on your phone, enter the code, then Share → Add to Home Screen.

## Customise
- Branding: colours and fonts are CSS variables at the top of `src/page.html`; the title and "Luxe Beauty" kicker are in the header.
- Looks: edit `STYLES` in `src/worker.js`. Model and quality are in `wrangler.toml` `[vars]` (default `gpt-image-1.5`, `high`).
- Cost: about US$0.15-0.25 per photo at high quality, or roughly a quarter of that at `medium`. ChatGPT Plus does not cover API use, so set a monthly limit in the OpenAI dashboard.
