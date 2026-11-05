#!/usr/bin/env python3
"""Google Search Console from the command line. No third-party deps (plain urllib).

Auth: a Google "Desktop app" OAuth client JSON at ~/.authframework/secrets/gmail.client (the same one a
Gmail/YouTube CLI can share) with the Search Console scope. Token lives at ~/.authframework/secrets/gsc.token
(0600). The Search Console API must be enabled on that client's Google Cloud project (console -> APIs).
Property: set GSC_SITE (e.g. https://www.example.com/ or sc-domain:example.com) or put {"site": "...",
"login_hint": "you@example.com"} in gsc.config.json next to this file. Nothing here can delete a property
or change verification.

usage:
  gsc.py auth-url                      print the consent URL (phone-friendly manual flow)
  gsc.py auth-finish "<127.0.0.1 url>" finish the manual flow with the address Chrome failed to open
  gsc.py relay TOKEN                   one-page phone relay on 127.0.0.1:8771 (expose with cloudflared)
  gsc.py sites                         properties this account can see
  gsc.py sitemaps                      submitted sitemaps + their status
  gsc.py submit-sitemap [url]          (re)submit the sitemap (default <site>/sitemap.xml)
  gsc.py inspect URL [URL...]          URL Inspection: index status / last crawl / canonical
  gsc.py queries [--days 28] [--min-pos 1] [--max-pos 100] [--limit 50]   query report
  gsc.py pages   [--days 28] [--limit 50]                                 page report
  gsc.py token-status                  JSON expiry probe (auth-keepalive compatible)
"""
import html, http.server, json, os, secrets, sys, threading, time, urllib.error, urllib.parse, urllib.request

SECRETS = os.path.expanduser("~/.authframework/secrets")
CLIENT_FILE = os.path.join(SECRETS, "gmail.client")
TOKEN_FILE = os.environ.get("GSC_TOKEN_FILE", os.path.join(SECRETS, "gsc.token"))
SCOPE = os.environ.get("GSC_SCOPE", "https://www.googleapis.com/auth/webmasters")
OAUTH_PORT = int(os.environ.get("GSC_OAUTH_PORT", "8770"))
REDIRECT = f"http://127.0.0.1:{OAUTH_PORT}/"
_CFG = {}
try:
    _CFG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gsc.config.json")))
except (OSError, ValueError):
    pass
SITE = os.environ.get("GSC_SITE") or _CFG.get("site") or "https://www.example.com/"
LOGIN_HINT = os.environ.get("GSC_LOGIN_HINT") or _CFG.get("login_hint") or ""
SITEMAP = SITE + "sitemap.xml"
WM = "https://www.googleapis.com/webmasters/v3"


def die(msg, code=1):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(code)


def client():
    if not os.path.exists(CLIENT_FILE):
        die(f"missing OAuth client at {CLIENT_FILE} (install it with gmail.sh install-client)")
    c = json.load(open(CLIENT_FILE))
    return c.get("installed", c)


def write_0600(path, text):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.write(fd, text.encode())
    os.close(fd)


def consent_url(state):
    c = client()
    q = {"client_id": c["client_id"], "redirect_uri": REDIRECT, "response_type": "code", "scope": SCOPE,
         "access_type": "offline", "prompt": "consent", "state": state}
    if LOGIN_HINT:
        q["login_hint"] = LOGIN_HINT
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(q)


def exchange(code):
    c = client()
    d = urllib.parse.urlencode({"code": code, "client_id": c["client_id"], "client_secret": c["client_secret"],
                                "redirect_uri": REDIRECT, "grant_type": "authorization_code"}).encode()
    t = json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", d))
    if "refresh_token" not in t:
        die("Google returned no refresh token (prompt=consent should force one). Try again.")
    t["obtained_at"] = int(time.time())
    write_0600(TOKEN_FILE, json.dumps(t))
    return t


