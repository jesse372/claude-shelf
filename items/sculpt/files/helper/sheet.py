"""Numbered contact sheets for picking photos: sheet.py <out prefix> <photo> [<photo> ...]  → <prefix>-1.jpg, -2.jpg …
Each frame gets a big number (1, 2, 3 … in the order given) so picks can be sent back as "4, 9, 17"."""
import sys
from PIL import Image, ImageDraw, ImageFont
out, paths = sys.argv[1], sys.argv[2:]
CELL, COLS, ROWS, PAD = 340, 5, 4, 10
try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 34)
except Exception: font = ImageFont.load_default()
per = COLS * ROWS
for s in range(0, len(paths), per):
    chunk = paths[s:s + per]
    rows = (len(chunk) + COLS - 1) // COLS
    sheet = Image.new('RGB', (COLS * (CELL + PAD) + PAD, rows * (CELL + PAD) + PAD), (251, 248, 244))
    d = ImageDraw.Draw(sheet)
    for k, p in enumerate(chunk):
        im = Image.open(p).convert('RGB'); im.thumbnail((CELL, CELL))
        x = PAD + (k % COLS) * (CELL + PAD); y = PAD + (k // COLS) * (CELL + PAD)
        sheet.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2))
        n = str(s + k + 1); bx = x + (CELL - im.width) // 2 + 6; by = y + (CELL - im.height) // 2 + 6
        tw = d.textlength(n, font=font)
        d.rectangle([bx, by, bx + tw + 16, by + 44], fill=(23, 19, 15)); d.text((bx + 8, by + 3), n, font=font, fill=(251, 248, 244))
    sheet.save(f'{out}-{s // per + 1}.jpg', quality=85)
print((len(paths) + per - 1) // per)
