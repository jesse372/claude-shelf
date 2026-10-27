---
name: telly
description: "Mess with the MadLad tap list TVs (the taplist screen / the telly) in real time: scramble every word on the board, handwrite a message across the screen, or show a photo. One command: `telly`. TRIGGERS: 'taplist screen', 'tap list screen', 'on the telly', 'on the TV', 'jumble the screen', 'jumble the letters', 'write X on the screen', 'put this photo up', 'show this on the TV', 'prank the TV', 'want a laugh'."
---

# telly — the tap list TVs, on command

`telly` is on PATH (`~/.local/bin/telly` → `scripts/telly`). Every TV polls the
`ontap-publish` worker every 3s, so an effect lands within ~3s of sending.

```bash
telly jumble [secs]              # scramble every word on the board (default 2s)
telly write "text" [secs]        # handwritten text across the screen (default 30s, max 40 chars)
telly photo FILE [secs] ["cap"]  # upload a picture and show it framed (default 30s), optional caption
telly show [secs] ["cap"]        # show the last uploaded picture again
telly unphoto                    # delete the stored picture
telly laugh                      # next gag in the "Want a laugh?" rotation
telly status                     # what was last sent
```

## Rules that bite
- **One at a time.** A screen ignores signals that arrive while it is still running the previous
  effect (and has already marked them seen), so wait for the last one to finish.
- **New effect = TV code change.** Effects live in `~/Projects/beer-tap-list/index.html` (the
  "immature bit" block) and the worker `worker/src/index.js` (`/laugh`, `/laughimg`). After pushing,
  wait for `build.txt` to go live on Pages **plus ~75s** for the TVs to self-reload before firing —
  fire early and the old page runs a different gag (`n % 4`) instead.
- **Photos never go in the repo** — it's public. They live in the worker's KV (`laughimg`).
- Photo edits (e.g. drawing horns on) are easiest in Python/PIL; headless Chrome `--screenshot` hangs here.
