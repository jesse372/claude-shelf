# ✨ Sculpt — cull, edit & retouch, then deliver to Pixieset

**Use it:** https://sculpt.madlad-taps.workers.dev (password in macOS Keychain: `security find-generic-password -s sculpt-site -a jesse -w`).
Works in Chrome, Edge or Safari on any computer. Photos are processed **in the browser** and never uploaded.
Offline Mac version: double-click `Sculpt.command`.

## Workflow
1. **Cull** — drop a card/folder (RAW: Canon CR2/CR3, Nikon NEF, Sony ARW, Fuji RAF, DNG, …; JPG, HEIC, TIFF).
   AI flags closed eyes, blur and burst duplicates (picks the best of each). *AI auto-cull* accepts its picks;
   P / X / U / 1–5 to cull by hand. RAW+JPEG pairs import as one photo. Flags & sliders are remembered per file on that computer.
2. **Edit** — *Colour*: Auto, looks (+ save your own), WB, exposure, highlights/shadows, whites/blacks, clarity, vibrance (skin-safe).
   *Retouch*: smooth skin (keeps pores; eyes/brows/lips/hair protected), even skin tone, **🩹 Remove** brush (exit signs, blemishes, objects).
   *Shape*: slim face, jawline, double chin, slim body/waist/hips/arms/legs + Push/Restore liquify.
   *Copy edits* to all picks. RAW files are edited in 16-bit.
3. **Export** — full-quality JPEGs keeping the original file name + capture date (Pixieset sorts by date taken) → drag the folder into your Pixieset gallery.

## ✨ Process shoot (auto-pilot for photographers)
Drop the card → **Process shoot** → choose a folder. Sculpt culls (blinks/blur/bursts), edits each pick in
Jesse's style, applies a natural skin retouch and a barely-there shape polish (children are never touched),
and exports full-quality JPEGs with original names + capture dates. Everything stays editable in Edit.

## My style (shared by everyone using the site)
- **Tone** is learned from finished photos (Edit → Colour → *Teach from finished photos…*, 20–200 photos):
  for each new photo Sculpt finds your finished photos of similar scenes and matches their brightness/contrast/blacks.
  Measured: 30% closer to the photographer's finish on 31 held-out photos; no colour casts.
- **Colour** can't be learned reliably from finished photos alone (tested: it copies scene content, not style), so it
  comes from *Use this photo's colour as my look* and is then **learned from every photo whose colour is fixed by hand
  in Sculpt** (after 5+ edits it predicts colour per scene).
- Stored in Cloudflare KV (`/api/style`); the offline Mac version keeps it in `data/style.json`.

## How it works
| Piece | File | Tech |
|---|---|---|
| Import | `js/io.js` | LibRaw (WASM), libheif, UTIF; embedded RAW previews for fast culling; EXIF read/write |
| Cull AI | `js/cull.js`, `js/detect.js` | MediaPipe face mesh blendshapes (blinks), Laplacian sharpness (calibrated), dHash + capture time bursts |
| Render | `js/render.js` | WebGL2: warp field → skin/chin → develop, all GPU at full res; 16-bit half-float for RAW |
| Shape | `js/warp.js` | Face mesh + pose + person segmentation → smooth displacement fields per slider |
| Skin | `js/skin.js` | Face-oval-minus-features mask ∪ learned skin-colour inside the person silhouette |
| Remove | `js/inpaint.js` | LaMa (208 MB, best) / MI-GAN (28 MB, fast) via ONNX Runtime WASM, multi-threaded (COOP/COEP) |
| Hosting | `deploy/` | Cloudflare Worker + static assets, cookie password gate; removal models load from Hugging Face and are cached |

## Commands
- `./deploy/deploy.sh` — build + deploy the website · `./deploy/deploy.sh --password` — change the password
- `node tests/e2e.mjs` — full local self-check (17 checks; headless Chrome on :9333, `python3 server.py` on :8765)
- `node tests/autopilot.mjs` — teach style → Process shoot → verify cull, edits and exported files
- `node tests/style-eval2.mjs` — honest style-learning benchmark (needs tests/fixtures/style2)
- `SCULPT_PASSWORD=… node tests/live.mjs` — smoke-test the live site
- `./setup.sh` — fetch AI models/libraries into `vendor/` (gitignored)

## Limits
- Pixieset has no public upload API, so the last step is dragging the exported folder into the gallery (Jesse is asking Pixieset for official access).
- Automatic reshaping is deliberately uniform and tiny: geometry couldn't reliably tell who has a double chin or fuller figure (tested on ~100 photos).
- Slimming is a warp: straight lines right beside the body can bend → use Restore.
- Very large Fuji X-Trans RAWs take ~10–20 s to develop; the next photo is pre-loaded in the background.
- Object removal: first use downloads the 208 MB model (once per browser); each removal takes a few seconds.
