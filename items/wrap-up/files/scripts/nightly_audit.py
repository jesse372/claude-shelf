#!/usr/bin/env python3
"""nightly_audit.py — automated arm of the wrap-up skill. Runs nightly, SILENT unless there
are findings. On a finding it (a) fires a desktop notification and (b) appends a row to the
wrap-up log. Deduplicates via local state so a standing finding only notifies ONCE, and
AUTO-RESOLVES (logs a "cleared" line) when a finding goes away (e.g. a transient job failure
recovers).

  nightly_audit.py            # real run (notifies on NEW findings, logs every change)
  nightly_audit.py --dry-run  # print findings only, touch nothing

Notification is generic: macOS `osascript display notification` + a log line at
~/.claude/logs/wrap-up.log. To route findings to your own channel (Slack webhook,
email, ntfy, a pager, etc.), fill in notify_channel() below.
"""
import subprocess, json, os, sys, time, datetime

STATE = os.path.expanduser("~/.wrap-up-audit-state.json")
LOG = os.path.expanduser("~/.claude/logs/wrap-up.log")

def _load():
    try: return json.load(open(STATE))
    except Exception: return {}
def _save(s): json.dump(s, open(STATE, "w"), indent=1)

def _log(line):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a") as fh:
        fh.write(f"{datetime.datetime.now().isoformat(timespec='seconds')}  {line}\n")

def notify(title, msg):
    """Generic owner-notify: desktop notification + log line.
    Append your own channel below if you want push/remote alerts."""
    _log(f"[{title}] {msg}")
    try:
        subprocess.run(["osascript", "-e",
                        f'display notification {json.dumps(msg)} with title {json.dumps(title)}'],
                       capture_output=True)
    except Exception:
        pass
    notify_channel(title, msg)

def notify_channel(title, msg):
    """PLACEHOLDER — wire up your own notification channel here if desired.
    Examples (uncomment + adapt):
      # import urllib.request
      # urllib.request.urlopen("https://ntfy.sh/<your-topic>", data=msg.encode())          # ntfy
      # urllib.request.urlopen(urllib.request.Request("<slack-webhook-url>",
      #     data=json.dumps({"text": f"{title}: {msg}"}).encode(),
      #     headers={"Content-Type": "application/json"}))                                   # Slack
    """
    return

# ---------- checks (each returns list of {key,title,severity,summary}) ----------

def chk_launchagents():
    out = []
    listing = subprocess.run(["launchctl", "list"], capture_output=True, text=True).stdout
    for line in listing.splitlines()[1:]:
        p = line.split("\t")
        if len(p) >= 3 and p[2].startswith("com.jesse."):
            try: ex = int(p[1])
            except ValueError: ex = None
            if ex is not None and ex > 0:   # positive exit = error (negative = signal, usually normal)
                out.append(dict(key=f"agent-fail:{p[2]}", severity="High",
                                title=f"Scheduled job failing: {p[2]} (last exit {ex})",
                                summary=f"LaunchAgent {p[2]} last exited non-zero ({ex}). Check its StandardErrorPath log. Auto-resolves when it next succeeds."))
    return out

def chk_secret_manager():
    """Generic placeholder health check. If you use a CLI secret manager, replace the body
    with a real probe (e.g. run its `list`/`status` command and flag a non-zero return).
    See ~/JesseOS/workspace/security/README.md."""
    return []

CHECKS = [chk_launchagents, chk_secret_manager]

def main():
    dry = "--dry-run" in sys.argv
    findings = []
    for c in CHECKS:
        try: findings += c()
        except Exception as e: print(f"check {c.__name__} errored: {e}", file=sys.stderr)

    if dry:
        print(f"DRY RUN — {len(findings)} finding(s):")
        for f in findings:
            print(f"  [{f['severity']}] {f['title']}")
        return

    state = _load()
    current = {f["key"] for f in findings}
    notified = resolved = 0
    for f in findings:
        if state.get(f["key"]):
            continue  # already seen + notified, still open
        notify(f"wrap-up: {f['severity']}", f"{f['title']} — {f['summary']}")
        state[f["key"]] = {"first_seen": time.strftime("%F")}
        notified += 1
    for key in list(state):
        if key not in current:
            _log(f"[cleared] finding resolved: {key}")
            resolved += 1
            del state[key]
    _save(state)
    _log(f"nightly audit — {len(findings)} open, {notified} new, {resolved} cleared")
    print(f"audit: {len(findings)} findings, {notified} notified, {resolved} resolved")

if __name__ == "__main__":
    main()
