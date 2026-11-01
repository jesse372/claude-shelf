#!/usr/bin/env python3
"""Finish `youtube.sh auth` from a phone when nobody is at the Mac.

Desktop OAuth redirects to 127.0.0.1:8766 on the device that approved it, so a phone can't reach the Mac's listener.
This serves a one-page relay on 127.0.0.1:8767 under a random token (expose it with a temporary tunnel):
  1. Phone opens the page, taps Start -> the Mac starts `youtube.sh --profile P auth ...` and the phone is sent to
     Google's consent page (the Mac never prints that URL; a BROWSER hook hands it to this relay).
  2. After Allow, the phone shows "can't connect to 127.0.0.1" -> user copies that address and pastes it here.
  3. The relay forwards it to the Mac's own loopback listener. The code is PKCE-bound to the waiting process and
     single-use, so it is useless anywhere else. Nothing is logged or echoed. Exits after one completed auth.
usage: phone_auth_relay.py TOKEN PROFILE --channel-title 'Exact title'
"""
import html, http.server, os, subprocess, sys, threading, time, urllib.parse, urllib.request
TOKEN, PROFILE, *AUTH_ARGS = sys.argv[1:]
HERE = os.path.dirname(os.path.abspath(__file__))
URLFILE = os.path.expanduser(f'~/.youtube-upload/profiles/{PROFILE}/.consent_url')
state = {'proc': None, 'out': ''}

def page(body):
    return ('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">'
            '<style>body{font:18px -apple-system,sans-serif;max-width:560px;margin:24px auto;padding:0 16px}'
            'a.b,button{display:block;width:100%;padding:16px;font-size:19px;border-radius:12px;border:0;'
            'background:#c00;color:#fff;text-align:center;text-decoration:none;margin:12px 0}'
            'textarea{width:100%;height:120px;font-size:15px}</style>' + body).encode()

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, body, code=200, loc=None):
        self.send_response(code)
        if loc: self.send_header('Location', loc)
        self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Cache-Control', 'no-store')
        self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        p = urllib.parse.urlparse(self.path).path
        if p == f'/{TOKEN}/':
            self.send(page(f'<h2>Connect YouTube: {html.escape(PROFILE)}</h2><ol><li>Tap <b>Start</b>. Google opens.</li>'
                '<li>Sign in, pick the channel, tap <b>Advanced → Go to Chance Video Uploader → Allow</b>.</li>'
                '<li>Your browser then says it <b>can\'t open 127.0.0.1</b>. That is expected. Copy that page\'s web '
                'address (tap the address bar → Copy), come back to this tab and paste it below.</li></ol>'
                f'<a class=b href="/{TOKEN}/start">Start</a>'
                f'<form method=post action="/{TOKEN}/finish"><textarea name=u placeholder="Paste the 127.0.0.1 address here"></textarea>'
                '<button>Finish</button></form>'))
        elif p == f'/{TOKEN}/start':
            if state['proc'] and state['proc'].poll() is None: state['proc'].kill(); time.sleep(1)
            try: os.remove(URLFILE)
            except FileNotFoundError: pass
            env = dict(os.environ, BROWSER=f'{sys.executable} {os.path.abspath(__file__)} --capture %s',
                       YT_CONSENT_URLFILE=URLFILE, PYTHONUNBUFFERED='1')
            state['proc'] = subprocess.Popen([f'{HERE}/youtube.sh', '--profile', PROFILE, 'auth', *AUTH_ARGS],
                                             env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            threading.Thread(target=lambda: state.__setitem__('out', state['proc'].stdout.read()), daemon=True).start()
            for _ in range(60):
                if os.path.exists(URLFILE): break
                time.sleep(0.5)
            if not os.path.exists(URLFILE): return self.send(page('<p>The Mac could not start the sign-in. Tell Claude.</p>'))
            url = open(URLFILE).read().strip(); os.remove(URLFILE)
            self.send(b'', 302, url)
        else:
            self.send(b'not found', 404)
    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != f'/{TOKEN}/finish': return self.send(b'not found', 404)
        n = int(self.headers.get('Content-Length', 0) or 0)
        u = urllib.parse.parse_qs(self.rfile.read(min(n, 20000)).decode()).get('u', [''])[0].strip()
        q = urllib.parse.urlparse(u)
        if q.hostname not in ('127.0.0.1', 'localhost') or 'code=' not in q.query:
            return self.send(page('<p>That doesn\'t look like the 127.0.0.1 address. Go back and paste the whole address from the page that failed to open.</p>'))
        if not state['proc'] or state['proc'].poll() is not None:
            return self.send(page('<p>The sign-in on the Mac has timed out. Go back and tap Start again.</p>'))
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{q.port or 8766}{q.path or "/"}?{q.query}', timeout=30).read()
        except Exception:
            pass
        try: state['proc'].wait(timeout=60)
        except subprocess.TimeoutExpired: pass
        ok = state['proc'].returncode == 0 and '"connected": true' in state['out']
        # keep the tool's own message (it never contains tokens or codes) so a failure can be diagnosed
        log = os.path.expanduser(f'~/.youtube-upload/profiles/{PROFILE}/last_phone_auth.log')
        fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600); os.write(fd, state['out'].encode()); os.close(fd)
        why = [l for l in state['out'].splitlines() if 'Error' in l or 'error' in l or 'not ' in l][-1:] or ['']
        msg = ('Connected. You can close this tab and tell Claude.' if ok else
               'It didn\'t connect: ' + html.escape(why[0][-300:]) + '<br><br>Tell Claude.')
        self.send(page(f'<h2>{msg}</h2>'))
        print('RESULT', 'OK' if ok else 'FAILED', flush=True)
        if ok: threading.Thread(target=lambda: (time.sleep(2), os._exit(0)), daemon=True).start()

if __name__ == '__main__':
    if TOKEN == '--capture':           # BROWSER hook: hand Google's consent URL to the relay, open nothing
        f = os.environ['YT_CONSENT_URLFILE']; fd = os.open(f, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        os.write(fd, PROFILE.encode()); os.close(fd); sys.exit(0)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8767), H)
    threading.Thread(target=lambda: (time.sleep(3600), os._exit(1)), daemon=True).start()   # hard stop after 1 h
    srv.serve_forever()
