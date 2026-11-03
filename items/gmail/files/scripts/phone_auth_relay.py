#!/usr/bin/env python3
"""Finish `gmail.sh auth` from a phone when nobody is at the Mac (same pattern as youtube-upload's relay).

Desktop OAuth redirects to 127.0.0.1:<port> on the device that approved it, so a phone can't reach the Mac's
listener. This serves a one-page relay on 127.0.0.1:8769 under a random token (expose it with a temporary tunnel):
  1. Phone opens the page, taps Start -> the Mac runs `gmail.sh auth` and the phone is sent to Google's consent page
     (a BROWSER hook hands the URL to this relay; the Mac never opens a browser).
  2. After Allow, the phone shows "can't connect to 127.0.0.1" -> user copies that address and pastes it here.
  3. The relay forwards it to the Mac's own loopback listener. Single-use code, bound to the waiting process.
     Nothing is logged or echoed. Exits after one completed auth, or after 2 hours.
usage: phone_auth_relay.py TOKEN
"""
import html, http.server, os, subprocess, sys, threading, time, urllib.parse, urllib.request

PORT_OAUTH = os.environ.get("GMAIL_OAUTH_PORT", "8768")      # 8765 is the LAN share
HERE = os.path.dirname(os.path.abspath(__file__))
URLFILE = os.path.expanduser("~/.authframework/secrets/.gmail_consent_url")
state = {"proc": None, "out": ""}
TOKEN = sys.argv[1]


def page(body):
    return ('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">'
            '<style>body{font:18px -apple-system,sans-serif;max-width:560px;margin:24px auto;padding:0 16px}'
            'a.b,button{display:block;width:100%;padding:16px;font-size:19px;border-radius:12px;border:0;'
            'background:#1a73e8;color:#fff;text-align:center;text-decoration:none;margin:12px 0}'
            'textarea{width:100%;height:120px;font-size:15px}</style>' + body).encode()


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, body, code=200, loc=None):
        self.send_response(code)
        if loc:
            self.send_header("Location", loc)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = urllib.parse.urlparse(self.path).path
        if p == f"/{TOKEN}/":
            self.send(page(
                "<h2>Connect Gmail for the lead follow-up loop</h2><ol>"
                "<li>Tap <b>Start</b>. Google opens. Sign in as <b>you@example.com</b>.</li>"
                "<li>If Google says the app isn't verified: tap <b>Advanced &rarr; Go to &hellip; (unsafe) &rarr; Continue/Allow</b>. "
                "It's your own app (the one YouTube uploads use).</li>"
                "<li>Chrome then says <b>This site can't be reached / localhost refused to connect</b>. That's expected. "
                "Tap the address bar at the top, then tap <b>Copy</b> (the copy icon next to the address).</li>"
                "<li>Switch back to THIS tab (tabs button at the top right), paste into the box below and tap <b>Finish</b>.</li></ol>"
                f'<a class=b href="/{TOKEN}/start" target="_blank" rel="noopener">Start (opens Google in a new tab)</a>'
                f'<form method=post action="/{TOKEN}/finish"><textarea name=u placeholder="Paste the 127.0.0.1 address here"></textarea>'
                "<button>Finish</button></form>"))
        elif p == f"/{TOKEN}/start":
            if state["proc"] and state["proc"].poll() is None:
                state["proc"].kill()
                time.sleep(1)
            try:
                os.remove(URLFILE)
            except FileNotFoundError:
                pass
            env = dict(os.environ, BROWSER=f"{sys.executable} {os.path.abspath(__file__)} --capture %s",
                       GMAIL_CONSENT_URLFILE=URLFILE, GMAIL_OAUTH_PORT=PORT_OAUTH, PYTHONUNBUFFERED="1")
            state["proc"] = subprocess.Popen([f"{HERE}/gmail.sh", "auth"], env=env,
                                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            threading.Thread(target=lambda: state.__setitem__("out", state["proc"].stdout.read()), daemon=True).start()
            for _ in range(120):
                if os.path.exists(URLFILE):
                    break
                time.sleep(0.5)
            if not os.path.exists(URLFILE):
                return self.send(page("<p>The Mac could not start the sign-in. Tell Claude.</p>"))
            url = open(URLFILE).read().strip()
            os.remove(URLFILE)
            self.send(b"", 302, url)
        else:
            self.send(b"not found", 404)

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != f"/{TOKEN}/finish":
            return self.send(b"not found", 404)
        n = int(self.headers.get("Content-Length", 0) or 0)
        u = urllib.parse.parse_qs(self.rfile.read(min(n, 20000)).decode()).get("u", [""])[0].strip()
        q = urllib.parse.urlparse(u)
        if q.hostname not in ("127.0.0.1", "localhost") or "code=" not in q.query:
            return self.send(page("<p>That doesn't look like the 127.0.0.1 address. Go back and paste the whole address "
                                  "from the page that failed to open.</p>"))
        if not state["proc"] or state["proc"].poll() is not None:
            return self.send(page("<p>The sign-in on the Mac has timed out. Go back and tap Start again.</p>"))
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{q.port or PORT_OAUTH}{q.path or '/'}?{q.query}", timeout=30).read()
        except Exception:
            pass
        try:
            state["proc"].wait(timeout=60)
        except subprocess.TimeoutExpired:
            pass
        ok = state["proc"].returncode == 0 and "authorized" in state["out"]
        why = [l for l in state["out"].splitlines() if "rror" in l or "not " in l][-1:] or [""]
        msg = ("Connected. You can close this tab and tell Claude." if ok else
               "It didn't connect: " + html.escape(why[0][-300:]) + "<br><br>Tell Claude.")
        self.send(page(f"<h2>{msg}</h2>"))
        print("RESULT", "OK" if ok else "FAILED", flush=True)
        if ok:
            threading.Thread(target=lambda: (time.sleep(2), os._exit(0)), daemon=True).start()


if __name__ == "__main__":
    if TOKEN == "--capture":          # BROWSER hook: hand Google's consent URL to the relay, open nothing
        f = os.environ["GMAIL_CONSENT_URLFILE"]
        fd = os.open(f, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        os.write(fd, sys.argv[2].encode())
        os.close(fd)
        sys.exit(0)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8769), H)
    threading.Thread(target=lambda: (time.sleep(7200), os._exit(1)), daemon=True).start()
    srv.serve_forever()