def access_token():
    if not os.path.exists(TOKEN_FILE):
        die("not authorized yet. Run: gsc.py auth-url (or the phone relay)")
    t = json.load(open(TOKEN_FILE))
    if t.get("access_token") and time.time() < t.get("obtained_at", 0) + t.get("expires_in", 0) - 60:
        return t["access_token"]
    c = client()
    d = urllib.parse.urlencode({"client_id": c["client_id"], "client_secret": c["client_secret"],
                                "refresh_token": t["refresh_token"], "grant_type": "refresh_token"}).encode()
    try:
        n = json.load(urllib.request.urlopen("https://oauth2.googleapis.com/token", d))
    except urllib.error.HTTPError as e:
        die(f"refresh failed ({e.read().decode()[:300]}). Re-authorize: gsc.py auth-url")
    t.update(n)
    t["obtained_at"] = int(time.time())
    write_0600(TOKEN_FILE, json.dumps(t))
    return t["access_token"]


def api(method, url, body=None):
    req = urllib.request.Request(url, method=method, headers={"Authorization": "Bearer " + access_token()})
    data = None
    if body is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    try:
        raw = urllib.request.urlopen(req, data).read()
        return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        b = e.read().decode()
        try:
            err = json.loads(b)["error"]
            det = [d.get("metadata", {}).get("activationUrl") for d in err.get("details", []) if d.get("reason")]
            die(f"HTTP {e.code} {err.get('status')}: {err.get('message')}" + (f"\n       enable at: {det[0]}" if det and det[0] else ""))
        except (KeyError, ValueError):
            die(f"HTTP {e.code}: {b[:400]}")


def site_q():
    return urllib.parse.quote(SITE, safe="")


# ------------------------------------------------------------------ commands
def cmd_auth_url(a):
    print(consent_url(secrets.token_urlsafe(16)))
    print("\nOpen that on any device, approve with the Google account that owns the property, then paste the 127.0.0.1 address Chrome "
          "fails to open into: gsc.py auth-finish \"<address>\"", file=sys.stderr)


def cmd_auth_finish(a):
    if not a:
        die("usage: gsc.py auth-finish \"http://127.0.0.1:8770/?state=...&code=...\"")
    q = urllib.parse.urlparse(a[0])
    code = urllib.parse.parse_qs(q.query).get("code", [""])[0]
    if q.hostname not in ("127.0.0.1", "localhost") or not code:
        die("that is not the 127.0.0.1 address with a code in it")
    exchange(code)
    print(f"authorized; token saved 0600 to {TOKEN_FILE}")
    cmd_sites([])


def cmd_sites(a):
    r = api("GET", f"{WM}/sites")
    for s in r.get("siteEntry", []):
        print(f"{s['permissionLevel']:<22} {s['siteUrl']}")
    if not r.get("siteEntry"):
        print("(no properties visible to this account)")


def cmd_sitemaps(a):
    r = api("GET", f"{WM}/sites/{site_q()}/sitemaps")
    for s in r.get("sitemap", []):
        n = sum(int(c.get("submitted", 0)) for c in s.get("contents", []))
        i = sum(int(c.get("indexed", 0)) for c in s.get("contents", []))
        print(f"{s['path']}\n  submitted {s.get('lastSubmitted','?')}  downloaded {s.get('lastDownloaded','never')}  "
              f"type {s.get('type','?')}  pending {s.get('isPending')}  errors {s.get('errors',0)} warnings {s.get('warnings',0)}  "
              f"urls submitted {n} indexed {i}")
    if not r.get("sitemap"):
        print("(no sitemaps submitted)")


def cmd_submit_sitemap(a):
    sm = a[0] if a else SITEMAP
    api("PUT", f"{WM}/sites/{site_q()}/sitemaps/{urllib.parse.quote(sm, safe='')}")
    print(f"submitted {sm}")
    cmd_sitemaps([])


