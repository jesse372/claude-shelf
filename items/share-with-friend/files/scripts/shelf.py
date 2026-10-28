#!/usr/bin/env python3
"""shelf.py: publish things Jesse builds with Claude to the public "Claude Shelf" site.

The site is a static GitHub Pages repo. Each creation lives at items/<slug>/ in that repo:
    items/<slug>/item.json      metadata shown on the card
    items/<slug>/files/...      the shareable copy (sanitised: secrets blocked, paths generalised)
    items/<slug>/<slug>.zip     one-click download (skills zip as <skill-name>/SKILL.md for claude.ai)
items.json + feed.xml + index.html at the repo root are regenerated on every change.

Commands:
    shelf.py publish --source PATH --title T --summary S [--type skill|tool|website|prompt|script|other]
                     [--how-to-use TEXT] [--requires TEXT] [--emoji E] [--slug S] [--link URL]
                     [--tags a,b] [--useful 1-5] [--exclude GLOB]... [--created ISO] [--updated ISO]
                     [--dry-run] [--no-push]
    shelf.py scan PATH            run only the secret/privacy scan
    shelf.py edit SLUG [--title T] [--summary S] [--useful 1-5] ...   card text only (no version bump)
    shelf.py rate SLUG 1-5        set how useful it is (drives the "Most useful" sort)
    shelf.py sync [SLUG...] [--dry-run]   republish anything whose source changed (nightly LaunchAgent)
    shelf.py list
    shelf.py remove SLUG
    shelf.py rebuild              regenerate index/items/feed from item.json files, then push
    shelf.py verify [SLUG]        check that the live site serves items.json (and contains SLUG)
"""
import argparse, contextlib, datetime as dt, fcntl, fnmatch, json, os, re, shutil, subprocess, sys
import tempfile, time, urllib.request, zipfile
from pathlib import Path
from xml.sax.saxutils import escape as xesc

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
CFG = json.loads((SKILL / "config.json").read_text())
REPO_DIR = Path(os.path.expanduser(CFG["repo_dir"]))
SITE_URL = CFG["site_url"].rstrip("/") + "/"
REPO_URL = CFG["repo_url"].rstrip("/")
TYPES = ["skill", "tool", "website", "prompt", "script", "other"]
SOURCES = SKILL / "sources.json"        # PRIVATE: slug -> where it came from, for `sync`. Never published.
_TEST = os.environ.get("SHELF_TEST")            # sandbox runs: no alerts, state kept out of the real paths
SYNC_STATE = Path(_TEST or Path.home() / "JesseOS/workspace/logs") / "shelf-sync.last.json"
HEARTBEAT = Path(_TEST or Path.home() / ".qc-heartbeats") / "shelf-sync"
NTFY_TOPIC_FILE = Path.home() / "JesseOS/workspace/watchdog/ntfy-topic.txt"

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", "env", "logs", "log", "state",
             ".cache", ".pytest_cache", ".mypy_cache", ".next", ".wrangler", ".idea", ".vscode",
             "secrets", ".secrets", "credentials"}
SKIP_FILE_RE = re.compile(
    r"(^\.env($|\.)|\.pem$|\.key$|\.p12$|\.pfx$|\.keystore$|\.sqlite3?$|\.db$|\.log$|^\.DS_Store$|"
    r"^id_(rsa|ed25519|ecdsa)|credential|secret|token|cookie|session|\.netrc$|\.npmrc$|\.pypirc$)", re.I)
MAX_FILE = 5 * 1024 * 1024
MAX_TOTAL = 40 * 1024 * 1024

