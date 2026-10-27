#!/usr/bin/env python3
"""skill-curator — weekly self-building + self-improving skill loop (full-auto).

Mines recent session work for NEW reusable skills, validates + improves existing ones, archives
dead ones (recoverable), re-syncs the skill links (~/.claude/skills + ~/.codex/skills via
sync-skills.sh), and writes a digest (local file + desktop notification). Drives a headless
`claude -p` (sonnet) scoped to the skills dir.

SAFETY: snapshots all skills before running (recoverable); `pinned: true` skills are off-limits;
archive (never delete); your skills dir should be version-controlled; --max-budget-usd cap on the model.

Run:  curate.py            # live
      curate.py --dry-run  # report only, no writes / no model edits
"""
from __future__ import annotations
import argparse, json, os, re, subprocess, sys, tarfile, time
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
SKILLS = HOME / "JesseOS/workspace/skills"
ARCHIVE = SKILLS / ".archive"
CONVENTIONS = SKILLS / "CONVENTIONS.md"
SYNC_SKILLS = SKILLS / "sync-skills.sh"
CLAUDE_SKILLS = HOME / ".claude/skills"
DECISIONS = HOME / "JesseOS/vault/50-memory/decisions.md"
STATE_DIR = HOME / ".local/state/jesseos-skills"
BACKUPS = STATE_DIR / "backups"
STATE = STATE_DIR / "state.json"
USAGE = STATE_DIR / "usage.json"
LOG = STATE_DIR / "curator.log"
DIGEST_DIR = HOME / "JesseOS/workspace/logs"
DIGEST_FILE = DIGEST_DIR / "skill-curator-digest.md"
MODEL = "sonnet"
SKIP = {"_TEMPLATE", ".archive"}


def log(m):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    line = f"{datetime.now().isoformat(timespec='seconds')} {m}"
    print(line)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def claude_bin():
    for c in ["/usr/local/bin/claude", str(HOME / ".omnara/bin/claude"),
              "/opt/homebrew/bin/claude"]:
        if Path(c).exists():
            return c
    return os.environ.get("CLAUDE_BIN", "claude")


def skill_dirs():
    return [d for d in sorted(SKILLS.iterdir())
            if d.is_dir() and d.name not in SKIP and (d / "SKILL.md").exists()]


def frontmatter(skill_md: Path):
    txt = skill_md.read_text(errors="ignore")
    m = re.match(r"^---\n(.*?)\n---\n", txt, re.S)
    fm = {}
    if m:
        for line in m.group(1).splitlines():
            mm = re.match(r"^(name|description|pinned|version):\s*(.*)$", line)
            if mm:
                fm[mm.group(1)] = mm.group(2).strip().strip('"').strip("'")
    return fm


def snapshot():
    BACKUPS.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    tgz = BACKUPS / f"skills-{ts}.tar.gz"
    with tarfile.open(tgz, "w:gz") as t:
        t.add(SKILLS, arcname="skills")
    snaps = sorted(BACKUPS.glob("skills-*.tar.gz"))
    for old in snaps[:-5]:
        old.unlink()
    return tgz


def recent_work():
    """Distilled work signal since last run = newest decisions.md entries (capped)."""
    if not DECISIONS.exists():
        return "(no decisions log)"
    txt = DECISIONS.read_text(errors="ignore")
    # decisions.md is newest-first under a marker; take the top ~10k chars of entries
    entries = re.split(r"\n(?=## )", txt)
    body = [e for e in entries if e.strip().startswith("## ")]
    return "\n".join(body[:25])[:10000]


def inventory():
    rows = []
    for d in skill_dirs():
        fm = frontmatter(d / "SKILL.md")
        rows.append(f"- {d.name} (pinned={fm.get('pinned','false')}): {fm.get('description','(no description)')[:160]}")
    return "\n".join(rows) or "(none)"


