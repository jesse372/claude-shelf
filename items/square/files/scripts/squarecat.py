#!/usr/bin/env python3
"""
squarecat.py — Square Catalog engine for the `square` skill.

Design rule (same as meta-ads): WRITES ARE NEVER IMMEDIATE.
Anything that would change the live Square catalogue writes a PLAN (a JSON file of
exact price changes). Nothing reaches Square until:

    square.sh apply <plan-id> --confirm

Stdlib only (urllib). Token arrives via env SQUARE_ACCESS_TOKEN (square.sh sources authlib).

API notes worth knowing before editing this file:
  * Square-Version header is deliberately NOT sent by default. When omitted, Square uses
    the default API version pinned to the application, which is stable forever. Hard-coding
    a dated version here means the skill silently rots when that version retires ~1yr later.
    Override with SQUARE_VERSION=2026-01-22 if you ever need a specific one.
  * Appointment services are CatalogItem objects with product_type == APPOINTMENTS_SERVICE.
    The PRICE lives on each child ITEM_VARIATION, not on the item.
  * Every catalog object carries a `version` (optimistic concurrency). Upserting with a
    stale version is rejected — which is exactly what we want, so apply always re-fetches.
"""
import argparse
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = os.environ.get("SQUARE_BASE", "https://connect.squareup.com")
STATE_DIR = os.path.expanduser(os.environ.get("SQUARE_STATE", "~/.square-skill"))
PLAN_DIR = os.path.join(STATE_DIR, "plans")
WRITE_LOG = os.path.expanduser("~/.claude/logs/square-writes.log")
SERVICE_PRODUCT_TYPE = "APPOINTMENTS_SERVICE"
# Set SQUARECAT_INCLUDE_ARCHIVED=1 to see archived services in `services` output.
INCLUDE_ARCHIVED = os.environ.get("SQUARECAT_INCLUDE_ARCHIVED") == "1"


class SquareError(Exception):
    pass


# ---------------------------------------------------------------- HTTP
def _token():
    t = os.environ.get("SQUARE_ACCESS_TOKEN", "").strip()
    if not t:
        raise SquareError(
            "No Square access token.\n"
            "  Set it up once:  square.sh install-token '<TOKEN>'\n"
            "  See SETUP.md in the skill folder for where to mint one."
        )
    return t


def api(path, body=None, method="GET", retries=3):
    """Call the Square Connect API. Returns parsed JSON, raises SquareError with Square's message."""
    url = BASE + (path if path.startswith("/") else "/" + path)
    headers = {
        "Authorization": "Bearer " + _token(),
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    ver = os.environ.get("SQUARE_VERSION", "").strip()
    if ver:
        headers["Square-Version"] = ver

    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as e:
            raw = e.read().decode(errors="replace")
            try:
                errs = json.loads(raw).get("errors", [])
            except Exception:
                errs = []
            if e.code == 429 and attempt < retries - 1:
                time.sleep(3 * (2 ** attempt))
                continue
            if errs:
                first = errs[0]
                code = first.get("code", "")
                msg = first.get("detail") or code
                hint = ""
                if e.code == 401:
                    hint = ("\n  -> Token rejected. It may be revoked, expired, or from the other "
                            "environment (sandbox token against production, or vice versa).")
                elif code == "INSUFFICIENT_SCOPES":
                    hint = "\n  -> Token is missing ITEMS_READ / ITEMS_WRITE. Re-mint it with those scopes."
                elif code == "VERSION_MISMATCH":
                    hint = "\n  -> Someone edited this item in Square since the plan was made. Re-run plan."
                raise SquareError(f"Square API {e.code} {code}: {msg}{hint}")
            raise SquareError(f"Square API HTTP {e.code}: {raw[:400]}")
        except urllib.error.URLError as e:
            if attempt < retries - 1:
                time.sleep(3 * (2 ** attempt))
                continue
            raise SquareError(f"Network error: {e.reason}")
    raise SquareError("exhausted retries")


def catalog_list(types="ITEM"):
    """GET /v2/catalog/list with cursor pagination; returns all objects."""
    out, cursor, pages = [], None, 0
    while True:
        path = "/v2/catalog/list?types=" + types
        if cursor:
            path += "&cursor=" + urllib.parse.quote(cursor)
        res = api(path)
        out.extend(res.get("objects", []))
        cursor = res.get("cursor")
        pages += 1
        if not cursor or pages >= 50:
            break
    return out


# ---------------------------------------------------------------- money + names
def money(cents, currency="AUD"):
    if cents is None:
        return "(variable)"
    return f"${cents/100:,.2f} {currency}"


def norm(name):
    """Normalize a service name for matching: case, &/and, punctuation, spacing."""
    s = (name or "").lower().strip()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9+]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


