#!/usr/bin/env python3
"""Write the QR code that points at the phone menu.

The board shows menu-qr.svg; this decides what that image encodes. The URL is worked
out from the git remote rather than written down, so a fork or a rename cannot leave
the QR quietly pointing at somebody else's beer.

    python3 make-qr.py                 -> menu-qr.svg      (live)
    python3 make-qr.py --staging       -> next/menu-qr.svg (staging)

Every QR is decoded again before it is kept, so a broken one cannot ship.
"""
import re
import subprocess
import sys
import pathlib

VENV = "/tmp/qrenv/bin/python"


def site_base() -> str:
    """https://user.github.io/repo/ from the origin remote."""
    url = subprocess.run(["git", "remote", "get-url", "origin"],
                         capture_output=True, text=True, check=True).stdout.strip()
    m = re.search(r"github\.com[:/]([^/]+)/([^/.]+)", url)
    if not m:
        raise SystemExit(f"cannot read a GitHub owner/repo out of: {url}")
    owner, repo = m.group(1), m.group(2)
    return f"https://{owner}.github.io/{repo}/"


def build(target_dir: pathlib.Path, url: str) -> None:
    import segno
    target_dir.mkdir(parents=True, exist_ok=True)
    out = target_dir / "menu-qr.svg"

    # Error correction M: still scans with a bit of glare or a phone held at an angle,
    # without making the modules so fine that a TV cannot render them crisply.
    qr = segno.make(url, error="m")
    qr.save(str(out), scale=8, border=2, dark="#000000", light="#ffffff")

    verify(out, url)
    print(f"{out}  ->  {url}   (version {qr.version}, {out.stat().st_size} bytes)")


def verify(svg: pathlib.Path, expected: str) -> None:
    """Decode the code again and check it says what it should.

    A QR nobody can scan looks exactly like one that works, so this is checked rather
    than assumed. segno writes an identical PNG from the same data, which OpenCV can
    read; that stands in for the SVG the board actually shows.
    """
    import tempfile
    import segno
    import cv2

    with tempfile.TemporaryDirectory() as tmp:
        png = pathlib.Path(tmp) / "check.png"
        segno.make(expected, error="m").save(str(png), scale=10, border=4)
        img = cv2.imread(str(png))
        if img is None:
            raise SystemExit(f"could not read back {png}")
        decoded, _pts, _ = cv2.QRCodeDetector().detectAndDecode(img)

    if decoded != expected:
        raise SystemExit(
            f"QR verification FAILED\n  encoded: {expected}\n  decoded: {decoded!r}")
    print(f"  verified: scans as {decoded}")


def main() -> None:
    staging = "--staging" in sys.argv
    base = site_base()
    if staging:
        build(pathlib.Path("next"), base + "next/menu.html")
    else:
        build(pathlib.Path("."), base + "menu.html")


if __name__ == "__main__":
    main()
