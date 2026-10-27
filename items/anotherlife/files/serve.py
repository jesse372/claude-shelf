#!/usr/bin/env python3
"""Dev server for AnotherLife.

Plain http.server sends no Cache-Control at all, so browsers fall back to
heuristic caching and a phone (especially an installed PWA) keeps serving a
stale build for hours. Everything here is sent no-store.
"""
import http.server, socketserver, os, sys, hashlib

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "www")
DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")

def revision():
    """Hash of everything the app loads, so a dev build can tell when to reload."""
    h = hashlib.sha1()
    for base, _dirs, files in os.walk(ROOT):
        for f in sorted(files):
            if f.endswith((".js", ".css", ".html", ".webmanifest")):
                p = os.path.join(base, f)
                try:
                    h.update(f.encode())
                    h.update(str(os.path.getmtime(p)).encode())
                except OSError:
                    pass
    return h.hexdigest()[:12]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_GET(self):
        # APKs live outside www/ so they never get bundled into the next build
        name = os.path.basename(self.path.split("?")[0])
        if name.endswith(".apk"):
            p = os.path.join(DIST, name)
            if os.path.isfile(p):
                self.send_response(200)
                self.send_header("Content-Type", "application/vnd.android.package-archive")
                self.send_header("Content-Length", str(os.path.getsize(p)))
                self.end_headers()
                with open(p, "rb") as fh:
                    self.wfile.write(fh.read())
                return
            self.send_error(404); return
        # Dev-only sound audition page. Lives in tools/, not www/, so it can
        # never end up inside a shipped build.
        if self.path.split("?")[0] == "/sound-test":
            p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "sound-test.html")
            if os.path.isfile(p):
                body = open(p, "rb").read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self.send_error(404); return
        if self.path.split("?")[0] == "/__rev":
            body = revision().encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_header(self, key, value):
        # drop the validators that let a client answer from cache
        if key.lower() in ("last-modified", "etag"):
            return
        super().send_header(key, value)

    def log_message(self, *a):
        pass

class Server(socketserver.ThreadingTCPServer):
    """One thread per connection, and a real backlog.

    The single-threaded TCPServer this used to be served one connection at a
    time with a listen backlog of 5. The app is ~20 files (16 JS modules) and a
    WebView opens six connections at once, so the moment the server was also
    doing anything else — another device, an APK download, a headless-Chrome
    probe — the queue overflowed and connections were RESET mid-load. On the
    phone that surfaces as net::ERR_CONNECTION_ABORTED, and because a failed ES
    module import stops everything, the app simply does not start. It looked
    like the server was down. It wasn't; it was busy.
    """
    daemon_threads = True          # never keep the process alive on a stuck socket
    allow_reuse_address = True
    request_queue_size = 128

with Server(("", PORT), Handler) as httpd:
    print(f"serving {ROOT} on :{PORT} with no-store (threaded, backlog 128)", flush=True)
    httpd.serve_forever()
