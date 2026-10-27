---
name: mac-headless-setup
description: "Complete setup and hardening protocol for headless Mac worker boxes (Mac mini) running Omnara/Claude remotely. Covers Node/Claude installation, daemon PATH injection, TCC permission audit and grant workflow, remote access verification, and auto-update monitoring. Use when provisioning a new headless Mac, debugging remote-access failures, or auditing TCC permissions for Omnara/Claude. TRIGGERS: 'headless mac', 'mac mini setup', 'tcc permissions', 'omnara daemon', 'remote mac', 'permission denied', 'screen recording', 'accessibility', 'full disk access', 'headless worker', 'provision mac', 'remote access broken'."
version: 1.0.0
pinned: false
metadata:
  tags: [macOS, Infrastructure, Security, Remote]
---

# mac-headless-setup — headless Mac worker protocol

Complete setup for a **headless Mac mini running Omnara/Claude remotely**. Covers the full stack: Node/CLI install, daemon PATH config, TCC permission audit, and auto-update monitoring. This is the checklist for turning a spare Mac into a reliable worker box.

## When to use
- Provisioning a new headless Mac mini for remote Claude/Omnara work
- Debugging "permission denied" / Screen Recording / Accessibility failures on a remote Mac
- Auditing or fixing TCC permissions for the Omnara daemon or Claude Desktop bundle
- Setting up auto-update monitoring for Claude Desktop, Claude Code, Omnara Desktop, Omnara CLI

NOT for: local/interactive Mac setup (this is remote-first); Windows/Linux boxes.