def cmd_inspect(a):
    if not a:
        die("usage: gsc.py inspect URL [URL...]")
    for u in a:
        if u.startswith("/"):
            u = SITE.rstrip("/") + u
        r = api("POST", "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
                {"inspectionUrl": u, "siteUrl": SITE, "languageCode": "en-AU"})
        ix = r.get("inspectionResult", {}).get("indexStatusResult", {})
        print(f"{u}\n  verdict {ix.get('verdict')}  coverage: {ix.get('coverageState')}\n  last crawl {ix.get('lastCrawlTime','never')}  "
              f"robots {ix.get('robotsTxtState')}  indexing {ix.get('indexingState')}\n  google canonical {ix.get('googleCanonical','-')}  "
              f"user canonical {ix.get('userCanonical','-')}")


def _opt(a, name, default):
    if name in a:
        i = a.index(name)
        return a[i + 1]
    return default


def _report(a, dim):
    days = int(_opt(a, "--days", 28)); limit = int(_opt(a, "--limit", 50))
    lo = float(_opt(a, "--min-pos", 1)); hi = float(_opt(a, "--max-pos", 100))
    end = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 2 * 86400))   # GSC data lags ~2 days
    start = time.strftime("%Y-%m-%d", time.gmtime(time.time() - (days + 2) * 86400))
    r = api("POST", f"{WM}/sites/{site_q()}/searchAnalytics/query",
            {"startDate": start, "endDate": end, "dimensions": [dim], "rowLimit": 1000})
    rows = [x for x in r.get("rows", []) if lo <= x["position"] <= hi]
    rows.sort(key=lambda x: (-x["impressions"], x["position"]))
    print(f"{dim} {start}..{end}  rows {len(rows)} (showing {min(limit, len(rows))}, position {lo:g}-{hi:g})")
    print(f"{'clicks':>6} {'impr':>6} {'ctr':>6} {'pos':>5}  {dim}")
    for x in rows[:limit]:
        print(f"{x['clicks']:>6} {x['impressions']:>6} {x['ctr']*100:>5.1f}% {x['position']:>5.1f}  {x['keys'][0]}")


def cmd_queries(a): _report(a, "query")
def cmd_pages(a): _report(a, "page")


def cmd_enable_api(a):
    """Enable searchconsole.googleapis.com on the OAuth client's project (token must carry cloud-platform scope)."""
    proj = client()["client_id"].split("-")[0]
    r = api("POST", f"https://serviceusage.googleapis.com/v1/projects/{proj}/services/searchconsole.googleapis.com:enable", {})
    print("enable requested:", json.dumps(r)[:300])
    for i in range(20):
        st = api("GET", f"https://serviceusage.googleapis.com/v1/projects/{proj}/services/searchconsole.googleapis.com")
        if st.get("state") == "ENABLED":
            print("Search Console API ENABLED on project", proj); return
        time.sleep(3)
    die("API still not reported ENABLED after 60s")


def cmd_token_status(a):
    if not os.path.exists(TOKEN_FILE):
        print(json.dumps({"ok": False, "reason": "no token"})); return
    t = json.load(open(TOKEN_FILE))
    try:
        access_token(); ok = True; why = ""
    except SystemExit:
        ok = False; why = "refresh failed"
    print(json.dumps({"ok": ok, "reason": why, "refresh_token": bool(t.get("refresh_token")), "scope": t.get("scope"),
                      "expires_at": None}))   # production OAuth app => refresh token does not expire on a timer


