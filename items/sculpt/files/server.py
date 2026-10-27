#!/usr/bin/env python3
"""Sculpt local server.

Serves the app on 127.0.0.1 only (photos never leave this Mac) and adds one
endpoint the browser can't do itself:

  POST /convert   body = raw image bytes (HEIC/HEIF/TIFF/etc.)
                  -> returns a JPEG, converted with macOS `sips`.

Chrome can't decode iPhone HEIC photos, so the app falls back to this.
"""
import http.server
import os
import socketserver
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("SCULPT_PORT", sys.argv[1] if len(sys.argv) > 1 else 8765))
MAX_UPLOAD = 200 * 1024 * 1024
STYLE_FILE = os.path.join(ROOT, "data", "style.json")
LEARNED_FILE = os.path.join(ROOT, "data", "learned.json")
import json, threading
_style_lock = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".wasm": "application/wasm",
        ".task": "application/octet-stream",
    }

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # Cross-origin isolation → SharedArrayBuffer → multi-threaded AI (removal model ~4x faster).
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        # App code must never be stale after an update; models can cache.
        if self.path.endswith((".html", ".js", ".css", "/")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if os.environ.get("SCULPT_VERBOSE"):
            super().log_message(fmt, *args)

    # ---- shared "My style" (same API as the hosted Worker) ----
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_style(self):
        try:
            with open(STYLE_FILE) as f:
                return json.load(f)
        except Exception:
            return None

    def _write_style(self, data):
        os.makedirs(os.path.dirname(STYLE_FILE), exist_ok=True)
        tmp = STYLE_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(data, f)
        os.replace(tmp, STYLE_FILE)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/learned":
            try:
                with open(LEARNED_FILE) as f:
                    return self._json(200, json.load(f))
            except Exception:
                return self._json(200, {})
        if self.path.split("?")[0] == "/api/style":
            data = self._read_style()
            return self._json(200, data or {})
        return super().do_GET()

    def do_PUT(self):
        if self.path.split("?")[0] == "/api/learned":
            n = int(self.headers.get("Content-Length", 0))
            if n <= 0 or n > 10 * 1024 * 1024:
                return self.send_error(413)
            data = json.loads(self.rfile.read(n))
            os.makedirs(os.path.dirname(LEARNED_FILE), exist_ok=True)
            with open(LEARNED_FILE, "w") as f:
                json.dump(data, f)
            return self._json(200, {"ok": True})
        if self.path.split("?")[0] != "/api/style":
            return self.send_error(404)
        n = int(self.headers.get("Content-Length", 0))
        if n <= 0 or n > 25 * 1024 * 1024:
            return self.send_error(413)
        try:
            data = json.loads(self.rfile.read(n))
        except Exception:
            return self.send_error(400)
        with _style_lock:
            self._write_style(data)
        return self._json(200, {"ok": True})

    def do_POST(self):
        if self.path.split("?")[0] == "/api/style/examples":
            n = int(self.headers.get("Content-Length", 0))
            if n <= 0 or n > 64 * 1024:
                return self.send_error(413)
            try:
                ex = json.loads(self.rfile.read(n))
            except Exception:
                return self.send_error(400)
            with _style_lock:
                data = self._read_style() or {"finals": [], "examples": [], "look": None}
                data.setdefault("examples", []).append(ex)
                data["examples"] = data["examples"][-600:]
                self._write_style(data)
            return self._json(200, {"ok": True, "n": len(data["examples"])})
        if self.path.split("?")[0] != "/convert":
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length", 0))
        if n <= 0 or n > MAX_UPLOAD:
            self.send_error(413, "bad size")
            return
        data = self.rfile.read(n)
        with tempfile.TemporaryDirectory() as d:
            src, dst = os.path.join(d, "in"), os.path.join(d, "out.jpg")
            with open(src, "wb") as f:
                f.write(data)
            r = subprocess.run(
                ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "95", src, "--out", dst],
                capture_output=True, timeout=120,
            )
            if r.returncode != 0 or not os.path.exists(dst):
                self.send_error(415, "could not convert image")
                return
            out = open(dst, "rb").read()
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Sculpt running at http://127.0.0.1:{PORT}  (Ctrl+C to stop)", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