def build_prompt(dry: bool):
    mode = ("DRY-RUN: do NOT write, create, move, or delete anything. Only REPORT what you would do."
            if dry else
            "LIVE: make the changes directly with your file tools, scoped to the skills directory.")
    return f"""You are the skill curator — a careful librarian that grows and maintains a set of
reusable Claude Code skills. {mode}

Read the conventions first: {CONVENTIONS}
Skills directory (operate ONLY here): {SKILLS}
Recent work log (decisions): below.

EXISTING SKILLS (pinned=true means READ-ONLY — never edit, rename, move, or archive these):
{inventory()}

RECENT WORK (mine this for reusable procedures):
{recent_work()}

DO THREE THINGS, conservatively (quality over quantity — 0 changes is fine if nothing warrants it):
1. DISCOVER & AUTHOR: find procedures in the recent work that are genuinely reusable and recur (done
   >=2x OR clearly reusable infra) and are NOT already covered by an existing skill. For each, create
   `{SKILLS}/<kebab-name>/SKILL.md` (+ a `scripts/` entrypoint if there's concrete logic to extract)
   strictly per CONVENTIONS.md (YAML frontmatter with trigger-rich `description`; the 7 body sections).
   Do NOT invent skills with no evidence. Do NOT duplicate an existing skill.
2. IMPROVE (non-pinned only): fix frontmatter to spec, tighten the `description` (more trigger phrases),
   repair broken file paths, refresh clearly-stale content. Do NOT gratuitously rewrite good skills.
3. CONSOLIDATE/ARCHIVE (non-pinned only): merge clearly-overlapping skills; move any dead/obsolete skill
   folder to `{ARCHIVE}/<name>/` with `mv` (NEVER delete).

HARD RULES: stay inside {SKILLS}. Never touch pinned skills, `_TEMPLATE`, or `CONVENTIONS.md`. Never
delete (archive instead). Keep each SKILL.md ~80-200 lines.

When finished, output EXACTLY ONE fenced json block as the LAST thing, nothing after it:
```json
{{"created":[{{"name":"","why":""}}],"improved":[{{"name":"","what":""}}],"archived":[{{"name":"","why":""}}],"notes":[""]}}
```
Use empty arrays where nothing applies."""


def run_claude(prompt, dry):
    args = [claude_bin(), "-p", prompt, "--model", MODEL,
            "--add-dir", str(SKILLS), "--max-budget-usd", "3.00"]
    if not dry:
        args += ["--allowedTools", "Read,Edit,Write,Bash,Glob,Grep",
                 "--permission-mode", "bypassPermissions"]
    else:
        args += ["--allowedTools", "Read,Glob,Grep", "--permission-mode", "default"]
    env = dict(os.environ, PATH="/usr/local/bin:" + str(HOME / ".omnara/bin")
               + ":/opt/homebrew/bin:" + os.environ.get("PATH", ""))
    p = subprocess.run(args, cwd=str(SKILLS), env=env, text=True,
                       capture_output=True, timeout=900)
    return p.stdout + ("\n[stderr]\n" + p.stderr if p.returncode else "")


def parse_summary(out):
    blocks = re.findall(r"```json\s*(\{.*?\})\s*```", out, re.S)
    for b in reversed(blocks):
        try:
            return json.loads(b)
        except Exception:
            continue
    return {"created": [], "improved": [], "archived": [], "notes": ["(no parseable summary from model)"]}


def resync_links():
    """Re-mirror canonical skills into ~/.claude/skills + ~/.codex/skills via sync-skills.sh."""
    if SYNC_SKILLS.exists():
        try:
            subprocess.run(["/bin/zsh", str(SYNC_SKILLS)], capture_output=True, timeout=60)
            return
        except Exception as e:
            log("sync-skills.sh failed, falling back to symlink resync: " + str(e)[:120])
    # Fallback: minimal symlink resync into ~/.claude/skills if sync-skills.sh is unavailable.
    CLAUDE_SKILLS.mkdir(parents=True, exist_ok=True)
    live = {p.name for p in skill_dirs()}
    for d in skill_dirs():
        link = CLAUDE_SKILLS / d.name
        if not (link.is_symlink() and link.resolve() == d.resolve()):
            if link.exists() or link.is_symlink():
                link.unlink()
            link.symlink_to(d)
    for link in CLAUDE_SKILLS.iterdir():
        if link.is_symlink() and link.name not in live:
            link.unlink()


