---
name: web-essentials
description: "Standing best-practices CHECKLIST for every website/landing page/HTML page you build — ALWAYS include a favicon AND an iPhone Add-to-Home-Screen (apple-touch) icon, usually the brand emoji, plus the apple-mobile-web-app meta tags and a theme-color. Includes emoji_icon.py to generate a favicon + 180x180 home-screen icon from an emoji and print a copy-paste <head> snippet. USE WHENEVER building or editing any web page, worker-served HTML, landing page, or single-file site. TRIGGERS: 'build a website', 'landing page', 'web page', 'favicon', 'home screen icon', 'add to home screen', 'apple-touch-icon', 'app icon', 'shortcut icon', 'site for'."
version: 1.0.0
metadata:
  tags: [Web, Frontend, Design, Conventions]
---

# web-essentials — never-forget website checklist

**Standing rule: every website you ship MUST include a favicon AND a clean iPhone "Add to Home
Screen" icon.** Default to the project's brand **emoji** on a dark rounded tile (matches dark UIs).
Don't ship a page without these — a blank favicon / screenshot home-screen icon looks unfinished.

## The checklist (paste into every page's `<head>`)
1. **Favicon** — SVG emoji data-URI (crisp at any size, works in all modern browsers).
2. **apple-touch-icon** — a real **180×180 PNG** (iOS ignores SVG here; without a PNG iOS uses an
   ugly screenshot of the page as the home-screen icon).
3. **apple-mobile-web-app-capable = yes** + **status-bar-style** + **apple-mobile-web-app-title**
   (the label shown under the home-screen icon).
4. **theme-color** — match the page background.
5. Always have a `<title>` and `<meta name="viewport" ...>` (table stakes).

## Generate it (one command)
```bash
S=~/.claude/skills/web-essentials/scripts/emoji_icon.py
$S "🚀" --title "My Site" --bg "#0e0f13"            # prints the <head> snippet
$S "🚀" --title "My Site" --out-dir ./icons         # also writes png/svg/snippet files
```
It prints a ready-to-paste block with the favicon + apple-touch-icon **inline as data URIs**, so a
single-file page or a Cloudflare Worker that returns HTML needs **no extra hosted assets**. Paste it
inside `<head>`.

## How it works / pitfalls
- The PNG is rendered from **AppleColorEmoji** (`/System/Library/Fonts/Apple Color Emoji.ttc`) via
  Pillow with `embedded_color=True`. That font is **bitmap-only** — only specific strike sizes load;
  the script tries 160→137→128→96 and scales. "invalid pixel size" = wrong strike (handled).
- Needs Pillow (`pip install pillow`) and macOS (for the Apple emoji font). On Linux, swap the font
  path for `NotoColorEmoji.ttf`.
- Inline data-URI apple-touch-icons work on modern iOS. If you prefer a hosted file, use `--out-dir`
  and serve `apple-touch-icon.png` at the site root with `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`.
- For worker-served single-file sites, inline data-URIs are the clean choice — no second request,
  no asset routing.

## Verify
```bash
# the served page must contain both icon links + the web-app meta:
curl -s <url> | grep -oE 'rel="(icon|apple-touch-icon)"|apple-mobile-web-app-(capable|title)'
# expect: rel="icon", rel="apple-touch-icon", apple-mobile-web-app-capable, apple-mobile-web-app-title
```
On iPhone: open the page in Safari → Share → Add to Home Screen → the icon should be the emoji tile
(not a page screenshot), and the label should match `--title`.
