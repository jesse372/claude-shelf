# beer-tap-list — Tap List

Static site published to GitHub Pages (`jesse372/beer-tap-list`, branch `main`), plus two
Cloudflare Workers. No build step, no framework, no node_modules. Pages are hand-written
HTML with inline `<script>`.

## READ THIS FIRST — files that will burn your context

| File | Cost | Rule |
|---|---|---|
| `bgphoto.json` | **~75,000 tokens** (300KB base64 on ONE line) | **Never read. Never grep with `-C`/content mode.** |
| `taps.json` | ~13,600 tokens, **91% is a base64 logo** | Don't `Read` it. Use the jq recipe below. |
| `business-taps.json` | ~14,100 tokens, 88% base64 | Same. |
| `edit.html` | 2,019 lines / ~22,000 tokens | Read with `offset`/`limit`, not whole. |
| `index.html` | 1,399 lines / ~15,000 tokens | Read with `offset`/`limit`, not whole. |
| `next/**` | duplicate of all of the above | **Generated. Never read, never edit.** |

To inspect the beer list, use this instead of reading the file:

```bash
jq '{brewery, tagline, taps: [.taps[] | {name, style, abv, tap}]}' taps.json
```

To find a symbol, prefer `Grep` with `output_mode: "files_with_matches"` first, then
read only the matching line range. Do not read a whole page to make a one-line edit.

## Data schemas (so you never need to open the files)

`taps.json` is the live board. `business-taps.json` is the same schema plus per-tap
`prices` and a populated `extras`. Both carry a ~50KB base64 `logo` — that blob is the
only reason they're expensive.

```
brewery, tagline            str
logo                        base64 data URI  <-- ~50KB, the expensive part
logoOnly, logoBanner        bool
logoSize                    "s" | "m" | "l"
showClock, hideKicked       bool
perPage                     "auto" | int
rotateSeconds, rotate       int
updated                     ISO8601
bg, bgV                     str, cache-buster int
dimAtNight, dimFrom, dimTo  bool, hour int, hour int
showQR, qrCaption           bool, str

taps[]        num, name, style, abv, ibu, notes, color(#hex), srm,
              ready, guest(bool), icon, level(0-100), status,
              prices{s1,s2,s3}   <-- business-taps.json only
library[]     name, style, abv, ibu, notes, color, srm, icon   (off-tap catalogue)
pricing       on, currency, sizes[{id,name,ml}],
              happy{on, from, to, label, days[], prices{sN}}
extras        on, showOnTV, groups[{id, name, items[{id,name,desc,price}]}]
sensors       on
```

```
hall.json          generated(date), totals{beers,days,guest},
                   beers[{name,style,abv,ibu,srm,color,notes,guest,
                          runs[{from,to}], times, days, first, last}]
hall-ignore.json   [str]           style words to skip
version.json       versionCode, versionName, url    (Fire TV updater)
bgphoto.json       {photo: base64}  <-- ONE key. Nothing else. Never open it.
```

## Layout

Live pages live at the repo **root**. That is what the world sees.

- `index.html` — the board shown on the TVs. Self-reloads when `BUILD` != `build.txt`.
- `edit.html` — the editor Jesse uses to change the list.
- `menu.html` — the QR-code menu for phones.
- `hall.html` — hall of fame, data in `hall.json`.
- `print.html` — printable version.
- `signin.html` — password gate. No data, so it has no `DATA_BASE`.

Shared assets: `taplib.js`, `config.js`, `icons.js`, `authkey.js`, `fonts/`.

- `next/` — **generated staging copy. Never edit by hand; `stage.sh` overwrites it.**
- `api/` — Cloudflare Worker `ontap-api`, D1-backed. Entry `api/src/index.js`.
- `worker/` — Cloudflare Worker `ontap-publish`. Holds the GitHub token server-side and
  commits editor changes back to the repo. Secrets via `wrangler secret put`, never committed.
- `firetv-app/` — Android TV wrapper (`ontap.apk`). Rarely touched.

## The staging workflow

Edit the **root** pages. Then:

```bash
./stage.sh      # copy root -> next/, rewriting DATA_BASE and STAGING
                # staging reads the LIVE beer list, so you see real beers
./promote.sh    # copy next/ -> root, undo the rewrites, then run ./bump.sh
git add -A && git commit && git push   # this is what actually publishes
```

`stage.sh` and `promote.sh` flip three magic constants with regex + `assert`. If you rename
any of these, **both scripts break loudly**:

- `var DATA_BASE = "";` ←→ `"../"` — required in index/edit/menu/print/hall
- `var STAGING   = false;` ←→ `true` — index and edit only
- `var BUILD = "...";` — index only; `bump.sh` stamps it and writes `build.txt`

`bump.sh` must leave `index.html`'s `BUILD` matching `build.txt`. If they ever disagree the
TVs reload forever.

## Conventions

- New page? Add it to the `PAGES` tuple in **both** `stage.sh` and `promote.sh`.
- Images are inlined as base64 data URIs into JSON. That's deliberate (GitHub Pages, no
  asset pipeline) — it's why the data files are hostile to read.
- Never commit `worker/.dev.vars` or `firetv-app/keystore.jks`.
