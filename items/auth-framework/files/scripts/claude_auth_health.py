#!/usr/bin/env python3
"""Read Claude auth metadata without exposing secrets or spending model tokens.

This checks local readiness and expiry, not upstream revocation or model capacity.
The Keychain payload stays in this process, never command arguments or output.
"""
import argparse
import json
import math
import subprocess
import time


def result(state, detail, hours=None, ready=False):
    return {"state": state, "hours_left": hours, "credential_ready": ready,
            "detail": detail}


def epoch(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("invalid expiry")
    if not math.isfinite(value) or value <= 0:
        raise ValueError("invalid expiry")
    return value / 1000 if value > 1e12 else value


def classify(payload, now):
    try:
        oauth = json.loads(payload).get("claudeAiOauth")
        if not isinstance(oauth, dict):
            raise ValueError("missing oauth object")
        expiry = oauth.get("refreshTokenExpiresAt")
        if expiry is not None:
            seconds = epoch(expiry) - now
            hours = math.floor(seconds / 3600)
            if seconds <= 0:
                return result("EXPIRED", "refresh token expired; run claude auth login --claudeai", hours)
        else:
            seconds, hours = None, None
        if not oauth.get("accessToken") and not oauth.get("refreshToken"):
            return result("MISSING", "Claude is signed out; run claude auth login --claudeai")
        if not oauth.get("refreshToken"):
            return result("NO_REFRESH", "no refresh token; run claude auth login --claudeai")
        if seconds is None:
            return result("UNKNOWN", "refresh expiry unavailable; inspect Claude authentication")
        if seconds < 48 * 3600:
            return result("EXPIRING", "refresh token expires within 48h; renew Claude login", hours, True)
        return result("OK", "refresh token present and not expired (local check only)", hours, True)
    except (ValueError, TypeError, AttributeError, OverflowError):
        return result("UNKNOWN", "Claude credential format unreadable")


def probe():
    try:
        completed = subprocess.run(
            ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
            capture_output=True, text=True, timeout=10,
        )
    except subprocess.TimeoutExpired:
        return result("UNKNOWN", "Keychain read timed out")
    except OSError:
        return result("UNKNOWN", "Keychain reader unavailable")
    if completed.returncode != 0:
        # A locked/denied Keychain is not proof that credentials were deleted.
        return result("UNKNOWN", "Claude credential missing or Keychain access denied")
    return classify(completed.stdout, time.time())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tsv", action="store_true", help="Print state|hours|detail (no secrets)")
    args = parser.parse_args()
    info = probe()
    if args.tsv:
        hours = info["hours_left"] if info["hours_left"] is not None else "n/a"
        print(f'{info["state"]}|{hours}|{info["detail"]}')
    else:
        print(json.dumps(info))
    return 0 if info["credential_ready"] else (2 if info["state"] == "UNKNOWN" else 1)


if __name__ == "__main__":
    raise SystemExit(main())
