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
telly auto                       # the hourly gag: on/off, hours window, last fired
telly auto on|off                # hourly gag on or off
telly auto hours 11 23 | any     # only between these Perth hours (0-23), or any time
```

## The hourly gag (2026-11-08)
A Cloudflare cron on the `ontap-publish` worker (`[triggers] crons = ["0 * * * *"]`,
`scheduled()` -> `autoLaugh`) fires the next gag in the rotation at the top of every hour.
The schedule lives in the worker's KV key `auto` (`{on, from, to, last, lastN, count}`);
`GET/POST /auto` read and change it. It never fires twice within 50 min, and skips hours
outside the `from`-`to` window (Perth time; both null = any time). `com.jesse.site-health`
(6h) alerts if it is on, inside its hours, and has not fired for 70+ min.

## The iPhone app = the editor (Jesse 2026-11-08: "the main app feature should focus on editing the taplist")
`https://jesse372.github.io/beer-tap-list/edit.html`, Safari > Share > Add to Home Screen, installs as
"Tap List" (`edit.webmanifest`, beer icon). On a phone: tabs Beers / Screen / TVs, one row per beer that
opens on touch (segmented Pouring / Kicked / Coming soon first, rarely-used fields under "More details"),
a floating + to add a beer, and a publish bar that only grows when something differs from the TV.
The TVs tab has the hourly gag switch + the laugh button. Look (Jesse 2026-11-08 "not professional" ->
rebuilt): grey bg, white grouped lists, hairlines, one amber accent, SVG icons, no emoji, sentence-case labels,
copy "Up to date" / "Unpublished changes" / "Publish". Keep new screens on that system.
`telly.html` (write a line, show a photo, hourly hours, jumble) is a page inside that app with a
back link, not an app of its own. Same open access as the `telly` command.
