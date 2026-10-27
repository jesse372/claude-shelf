#!/usr/bin/env bash
# Stamp a new build number into the page and publish it, so every screen
# can tell whether it is running the current version.
set -euo pipefail
cd "$(dirname "$0")"
B=$(date +%Y%m%d-%H%M%S)
python3 - "$B" <<PY
import sys, re
b = sys.argv[1]
s = open("index.html").read()
# Check the constant EXISTS. Comparing before/after wrongly fails when the stamp is
# already this second's value, which left index.html and build.txt disagreeing — and
# a page whose build never matches build.txt reloads itself forever.
assert re.search(r'var BUILD = "[^"]*";', s), "BUILD constant not found in index.html"
s2 = re.sub(r'var BUILD = "[^"]*";', 'var BUILD = "%s";' % b, s, count=1)
open("index.html","w").write(s2)
open("build.txt","w").write(b + "\n")
PY
echo "build $B"
