#!/usr/bin/env python3
"""notify.py - ONE place every robot on this Mac tells the owner something, so they are not buried in messages.

Every message gets a level from rules.json (first matching regex on the subject wins, else "default"):
  urgent  -> Telegram message from your own bot, right now
  daily   -> held for ONE evening summary (notify.py digest); no summary on days with nothing in it
  quiet   -> logged only (state/log.jsonl), nobody is told
Telegram not linked yet or down -> a desktop notification on the Mac plus the log (never lost).
A summary that could not be delivered stays queued for the next evening.

Setup (once, about 2 minutes):
  1. In Telegram, message @BotFather, send /newbot, and copy the token it gives you.
  2. notify.py link          paste the token when asked (it is saved to ~/.authframework/secrets/, mode 600),
                             then send any message to your new bot and press Return.
  3. notify.py test

Usage: notify.py send --subject S --body B|- [--level urgent|daily|quiet] [--source NAME]
       notify.py digest [--dry]          send the evening summary if anything is queued
       notify.py link | test | status
"""
import os, sys, re, json, time, fcntl, argparse, getpass, subprocess, urllib.request, urllib.parse, datetime as D

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "state"); os.makedirs(STATE, exist_ok=True)
RULES = os.path.join(HERE, "rules.json")
QUEUE = os.path.join(STATE, "daily.jsonl")
LOG = os.path.join(STATE, "log.jsonl")
TG_ENV = os.path.expanduser("~/.authframework/secrets/telegram-bot.env")
HOST = subprocess.run(["scutil", "--get", "ComputerName"], capture_output=True, text=True).stdout.strip() or "the Mac"


def now():
    return D.datetime.now().astimezone().isoformat(timespec="seconds")


def _append(path, rec):
    with open(path, "a") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX); fh.write(json.dumps(rec) + "\n")


def level_for(subject):
    try:
        rules = json.load(open(RULES))
    except Exception:
        return "urgent"                      # broken rules file -> never swallow anything
    for r in rules["rules"]:
        if re.search(r["match"], subject, re.I):
            return r["level"]
    return rules.get("default", "daily")


def _env():
    d = {}
    try:
        for line in open(TG_ENV):
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1); d[k.strip()] = v.strip().strip('"')
    except OSError:
        pass
    return d


def _save_env(d):
    os.makedirs(os.path.dirname(TG_ENV), mode=0o700, exist_ok=True)
    tmp = TG_ENV + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        fh.write("".join(f"{k}={v}\n" for k, v in d.items()))
    os.replace(tmp, TG_ENV)


def _api(tok, method, **params):
    data = urllib.parse.urlencode(params).encode() if params else None
    with urllib.request.urlopen(f"https://api.telegram.org/bot{tok}/{method}", data=data, timeout=20) as r:
        return json.loads(r.read())


def telegram(text):
    e = _env(); tok, cid = e.get("TG_BOT_TOKEN"), e.get("TG_CHAT_ID")
    if not (tok and cid):
        return False
    try:
        return _api(tok, "sendMessage", chat_id=cid, text=text[:4000], disable_web_page_preview="true").get("ok", False)
    except Exception:
        return False


def desktop(subject, body):
    """Fallback while Telegram is not linked: a notification on the Mac's own screen."""
    esc = lambda s: s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
    subprocess.run(["osascript", "-e", f'display notification "{esc(body[:200])}" with title "{esc(subject[:80])}"'],
                   capture_output=True, timeout=20)
    return True


def send(subject, body, level=None, source=""):
    level = level or level_for(subject)
    via = level
    if level == "urgent":
        if telegram(f"🔔 {subject}\n\n{body.strip()}"[:4000]):
            via = "telegram"
        else:
            desktop(subject, body); via = "desktop only (telegram not linked/failed)"
    elif level == "daily":
        _append(QUEUE, {"at": now(), "subject": subject, "body": body[:1500], "source": source})
    _append(LOG, {"at": now(), "level": level, "via": via, "subject": subject, "source": source})
    return True


