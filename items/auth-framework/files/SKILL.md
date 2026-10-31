---
name: auth-framework
description: "Universal proactive auth keepalive + headless credential access for every authenticated flow on the box. Use when adding/auditing ANY automation that logs in, holds a token/session/cookie, or can expire — so it self-heals BEFORE it breaks instead of failing silently. Provides authlib.sh (a generic headless credential accessor: cred_get / cred_ensure_session, reading from env vars or the macOS Keychain, with a hook to wire your own secret store) and auth-keepalive.sh (a engine that detects <48h-to-expiry across all flows and refreshes-or-alerts every 6h via launchd). STANDARD: any new auth flow registers a target here. TRIGGERS: 'token expired', 'session expired', 'auth keepalive', 'refresh token', 'oauth', 'cookie expiry', 'login automation', 'credential access', 'headless credential', 'proactive re-auth', 'stop it failing silently'."
version: 1.0.0
metadata:
  tags: [Auth, Credentials, Security, Infra, Self-Healing]
---

# auth-framework — proactive auth keepalive

Standing rule: **every authenticated flow should detect expiry BEFORE it breaks and self-heal or
alert — a human never discovers a dead token by hand.** A single dead session can silently break
every cron that depends on it and get misdiagnosed as a different failure. This framework models the
fix on a simple ladder: probe → refresh → alert.

## Components
- **`scripts/authlib.sh`** — generic headless credential accessor. Source it, then:
  - `cred_get <name> [field]` — print a secret value. Resolution order: (1) env var
    `AUTHFRAMEWORK_<NAME>[_<FIELD>]`, (2) macOS Keychain
    (`security find-generic-password -s <name> [-a <field>] -w`, no GUI prompt), (3) a 0600 file
    under `~/.authframework/secrets/`.
  - `cred_ensure_session` — optional hook to (re)establish your secret store's session; a no-op by
    default (Keychain/env need none).
  - **Wire your own store:** if you use a vault CLI (1Password `op`, Bitwarden `bw`, `pass`, Vault,
    cloud secret managers), implement it at the two marked `WIRE YOUR OWN STORE HERE` spots in
    `authlib.sh`. Everything downstream (timeouts, the keepalive engine) is unchanged.
  - **Keychain tip:** add items non-interactively with
    `security add-generic-password -s <name> -a <field> -w '<secret>' -U -A` so launchd/headless
    reads don't trigger a GUI auth prompt. Never write an item whose ACL forces a prompt — it hangs
    headless and blocks all reads.
- **`scripts/auth-keepalive.sh [--dry-run]`** — the engine. Walks a registry of targets; per target
  computes time-to-expiry, probes health, and refreshes-or-alerts (cap: 1 alert/key/24h). Runs every
  ~6h via `com.jesse.auth-keepalive`. `--dry-run` prints the table without acting.

## Notifications
Alerts go to a **macOS notification** (`osascript display notification`) plus a log line at
`~/.claude/logs/auth-framework.log`. There's a commented placeholder in `af_alert` to wire
a push channel (Slack/Telegram/email/ntfy) if you want phone alerts. Every alert is also written to
`~/.authframework/alert-queue/` so nothing is lost if a push channel is down.

## Current example targets (auth-keepalive.sh)
These ship as working examples — adapt the probes to where your tokens actually live.

| Target | How handled |
|---|---|
| claude-code | bounded metadata-only `scripts/claude_auth_health.py` check; alerts within 48h of refresh expiry, separately when expired/missing, and on unreadable credentials. No model calls. Expired refresh tokens require `claude auth login --claudeai` |
| codex | reads `~/.codex/auth.json`; report-only if a `refresh_token` is present (auto-refreshes); alerts only if expiring <48h with no refresh token |
| omnara | probes that the `com.omnara.cli` daemon is alive (the thing that matters); alerts if down |
| gmail | reads `~/.authframework/secrets/gmail.token` via `gmail.sh token-status`; alerts if absent or missing a `refresh_token`, then does a real `whoami` probe (a revoked token still looks fine on disk). Catches the Testing-mode 7-day refresh-token revocation |
| youtube | once connected, runs `youtube-upload/scripts/youtube.sh health --all --live` with a 90-second bound; refreshes each connected profile, checks its saved channel, and alerts on any failure. Never uploads; skips initial setup until a connection is complete |
| template (`t_template`) | disabled by default — copy it to register a new target (set `ENABLE_TEMPLATE=1` to see it run) |

## Relationship to auth-watchdog.sh
This **complements** the existing `~/JesseOS/workspace/security/auth-watchdog.sh` (which does live
health probes of Claude/Codex/Omnara) — it does not replace it. Division of labour: let
auth-keepalive own the **forward-looking <48h expiry window + refresh-or-alert**, and let the
watchdog own **"is it up right now"**. To avoid double-alerting on the same target, keep one source
of truth per concern (e.g. if the watchdog already shouts when Omnara is down, you can downgrade the
omnara target here to report-only).

## Add a new auth target (the standard)
Copy `t_template()` in `auth-keepalive.sh` to a `t_<name>()` that prints one
`row <name> <STATE> <hrs> <detail>` and, unless `$DRY=1`, refreshes (if possible) or calls
`af_alert <cap-key> "<subject>" "<body>"`. Then add `t_<name>` to the RUN block. Reuse the helpers
`iso_hours_left`, `mtime_plus_days_hours_left`, and `cred_get`. Keep alerts evidence-based — prefer a
real probe (read the actual cookie/token expiry, or ping the daemon) over fragile heuristics.

## Install
```sh
# scripts live in the skill dir; the LaunchAgent points at them
mkdir -p ~/.claude/logs ~/.authframework
cp com.jesse.auth-keepalive.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.jesse.auth-keepalive.plist
```
The plist sets a full PATH (`/usr/local/bin:~/.omnara/bin:/usr/bin:/bin:/usr/sbin:/sbin`)
so launchd-run probes find their binaries.

## Verify
`bash scripts/auth-keepalive.sh --dry-run` (table only) · `bash scripts/auth-keepalive.sh` (live).
Health log: `~/.claude/logs/auth-framework.log`; launchd output:
`~/.claude/logs/auth-keepalive.cron.log`.

## Claude Remote Control expiry recovery

An RC parent can still display `Connected` after child sessions lose authentication. Do not use
process presence, a remaining Keychain item, or an old screen status as proof of working auth.
`python3 scripts/claude_auth_health.py` emits only safe metadata; exit 0 means locally refreshable,
1 means renewal needed, 2 means unknown. It does not prove upstream validity or model capacity.
The 10-second Keychain timeout and in-process parsing keep raw tokens out of command arguments.

When refresh expiry has passed, start `claude auth login --claudeai`, complete the official browser
sign-in, then check `claude auth status`. Verify a new remote request before claiming full recovery.
Existing Remote Control monitoring should call the same probe before refreshing a healthy heartbeat
and send near-expiry/expired warnings through its existing phone notifier. Do not restart sessions
merely to mask expired credentials. Never publish login links, auth codes, or credential snapshots.