# ------------------------------------------------------------------ phone relay
def cmd_relay(a):
    """One page: Start -> Google consent; Finish -> paste the failed 127.0.0.1 address; code exchanged on the Mac."""
    if not a:
        die("usage: gsc.py relay TOKEN")
    tok = a[0]; st = {"state": None}

    def page(body):
        return ('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">'
                '<style>body{font:18px -apple-system,sans-serif;max-width:560px;margin:24px auto;padding:0 16px}'
                'a.b,button{display:block;width:100%;padding:16px;font-size:19px;border-radius:12px;border:0;'
                'background:#1a73e8;color:#fff;text-align:center;text-decoration:none;margin:12px 0}'
                'textarea{width:100%;height:120px;font-size:15px}</style>' + body).encode()

    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *x): pass

        def send(self, body, code=200, loc=None):
            self.send_response(code)
            if loc: self.send_header("Location", loc)
            self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Cache-Control", "no-store")
            self.end_headers(); self.wfile.write(body)

        def do_GET(self):
            p = urllib.parse.urlparse(self.path).path
            if p == f"/{tok}/":
                self.send(page(
                    f"<h2>Connect Google Search Console ({html.escape(SITE)})</h2><ol>"
                    f"<li>Tap <b>Start</b>. Google opens. Sign in{' as <b>' + html.escape(LOGIN_HINT) + '</b>' if LOGIN_HINT else ''} and tap <b>Allow</b>.</li>"
                    "<li>If Google says the app isn't verified: <b>Advanced &rarr; Go to &hellip; (unsafe) &rarr; Continue</b>. "
                    "It's your own OAuth app.</li>"
                    "<li>Chrome then says <b>This site can't be reached / 127.0.0.1 refused to connect</b>. That's expected. "
                    "Tap the address bar, then <b>Copy</b>.</li>"
                    "<li>Come back to THIS tab, paste into the box and tap <b>Finish</b>.</li></ol>"
                    f'<a class=b href="/{tok}/start" target="_blank" rel="noopener">Start (opens Google in a new tab)</a>'
                    f'<form method=post action="/{tok}/finish"><textarea name=u placeholder="Paste the 127.0.0.1 address here"></textarea>'
                    "<button>Finish</button></form>"))
            elif p == f"/{tok}/start":
                st["state"] = secrets.token_urlsafe(16)
                self.send(b"", 302, consent_url(st["state"]))
            else:
                self.send(b"not found", 404)

        def do_POST(self):
            if urllib.parse.urlparse(self.path).path != f"/{tok}/finish":
                return self.send(b"not found", 404)
            n = int(self.headers.get("Content-Length", 0) or 0)
            u = urllib.parse.parse_qs(self.rfile.read(min(n, 20000)).decode()).get("u", [""])[0].strip()
            q = urllib.parse.urlparse(u); qs = urllib.parse.parse_qs(q.query)
            if q.hostname not in ("127.0.0.1", "localhost") or "code" not in qs:
                return self.send(page("<p>That doesn't look like the 127.0.0.1 address. Go back and paste the whole address "
                                      "from the page that failed to open.</p>"))
            if qs.get("state", [""])[0] != st["state"]:
                return self.send(page("<p>That address is from an older attempt. Go back, tap Start again, then paste the new one.</p>"))
            try:
                exchange(qs["code"][0])
                self.send(page("<h2>Connected.</h2><p>You can close this tab and tell Claude.</p>"))
                print("RESULT OK", flush=True)
                threading.Thread(target=lambda: (time.sleep(2), os._exit(0)), daemon=True).start()
            except SystemExit as e:
                self.send(page("<h2>It didn't connect.</h2><p>Tell Claude.</p>"))
                print("RESULT FAILED", flush=True)
            except Exception as e:
                self.send(page(f"<h2>It didn't connect: {html.escape(str(e)[:300])}</h2><p>Tell Claude.</p>"))
                print("RESULT FAILED", str(e)[:300], flush=True)

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8771), H)
    threading.Thread(target=lambda: (time.sleep(7200), os._exit(1)), daemon=True).start()
    srv.serve_forever()


if __name__ == "__main__":
    cmds = {"auth-url": cmd_auth_url, "auth-finish": cmd_auth_finish, "relay": cmd_relay, "sites": cmd_sites,
            "sitemaps": cmd_sitemaps, "submit-sitemap": cmd_submit_sitemap, "inspect": cmd_inspect,
            "queries": cmd_queries, "pages": cmd_pages, "token-status": cmd_token_status, "enable-api": cmd_enable_api}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print(__doc__); sys.exit(2)
    cmds[sys.argv[1]](sys.argv[2:])
