#!/usr/bin/env python3
"""One-off: once Jesse approves the Google sign-in (token at gsc-verify.token), verify perthfuneralphotography.com.au
in Search Console by HTML file, add the property, submit the sitemap. Waits up to 72h for the token. Log: state/funeral-verify.log"""
import os, sys, time, json, subprocess, urllib.request, urllib.parse, datetime as dt
HOME = os.path.expanduser("~")
os.environ["GSC_TOKEN_FILE"] = f"{HOME}/.authframework/secrets/gsc-verify.token"
os.environ["GSC_SITE"] = "https://perthfuneralphotography.com.au/"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gsc
PROJ = f"{HOME}/JesseOS/projects/perth-funeral-photography"
SITE = "https://perthfuneralphotography.com.au/"
NOTIFY = f"{HOME}/JesseOS/workspace/notify/notify.py"
def log(*a): print(dt.datetime.now().strftime("%F %T"), *a, flush=True)
def call(method, url, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Bearer " + gsc.access_token(), "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read(); return json.loads(t) if t else {}
def notify(s, b):
    subprocess.run([sys.executable, NOTIFY, "send", "--subject", s, "--body", b, "--level", "daily"], timeout=120)
DONE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "state", "funeral-verify.done")
if os.path.exists(DONE): sys.exit(0)
deadline = time.time() + 72 * 3600
while not os.path.exists(os.environ["GSC_TOKEN_FILE"]):
    if time.time() > deadline: log("gave up: no sign-in within 72h"); sys.exit(1)
    time.sleep(30)
log("token present")
try:
    tok = call("POST", "https://www.googleapis.com/siteVerification/v1/token",
               {"site": {"type": "SITE", "identifier": SITE}, "verificationMethod": "FILE"})["token"]
    fn = os.path.join(PROJ, "site", tok)
    open(fn, "w").write(f"google-site-verification: {tok}")
    r = subprocess.run(["npx", "wrangler", "pages", "deploy", "site", "--project-name", "perth-funeral-photography",
                        "--branch", "main", "--commit-dirty=true"], cwd=PROJ, capture_output=True, text=True, timeout=600)
    log("deploy rc", r.returncode); time.sleep(45)
    call("POST", "https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=FILE",
         {"site": {"type": "SITE", "identifier": SITE}})
    log("verified")
    q = urllib.parse.quote(SITE, safe="")
    call("PUT", f"https://www.googleapis.com/webmasters/v3/sites/{q}")
    call("PUT", f"https://www.googleapis.com/webmasters/v3/sites/{q}/sitemaps/" + urllib.parse.quote(SITE + "sitemap.xml", safe=""))
    log("property added + sitemap submitted"); open(DONE, "w").write("ok")
    notify("Funeral site: Search Console connected", "perthfuneralphotography.com.au is verified in Search Console and the sitemap is submitted.")
except Exception as e:
    body = getattr(e, "read", lambda: b"")().decode()[:500]
    log("FAILED", e, body); notify("Funeral site: Search Console step failed", f"{e} {body}"); sys.exit(1)