def digest(dry=False):
    work = QUEUE + ".sending"                # left over from a failed send -> goes out with today's
    files = [f for f in (work, QUEUE) if os.path.exists(f) and os.path.getsize(f)]
    if not files:
        return True                          # nothing worth telling anyone -> no message at all
    items = [json.loads(l) for f in files for l in open(f) if l.strip()]
    if not dry and not (_env().get("TG_BOT_TOKEN") and _env().get("TG_CHAT_ID")):
        print("Telegram not linked yet (notify.py link): summary kept in the queue"); return True
    if not dry and os.path.exists(QUEUE):
        grab = QUEUE + ".grab"; os.replace(QUEUE, grab)     # new messages start a fresh queue from here
        time.sleep(1)                        # let a writer that opened the old file finish its line
        with open(work, "a") as w:           # append: keep leftovers from a failed send
            w.write(open(grab).read())
        os.remove(grab)
        items = [json.loads(l) for l in open(work) if l.strip()]
    groups = {}
    for it in items:                         # same kind of message -> one line (latest wins)
        groups.setdefault(re.sub(r"\d+", "#", it["subject"]), []).append(it)
    lines = []
    for g in groups.values():
        last = g[-1]; n = f" (x{len(g)})" if len(g) > 1 else ""
        first_line = next((l.strip() for l in last["body"].splitlines() if l.strip()), "")
        lines.append(f"• {last['subject']}{n}" + (f"\n   {first_line[:180]}" if first_line and first_line not in last["subject"] else ""))
    text = f"Today on {HOST} ({len(items)} thing{'s' if len(items) != 1 else ''}, nothing urgent):\n\n" + "\n".join(lines)
    if dry:
        print(text); return True
    if not telegram(text):
        return False                         # stays in .sending for tomorrow
    os.remove(work)
    _append(LOG, {"at": now(), "level": "digest", "via": "sent", "subject": f"{len(items)} items"})
    return True


def link():
    e = _env()
    if not e.get("TG_BOT_TOKEN"):
        tok = getpass.getpass("Paste the bot token from @BotFather (hidden as you type): ").strip()
        if not re.fullmatch(r"\d+:[\w-]{30,}", tok):
            print("That does not look like a bot token."); return 1
        e["TG_BOT_TOKEN"] = tok; _save_env(e)
    try:
        name = _api(e["TG_BOT_TOKEN"], "getMe")["result"]["username"]
    except Exception as ex:
        print(f"Telegram rejected the token ({ex}). Delete {TG_ENV} and run link again."); return 1
    input(f"Now open Telegram, send any message to @{name}, then press Return here. ")
    ups = _api(e["TG_BOT_TOKEN"], "getUpdates").get("result", [])
    chats = [u["message"]["chat"] for u in ups if u.get("message", {}).get("chat", {}).get("type") == "private"]
    if not chats:
        print("No message seen yet. Send the bot a message and run link again."); return 1
    e["TG_CHAT_ID"] = str(chats[-1]["id"]); _save_env(e)
    print(f"Linked to {chats[-1].get('first_name', 'you')}. Run: notify.py test"); return 0


def main():
    p = argparse.ArgumentParser(); sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("send"); s.add_argument("--subject", required=True); s.add_argument("--body", required=True)
    s.add_argument("--level", choices=["urgent", "daily", "quiet"]); s.add_argument("--source", default="")
    d = sub.add_parser("digest"); d.add_argument("--dry", action="store_true")
    sub.add_parser("link"); sub.add_parser("test"); sub.add_parser("status")
    a = p.parse_args()
    if a.cmd == "send":
        body = sys.stdin.read() if a.body == "-" else a.body
        return 0 if send(a.subject, body, a.level, a.source) else 1
    if a.cmd == "digest":
        return 0 if digest(a.dry) else 1
    if a.cmd == "link":
        return link()
    linked = bool(_env().get("TG_BOT_TOKEN") and _env().get("TG_CHAT_ID"))
    if a.cmd == "test":
        if not linked:
            print("Telegram NOT linked yet. Run: notify.py link"); return 1
        ok = telegram(f"✅ Alerts from {HOST} now come here. Urgent things straight away; everything else in one "
                      "evening summary, only on days there is something.")
        print("sent" if ok else "Telegram send failed"); return 0 if ok else 1
    if a.cmd == "status":
        q = sum(1 for _ in open(QUEUE)) if os.path.exists(QUEUE) else 0
        print(json.dumps({"telegram_linked": linked, "queued_for_summary": q})); return 0


if __name__ == "__main__":
    sys.exit(main())
