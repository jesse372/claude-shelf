#!/usr/bin/env python3
"""guardian.py - health checks + Tier-1 repair for every unattended job in registry.json.

  guardian.py probe <label> <run_id>   check; on the first RED in a guardian run do the Tier-1 repair and re-check;
                                        on a later call in the same run (= after a Claude fix) re-run the job, then check
  guardian.py check <label>             check only (no side effects except remembering launchd 'runs')
  guardian.py context <label>           log tail + launchd status (fed to the Tier-2 Claude repair)
  guardian.py list                      one line per job
Prints one status line; exit 0 = healthy.
"""
import json, os, re, shutil, subprocess, sys, time

HOME = os.path.expanduser("~")
DIR = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(DIR, "state"); os.makedirs(STATE, exist_ok=True)
UID = os.getuid()
RERUN_GAP_H = 6   # Tier-1 re-runs of a scheduled (non-daemon) job: at most one per this many hours
ERR_RX = re.compile(r"Traceback \(most recent call last\)|\bFATAL\b|^fatal: |PUSH FAILED|COMMIT FAILED|UNREADABLE|"
                    r"Operation not permitted|command not found|JSONDecodeError|Killed: 9|Alarm clock|"
                    r"Segmentation fault|RENDER FAILED|\bERROR\b", re.M)


def x(p): return os.path.expanduser(p) if p else p


def sj(j):
    """state_json may be one path or a list; a bare string must not be iterated letter by letter."""
    v = j.get("state_json") or []
    return [v] if isinstance(v, str) else v


def registry():
    return {j["label"]: j for j in json.load(open(os.path.join(DIR, "registry.json")))["jobs"]}


def st_load(label):
    p = os.path.join(STATE, label + ".json")
    try: return json.load(open(p))
    except Exception: return {}


def st_save(label, d):
    p = os.path.join(STATE, label + ".json"); t = p + ".tmp"
    json.dump(d, open(t, "w"), indent=1); os.replace(t, p)


def lc(label):
    """launchd facts: loaded, state, pid, runs, last exit code."""
    r = subprocess.run(["launchctl", "print", f"gui/{UID}/{label}"], capture_output=True, text=True)
    if r.returncode != 0: return {"loaded": False}
    out = r.stdout; f = {"loaded": True}
    for k, rx in (("state", r"^\tstate = (.+)$"), ("pid", r"^\tpid = (\d+)$"), ("runs", r"^\truns = (\d+)$"),
                  ("exit", r"^\tlast exit code = (.+)$")):
        m = re.search(rx, out, re.M); f[k] = m.group(1).strip() if m else None
    return f


def plist(label):
    return os.path.join(HOME, "Library/LaunchAgents", label + ".plist")


def new_log_errors(j, s, advance):
    """Crash lines written to the job's log since we last looked."""
    p = x(j.get("log"))
    if not p or not os.path.exists(p): return []
    size = os.path.getsize(p); off = s.get("log_off")
    if off is None or off > size: off = size if off is None else 0   # first sight: don't alarm on history; truncated: rescan
    with open(p, "rb") as fh:
        fh.seek(off); chunk = fh.read(min(size - off, 2_000_000)).decode("utf-8", "replace")
    errs = [l.strip()[:220] for l in chunk.splitlines() if ERR_RX.search(l)]
    if advance or not errs: s["log_off"] = size
    return errs


def bad_json(j):
    bad = []
    for p in map(x, sj(j)):
        if not os.path.exists(p): continue
        try: json.load(open(p))
        except Exception: bad.append(p)
    return bad


def snapshot(j):
    d = os.path.join(STATE, "lastgood", j["label"]); os.makedirs(d, exist_ok=True)
    for p in map(x, sj(j)):
        if os.path.exists(p): shutil.copy2(p, os.path.join(d, os.path.basename(p)))


def check(j, advance=False):
    label = j["label"]; s = st_load(label); f = lc(label); now = time.time(); problems = []
    if not f["loaded"]:
        problems.append("not loaded in launchd")
    else:
        if j["kind"] == "daemon" and not f.get("pid"):
            problems.append(f"daemon not running (state {f.get('state')}, last exit {f.get('exit')})")
        ex = f.get("exit") or "0"
        if j["kind"] != "daemon" and re.match(r"^-?\d+$", ex) and int(ex) != 0 and int(ex) not in j.get("allow_exit", []):
            problems.append(f"last run exited {ex}")
        runs = int(f.get("runs") or 0)
        if runs != s.get("runs") or "runs_at" not in s:
            s["runs"], s["runs_at"] = runs, now   # moved (or reset by a reboot) => fresh baseline
        gap = j.get("max_gap_h")
        if gap and j["kind"] in ("interval", "calendar") and f.get("state") != "running" and now - s["runs_at"] > gap * 3600:
            problems.append(f"hasn't run for {(now - s['runs_at']) / 3600:.1f}h (expected every <= {gap}h)")
    bj = bad_json(j)
    if bj: problems.append("corrupt state file(s): " + ", ".join(os.path.basename(b) for b in bj))
    errs = new_log_errors(j, s, advance)
    if errs: problems.append(f"{len(errs)} new error line(s) in log, e.g. {errs[-1]}")
    if j.get("probe"):
        r = subprocess.run(["/bin/bash", "-c", j["probe"]], capture_output=True, text=True, timeout=120)
        if r.returncode != 0:
            why = (r.stdout.strip().splitlines() or r.stderr.strip().splitlines() or [""])[-1][:240]
            problems.append("health probe failed: " + (why or j["probe"][:80]))
    if not problems:
        snapshot(j); s["green_at"] = now
    st_save(label, s)
    return problems