## Prerequisites
- macOS machine (tested on 26.x), remote or local
- A remote mesh/VPN (e.g. Tailscale) + SSH enabled (System Settings → General → Sharing → Remote Login)
- Screen Sharing enabled for the TCC grant workflow (can't grant via SSH due to SIP)
- A screen-share client (iPhone or Mac) for the TCC grant step
- A secret manager for storing the daemon OAuth token — see `~/JesseOS/workspace/security/README.md`

## Discover your own identifiers first

This protocol references a few machine-specific identifiers. Find yours before running anything; do NOT assume the values below.

```bash
# Your username and home
echo "$USER" "$HOME"

# The Omnara daemon LaunchAgent on THIS machine (label varies by install):
ls ~/Library/LaunchAgents/ | grep -i omnara
launchctl list | grep -i omnara

# The Omnara app bundle ID (the TCC client identity) — locate the installed app, then read its bundle id:
#   find the app (commonly under ~ or /Applications), then:
#   defaults read "/path/to/Omnara.app/Contents/Info" CFBundleIdentifier
```

Throughout this doc:
- `OMNARA_LABEL` = the LaunchAgent label you found (e.g. the `com.omnara.*` label for your install).
- `OMNARA_BUNDLE_ID` = the bundle ID of the installed Omnara app (the TCC client identity).
- `OMNARA_PLIST` = `~/Library/LaunchAgents/<OMNARA_LABEL>.plist`.

## Quick reference

```bash
# Phase 1: Install Node (user-space, no sudo)
cd ~ && curl -LO https://nodejs.org/dist/v24.16.0/node-v24.16.0-darwin-arm64.tar.gz
tar -xzf node-v24.16.0-darwin-arm64.tar.gz
mv node-v24.16.0-darwin-arm64 node-current
rm node-v24.16.0-darwin-arm64.tar.gz

# Phase 2: Install Claude Code CLI
~/node-current/bin/npm install -g @anthropic-ai/claude-code

# Phase 3: Inject Node into Omnara daemon PATH
# Read current daemon plist, prepend ~/node-current/bin to PATH env, write back
launchctl unload "$OMNARA_PLIST"
# (edit plist to add ProgramArguments PATH prepend or EnvironmentVariables)
launchctl load "$OMNARA_PLIST"

# Phase 4: TCC audit (check which permissions are missing)
~/.claude/skills/mac-headless-setup/scripts/tcc-audit.sh "$OMNARA_BUNDLE_ID"
# Outputs: ALLOWED / DENIED / NOT_FOUND for Full Disk Access, Screen Recording, Accessibility

# Phase 5: Grant missing TCC permissions (MUST be done via screen-share GUI)
# Connect via your screen-share client → System Settings → Privacy & Security →
# Full Disk Access / Screen Recording / Accessibility → grant to the Omnara app

# Phase 6: Install auto-update monitor (Claude Desktop/Code, Omnara Desktop/CLI)
# (if ~/.app-autoupdate/update.sh exists, LaunchAgent checks all four every 6h)
ls ~/.app-autoupdate/update.sh && cat ~/.app-autoupdate/status.json
```

| Action | Command |
|--------|---------|
| Audit TCC for Omnara | `~/.claude/skills/mac-headless-setup/scripts/tcc-audit.sh "$OMNARA_BUNDLE_ID"` |
| Audit TCC for Claude Desktop | `~/.claude/skills/mac-headless-setup/scripts/tcc-audit.sh com.anthropic.claudefordesktop` |
| Check Omnara daemon is running | `launchctl list | grep -i omnara` |
| Force immediate auto-update check | `launchctl kickstart gui/$(id -u)/com.jesse.appupdate` |
| View current versions | `cat ~/.app-autoupdate/status.json` |

## Procedure

### 1. Provision Node + Claude Code (user-space, headless-safe)
SSH into the box. Install Node as a user tarball (never via Homebrew — daemon PATH issues):
```bash
cd ~
curl -LO https://nodejs.org/dist/v24.16.0/node-v24.16.0-darwin-arm64.tar.gz
tar -xzf node-v24.16.0-darwin-arm64.tar.gz
mv node-v24.16.0-darwin-arm64 node-current
rm node-v24.16.0-darwin-arm64.tar.gz
~/node-current/bin/node --version  # verify
```
Then Claude Code CLI:
```bash
~/node-current/bin/npm install -g @anthropic-ai/claude-code
~/node-current/bin/claude --version  # verify
```

### 2. Inject Node PATH into Omnara daemon
The daemon plist (`$OMNARA_PLIST`) has a `ProgramArguments` array and optionally `EnvironmentVariables`. Prepend `~/node-current/bin` so the daemon can find `claude` and `node`:

```bash
launchctl unload "$OMNARA_PLIST"
# Edit the plist to add (replace USERNAME with your own, i.e. $USER):
#   <key>EnvironmentVariables</key>
#   <dict>
#     <key>PATH</key>
#     <string>/Users/USERNAME/node-current/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
#   </dict>
launchctl load "$OMNARA_PLIST"
launchctl kickstart -k "gui/$(id -u)/$OMNARA_LABEL"
```

Verify daemon picked it up:
```bash
launchctl list | grep -i omnara  # should show running PID
```

### 3. Set up headless Claude auth (OAuth token in daemon plist or keychain)
The Omnara daemon stores the OAuth token either in the plist's `StartupArguments`/`ProgramArguments` or in the macOS Keychain. If missing, authenticate once via the GUI Omnara app (screen-share session), or copy a known-good token from another machine. Save it to your secret manager:
```bash
# Extract from keychain (if stored there):
security find-generic-password -s "Omnara-credentials" -a "$USER" -w

# Then store the token in your own secret manager.
# See ~/JesseOS/workspace/security/README.md for how this machine stores credentials.
```

### 4. TCC permission audit
macOS TCC (Transparency, Consent, and Control) governs Screen Recording, Accessibility, Full Disk Access. The **Omnara daemon identity = its app bundle ID** (`$OMNARA_BUNDLE_ID`, discovered above). Check what's granted:

```bash
~/.claude/skills/mac-headless-setup/scripts/tcc-audit.sh "$OMNARA_BUNDLE_ID"
```

Output shows ALLOWED / DENIED / NOT_FOUND for each of:
- `kTCCServiceSystemPolicyAllFiles` (Full Disk Access)
- `kTCCServiceScreenCapture` (Screen Recording)
- `kTCCServiceAccessibility` (Accessibility)

### 5. Grant missing TCC permissions (GUI-only, SIP-protected)
**You CANNOT grant TCC via SSH or CLI** due to System Integrity Protection. Must be done via screen-share:

1. Connect to the Mac via your screen-share client (iPhone or Mac → Screen Sharing.app, or a 3rd-party client over your VPN mesh).
2. Open **System Settings → Privacy & Security**.
3. For each missing permission:
   - **Full Disk Access**: click lock → add the Omnara app → toggle ON.
   - **Screen Recording**: same process.
   - **Accessibility**: same process.
4. Re-run the audit script to confirm all three show ALLOWED.

### 6. Install auto-update monitor (optional but recommended)
Sets up a LaunchAgent that checks Claude Desktop GUI, Claude Code CLI, Omnara Desktop GUI, and Omnara CLI/daemon every 6 hours against official release feeds, auto-downloads + installs updates. Status visible anytime via `~/.app-autoupdate/status.json`.

If the `app-autoupdate` project exists on this machine, verify it's loaded (replace the label with your own if it differs):
```bash
launchctl list | grep com.jesse.appupdate
cat ~/.app-autoupdate/status.json
```

Force an immediate check:
```bash
launchctl kickstart gui/$(id -u)/com.jesse.appupdate
```

## Owner notifications (generic)

This protocol does not assume any particular alerting stack. For a self-contained default, notify locally and log to a file:

```bash
# Generic notifier — desktop notification + append to a log file.
NOTE_LOG="~/.claude/logs/mac-headless-setup.log"
mkdir -p "$(dirname "$NOTE_LOG")"
notify() {
  local msg="$1"
  osascript -e "display notification \"$msg\" with title \"mac-headless-setup\"" 2>/dev/null || true
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$msg" >> "$NOTE_LOG"
  # TODO: wire up your preferred remote alert channel here (e.g. push/chat/email).
}
```

## Pitfalls

- **Node via Homebrew breaks daemon PATH**: Homebrew's `/opt/homebrew/bin` may not be in the daemon's environment. Use the user-space tarball method above.
- **TCC permissions silently revoked**: macOS can revoke TCC on app updates or system upgrades. Consider a small daily check that re-runs `tcc-audit.sh` and alerts (via the generic `notify` helper above) when any of the three permissions flips away from ALLOWED. Re-granting requires a human at the GUI (TCC can't be set via CLI — SIP).
- **OAuth token expiry**: The Omnara daemon refreshes tokens automatically, but if the refresh flow breaks (e.g., an OAuth endpoint change), the daemon silently stops working. Monitor for stale sessions.
- **Remote-desktop frame rate**: Plain VNC tends to be low frame rate (~15fps); dedicated clients (e.g. a vendor "Connect" agent running on the Mac and signed in to its cloud) can hit 60fps. macOS "High Performance" screen sharing is Mac→Mac only (not available to iPhone/3rd-party VNC).
- **Omnara CLI restart interrupts active sessions**: When the Omnara CLI/daemon itself updates, it restarts and any active session is interrupted. Have the auto-updater fire the generic `notify` helper before restarting the daemon. All other updates (Claude Desktop, Omnara Desktop, Claude Code) are non-disruptive.

## Verification

```bash
# 1. Node + Claude installed and in PATH
~/node-current/bin/node --version
~/node-current/bin/claude --version

# 2. Omnara daemon running with correct PATH
launchctl list | grep -i omnara  # should show PID
launchctl getenv PATH  # should include ~/node-current/bin (may not work for daemon env; check plist)

# 3. TCC permissions granted
~/.claude/skills/mac-headless-setup/scripts/tcc-audit.sh "$OMNARA_BUNDLE_ID"
# All three (Full Disk, Screen Recording, Accessibility) should say ALLOWED

# 4. Headless session can be initiated
# From another machine:
# omnara chat --directory /path/to/workspace
# Should connect and spawn a Claude session on the remote Mac

# 5. Auto-update monitor healthy (if installed)
cat ~/.app-autoupdate/status.json | jq '.lastCheck, .apps[] | select(.updateAvailable == true)'
# lastCheck should be recent; no apps with updateAvailable:true (if all up-to-date)
```