SECRET_PATTERNS = [
    ("Anthropic/OpenAI key", r"\bsk-(ant-)?[A-Za-z0-9_\-]{20,}"),
    ("GitHub token", r"\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})"),
    ("AWS key", r"\bAKIA[0-9A-Z]{16}\b"),
    ("Slack token", r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
    ("Google API key", r"\bAIza[0-9A-Za-z_\-]{35}\b"),
    ("Meta/Square token", r"\bEAA[A-Za-z0-9_\-]{40,}"),
    ("Stripe key", r"\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}"),
    ("Private key block", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("Bearer token", r"(?i)\bbearer\s+[A-Za-z0-9._\-]{30,}"),
    ("Hard-coded secret", r"(?i)\b(api[_-]?key|secret|passw(or)?d|access[_-]?token|auth[_-]?token|client[_-]?secret)"
                          r"\b\s*[:=]\s*['\"]([^'\"\s$<{]{12,})['\"]"),
]
PLACEHOLDER = re.compile(r"(?i)(your|example|placeholder|xxxx|changeme|dummy|redacted|<|\$\{)")
# personal-looking data: BLOCK (a real person's phone/email must never go public)
PERSONAL_PATTERNS = [
    ("personal email", r"[A-Za-z0-9._%+\-]+@(gmail|googlemail|outlook|hotmail|live|icloud|me|mac|yahoo|bigpond|optusnet|iinet|westnet|proton(mail)?)\.[A-Za-z.]{2,}"),
    ("AU mobile number", r"(?<![\d.])(\+?61\s?4\d{2}|04\d{2})[\s\-]?\d{3}[\s\-]?\d{3}(?![\d.])"),
    ("AU landline", r"(?<![\d.])\(?0[2378]\)?[\s\-]?\d{4}[\s\-]?\d{4}(?![\d.])"),
]
WARN_PATTERNS = [
    ("email address", r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"),
    ("street address?", r"\b\d{1,4}\s+[A-Z][a-z]+\s+(Rd|Road|St|Street|Ave|Avenue|Dr|Drive|Cres|Crescent|Way|Pde|Parade|Ct|Court|Pl|Place)\b"),
    ("Jesse-specific path (needs JesseOS)", r"JesseOS"),
]
MEDIA_RE = re.compile(r"\.(jpe?g|heic|cr2|cr3|nef|arw|dng|tiff?|mp4|mov|m4v|avi|mkv|webm|wav|m4a)$", re.I)
SAFE_EMAILS = re.compile(r"(?i)(noreply@|no-reply@|example\.(com|org)|@users\.noreply\.github\.com|user@|you@|name@|me@)")


# ---------------------------------------------------------------- helpers
def die(msg, code=1):
    print(f"✗ {msg}", file=sys.stderr)
    sys.exit(code)


def now_iso():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:60] or "item"


def private_terms():
    out = []   # private-terms*.txt are NOT published; one literal or regex per line
    for f in sorted(SKILL.glob("private-terms*.txt")):
        for line in f.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                out.append(line)
    return out


def read_text(p):
    try:
        b = p.read_bytes()
        if b"\0" in b[:8192]:
            return None
        return b.decode("utf-8")
    except (UnicodeDecodeError, OSError):
        return None


def rewrite(text):
    for pat, rep in CFG.get("path_rewrites", []):
        text = re.sub(pat, rep, text)
    return text


def excluded(rel, patterns):
    r = str(rel)
    return any(fnmatch.fnmatch(r, pat) or fnmatch.fnmatch(r, pat.rstrip("/") + "/*")
               or any(fnmatch.fnmatch(part, pat) for part in Path(r).parts) for pat in patterns)


def git_files(src):
    """Tracked + untracked-but-not-ignored files when src is inside a git work tree, else None."""
    try:
        r = subprocess.run(["git", "-C", str(src), "ls-files", "-co", "--exclude-standard", "-z", "--", "."],
                           capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"git ls-files timed out in {src}")
    if r.returncode:
        return None
    return sorted({f for f in r.stdout.split("\0") if f})


def iter_source(src, patterns=()):
    """Yield (abs_path, rel_path, skipped_reason|None)."""
    if src.is_file():
        yield src, Path(src.name), None
        return
    gf = git_files(src)
    if gf is not None:
        for f in gf:
            p, rel = src / f, Path(f)
            if not p.is_file():
                continue
            if excluded(rel, patterns):
                yield p, rel, "excluded"
            elif any(part in SKIP_DIRS or part.startswith(".") and part not in {".claude", ".github", ".gitignore", ".nojekyll"}
                     for part in rel.parts[:-1]):
                yield p, rel, "skipped dir"
            elif SKIP_FILE_RE.search(rel.name):
                yield p, rel, "looks like a secret/state file"
            elif p.is_symlink():
                yield p, rel, "symlink"
            elif p.stat().st_size > MAX_FILE:
                yield p, rel, f"too big ({p.stat().st_size // 1024} KB)"
            else:
                yield p, rel, None
        return
    for root, dirs, files in os.walk(src):
        rootp = Path(root)
        kept = []
        for d in sorted(dirs):
            if d in SKIP_DIRS or d.startswith(".") and d not in {".claude", ".github"} or excluded((rootp / d).relative_to(src), patterns):
                yield rootp / d, (rootp / d).relative_to(src), "skipped dir"
            else:
                kept.append(d)
        dirs[:] = kept
        for f in sorted(files):
            p = rootp / f
            rel = p.relative_to(src)
            if excluded(rel, patterns):
                yield p, rel, "excluded"
            elif SKIP_FILE_RE.search(f):
                yield p, rel, "looks like a secret/state file"
            elif p.is_symlink():
                yield p, rel, "symlink"
            elif p.stat().st_size > MAX_FILE:
                yield p, rel, f"too big ({p.stat().st_size // 1024} KB)"
            else:
                yield p, rel, None


def scan_text(rel, text, terms):
    """Return (blockers, warnings) lists of strings."""
    blockers, warnings = [], []
    for i, line in enumerate(text.splitlines(), 1):
        for name, pat in SECRET_PATTERNS:
            for m in re.finditer(pat, line):
                val = m.group(m.lastindex) if name == "Hard-coded secret" else m.group(0)
                if name == "Hard-coded secret" and PLACEHOLDER.search(val):
                    continue
                blockers.append(f"{rel}:{i}  {name}: {val[:12]}…")
        for name, pat in PERSONAL_PATTERNS:
            for m in re.finditer(pat, line, re.I):
                if not SAFE_EMAILS.search(m.group(0)):
                    blockers.append(f"{rel}:{i}  {name}: {m.group(0)[:40]}")
        for t in terms:
            try:
                hit = re.search(t, line, re.I)
            except re.error:
                hit = t.lower() in line.lower()
            if hit:
                blockers.append(f"{rel}:{i}  private term '{t}'")
        for name, pat in WARN_PATTERNS:
            for m in re.finditer(pat, line):
                if name == "email address" and SAFE_EMAILS.search(m.group(0)):
                    continue
                warnings.append(f"{rel}:{i}  {name}: {m.group(0)[:60]}")
    return blockers, warnings


def redact(text, terms):
    for t in terms:
        try:
            text = re.sub(t, "[redacted]", text, flags=re.I)
        except re.error:
            text = re.sub(re.escape(t), "[redacted]", text, flags=re.I)
    return text


def stage(src, dest, patterns=(), do_redact=False):
    """Copy src into dest with rewrites applied; return report dict. dest must not exist."""
    terms = private_terms()
    rep = {"files": [], "skipped": [], "blockers": [], "warnings": [], "total": 0, "media": []}
    for p, rel, why in iter_source(src, patterns):
        if why:
            rep["skipped"].append(f"{rel}  ({why})")
            continue
        out = dest / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        text = read_text(p)
        if text is None:
            shutil.copy2(p, out)
        else:
            text = rewrite(text)
            if do_redact:
                text = redact(text, terms)
            b, w = scan_text(rel, text, terms)
            rep["blockers"] += b
            rep["warnings"] += w
            out.write_text(text)
            shutil.copymode(p, out)
        # scan file NAMES for private terms too
        for t in terms:
            try:
                fhit = re.search(t, str(rel), re.I)
            except re.error:
                fhit = t.lower() in str(rel).lower()
            if fhit:
                rep["blockers"].append(f"{rel}  private term in filename '{t}'")
        rep["total"] += out.stat().st_size
        rep["files"].append(str(rel))
        if MEDIA_RE.search(rel.name):
            rep["media"].append(str(rel))
    if rep["total"] > MAX_TOTAL:
        rep["blockers"].append(f"total size {rep['total'] // 1024 // 1024} MB > {MAX_TOTAL // 1024 // 1024} MB limit")
    return rep


def print_report(rep):
    skipped = rep["skipped"]
    for s in skipped[:25]:
        print(f"  · skipped {s}")
    if len(skipped) > 25:
        print(f"  · …and {len(skipped) - 25} more skipped")
    if rep.get("media"):
        print(f"⚠ {len(rep['media'])} photo/video/audio file(s) included. Make sure none are client or private media:")
        for m in rep["media"][:15]:
            print(f"    {m}")
    if rep["warnings"]:
        print(f"⚠ {len(rep['warnings'])} warning(s): review these are OK to share:")
        for w in sorted(set(rep["warnings"]))[:60]:
            print(f"    {w}")
    if rep["blockers"]:
        print(f"✗ {len(rep['blockers'])} BLOCKER(S): not publishing:")
        for b in sorted(set(rep["blockers"]))[:60]:
            print(f"    {b}")


def skill_name(src):
    md = (src / "SKILL.md") if src.is_dir() else None
    if md and md.exists():
        m = re.search(r"^name:\s*['\"]?([A-Za-z0-9_\-]+)", md.read_text(), re.M)
        if m:
            return m.group(1)
    return src.stem if src.is_file() else src.name


def make_zip(files_dir, zip_path, top):
    zip_path.unlink(missing_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(files_dir.rglob("*")):
            if p.is_file():
                z.write(p, f"{top}/{p.relative_to(files_dir)}")


def install_prompt(it):
    zip_url = SITE_URL + it["zip"] if it.get("zip") else None
    t, title = it["type"], it["title"]
    safety = "Read the files first and tell me if anything looks risky, needs an API key, or costs money. Ask me before installing anything system-wide."
    if t == "prompt" and it.get("prompt_text"):
        return it["prompt_text"]
    if t == "skill" and zip_url:
        name = it.get("skill_name", it["slug"])
        return (f"Please install the Claude Code skill \"{title}\" from my friend's Claude Shelf.\n"
                f"1. Download {zip_url}\n"
                f"2. Unzip it into ~/.claude/skills/ so it ends up at ~/.claude/skills/{name}/SKILL.md\n"
                f"3. {safety}\n"
                f"4. Set up anything SKILL.md says it needs, then tell me in plain words how to use it.")
    if t == "website" and it.get("link") and not zip_url:
        return None
    if zip_url:
        return (f"Please set up \"{title}\" from my friend's Claude Shelf.\n"
                f"1. Download {zip_url} and unzip it to ~/claude-shelf/{it['slug']}/\n"
                f"2. {safety}\n"
                f"3. Get it working on my machine and show me how to use it.\n"
                + (f"His notes: {it['how_to_use']}" if it.get("how_to_use") else ""))
    return None


def load_sources():
    return json.loads(SOURCES.read_text()) if SOURCES.exists() else {}


def save_source(slug, rec):
    srcs = load_sources()
    srcs[slug] = rec
    SOURCES.write_text(json.dumps(dict(sorted(srcs.items())), indent=2) + "\n")


def can_read(path):
    """macOS privacy (TCC) makes background jobs HANG on ~/Documents, ~/Desktop, ~/Downloads.
    Probe in a throwaway process with a timeout instead of finding out by freezing."""
    try:
        return subprocess.run(["/bin/ls", str(path)], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, timeout=15).returncode == 0
    except subprocess.TimeoutExpired:
        return False


def throttled(key, msg, days=7):
    """True if this alert should fire: new message, or the same one not sent for `days`."""
    f = SYNC_STATE.with_name("shelf-sync.alerts.json")
    seen = json.loads(f.read_text()) if f.exists() else {}
    last = seen.get(key, {})
    if last.get("msg") == msg and time.time() - last.get("at", 0) < days * 86400:
        return False
    seen[key] = {"msg": msg, "at": time.time()}
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(seen))
    return True


def same_tree(a, b):
    """True if dirs a and b hold exactly the same files with the same bytes."""
    if not b.exists():
        return False
    fa = {p.relative_to(a): p for p in a.rglob("*") if p.is_file()}
    fb = {p.relative_to(b): p for p in b.rglob("*") if p.is_file()}
    return fa.keys() == fb.keys() and all(fa[k].read_bytes() == fb[k].read_bytes() for k in fa)


def tree_diff(a, b):
    fa = {str(p.relative_to(a)) for p in a.rglob("*") if p.is_file()}
    fb = {str(p.relative_to(b)) for p in b.rglob("*") if p.is_file()} if b.exists() else set()
    mod = [k for k in fa & fb if (a / k).read_bytes() != (b / k).read_bytes()]
    return f"+{len(fa - fb)} new, -{len(fb - fa)} removed, ~{len(mod)} changed"


def notify(title, msg):
    """macOS banner + phone (ntfy, same topic as the site watchdog) + log."""
    print(f"ALERT {title}: {msg}")
    if _TEST:
        return
    with contextlib.suppress(Exception):
        # fire-and-forget: osascript can hang with no GUI session, and a captured pipe would hang us with it
        subprocess.Popen(["osascript", "-e", f'display notification "{msg[:200].replace(chr(34), chr(39))}" with title "{title}"'],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    with contextlib.suppress(Exception):
        topic = NTFY_TOPIC_FILE.read_text().strip() if NTFY_TOPIC_FILE.exists() else ""
        if topic:
            req = urllib.request.Request(f"https://ntfy.sh/{topic}", data=msg[:1000].encode(),
                                         headers={"Title": title, "Tags": "toolbox"})
            urllib.request.urlopen(req, timeout=15)


@contextlib.contextmanager
def repo_lock():
    REPO_DIR.mkdir(parents=True, exist_ok=True)
    lf = open(REPO_DIR.parent / ".claude-shelf.lock", "w")
    fcntl.flock(lf, fcntl.LOCK_EX)
    try:
        yield
    finally:
        fcntl.flock(lf, fcntl.LOCK_UN)
        lf.close()


def git(*args, check=True):
    r = subprocess.run(["git", "-C", str(REPO_DIR), *args], capture_output=True, text=True)
    if check and r.returncode:
        die(f"git {' '.join(args)} failed:\n{r.stdout}{r.stderr}")
    return r


def ensure_repo():
    if not (REPO_DIR / ".git").exists():
        die(f"site repo not found at {REPO_DIR}. Clone it: git clone {REPO_URL} {REPO_DIR}")
    git("pull", "--rebase", "--autostash", "-q", check=False)


def load_items():
    items = []
    for f in sorted((REPO_DIR / "items").glob("*/item.json")):
        try:
            items.append(json.loads(f.read_text()))
        except json.JSONDecodeError as e:
            print(f"⚠ bad {f}: {e}")
    items.sort(key=lambda i: i.get("updated", ""), reverse=True)
    return items


def build_site():
    items = load_items()
    public = [{k: v for k, v in i.items() if k != "prompt_text"} | {"install_prompt": install_prompt(i)} for i in items]
    (REPO_DIR / "items.json").write_text(json.dumps(
        {"title": CFG["site_title"], "site": SITE_URL, "updated": now_iso(), "items": public}, indent=2, ensure_ascii=False))
    tpl = (HERE / "site_template" / "index.html").read_text()
    tpl = (tpl.replace("{{ICONS}}", (HERE / "site_template" / "icons.html").read_text().strip())
              .replace("{{SITE_TITLE}}", CFG["site_title"]).replace("{{OWNER}}", CFG["owner_first_name"])
              .replace("{{REPO_URL}}", REPO_URL)
              .replace("{{SITE_URL_JSON}}", json.dumps(SITE_URL)).replace("{{REPO_URL_JSON}}", json.dumps(REPO_URL)))
    (REPO_DIR / "index.html").write_text(tpl)
    (REPO_DIR / ".nojekyll").write_text("")
    # Atom feed
    entries = []
    for i in items[:50]:
        ver = f" (updated, v{i['version']})" if i.get("version", 1) > 1 else ""
        entries.append(
            f"<entry><title>{xesc(i.get('emoji', '') + ' ' + i['title'] + ver)}</title>"
            f"<id>{xesc(SITE_URL)}#{xesc(i['slug'])}-v{i.get('version', 1)}</id>"
            f"<link href=\"{xesc(SITE_URL)}#{xesc(i['slug'])}\"/><updated>{i['updated']}</updated>"
            f"<summary>{xesc(i['summary'])}</summary></entry>")
    (REPO_DIR / "feed.xml").write_text(
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<feed xmlns=\"http://www.w3.org/2005/Atom\">"
        f"<title>{xesc(CFG['site_title'])}</title><id>{xesc(SITE_URL)}</id>"
        f"<link href=\"{xesc(SITE_URL)}\"/><link rel=\"self\" href=\"{xesc(SITE_URL)}feed.xml\"/>"
        f"<updated>{items[0]['updated'] if items else now_iso()}</updated>"
        f"<author><name>{xesc(CFG['owner_first_name'])}</name></author>" + "".join(entries) + "</feed>\n")
    return items


def commit_push(msg, push=True):
    git("add", "-A")
    if not git("status", "--porcelain").stdout.strip():
        print("· nothing changed")
        return False
    git("commit", "-q", "-m", msg + "\n\nCo-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>")
    if push:
        r = git("push", "-q", check=False)
        if r.returncode:
            git("pull", "--rebase", "-q")
            git("push", "-q")
        print(f"✓ pushed. Live in about a minute at {SITE_URL}")
    return True


# ---------------------------------------------------------------- commands
def cmd_scan(a):
    src = Path(os.path.expanduser(a.path)).resolve()
    with tempfile.TemporaryDirectory() as td:
        rep = stage(src, Path(td) / "x", a.exclude or [], a.redact)
    print(f"{len(rep['files'])} file(s), {rep['total'] // 1024} KB")
    print_report(rep)
    sys.exit(1 if rep["blockers"] else 0)


def cmd_publish(a):
    src = Path(os.path.expanduser(a.source)).resolve() if a.source else None
    if src and not src.exists():
        die(f"source not found: {src}")
    if not src and not a.link:
        die("need --source and/or --link")
    t = a.type or ("skill" if src and src.is_dir() and (src / "SKILL.md").exists() else "tool")
    if t not in TYPES:
        die(f"--type must be one of {TYPES}")
    slug = slugify(a.slug or (skill_name(src) if t == "skill" and src else a.title))

    if a.prebuild and not a.dry_run:
        r = subprocess.run(a.prebuild, shell=True, capture_output=True, text=True)
        if r.returncode:
            die(f"--prebuild failed:\n{r.stdout}{r.stderr}")
    with repo_lock():
        if not a.dry_run:
            ensure_repo()
        item_dir = REPO_DIR / "items" / slug
        old = json.loads((item_dir / "item.json").read_text()) if (item_dir / "item.json").exists() else None

        with tempfile.TemporaryDirectory() as td:
            staged = Path(td) / "files"
            rep = {"files": [], "skipped": [], "blockers": [], "warnings": [], "total": 0, "media": []}
            if src:
                rep = stage(src, staged, a.exclude or [], a.redact)
                if not rep["files"]:
                    die("nothing left to publish after exclusions")
            # metadata text is published too, so scan it
            for field in ("title", "summary", "how_to_use", "requires"):
                b, w = scan_text(f"--{field}", getattr(a, field) or "", private_terms())
                rep["blockers"] += b
                rep["warnings"] += w
            print(f"{'UPDATE' if old else 'NEW'} {t} '{a.title}' → items/{slug}/  ({len(rep['files'])} file(s), {rep['total'] // 1024} KB)")
            print_report(rep)
            if rep["blockers"]:
                die("fix or remove the flagged content (or add the file to the source's exclusions) and re-run.", 2)
            if a.dry_run:
                print("· dry run: nothing written")
                return

            if item_dir.exists():
                shutil.rmtree(item_dir)
            item_dir.mkdir(parents=True)
            it = {
                "slug": slug, "title": a.title, "emoji": a.emoji or {"skill": "🧩", "tool": "🛠️", "website": "🌐",
                                                                     "prompt": "💬", "script": "📜"}.get(t, "✨"),
                "type": t, "summary": a.summary, "how_to_use": a.how_to_use or "", "requires": a.requires or "",
                "tags": [x.strip() for x in (a.tags or "").split(",") if x.strip()], "link": a.link or "",
                "created": a.created or (old["created"] if old else now_iso()), "updated": a.updated or now_iso(),
                "version": (old.get("version", 1) + 1) if old and not a.keep_version else (old.get("version", 1) if old else 1),
                "useful": a.useful if a.useful is not None else (old.get("useful", 3) if old else 3),
                "files": rep["files"],
            }
            if src and rep["files"]:
                shutil.copytree(staged, item_dir / "files")
                top = skill_name(src) if t == "skill" else slug
                if t == "skill":
                    it["skill_name"] = top
                make_zip(item_dir / "files", item_dir / f"{slug}.zip", top)
                it["zip"] = f"items/{slug}/{slug}.zip"
                if t == "prompt" and len(rep["files"]) == 1:
                    it["prompt_text"] = (item_dir / "files" / rep["files"][0]).read_text()
            (item_dir / "item.json").write_text(json.dumps(it, indent=2, ensure_ascii=False))
            if src and not a.no_track:
                save_source(slug, {"source": str(src).replace(str(Path.home()), "~", 1), "exclude": a.exclude or [],
                                   "redact": bool(a.redact), "prebuild": a.prebuild or ""})

        build_site()
        commit_push(f"{'Update' if old else 'Publish'}: {a.title}", push=not a.no_push)
        print(f"  card: {SITE_URL}#{slug}")


def cmd_list(a):
    ensure_repo()
    for i in load_items():
        print(f"{i['updated'][:10]}  {'★' * i.get('useful', 3):<5} v{i.get('version', 1):<2} {i['type']:<8} {i['slug']:<28} {i['title']}")


def cmd_remove(a):
    with repo_lock():
        ensure_repo()
        d = REPO_DIR / "items" / a.slug
        if not d.exists():
            die(f"no item '{a.slug}'")
        shutil.rmtree(d)
        srcs = load_sources()
        if srcs.pop(a.slug, None) is not None:
            SOURCES.write_text(json.dumps(srcs, indent=2) + "\n")
        build_site()
        commit_push(f"Remove: {a.slug}")
    print("note: it stays in the public git history. If it held something sensitive, rotate that secret.")


def cmd_rate(a):
    with repo_lock():
        ensure_repo()
        f = REPO_DIR / "items" / a.slug / "item.json"
        if not f.exists():
            die(f"no item '{a.slug}'")
        it = json.loads(f.read_text())
        it["useful"] = a.score
        f.write_text(json.dumps(it, indent=2, ensure_ascii=False))
        build_site()
        commit_push(f"Rate {a.slug}: {a.score}/5")


def cmd_edit(a):
    """Change card text/rating without touching files, version or dates."""
    with repo_lock():
        ensure_repo()
        f = REPO_DIR / "items" / a.slug / "item.json"
        if not f.exists():
            die(f"no item '{a.slug}'")
        it = json.loads(f.read_text())
        changes = {k: getattr(a, k) for k in ("title", "summary", "how_to_use", "requires", "emoji", "useful", "link")
                   if getattr(a, k) is not None}
        if a.tags is not None:
            changes["tags"] = [x.strip() for x in a.tags.split(",") if x.strip()]
        for field in ("title", "summary", "how_to_use", "requires"):
            if field in changes:
                b, _ = scan_text(f"--{field}", changes[field], private_terms())
                if b:
                    die("blocked: " + "; ".join(b))
        it.update(changes)
        f.write_text(json.dumps(it, indent=2, ensure_ascii=False))
        print(f"edited {a.slug}: {', '.join(changes) or 'nothing'}")
        if not a.no_push:
            build_site()
            commit_push(f"Edit {a.slug}")


def cmd_sync(a):
    """Re-copy every tracked item from its source; republish the ones whose shareable files changed."""
    srcs = load_sources()
    changed, blocked, errors, no_access = [], [], [], []
    with repo_lock():
        ensure_repo()
        for slug, rec in srcs.items():
            if a.slugs and slug not in a.slugs:
                continue
            item_dir = REPO_DIR / "items" / slug
            f = item_dir / "item.json"
            if not f.exists():
                print(f"· {slug}: no longer on the shelf, skipping")
                continue
            if rec.get("prebuild"):
                r = subprocess.run(rec["prebuild"], shell=True, capture_output=True, text=True)
                if r.returncode:
                    errors.append(f"{slug}: prebuild failed: {(r.stderr or r.stdout).strip()[-200:]}")
                    continue
            src = Path(os.path.expanduser(rec["source"]))
            if not can_read(src):
                no_access.append(slug)
                continue
            if not src.exists():
                errors.append(f"{slug}: source folder missing ({rec['source']})")
                continue
            with tempfile.TemporaryDirectory() as td:
                staged = Path(td) / "files"
                try:
                    rep = stage(src, staged, rec.get("exclude", []), rec.get("redact", False))
                except (RuntimeError, OSError) as e:
                    errors.append(f"{slug}: {e}")
                    continue
                if not rep["files"]:
                    errors.append(f"{slug}: nothing to publish from {rec['source']}")
                    continue
                if same_tree(staged, item_dir / "files"):
                    continue
                diff = tree_diff(staged, item_dir / "files")
                if rep["blockers"]:
                    blocked.append(f"{slug}: " + "; ".join(sorted(set(rep["blockers"]))[:3]))
                    continue
                print(f"↻ {slug}: {diff}")
                if rep.get("media"):
                    new_media = [m for m in rep["media"] if not (item_dir / "files" / m).exists()]
                    if new_media:
                        blocked.append(f"{slug}: {len(new_media)} NEW photo/video file(s) need a human look "
                                       f"(e.g. {new_media[0]}). Publish manually once checked.")
                        continue
                if a.dry_run:
                    changed.append(slug)
                    continue
                it = json.loads(f.read_text())
                shutil.rmtree(item_dir / "files", ignore_errors=True)
                shutil.copytree(staged, item_dir / "files")
                make_zip(item_dir / "files", item_dir / f"{slug}.zip", it.get("skill_name") or slug)
                if it["type"] == "prompt" and len(rep["files"]) == 1:
                    it["prompt_text"] = (item_dir / "files" / rep["files"][0]).read_text()
                it.update(files=rep["files"], updated=now_iso(), version=it.get("version", 1) + 1)
                f.write_text(json.dumps(it, indent=2, ensure_ascii=False))
                changed.append(slug)
        if changed and not a.dry_run:
            build_site()
            commit_push("Sync: updated " + ", ".join(changed))
    print(f"sync: {len(changed)} updated{' (dry run)' if a.dry_run else ''}, {len(blocked)} blocked, {len(errors)} errors"
          + (f", {len(no_access)} skipped (no folder permission)" if no_access else "")
          + (f": {', '.join(changed)}" if changed else ""))
    for b in blocked + errors:
        print(f"  ! {b}")
    if no_access:
        print(f"  · no permission to read: {', '.join(no_access)} (they update when an agent runs `shelf.py sync` interactively)")
    if not a.dry_run:
        SYNC_STATE.parent.mkdir(parents=True, exist_ok=True)
        SYNC_STATE.write_text(json.dumps({"at": now_iso(), "updated": changed, "blocked": blocked, "errors": errors,
                                          "no_access": no_access}, indent=2))
        HEARTBEAT.parent.mkdir(parents=True, exist_ok=True)
        HEARTBEAT.write_text(f"{int(time.time())} {3 * 86400} shelf-sync\n")   # pipeline-qc dead-man's switch: 3 days
        if no_access:
            msg = (f"Nightly sync can't read {', '.join(no_access)} (macOS blocks background jobs from ~/Documents). "
                   "Fix once: System Settings → Privacy & Security → Full Disk Access → add /bin/bash. "
                   "Until then these update whenever Claude runs the sync in a session.")
            if throttled("no_access", msg, days=14):
                notify("Claude Shelf: folder permission", msg)
        if (blocked or errors) and throttled("problems", " | ".join(sorted(blocked + errors)), days=3):
            notify("Claude Shelf sync needs a look",
                   f"{len(blocked)} blocked, {len(errors)} errors. " + " | ".join(blocked + errors)[:700]
                   + " (details: ~/.claude/logs/shelf-sync.log)")
    sys.exit(1 if blocked or errors else 0)


def cmd_rebuild(a):
    with repo_lock():
        ensure_repo()
        build_site()
        commit_push("Rebuild site", push=not a.no_push)


def cmd_verify(a):
    url = SITE_URL + "items.json"
    for attempt in range(a.tries):
        try:
            with urllib.request.urlopen(f"{url}?t={time.time()}", timeout=15) as r:
                data = json.loads(r.read())
            slugs = [i["slug"] for i in data.get("items", [])]
            if not a.slug or a.slug in slugs:
                print(f"✓ live: {SITE_URL} ({len(slugs)} item(s))")
                return
            print(f"… live but '{a.slug}' not there yet")
        except Exception as e:
            print(f"… not reachable yet ({e.__class__.__name__}: {e})")
        if attempt < a.tries - 1:
            time.sleep(20)
    die("site did not show the change in time. Check the repo's Actions/Pages tab.")


def main():
    p = argparse.ArgumentParser(description="Publish things you build with Claude to the Claude Shelf site.")
    sp = p.add_subparsers(dest="cmd", required=True)
    pub = sp.add_parser("publish")
    pub.add_argument("--source", help="file or folder to share")
    pub.add_argument("--title", required=True)
    pub.add_argument("--summary", required=True, help="1-2 sentences, friend-facing: what it does / why it's useful")
    pub.add_argument("--type", choices=TYPES)
    pub.add_argument("--how-to-use", dest="how_to_use")
    pub.add_argument("--requires", help="what the friend needs (API keys, macOS, Node, …)")
    pub.add_argument("--emoji")
    pub.add_argument("--slug")
    pub.add_argument("--link", help="live URL (for websites)")
    pub.add_argument("--tags")
    pub.add_argument("--exclude", action="append", help="glob to leave out (repeatable), e.g. 'review-*' or 'data/*.jpg'")
    pub.add_argument("--redact", action="store_true", help="replace private-term matches (e.g. client names) with [redacted] instead of blocking")
    pub.add_argument("--useful", type=int, choices=range(1, 6), help="1-5: how useful this is likely to be for the friend")
    pub.add_argument("--created", help="ISO date it was first built (default: now / keep existing)")
    pub.add_argument("--updated", help="ISO date it last changed (default: now)")
    pub.add_argument("--keep-version", action="store_true", help="don't bump the version (metadata-only fix)")
    pub.add_argument("--prebuild", help="shell command that (re)builds --source first; stored for sync")
    pub.add_argument("--no-track", action="store_true", help="don't auto-sync this item from its source")
    pub.add_argument("--dry-run", action="store_true")
    pub.add_argument("--no-push", action="store_true")
    pub.set_defaults(f=cmd_publish)
    s = sp.add_parser("scan"); s.add_argument("path"); s.add_argument("--exclude", action="append"); s.add_argument("--redact", action="store_true"); s.set_defaults(f=cmd_scan)
    rt = sp.add_parser("rate"); rt.add_argument("slug"); rt.add_argument("score", type=int, choices=range(1, 6)); rt.set_defaults(f=cmd_rate)
    sp.add_parser("list").set_defaults(f=cmd_list)
    r = sp.add_parser("remove"); r.add_argument("slug"); r.set_defaults(f=cmd_remove)
    e = sp.add_parser("edit")
    e.add_argument("slug")
    for fl in ("title", "summary", "how-to-use", "requires", "emoji", "link", "tags"):
        e.add_argument(f"--{fl}", dest=fl.replace("-", "_"))
    e.add_argument("--useful", type=int, choices=range(1, 6))
    e.add_argument("--no-push", action="store_true", help="batch several edits, then run rebuild")
    e.set_defaults(f=cmd_edit)
    sy = sp.add_parser("sync", help="republish items whose source changed (runs nightly)")
    sy.add_argument("slugs", nargs="*")
    sy.add_argument("--dry-run", action="store_true")
    sy.set_defaults(f=cmd_sync)
    b = sp.add_parser("rebuild"); b.add_argument("--no-push", action="store_true"); b.set_defaults(f=cmd_rebuild)
    v = sp.add_parser("verify"); v.add_argument("slug", nargs="?"); v.add_argument("--tries", type=int, default=9)
    v.set_defaults(f=cmd_verify)
    a = p.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