def validate():
    bad = []
    for d in skill_dirs():
        fm = frontmatter(d / "SKILL.md")
        if not fm.get("name") or not fm.get("description"):
            bad.append(d.name)
    return bad


def notify(title, message):
    """Desktop notification via osascript (best-effort)."""
    try:
        msg = message.replace('"', "'")[:240]
        subprocess.run(["osascript", "-e",
                        f'display notification "{msg}" with title "{title}"'],
                       capture_output=True, timeout=15)
    except Exception as e:
        log("notification failed: " + str(e)[:120])


def send_digest(summary, dry, invalid, snap):
    c, i, a = summary.get("created", []), summary.get("improved", []), summary.get("archived", [])
    status = "WARN" if invalid else "OK"
    head = f"[{status}] Skill Curator" + (" (dry-run)" if dry else "") + f" - {datetime.now().strftime('%a %d %b')}"
    lines = [f"created {len(c)} | improved {len(i)} | archived {len(a)} | {len(skill_dirs())} live"]
    for x in c: lines.append(f"+ {x.get('name','?')} - {x.get('why','')[:90]}")
    for x in i: lines.append(f"~ {x.get('name','?')} - {x.get('what','')[:90]}")
    for x in a: lines.append(f"archived {x.get('name','?')} - {x.get('why','')[:90]}")
    if invalid: lines.append("WARN invalid frontmatter: " + ", ".join(invalid))
    for n in summary.get("notes", [])[:3]:
        if n: lines.append("- " + n[:120])
    if not dry: lines.append(f"rollback: tar xzf {snap} -C /tmp && diff (or restore)")
    body = "\n".join(lines)

    # 1) Write the digest to a local markdown log (always).
    try:
        DIGEST_DIR.mkdir(parents=True, exist_ok=True)
        with open(DIGEST_FILE, "w") as f:
            f.write(f"# {head}\n\n{body}\n")
    except Exception as e:
        log("digest file write failed: " + str(e)[:120])

    # 2) Fire a desktop notification with a one-line summary.
    notify("skill-curator", lines[0])

    # --- OPTIONAL: push the digest to your own channel ---------------------------------------
    # To also send this digest to Telegram, email, or another notifier, wire it up here.
    # Pull any credentials/tokens from your own secret manager (see
    # ~/JesseOS/workspace/security/README.md) rather than hard-coding them. Example sketch:
    #
    #   token = subprocess.run(["your-secret-manager", "get", "telegram_bot_token"],
    #                          capture_output=True, text=True).stdout.strip()
    #   chat  = "<your-telegram-chat-id>"
    #   import urllib.request, urllib.parse
    #   data = urllib.parse.urlencode({"chat_id": chat, "text": head + "\n" + body}).encode()
    #   urllib.request.urlopen(
    #       f"https://api.telegram.org/bot{token}/sendMessage", data=data, timeout=30)
    #
    # Or send email via the `mail`/`sendmail` CLI, an SMTP library, etc. Keep secrets OUT of
    # this file and out of version control.
    # -----------------------------------------------------------------------------------------

    return body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    log(f"curator start (dry={args.dry_run})")
    snap = snapshot() if not args.dry_run else "(dry-run, no snapshot)"
    out = run_claude(build_prompt(args.dry_run), args.dry_run)
    summary = parse_summary(out)
    if not args.dry_run:
        resync_links()
    invalid = validate()
    body = send_digest(summary, args.dry_run, invalid, snap)
    if not args.dry_run:
        STATE.write_text(json.dumps({"last_run": datetime.now(timezone.utc).isoformat(),
                                     "summary": summary, "snapshot": str(snap)}, indent=2))
    log("curator done:\n" + body)


if __name__ == "__main__":
    main()
