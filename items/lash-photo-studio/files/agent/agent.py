#!/usr/bin/env python3
"""Lash Studio agent: runs on the Mac mini (run as a macOS LaunchAgent, see README).

Polls the Worker for photos Bec has sent, edits each one with `codex exec`, which uses the
image_generation tool and The ChatGPT account sign-in (no OpenAI API billing), and uploads the result.

Uses only the standard library plus macOS `sips`. Logs to agent/agent.log.
    python3 agent.py            # run forever (what launchd does)
    python3 agent.py --once     # handle at most one job, then exit (testing)
    python3 agent.py --health   # print the queue + agent status from the Worker
"""
import json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request, urllib.error
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = os.environ.get("LASH_STUDIO_URL", "https://YOUR-WORKER.workers.dev").rstrip("/")
TOKEN = (HERE / ".agent_token").read_text().strip()
CODEX = shutil.which("codex") or "/usr/local/bin/codex"
GEN_DIR = Path.home() / ".codex" / "generated_images"
POLL_IDLE = 8          # seconds between checks when there's nothing to do
CODEX_TIMEOUT = 420    # seconds; the Worker re-queues anything stuck "working" for 10 min
MAX_SIDE = 2048
LOG = HERE / "agent.log"


def log(*a):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + " ".join(str(x) for x in a)
    print(line, flush=True)
    try:
        if LOG.exists() and LOG.stat().st_size > 2_000_000:
            LOG.replace(LOG.with_suffix(".log.1"))
        with LOG.open("a") as f:
            f.write(line + "\n")
    except OSError:
        pass


def call(method, path, body=None, ctype="application/json", timeout=60):
    data = json.dumps(body).encode() if isinstance(body, (dict, list)) else body
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={
        "authorization": "Bearer " + TOKEN, "content-type": ctype, "user-agent": "lash-studio-agent/1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        return json.loads(raw) if r.headers.get("content-type", "").startswith("application/json") else raw


def classify(text):
    """Turn Codex output into (message for Bec, retry?)."""
    t = text.lower()
    if re.search(r"usage limit|rate limit|too many requests|quota|reached your", t):
        return "The ChatGPT account has hit its limit for now. Please try again later.", False
    if re.search(r"log ?in|sign ?in|unauthori[sz]ed|401|auth.*expired|refresh token", t):
        return "The editing computer needs someone to sign in to ChatGPT again. Please let the owner know.", False
    if re.search(r"safety|policy|can't help|cannot help|unable to (edit|help)|not able to", t):
        return "ChatGPT wouldn't edit this photo. Try a different shot.", False
    return "The edit didn't work that time. Please try again.", True


def sips(*args):
    subprocess.run(["/usr/bin/sips", *args], check=True, capture_output=True)


def dims(path):
    out = subprocess.run(["/usr/bin/sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
                         capture_output=True, text=True).stdout
    w = int(re.search(r"pixelWidth: (\d+)", out).group(1))
    h = int(re.search(r"pixelHeight: (\d+)", out).group(1))
    return w, h


def finish_image(src, dst, shape):
    """PNG from Codex -> JPEG, capped size, centre-cropped to the shape Bec asked for."""
    sips("-s", "format", "jpeg", "-s", "formatOptions", "92", str(src), "--out", str(dst))
    target = {"square": 1.0, "portrait": 4 / 5}.get(shape)
    if target:
        w, h = dims(dst)
        if abs(w / h - target) > 0.02:
            if w / h > target:
                w = round(h * target)
            else:
                h = round(w / target)
            sips("-c", str(h), str(w), str(dst))
    w, h = dims(dst)
    if max(w, h) > MAX_SIDE:
        sips("-Z", str(MAX_SIDE), str(dst))


def find_output(thread_id, started):
    """The image Codex saved for this run: in its thread folder if we know it, else the newest since start."""
    if thread_id and (GEN_DIR / thread_id).is_dir():
        files = sorted((GEN_DIR / thread_id).glob("*.png"), key=lambda p: p.stat().st_mtime)
        if files:
            return files[-1]
    if not GEN_DIR.is_dir():
        return None
    files = [p for p in GEN_DIR.rglob("*.png") if p.stat().st_mtime >= started - 1]
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def process(job):
    jid = job["id"]
    log("job", jid, "style", job.get("style"), "shape", job.get("size"))
    work = Path(tempfile.mkdtemp(prefix="lash-"))
    out_png = None
    try:
        (work / "in.jpg").write_bytes(call("GET", f"/api/agent/jobs/{jid}/input", timeout=120))
        started = time.time()
        cmd = [CODEX, "exec", "--skip-git-repo-check", "--ephemeral", "--json",
               "-s", "read-only", "-c", 'model_reasoning_effort="low"', "-c", 'approval_policy="never"',
               "-C", str(work), "-i", str(work / "in.jpg"), "-o", str(work / "last.txt"), "-"]
        try:
            p = subprocess.run(cmd, input=job["prompt"], capture_output=True, text=True, timeout=CODEX_TIMEOUT)
            output = (p.stdout or "") + "\n" + (p.stderr or "")
        except subprocess.TimeoutExpired as e:
            tail = (e.stdout or b"")
            tail = tail.decode(errors="replace") if isinstance(tail, bytes) else tail
            log("job", jid, "codex timed out | tail:", tail[-800:].replace("\n", " "))
            call("POST", f"/api/agent/jobs/{jid}/fail", {"error": "The edit took too long. Please try again.", "retry": True})
            return
        m = re.search(r'"thread_id"\s*:\s*"([0-9a-f-]{36})"', output)
        out_png = find_output(m.group(1) if m else None, started)
        took = round(time.time() - started)
        if not out_png:
            msg, retry = classify(output)
            log("job", jid, f"no image after {took}s (exit {p.returncode}) ->", msg, "| tail:", output[-600:].replace("\n", " "))
            call("POST", f"/api/agent/jobs/{jid}/fail", {"error": msg, "retry": retry})
            return
        final = work / "out.jpg"
        finish_image(out_png, final, job.get("size"))
        call("POST", f"/api/agent/jobs/{jid}/result", final.read_bytes(), ctype="image/jpeg", timeout=120)
        log("job", jid, f"done in {took}s,", final.stat().st_size // 1024, "KB")
    except Exception as e:  # never let one bad job kill the agent
        log("job", jid, "error:", repr(e))
        try:
            call("POST", f"/api/agent/jobs/{jid}/fail", {"error": "The edit didn't work that time. Please try again.", "retry": True})
        except Exception:
            pass
    finally:
        shutil.rmtree(work, ignore_errors=True)
        # client photos shouldn't pile up on the Mac
        if out_png and out_png.exists():
            out_png.unlink(missing_ok=True)
            try:
                out_png.parent.rmdir()
            except OSError:
                pass


def main():
    if "--health" in sys.argv:
        print(json.dumps(call("GET", "/api/agent/health"), indent=2))
        return
    once = "--once" in sys.argv
    log("agent start", BASE, "codex", CODEX)
    backoff = POLL_IDLE
    while True:
        try:
            job = call("POST", "/api/agent/next").get("job")
            backoff = POLL_IDLE
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
            log("poll failed:", repr(e))
            backoff = min(backoff * 2, 120)
            time.sleep(backoff)
            continue
        if job:
            process(job)
            if once:
                return
            continue
        if once:
            log("no jobs")
            return
        time.sleep(POLL_IDLE)


if __name__ == "__main__":
    main()
