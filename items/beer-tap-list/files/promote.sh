#!/usr/bin/env bash
# Promote the STAGING site to live.
#
# Copies next/index.html and next/edit.html over the live pages, undoing the two
# staging-only changes (the data path and the staging flag) and stamping a fresh
# build so every screen reloads itself.
#
# Staging is left in place afterwards, so the two match until the next ./stage.sh.
set -euo pipefail
cd "$(dirname "$0")"

[ -f next/index.html ] || { echo "nothing staged — run ./stage.sh first" >&2; exit 1; }

python3 - <<'PY'
import re

import os
PAGES = [p for p in ("index.html", "edit.html", "menu.html", "hall.html", "print.html", "signin.html", "reset.html") if os.path.exists("next/" + p)]

for name in PAGES:
    s = open("next/" + name).read()

    # Pages that read the beer list must carry the constant; a sign-in page has
    # no data to read, so it legitimately has none.
    DATA_PAGES = ("index.html", "edit.html", "menu.html", "print.html", "hall.html")
    s2, n = re.subn(r'var DATA_BASE = "\.\./";', 'var DATA_BASE = "";', s, count=1)
    assert n == 1 or name not in DATA_PAGES, \
        f"{name}: DATA_BASE not found — did the constant get renamed?"
    s = s2

    # menu.html and hall.html have no STAGING flag; only the app pages do.
    s2, n = re.subn(r'var STAGING   = true;', 'var STAGING   = false;', s, count=1)
    assert n == 1 or name not in ("index.html", "edit.html"), \
        f"{name}: staging flag not found"
    s = s2

    open(name, "w").write(s)

print("promoted staging -> live")
PY

[ -x /tmp/qrenv/bin/python ] && /tmp/qrenv/bin/python make-qr.py || \
  echo "note: QR not regenerated (no generator available)" >&2

# Fresh stamp for the live pages, so the TVs pick the change up on their own.
./bump.sh
echo "done — commit and push to publish"