# ---------------------------------------------------------------- Square side
def fetch_services():
    """Return [{item_id,item_name,variation_id,variation_name,price_cents,currency,version}]."""
    rows = []
    for obj in catalog_list("ITEM"):
        if obj.get("type") != "ITEM" or obj.get("is_deleted"):
            continue
        item = obj.get("item_data", {}) or {}
        if item.get("product_type") != SERVICE_PRODUCT_TYPE:
            continue
        # Archived services are not bookable and must not shadow live ones.
        # Without this, an archived legacy item makes its live replacement
        # look "ambiguous" and the price change gets silently skipped.
        if item.get("is_archived") and not INCLUDE_ARCHIVED:
            continue
        variations = item.get("variations", []) or []
        for v in variations:
            vd = v.get("item_variation_data", {}) or {}
            pm = vd.get("price_money") or {}
            rows.append({
                "item_id": obj.get("id"),
                "item_name": item.get("name", ""),
                "variation_id": v.get("id"),
                "variation_name": vd.get("name", ""),
                "price_cents": pm.get("amount"),
                "currency": pm.get("currency", "AUD"),
                "version": v.get("version"),
                "n_variations": len(variations),
            })
    rows.sort(key=lambda r: (r["item_name"].lower(), r["variation_name"].lower()))
    return rows


# Variation names Square creates by default — they name the item, not the service.
GENERIC_VARIATION_NAMES = {"regular", "", "default", "standard", "base price", "price"}


def match_keys(row):
    """
    Keys a site service name may match this Square variation by.

    Square Appointments shops are set up two ways, and both are common:
      A) one ITEM per service, single variation called "Regular"
            -> match on the ITEM name
      B) one ITEM per category (e.g. "Lash Extensions") with a variation per service
         ("Classic Full Set", "Hybrid Full Set")
            -> match on the VARIATION name
    So a real service name can live on either object. We accept both, plus the combined
    "Item Variation" form. Generic variation labels are excluded so that every "Regular"
    variation in the catalogue doesn't collide into one ambiguous blob.
    """
    keys = {norm(row["item_name"])}
    vn = (row["variation_name"] or "").strip()
    if vn:
        keys.add(norm(row["item_name"] + " " + vn))
        if norm(vn) not in GENERIC_VARIATION_NAMES:
            keys.add(norm(vn))
    return keys


# ---------------------------------------------------------------- site side (source of truth)
PRICE_RE = re.compile(r"^\$(\d+)$")


def _text(frag):
    """Strip tags + unescape entities from an HTML fragment."""
    import html as _html
    return _html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", frag))).strip()


ROW_RE = re.compile(r'<div class="row">(.*?)</div>', re.S)
NAME_RE = re.compile(r'<span class="name">(.*?)</span>', re.S)
PRICE_SPAN_RE = re.compile(r'<span class="price">\s*\$(\d+)\s*</span>', re.S)


def _rows_from_html(path):
    """
    Pull (name, price) out of the site's menu markup:
        <div class="row"><span class="name">X</span><span class="desc">..</span><span class="price">$120</span></div>

    Parsing the STRUCTURE, not "the line above a price", matters: an earlier heuristic
    version matched the description text as the service name, which silently produced a
    plan full of unmatched services. If the markup ever changes, this returns nothing and
    the caller raises loudly rather than guessing.
    """
    with open(path, encoding="utf-8") as fh:
        t = fh.read()
    t = re.sub(r"<(script|style)[\s\S]*?</\1>", "", t)
    out = []
    for frag in ROW_RE.findall(t):
        n, p = NAME_RE.search(frag), PRICE_SPAN_RE.search(frag)
        if n and p:
            out.append((_text(n.group(1)), int(p.group(1)) * 100))
    return out


