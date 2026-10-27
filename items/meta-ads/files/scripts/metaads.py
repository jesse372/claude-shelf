#!/usr/bin/env python3
"""
metaads.py — Meta (Facebook) Marketing API engine for the `meta-ads` skill.

Design rule: WRITES ARE NEVER IMMEDIATE.
Any command that would change something in the ad account instead writes a PLAN
(a JSON file of exact API calls). Nothing reaches Meta until:
    ads.sh apply <plan> --confirm

Stdlib only (urllib). Token arrives via env META_ACCESS_TOKEN (ads.sh sources authlib).
"""
import json, os, sys, time, urllib.parse, urllib.request, urllib.error, datetime, argparse, re

API_VERSION = os.environ.get("META_API_VERSION", "v23.0")
BASE = f"https://graph.facebook.com/{API_VERSION}"
STATE_DIR = os.path.expanduser(os.environ.get("META_ADS_STATE", "~/.meta-ads"))
PLAN_DIR = os.path.join(STATE_DIR, "plans")

# Currencies with no minor unit (budget is passed as whole units, not cents).
ZERO_DECIMAL = {"JPY","KRW","VND","CLP","ISK","HUF","TWD","UGX","XAF","XOF","XPF","BIF","DJF","GNF","KMF","MGA","PYG","RWF","VUV"}


# ---------------------------------------------------------------- HTTP
class MetaError(Exception):
    pass


def _token():
    t = os.environ.get("META_ACCESS_TOKEN", "").strip()
    if not t:
        raise MetaError(
            "No access token. Set it up once:\n"
            "  security add-generic-password -s meta-ads -a token -w '<TOKEN>'\n"
            "See SETUP.md in the skill folder for how to mint a System User token."
        )
    return t


