#!/usr/bin/env python3
"""Reconstruct every beer ever on tap from the history of taps.json.

Each commit that touched the list is a snapshot of what was pouring that day, so
walking them in order gives the whole story: what was on, when it went on, and when
it came off. Nothing new has to be recorded — the data has been accumulating since
the first commit.

Duplicates are the whole problem here. The same keg appears in dozens of consecutive
commits, a beer often comes back months later, and names drift ("Bush Chook",
"bush chook ", "Bush Chook V2"). Those must collapse into one entry with several
runs rather than dozens of separate beers.

    python3 hall.py            -> hall.json
    python3 hall.py --report   -> also print what merged, so the merging can be judged
"""
import json
import re
import subprocess
import sys
from collections import OrderedDict

FILE = "taps.json"
TEMPLATE = set()
IGNORE = set()

# The repo ships with a sample list so a new board is not empty. Those beers were
# never poured. The brewery name is the wrong signal for this — it gets renamed while
# the sample beers are still sitting on the taps — so the scaffold is identified by
# its OWN tap list, taken from the very first commit. Once real beers replace them the
# sets diverge and the hall begins.

# Trailing batch markers: "V2", "v.3", "#2", "(2)", "mk2", "batch 3", "no.2"
VERSION_TAIL = re.compile(
    r"\s*(?:[\(\[]?\s*(?:v|ver|version|mk|batch|no|#)\s*\.?\s*\d+\s*[\)\]]?|[\(\[]\s*\d+\s*[\)\]])\s*$",
    re.I,
)


def norm(name: str) -> str:
    """Key a beer by its name, ignoring the things that are not really differences."""
    s = (name or "").strip().lower()
    s = VERSION_TAIL.sub("", s)          # same beer, later batch
    # Apostrophes are dropped rather than spaced, so "Bee's Knees" and "Bees Knees"
    # are one beer. Other punctuation becomes a space, which keeps words apart.
    s = s.replace("'", "").replace("\u2019", "")
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def ignored_names():
    """Optional hall-ignore.json: ["Test Beer", ...] — anything you would rather forget."""
    try:
        with open("hall-ignore.json") as fh:
            return {norm(n) for n in json.load(fh) if norm(n)}
    except (FileNotFoundError, ValueError):
        return set()


def template_names():
    """The sample beers, as they were before anyone edited the list."""
    first = next(commits(), None)
    if not first:
        return set()
    data = snapshot(first[0]) or {}
    return {norm(t.get("name")) for t in data.get("taps", []) if norm(t.get("name"))}


def commits():
    out = subprocess.run(
        ["git", "log", "--reverse", "--format=%H|%aI", "--", FILE],
        capture_output=True, text=True, check=True).stdout.strip()
    for line in out.splitlines():
        if "|" in line:
            sha, when = line.split("|", 1)
            yield sha, when[:10]


def snapshot(sha):
    r = subprocess.run(["git", "show", f"{sha}:{FILE}"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None          # a half-written list in history is not worth dying over


def main():
    report = "--report" in sys.argv
    global TEMPLATE, IGNORE
    TEMPLATE = template_names()
    IGNORE = ignored_names()

    beers = OrderedDict()    # key -> record
    seen_names = {}          # key -> {raw name: times seen}
    last_date = None

    for sha, date in commits():
        data = snapshot(sha)
        if not data:
            continue

        last_date = date

        present = set()
        for t in data.get("taps", []):
            raw = str(t.get("name") or "").strip()
            if not raw:
                continue
            # A beer still fermenting was never actually poured, so it does not
            # start its run until it appears as something other than "coming".
            if t.get("status") == "coming":
                continue
            key = norm(raw)
            if not key:
                continue
            # The sample beers the repo ships with were never poured. Skipping them
            # per-beer rather than per-snapshot, because they sat on the taps
            # alongside real ones while the board was being set up.
            if key in TEMPLATE or key in IGNORE:
                continue
            present.add(key)
            seen_names.setdefault(key, {})
            seen_names[key][raw] = seen_names[key].get(raw, 0) + 1

            b = beers.get(key)
            if b is None:
                b = beers[key] = {
                    "key": key, "name": raw, "runs": [],
                    "style": "", "abv": "", "ibu": "", "srm": "", "color": "",
                    "notes": "", "guest": False,
                }
            # Keep the most recent details — a beer's stats get corrected over time.
            for src, dst in (("style", "style"), ("abv", "abv"), ("ibu", "ibu"),
                             ("srm", "srm"), ("color", "color"), ("notes", "notes")):
                v = t.get(src)
                if v not in (None, "", 0):
                    b[dst] = v
            if t.get("guest"):
                b["guest"] = True
            b["name"] = raw

            if b["runs"] and b["runs"][-1].get("open"):
                b["runs"][-1]["to"] = date
            else:
                b["runs"].append({"from": date, "to": date, "open": True})

        # Anything absent from this snapshot has come off the taps.
        for key, b in beers.items():
            if key not in present and b["runs"] and b["runs"][-1].get("open"):
                b["runs"][-1]["open"] = False

    def days(run):
        from datetime import date as D
        a = D.fromisoformat(run["from"])
        b = D.fromisoformat(run["to"])
        return max(1, (b - a).days + 1)

    out = []
    for b in beers.values():
        for r in b["runs"]:
            r.pop("open", None)
        total = sum(days(r) for r in b["runs"])
        out.append({
            "name": b["name"], "style": b["style"], "abv": b["abv"],
            "ibu": b["ibu"], "srm": b["srm"], "color": b["color"] or "#e3ad42",
            "notes": b["notes"], "guest": b["guest"],
            "runs": b["runs"], "times": len(b["runs"]), "days": total,
            "first": b["runs"][0]["from"], "last": b["runs"][-1]["to"],
        })

    out.sort(key=lambda x: (-x["days"], x["first"]))
    hall = {
        "generated": last_date,
        "beers": out,
        "totals": {
            "beers": len(out),
            "days": sum(b["days"] for b in out),
            "guest": sum(1 for b in out if b["guest"]),
        },
    }
    with open("hall.json", "w") as fh:
        json.dump(hall, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print(f"hall.json — {len(out)} distinct beers from {hall['totals']['days']} tap-days")

    if report:
        print("\nnames merged into one beer:")
        any_merge = False
        for key, names in seen_names.items():
            if len(names) > 1:
                any_merge = True
                print(f"  {key!r}")
                for raw, n in sorted(names.items(), key=lambda kv: -kv[1]):
                    print(f"      {raw!r}  ({n} snapshots)")
        if not any_merge:
            print("  (none — every beer had exactly one spelling)")
        print("\nbeers tapped more than once:")
        multi = [b for b in out if b["times"] > 1]
        for b in multi:
            spans = ", ".join(f"{r['from']}..{r['to']}" for r in b["runs"])
            print(f"  {b['name']}: {b['times']} runs — {spans}")
        if not multi:
            print("  (none)")


if __name__ == "__main__":
    main()