def site_prices(site_dir, csv_extras=True):
    """
    Canonical price list = what the website publicly advertises.

    services.html is the authority. Any service that exists only in the Square import CSV
    (e.g. refills, which the site doesn't publish a price for) is included but flagged
    `source: csv` so a human can see it was never on the page.
    """
    services_html = os.path.join(site_dir, "services.html")
    if not os.path.exists(services_html):
        raise SquareError(f"No services.html under {site_dir}")

    found = {}
    rows = _rows_from_html(services_html)
    if not rows:
        raise SquareError(
            f"Found no <div class=\"row\"> price rows in {services_html}. The site markup has "
            f"changed — fix _rows_from_html() rather than trusting a partial price list.")
    for name, cents in rows:
        found[norm(name)] = {"name": name, "price_cents": cents, "source": "site"}

    if csv_extras:
        csv_path = os.path.join(site_dir, "marketing", "square-services-import.csv")
        if os.path.exists(csv_path):
            import csv as _csv
            with open(csv_path, encoding="utf-8") as fh:
                for row in _csv.DictReader(fh):
                    nm = (row.get("service_name") or "").strip()
                    pr = (row.get("price") or "").strip()
                    if not nm or not pr.isdigit():
                        continue
                    k = norm(nm)
                    if k not in found:
                        found[k] = {"name": nm, "price_cents": int(pr) * 100, "source": "csv"}
    return found


# ---------------------------------------------------------------- plan / apply
def new_plan_id():
    return "plan-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S")


def plan_path(pid):
    return os.path.join(PLAN_DIR, pid + ".json")


def save_plan(plan):
    os.makedirs(PLAN_DIR, exist_ok=True)
    p = plan_path(plan["id"])
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(plan, fh, indent=2)
    return p


def load_plan(pid):
    p = plan_path(pid) if not pid.endswith(".json") else pid
    if not os.path.exists(p):
        raise SquareError(f"No such plan: {pid}. List them with: square.sh plans")
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def build_plan(site_dir, include_csv=True):
    canon = site_prices(site_dir, csv_extras=include_csv)
    rows = fetch_services()
    if not rows:
        raise SquareError(
            "Square returned no appointment services. Either the catalogue is empty, or the "
            "token belongs to a different merchant/environment. Check: square.sh doctor")

    changes, in_sync, ambiguous = [], [], []
    used = set()
    for key, want in canon.items():
        hits = [r for r in rows if key in match_keys(r)]
        if not hits:
            continue
        if len(hits) > 1:
            ambiguous.append({"site_name": want["name"],
                              "candidates": [f'{h["item_name"]} / {h["variation_name"]}' for h in hits]})
            continue
        r = hits[0]
        used.add(r["variation_id"])
        rec = {
            "variation_id": r["variation_id"],
            "item_id": r["item_id"],
            "item_name": r["item_name"],
            "variation_name": r["variation_name"],
            "site_name": want["name"],
            "source": want["source"],
            "old_cents": r["price_cents"],
            "new_cents": want["price_cents"],
            "currency": r["currency"] or "AUD",
        }
        if r["price_cents"] == want["price_cents"]:
            in_sync.append(rec)
        else:
            changes.append(rec)

    matched_keys = {k for k in canon if any(k in match_keys(r) for r in rows)}
    plan = {
        "id": new_plan_id(),
        "created": datetime.datetime.now().isoformat(timespec="seconds"),
        "site_dir": os.path.abspath(site_dir),
        "changes": changes,
        "in_sync": in_sync,
        "ambiguous": ambiguous,
        "only_on_site": [canon[k]["name"] for k in canon if k not in matched_keys],
        "only_in_square": [f'{r["item_name"]} / {r["variation_name"]}'.rstrip(" /")
                           for r in rows if r["variation_id"] not in used],
        "applied": None,
    }
    return plan


def render_plan(plan, verbose=True):
    out = []
    out.append(f'PLAN {plan["id"]}   (created {plan["created"]})')
    out.append(f'source of truth: {plan["site_dir"]}')
    out.append("")
    if not plan["changes"]:
        out.append("  No price changes needed — Square already matches the site.")
    else:
        out.append(f'  {len(plan["changes"])} price change(s) to push to Square:')
        out.append("")
        w = max(len(c["item_name"] + (" / " + c["variation_name"] if c["variation_name"] else ""))
                for c in plan["changes"])
        for c in plan["changes"]:
            label = c["item_name"] + (" / " + c["variation_name"] if c["variation_name"] else "")
            arrow = f'{money(c["old_cents"], c["currency"]):>14}  ->  {money(c["new_cents"], c["currency"])}'
            flag = "  [from CSV, not published on site]" if c["source"] == "csv" else ""
            out.append(f"    {label:<{w}}  {arrow}{flag}")
    if verbose:
        out.append("")
        out.append(f'  {len(plan["in_sync"])} service(s) already correct.')
        for k, title in (("ambiguous", "AMBIGUOUS (skipped — more than one Square match)"),
                         ("only_on_site", "On the site but NOT in Square"),
                         ("only_in_square", "In Square but NOT on the site")):
            vals = plan.get(k) or []
            if vals:
                out.append("")
                out.append(f"  {title}:")
                for v in vals:
                    out.append("    - " + (json.dumps(v) if isinstance(v, dict) else v))
    out.append("")
    if plan.get("applied"):
        out.append(f'  ALREADY APPLIED at {plan["applied"]}')
    elif plan["changes"]:
        out.append(f'  Nothing has changed in Square yet. To apply:')
        out.append(f'    square.sh apply {plan["id"]} --confirm')
    return "\n".join(out)