def rerun(j, force=False):
    """Run the job once now and wait for it (interval/calendar) - or restart it (daemon)."""
    label = j["label"]
    if j.get("rerun") is False: return "rerun disabled for this job"
    if not lc(label)["loaded"]:
        subprocess.run(["launchctl", "bootstrap", f"gui/{UID}", plist(label)], capture_output=True)
    before = int(lc(label).get("runs") or 0)
    if j["kind"] == "daemon":
        subprocess.run(["launchctl", "kickstart", "-k", f"gui/{UID}/{label}"], capture_output=True); time.sleep(8); return "restarted"
    # A scheduled job that keeps failing for a reason only a human can fix (e.g. a macOS privacy block) must not
    # be re-run on every 10-min guardian pass: on 2026-11-05 that re-ran the nightly backup all night, each run
    # writing the same errors to its log and paging the owner again. One re-run per 6h per job is enough.
    m = os.path.join(STATE, "rerun-" + label)
    try: last = float(open(m).read().strip() or 0)
    except (OSError, ValueError): last = 0
    if not force and time.time() - last < RERUN_GAP_H * 3600:   # force = the one verify run after a Claude fix
        return f"re-run skipped, last re-run {int((time.time() - last) / 60)} min ago (max one per {RERUN_GAP_H}h)"
    with open(m + ".tmp", "w") as fh: fh.write(str(int(time.time())))
    os.replace(m + ".tmp", m)
    subprocess.run(["launchctl", "kickstart", f"gui/{UID}/{label}"], capture_output=True)
    t0 = time.time()
    while time.time() - t0 < 300:
        time.sleep(4); f = lc(label)
        if int(f.get("runs") or 0) > before and f.get("state") != "running": return "re-ran"
    return "re-run still going after 5 min"


def tier1(j):
    """Mechanical repair: load the agent, restore corrupted state from last-good, then re-run the job."""
    label = j["label"]; did = []
    if not lc(label)["loaded"] and os.path.exists(plist(label)):
        subprocess.run(["launchctl", "bootstrap", f"gui/{UID}", plist(label)], capture_output=True); did.append("loaded agent")
    for p in bad_json(j):
        g = os.path.join(STATE, "lastgood", label, os.path.basename(p))
        if os.path.exists(g):
            shutil.copy2(p, p + f".corrupt-{int(time.time())}"); shutil.copy2(g, p); did.append(f"restored {os.path.basename(p)} from last good copy")
        else:
            did.append(f"{os.path.basename(p)} corrupt and no last-good copy")
    s = st_load(label); new_log_errors(j, s, advance=True); st_save(label, s)   # judge only the fresh run's output
    did.append(rerun(j))
    return did


def main():
    a = sys.argv[1:]; R = registry()
    if not a or a[0] == "list":
        for l, j in R.items(): print(l, "|", j["kind"], "|", j["what"][:90])
        return 0
    cmd, label = a[0], a[1]; j = R[label]
    if cmd == "check":
        p = check(j); print("; ".join(p) or "ok"); return 1 if p else 0
    if cmd == "context":
        f = lc(label); print(f"launchd: {f}"); lp = x(j.get("log"))
        if lp and os.path.exists(lp):
            print(f"--- last 80 lines of {lp}"); print("".join(open(lp, errors="replace").readlines()[-80:]))
        return 0
    if cmd == "probe":
        run_id = a[2] if len(a) > 2 else "manual"; s = st_load(label)
        later = s.get("probe_run") == run_id; s["probe_run"] = run_id; st_save(label, s)
        if later:                                   # after a Claude fix: prove it with a fresh run
            note = rerun(j, force=True); p = check(j, advance=True)
            print(("; ".join(p) + f" [after fix, {note}]") if p else f"ok after fix ({note})"); return 1 if p else 0
        p = check(j)
        if not p: print("ok"); return 0
        did = tier1(j); p2 = check(j, advance=True)
        if not p2:
            print(f"self-repaired: {'; '.join(p)} -> {', '.join(did)}")
            open(os.path.join(STATE, "repaired.log"), "a").write(f"{time.strftime('%F %T')} {label}: {'; '.join(p)} -> {', '.join(did)}\n")
            return 0
        print("; ".join(p2) + f" (tier1 tried: {', '.join(did)})"); return 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
