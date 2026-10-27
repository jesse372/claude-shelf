#!/usr/bin/env python3
"""Generate a favicon + iPhone home-screen (apple-touch) icon from an emoji and print the
ready-to-paste <head> snippet. Standing rule: EVERY website you build ships a favicon AND an
Add-to-Home-Screen icon — usually the brand emoji.

Usage:
  emoji_icon.py "🚀" --title "My Site"            # prints <head> snippet (inline data URIs)
  emoji_icon.py "🚀" --title "My Site" --out-dir ./icons   # also writes png/svg/snippet files
Outputs an SVG favicon (emoji as text) + a 180x180 PNG apple-touch-icon (rounded, on a bg color),
both inline as data URIs so a single-file worker/page needs no extra assets.
"""
import argparse, base64, io, os, sys, urllib.parse
from PIL import Image, ImageDraw, ImageFont

APPLE_EMOJI = "/System/Library/Fonts/Apple Color Emoji.ttc"

def hexrgba(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (255,)

def render_png(emoji, size, bg, radius):
    # AppleColorEmoji is a bitmap font; only specific strike sizes load. Try largest first, scale down.
    for strike in [160, 137, 128, 96]:
        try:
            font = ImageFont.truetype(APPLE_EMOJI, strike)
            layer = Image.new("RGBA", (strike, strike), (0, 0, 0, 0))
            ImageDraw.Draw(layer).text((strike // 2, strike // 2), emoji, font=font,
                                       anchor="mm", embedded_color=True)
            img = Image.new("RGBA", (size, size), bg)
            pad = int(size * 0.13); inner = size - 2 * pad
            em = layer.resize((inner, inner))
            img.paste(em, (pad, pad), em)
            if radius:
                mask = Image.new("L", (size, size), 0)
                ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
                img.putalpha(mask)
            return img
        except Exception:
            continue
    sys.exit("ERROR: could not render emoji (no usable AppleColorEmoji strike on this machine)")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("emoji")
    ap.add_argument("--bg", default="#0e0f13", help="icon background (hex), match the page theme")
    ap.add_argument("--title", default="App", help="Add-to-Home-Screen label")
    ap.add_argument("--out-dir", help="also write apple-touch-icon.png, favicon.svg, head_snippet.html")
    a = ap.parse_args()

    img = render_png(a.emoji, 180, hexrgba(a.bg), 40)
    buf = io.BytesIO(); img.save(buf, "PNG")
    png_b64 = base64.b64encode(buf.getvalue()).decode()

    svg = (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>"
           f"<text x='50' y='54' font-size='80' text-anchor='middle' dominant-baseline='central'>{a.emoji}</text></svg>")
    svg_uri = "data:image/svg+xml," + urllib.parse.quote(svg)

    snippet = (
        f'<link rel="icon" href="{svg_uri}">\n'
        f'<link rel="apple-touch-icon" href="data:image/png;base64,{png_b64}">\n'
        f'<meta name="apple-mobile-web-app-capable" content="yes">\n'
        f'<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
        f'<meta name="apple-mobile-web-app-title" content="{a.title}">\n'
        f'<meta name="theme-color" content="{a.bg}">'
    )
    if a.out_dir:
        os.makedirs(a.out_dir, exist_ok=True)
        img.save(os.path.join(a.out_dir, "apple-touch-icon.png"))
        open(os.path.join(a.out_dir, "favicon.svg"), "w").write(svg)
        open(os.path.join(a.out_dir, "head_snippet.html"), "w").write(snippet)
        print(f"# wrote apple-touch-icon.png, favicon.svg, head_snippet.html to {a.out_dir}\n", file=sys.stderr)
    print(snippet)

if __name__ == "__main__":
    main()