def apply_plan(plan, confirm=False, force=False):
    if not confirm:
        print(render_plan(plan))
        print("\nDRY RUN — no --confirm, so nothing was sent to Square.")
        return 2
    if plan.get("applied") and not force:
        raise SquareError(f'Plan {plan["id"]} was already applied at {plan["applied"]}. '
                          f'Re-run `plan` for a fresh diff (or pass --force).')

    os.makedirs(os.path.dirname(WRITE_LOG), exist_ok=True)
    done, skipped, failed = [], [], []
    for c in plan["changes"]:
        vid = c["variation_id"]
        # Re-fetch: proves the object still exists, gives a fresh version, and lets us detect
        # anyone who changed the price in the Square dashboard since this plan was built.
        try:
            obj = api(f"/v2/catalog/object/{vid}").get("object")
        except SquareError as e:
            failed.append((c, str(e)))
            continue
        if not obj:
            failed.append((c, "object vanished"))
            continue
        vd = obj.get("item_variation_data", {}) or {}
        cur = (vd.get("price_money") or {}).get("amount")
        if cur != c["old_cents"] and not force:
            skipped.append((c, f'price is now {money(cur, c["currency"])}, plan expected '
                               f'{money(c["old_cents"], c["currency"])} — changed in Square since planning'))
            continue
        vd["price_money"] = {"amount": c["new_cents"], "currency": c["currency"]}
        vd["pricing_type"] = "FIXED_PRICING"
        obj["item_variation_data"] = vd
        try:
            api("/v2/catalog/object", body={"idempotency_key": str(uuid.uuid4()), "object": obj},
                method="POST")
            done.append(c)
            with open(WRITE_LOG, "a", encoding="utf-8") as fh:
                fh.write(f'{datetime.datetime.now().isoformat(timespec="seconds")}\t{plan["id"]}\t'
                         f'{c["item_name"]}/{c["variation_name"]}\t{c["old_cents"]}->{c["new_cents"]}\n')
        except SquareError as e:
            failed.append((c, str(e)))

    print(f'Applied {len(done)}/{len(plan["changes"])} price change(s).')
    for c in done:
        print(f'  ok      {c["item_name"]}  {money(c["old_cents"], c["currency"])} -> {money(c["new_cents"], c["currency"])}')
    for c, why in skipped:
        print(f'  SKIP    {c["item_name"]}: {why}')
    for c, why in failed:
        print(f'  FAILED  {c["item_name"]}: {why}')

    plan["applied"] = datetime.datetime.now().isoformat(timespec="seconds")
    plan["result"] = {"ok": [c["variation_id"] for c in done],
                      "skipped": [c["variation_id"] for c, _ in skipped],
                      "failed": [c["variation_id"] for c, _ in failed]}
    save_plan(plan)
    if failed:
        return 1
    if skipped:
        print("\nSkipped items were NOT changed. Re-run `plan` to pick up Square's current prices.")
        return 1
    return 0


# ---------------------------------------------------------------- commands
def cmd_doctor(a):
    tok = os.environ.get("SQUARE_ACCESS_TOKEN", "").strip()
    print(f'token           : {"present (" + str(len(tok)) + " chars)" if tok else "MISSING"}')
    print(f'api base        : {BASE}')
    print(f'Square-Version  : {os.environ.get("SQUARE_VERSION") or "(application default — recommended)"}')
    if not tok:
        print("\nRun: square.sh install-token '<TOKEN>'   (see SETUP.md)")
        return 1
    m = api("/v2/merchants").get("merchant", [])
    for mer in m:
        print(f'merchant        : {mer.get("business_name")}  ({mer.get("id")})  '
              f'country={mer.get("country")} currency={mer.get("currency")}')
    locs = api("/v2/locations").get("locations", [])
    for l in locs:
        print(f'location        : {l.get("name")}  ({l.get("id")})  status={l.get("status")}')
    rows = fetch_services()
    print(f'services        : {len(rows)} appointment service variation(s) in the catalogue')
    return 0