def api(path, params=None, method="GET", retries=3):
    """Call the Graph API. Returns parsed JSON. Raises MetaError with Meta's own message."""
    params = dict(params or {})
    params["access_token"] = _token()
    path = path if path.startswith("/") else "/" + path
    url = BASE + path

    for attempt in range(retries):
        if method == "GET":
            req = urllib.request.Request(url + "?" + urllib.parse.urlencode(params), method="GET")
            body = None
        else:
            body = urllib.parse.urlencode(params).encode()
            req = urllib.request.Request(url, data=body, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            raw = e.read().decode(errors="replace")
            try:
                err = json.loads(raw).get("error", {})
            except Exception:
                raise MetaError(f"HTTP {e.code}: {raw[:400]}")
            code = err.get("code")
            # 17 = user request limit, 613 = calls-per-hour, 80004 = ads throttle
            if code in (17, 613, 80004) and attempt < retries - 1:
                time.sleep(5 * (2 ** attempt))
                continue
            msg = err.get("error_user_msg") or err.get("message") or raw[:300]
            hint = ""
            if code == 190:
                hint = "\n  -> Token is invalid or expired. Re-mint it (see SETUP.md)."
            elif code == 100 and "version" in str(msg).lower():
                hint = f"\n  -> API {API_VERSION} may be retired. Try: META_API_VERSION=v24.0 ..."
            elif code == 200:
                hint = "\n  -> Token lacks ads_management permission on this ad account."
            raise MetaError(f"Meta API error {code}: {msg}{hint}")
        except urllib.error.URLError as e:
            if attempt < retries - 1:
                time.sleep(3 * (2 ** attempt))
                continue
            raise MetaError(f"Network error: {e.reason}")
    raise MetaError("exhausted retries")


def api_all(path, params=None, limit_pages=25):
    """GET with cursor pagination; returns the concatenated `data` list."""
    params = dict(params or {})
    params.setdefault("limit", 200)
    out, page = [], 0
    res = api(path, params)
    while True:
        out.extend(res.get("data", []))
        page += 1
        nxt = (res.get("paging") or {}).get("next")
        if not nxt or page >= limit_pages:
            break
        try:
            with urllib.request.urlopen(nxt, timeout=60) as r:
                res = json.loads(r.read().decode())
        except Exception:
            break
    return out


# ---------------------------------------------------------------- account helpers
def account_id():
    a = os.environ.get("META_AD_ACCOUNT", "").strip()
    if not a:
        raise MetaError(
            "No ad account set. Run `ads.sh accounts` to list yours, then:\n"
            "  security add-generic-password -s meta-ads -a account -w 'act_YOUR_AD_ACCOUNT_ID'"
        )
    return a if a.startswith("act_") else "act_" + a


_acct_cache = {}


def account_currency(acct=None):
    acct = acct or account_id()
    if acct not in _acct_cache:
        _acct_cache[acct] = api(f"/{acct}", {"fields": "currency,name,account_status"})
    return _acct_cache[acct]


def to_minor(amount, currency):
    """'50' dollars -> 5000 cents. Respects zero-decimal currencies."""
    amt = float(amount)
    if currency.upper() in ZERO_DECIMAL:
        return int(round(amt))
    return int(round(amt * 100))


def fmt_money(minor, currency):
    if currency.upper() in ZERO_DECIMAL:
        return f"{int(minor):,} {currency}"
    return f"{int(minor)/100:,.2f} {currency}"


# ---------------------------------------------------------------- plans
def new_plan(kind, description, steps, account=None):
    os.makedirs(PLAN_DIR, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    # Second-resolution stamps collide when two plans are made in the same second,
    # which would silently overwrite the earlier plan. Disambiguate with a suffix.
    pid = f"{stamp}-{kind}"
    n = 2
    while os.path.exists(os.path.join(PLAN_DIR, pid + ".json")):
        pid = f"{stamp}-{kind}-{n}"
        n += 1
    plan = {
        "id": pid,
        "kind": kind,
        "created": datetime.datetime.now().isoformat(timespec="seconds"),
        "account": account or account_id(),
        "api_version": API_VERSION,
        "description": description,
        "applied": False,
        "steps": steps,
    }
    path = os.path.join(PLAN_DIR, pid + ".json")
    with open(path, "w") as f:
        json.dump(plan, f, indent=2)
    return path, plan


def print_plan(plan, path=None):
    print(f"\n  PLAN: {plan['description']}")
    print(f"  account: {plan['account']}   created: {plan['created']}")
    if plan.get("applied"):
        print("  status:  ALREADY APPLIED")
    print(f"\n  {len(plan['steps'])} API call(s) that WILL run on confirm:\n")
    for i, s in enumerate(plan["steps"], 1):
        print(f"   {i}. {s['describe']}")
        print(f"      {s['method']} {s['path']}")
        for k, v in sorted(s["params"].items()):
            print(f"        {k} = {v}")
    print()
    if path and not plan.get("applied"):
        print("  Nothing has been sent to Meta yet. To execute:")
        print(f"    ads.sh apply {plan['id']} --confirm\n")


# ---------------------------------------------------------------- commands
def cmd_doctor(args):
    print(f"Meta Ads doctor  (API {API_VERSION})")
    try:
        _token()
        print("  token .......... found")
    except MetaError as e:
        print(f"  token .......... MISSING\n{e}")
        return 1
    me = api("/me", {"fields": "id,name"})
    print(f"  identity ....... {me.get('name','(system user)')} [{me.get('id')}]")
    try:
        acct = account_id()
        info = account_currency(acct)
        status = info.get("account_status")
        smap = {1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_REVIEW", 9: "IN_GRACE_PERIOD", 101: "CLOSED"}
        print(f"  ad account ..... {info.get('name')} [{acct}] {info.get('currency')} status={smap.get(status, status)}")
        if status != 1:
            print("     ^ account is not ACTIVE — writes may be rejected by Meta.")
    except MetaError as e:
        print(f"  ad account ..... NOT SET\n     {e}")
        return 1
    n = len(api_all(f"/{acct}/campaigns", {"fields": "id", "limit": 50}, limit_pages=1))
    print(f"  read access .... ok ({n} campaign(s) visible)")
    print("\n  Writes are plan-gated: nothing changes without `apply <plan> --confirm`.")
    return 0


def cmd_accounts(args):
    rows = api_all("/me/adaccounts", {"fields": "id,name,currency,account_status"})
    if not rows:
        print("No ad accounts visible to this token.")
        return 1
    print(f"{'AD ACCOUNT':<22} {'CUR':<5} {'ST':<4} NAME")
    for r in rows:
        print(f"{r.get('id',''):<22} {r.get('currency',''):<5} {str(r.get('account_status','')):<4} {r.get('name','')}")
    return 0


LEVEL_EDGE = {"campaign": "campaigns", "adset": "adsets", "ad": "ads"}
LEVEL_FIELDS = {
    "campaign": "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time",
    "adset": "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal,created_time",
    "ad": "id,name,status,effective_status,adset_id,campaign_id,created_time",
}


def cmd_list(args):
    level = args.level
    acct = account_id()
    cur = account_currency(acct).get("currency", "")
    params = {"fields": LEVEL_FIELDS[level]}
    if args.status:
        params["effective_status"] = json.dumps([s.strip().upper() for s in args.status.split(",")])
    path = f"/{args.parent}/{LEVEL_EDGE[level]}" if args.parent else f"/{acct}/{LEVEL_EDGE[level]}"
    rows = api_all(path, params)
    if not rows:
        print("(nothing found)")
        return 0
    print(f"{'ID':<18} {'STATUS':<12} {'BUDGET':<16} NAME")
    for r in rows:
        b = ""
        if r.get("daily_budget"):
            b = fmt_money(r["daily_budget"], cur) + "/d"
        elif r.get("lifetime_budget"):
            b = fmt_money(r["lifetime_budget"], cur) + " life"
        print(f"{r.get('id',''):<18} {(r.get('effective_status') or r.get('status','')):<12} {b:<16} {r.get('name','')}")
    print(f"\n{len(rows)} {level}(s)")
    return 0


LEAD_ACTIONS = {"lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped",
                "onsite_conversion.messaging_conversation_started_7d", "complete_registration",
                "offsite_conversion.fb_pixel_complete_registration", "submit_application"}


def _lead_count(row):
    total = 0.0
    for a in row.get("actions") or []:
        if a.get("action_type") in LEAD_ACTIONS:
            try:
                total += float(a.get("value", 0))
            except (TypeError, ValueError):
                pass
    return total


def cmd_report(args):
    acct = account_id()
    cur = account_currency(acct).get("currency", "")
    params = {
        "level": args.level,
        "fields": "campaign_name,adset_name,ad_name,spend,impressions,reach,frequency,clicks,ctr,cpc,cpm,actions",
        "limit": 500,
    }
    if args.since and args.until:
        params["time_range"] = json.dumps({"since": args.since, "until": args.until})
    elif args.days:
        until = datetime.date.today() - datetime.timedelta(days=1)
        since = until - datetime.timedelta(days=int(args.days) - 1)
        params["time_range"] = json.dumps({"since": str(since), "until": str(until)})
    else:
        params["date_preset"] = args.preset

    rows = api_all(f"/{acct}/insights", params)
    if not rows:
        print("No delivery data for that window.")
        return 0

    namekey = {"campaign": "campaign_name", "adset": "adset_name", "ad": "ad_name"}[args.level]
    recs = []
    for r in rows:
        spend = float(r.get("spend") or 0)
        leads = _lead_count(r)
        recs.append({
            "name": r.get(namekey, "(unnamed)"),
            "spend": spend,
            "impr": int(float(r.get("impressions") or 0)),
            "clicks": int(float(r.get("clicks") or 0)),
            "ctr": float(r.get("ctr") or 0),
            "cpc": float(r.get("cpc") or 0),
            "leads": leads,
            "cpl": (spend / leads) if leads else None,
        })
    recs.sort(key=lambda x: -x["spend"])

    win = f"{args.since}..{args.until}" if args.since and args.until else (f"last {args.days}d" if args.days else args.preset)
    print(f"\nPerformance by {args.level} — {win} — {cur}\n")
    print(f"{'NAME':<40} {'SPEND':>10} {'IMPR':>9} {'CLICKS':>7} {'CTR%':>6} {'CPC':>7} {'LEADS':>6} {'CPL':>9}")
    print("-" * 100)
    for r in recs:
        nm = r["name"][:38] + ".." if len(r["name"]) > 40 else r["name"]
        cpl = f"{r['cpl']:,.2f}" if r["cpl"] is not None else "—"
        print(f"{nm:<40} {r['spend']:>10,.2f} {r['impr']:>9,} {r['clicks']:>7,} {r['ctr']:>6.2f} {r['cpc']:>7,.2f} {r['leads']:>6,.0f} {cpl:>9}")
    print("-" * 100)
    ts, tl = sum(r["spend"] for r in recs), sum(r["leads"] for r in recs)
    tc = sum(r["clicks"] for r in recs)
    ti = sum(r["impr"] for r in recs)
    blended = f"{ts/tl:,.2f}" if tl else "—"
    print(f"{'TOTAL':<40} {ts:>10,.2f} {ti:>9,} {tc:>7,} {'':>6} {'':>7} {tl:>6,.0f} {blended:>9}")
    if tl == 0 and ts > 0:
        print("\nNote: 0 leads attributed. If the site does fire a Lead event, the pixel/CAPI mapping")
        print("      is likely the problem rather than the ads. Worth checking before judging CPL.")
    print()
    return 0


def _obj(oid, fields="id,name"):
    return api(f"/{oid}", {"fields": fields})


def cmd_duplicate(args):
    oid = args.id
    info = _obj(oid, "id,name,adset_id,campaign_id")
    # Infer level from which parent ids come back.
    if "adset_id" in info:
        level, edge_parent = "ad", ("adset_id", info["adset_id"])
    elif "campaign_id" in info:
        level, edge_parent = "adset", ("campaign_id", info["campaign_id"])
    else:
        level, edge_parent = "campaign", (None, None)

    params = {"status_option": args.status.upper(), "deep_copy": "true" if args.deep else "false"}
    if level in ("ad", "adset") and edge_parent[0]:
        params[edge_parent[0]] = args.into or edge_parent[1]
    if args.name:
        params["rename_options"] = json.dumps({"rename_strategy": "NO_RENAME"})
    else:
        params["rename_options"] = json.dumps({"rename_strategy": "DEEP_RENAME" if args.deep else "ONLY_TOP_LEVEL_RENAME",
                                               "rename_suffix": args.suffix})

    steps = []
    for i in range(args.count):
        steps.append({
            "method": "POST",
            "path": f"/{oid}/copies",
            "params": dict(params),
            "describe": f"Duplicate {level} '{info.get('name','?')}' (copy {i+1} of {args.count}) as {args.status.upper()}",
        })
        if args.name:
            steps.append({
                "method": "POST", "path": "__RENAME_LAST__",
                "params": {"name": args.name if args.count == 1 else f"{args.name} {i+1}"},
                "describe": f"Rename the new copy to '{args.name if args.count == 1 else f'{args.name} {i+1}'}'",
            })

    desc = f"Duplicate {level} '{info.get('name','?')}' x{args.count} (new copies start {args.status.upper()})"
    path, plan = new_plan("duplicate", desc, steps)
    print_plan(plan, path)
    if args.status.upper() == "PAUSED":
        print("  Copies start PAUSED, so they cannot spend until you activate them.\n")
    return 0


def cmd_edit(args):
    oid = args.id
    acct = account_id()
    cur = account_currency(acct).get("currency", "")
    info = _obj(oid, "id,name,status,daily_budget,lifetime_budget")
    params, notes = {}, []

    if args.name:
        params["name"] = args.name
        notes.append(f"name: '{info.get('name')}' -> '{args.name}'")
    if args.status:
        params["status"] = args.status.upper()
        notes.append(f"status: {info.get('status')} -> {args.status.upper()}")
    if args.daily_budget is not None:
        minor = to_minor(args.daily_budget, cur)
        params["daily_budget"] = minor
        old = info.get("daily_budget")
        oldtxt = fmt_money(old, cur) if old else "(none)"
        notes.append(f"daily budget: {oldtxt} -> {fmt_money(minor, cur)}  [sent as {minor} minor units]")
        if old:
            pct = (minor - int(old)) / int(old) * 100
            notes.append(f"  that is a {pct:+.0f}% change")
    if args.lifetime_budget is not None:
        minor = to_minor(args.lifetime_budget, cur)
        params["lifetime_budget"] = minor
        old = info.get("lifetime_budget")
        oldtxt = fmt_money(old, cur) if old else "(none)"
        notes.append(f"lifetime budget: {oldtxt} -> {fmt_money(minor, cur)}  [sent as {minor} minor units]")

    if not params:
        print("Nothing to change. Pass --name / --status / --daily-budget / --lifetime-budget.")
        return 1

    steps = [{"method": "POST", "path": f"/{oid}", "params": params,
              "describe": "Edit '" + str(info.get("name", oid)) + "': " + "; ".join(n for n in notes if not n.startswith("  "))}]
    path, plan = new_plan("edit", f"Edit '{info.get('name', oid)}'", steps)
    print_plan(plan, path)
    print("  Interpreted as:")
    for n in notes:
        print(f"    {n}")
    print()
    return 0


def cmd_setstatus(args, status):
    oid = args.id
    info = _obj(oid, "id,name,status")
    steps = [{"method": "POST", "path": f"/{oid}", "params": {"status": status},
              "describe": f"Set '{info.get('name', oid)}' to {status} (was {info.get('status')})"}]
    path, plan = new_plan(status.lower(), f"{status} '{info.get('name', oid)}'", steps)
    print_plan(plan, path)
    return 0


def _load_plan(pid):
    p = pid if os.path.isabs(pid) else os.path.join(PLAN_DIR, pid.replace(".json", "") + ".json")
    if not os.path.exists(p):
        raise MetaError(f"No such plan: {pid}. Run `ads.sh plans` to list them.")
    with open(p) as f:
        return p, json.load(f)


def cmd_plans(args):
    if not os.path.isdir(PLAN_DIR):
        print("No plans yet.")
        return 0
    files = sorted(f for f in os.listdir(PLAN_DIR) if f.endswith(".json"))
    if not files:
        print("No plans yet.")
        return 0
    print(f"{'PLAN ID':<34} {'APPLIED':<9} DESCRIPTION")
    for f in files:
        with open(os.path.join(PLAN_DIR, f)) as fh:
            p = json.load(fh)
        print(f"{p['id']:<34} {('yes' if p.get('applied') else 'PENDING'):<9} {p['description']}")
    return 0


def cmd_show(args):
    path, plan = _load_plan(args.plan)
    print_plan(plan, path)
    return 0


def cmd_apply(args):
    path, plan = _load_plan(args.plan)
    if plan.get("applied") and not args.again:
        print(f"Plan {plan['id']} was already applied on {plan.get('applied_at')}. Use --again to force.")
        return 1
    if not args.confirm:
        print_plan(plan, path)
        print("  NOT APPLIED — this was a dry run. Re-run with --confirm to execute.\n")
        return 0

    print(f"Applying plan {plan['id']} — {plan['description']}\n")
    results, last_id = [], None
    for i, s in enumerate(plan["steps"], 1):
        p = s["path"]
        if p == "__RENAME_LAST__":
            if not last_id:
                print(f"  {i}. SKIP rename — previous step returned no id")
                continue
            p = f"/{last_id}"
        print(f"  {i}. {s['describe']}")
        try:
            res = api(p, s["params"], method=s["method"])
        except MetaError as e:
            print(f"     FAILED: {e}")
            results.append({"step": i, "ok": False, "error": str(e)})
            plan["applied"] = True
            plan["applied_at"] = datetime.datetime.now().isoformat(timespec="seconds")
            plan["results"] = results
            with open(path, "w") as f:
                json.dump(plan, f, indent=2)
            print("\n  Stopped at the first failure. Earlier steps above already took effect.")
            return 1
        nid = res.get("copied_ad_id") or res.get("copied_adset_id") or res.get("copied_campaign_id") or res.get("id")
        if isinstance(res, dict) and res.get("ad_object_ids"):
            try:
                nid = res["ad_object_ids"][0].get("copied_id", nid)
            except Exception:
                pass
        if nid:
            last_id = nid
            print(f"     ok -> {nid}")
        else:
            print("     ok")
        results.append({"step": i, "ok": True, "response": res})

    plan["applied"] = True
    plan["applied_at"] = datetime.datetime.now().isoformat(timespec="seconds")
    plan["results"] = results
    with open(path, "w") as f:
        json.dump(plan, f, indent=2)
    print(f"\nDone. {len(results)} step(s) applied. Record kept at {path}\n")
    return 0


# ---------------------------------------------------------------- CLI
def main():
    ap = argparse.ArgumentParser(prog="ads.sh", description="Meta Ads — read freely, write only via confirmed plans.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("doctor", help="check token, account and permissions")
    sub.add_parser("accounts", help="list ad accounts this token can see")

    p = sub.add_parser("list", help="list campaigns / adsets / ads")
    p.add_argument("level", choices=["campaigns", "adsets", "ads"])
    p.add_argument("--status", help="filter, e.g. ACTIVE or ACTIVE,PAUSED")
    p.add_argument("--parent", help="only children of this campaign/adset id")

    p = sub.add_parser("report", help="performance report")
    p.add_argument("--level", choices=["campaign", "adset", "ad"], default="campaign")
    p.add_argument("--preset", default="last_7d", help="last_7d, last_14d, last_30d, this_month, maximum ...")
    p.add_argument("--days", type=int, help="last N complete days (ending yesterday)")
    p.add_argument("--since"); p.add_argument("--until")

    p = sub.add_parser("duplicate", help="PLAN a duplicate of a campaign/adset/ad")
    p.add_argument("id")
    p.add_argument("--count", type=int, default=1)
    p.add_argument("--name", help="exact name for the copy")
    p.add_argument("--suffix", default=" - Copy")
    p.add_argument("--status", default="PAUSED", choices=["PAUSED", "ACTIVE", "paused", "active"])
    p.add_argument("--deep", action="store_true", help="also copy children (adsets/ads)")
    p.add_argument("--into", help="target parent id (move copy into another campaign/adset)")

    p = sub.add_parser("edit", help="PLAN an edit")
    p.add_argument("id")
    p.add_argument("--name")
    p.add_argument("--status", choices=["ACTIVE", "PAUSED", "ARCHIVED", "active", "paused", "archived"])
    p.add_argument("--daily-budget", dest="daily_budget", help="in whole currency units, e.g. 50 = $50.00")
    p.add_argument("--lifetime-budget", dest="lifetime_budget", help="in whole currency units")

    for nm, st in (("pause", "PAUSED"), ("resume", "ACTIVE")):
        q = sub.add_parser(nm, help=f"PLAN setting something to {st}")
        q.add_argument("id")
        q.set_defaults(_status=st)

    sub.add_parser("plans", help="list saved plans")
    p = sub.add_parser("show", help="show a plan"); p.add_argument("plan")
    p = sub.add_parser("apply", help="execute a plan (needs --confirm)")
    p.add_argument("plan"); p.add_argument("--confirm", action="store_true"); p.add_argument("--again", action="store_true")

    args = ap.parse_args()
    try:
        if args.cmd == "doctor":    return cmd_doctor(args)
        if args.cmd == "accounts":  return cmd_accounts(args)
        if args.cmd == "list":
            args.level = {"campaigns": "campaign", "adsets": "adset", "ads": "ad"}[args.level]
            return cmd_list(args)
        if args.cmd == "report":    return cmd_report(args)
        if args.cmd == "duplicate": return cmd_duplicate(args)
        if args.cmd == "edit":      return cmd_edit(args)
        if args.cmd in ("pause", "resume"): return cmd_setstatus(args, args._status)
        if args.cmd == "plans":     return cmd_plans(args)
        if args.cmd == "show":      return cmd_show(args)
        if args.cmd == "apply":     return cmd_apply(args)
    except MetaError as e:
        print(f"\nerror: {e}\n", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