def cmd_services(a):
    rows = fetch_services()
    if a.json:
        print(json.dumps(rows, indent=2))
        return 0
    if not rows:
        print("No appointment services found in this Square catalogue.")
        return 0
    w = max(len(r["item_name"]) for r in rows)
    for r in rows:
        vn = f'  / {r["variation_name"]}' if r["variation_name"] and r["n_variations"] > 1 else ""
        print(f'{r["item_name"]:<{w}}{vn}   {money(r["price_cents"], r["currency"])}')
    print(f"\n{len(rows)} service variation(s).")
    return 0


def cmd_prices(a):
    canon = site_prices(a.site, csv_extras=not a.no_csv)
    for k in sorted(canon, key=lambda k: canon[k]["name"].lower()):
        v = canon[k]
        tag = "" if v["source"] == "site" else "   [csv only]"
        print(f'{v["name"]:<46} {money(v["price_cents"]):>12}{tag}')
    print(f"\n{len(canon)} service(s) from {a.site}")
    return 0


def cmd_plan(a):
    plan = build_plan(a.site, include_csv=not a.no_csv)
    save_plan(plan)
    print(render_plan(plan))
    return 0


def cmd_plans(a):
    os.makedirs(PLAN_DIR, exist_ok=True)
    ps = sorted(os.listdir(PLAN_DIR), reverse=True)[:20]
    for p in ps:
        try:
            with open(os.path.join(PLAN_DIR, p), encoding="utf-8") as fh:
                d = json.load(fh)
            state = "APPLIED " + d["applied"] if d.get("applied") else "pending"
            print(f'{d["id"]}   {len(d.get("changes", []))} change(s)   {state}')
        except Exception:
            continue
    if not ps:
        print("(no plans yet)")
    return 0


def cmd_show(a):
    print(render_plan(load_plan(a.plan_id)))
    return 0


def cmd_apply(a):
    return apply_plan(load_plan(a.plan_id), confirm=a.confirm, force=a.force)


def cmd_token_status(a):
    tok = os.environ.get("SQUARE_ACCESS_TOKEN", "").strip()
    out = {"present": bool(tok), "valid": None, "merchant": None, "error": None}
    if tok:
        try:
            m = api("/v2/merchants").get("merchant", [])
            out["valid"] = True
            out["merchant"] = (m[0].get("business_name") if m else None)
        except SquareError as e:
            out["valid"] = False
            out["error"] = str(e)[:200]
    print(json.dumps(out))
    return 0


def main():
    ap = argparse.ArgumentParser(prog="square.sh", description="Square catalogue prices, plan-gated.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    site_default = os.path.expanduser("~/JesseOS/projects/luxe-beauty-yanchep")

    sub.add_parser("doctor").set_defaults(fn=cmd_doctor)

    p = sub.add_parser("services", help="list live Square appointment services + prices")
    p.add_argument("--json", action="store_true")
    p.set_defaults(fn=cmd_services)

    p = sub.add_parser("prices", help="show the canonical price list taken from the website")
    p.add_argument("--site", default=site_default)
    p.add_argument("--no-csv", action="store_true", help="ignore services that only exist in the import CSV")
    p.set_defaults(fn=cmd_prices)

    p = sub.add_parser("plan", help="diff website prices against Square, write a plan")
    p.add_argument("--site", default=site_default)
    p.add_argument("--no-csv", action="store_true")
    p.set_defaults(fn=cmd_plan)

    sub.add_parser("plans", help="list recent plans").set_defaults(fn=cmd_plans)

    p = sub.add_parser("show", help="render a plan")
    p.add_argument("plan_id")
    p.set_defaults(fn=cmd_show)

    p = sub.add_parser("apply", help="push a plan to Square (requires --confirm)")
    p.add_argument("plan_id")
    p.add_argument("--confirm", action="store_true")
    p.add_argument("--force", action="store_true", help="apply even if Square drifted since planning")
    p.set_defaults(fn=cmd_apply)

    sub.add_parser("token-status").set_defaults(fn=cmd_token_status)

    a = ap.parse_args()
    try:
        sys.exit(a.fn(a))
    except SquareError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
