#!/bin/bash
# =============================================================================
# media-inbox / install.sh — idempotent. Safe to re-run any time.
# Creates the iCloud inbox, the vault output tree, and loads both LaunchAgents.
# =============================================================================
set -uo pipefail
HOME="${HOME:-~}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

SKILL="~/.claude/skills/media-inbox"
INBOX="$HOME/Library/Mobile Documents/com~apple~CloudDocs/AI-Inbox"
ICLOUD_TX="$HOME/Library/Mobile Documents/com~apple~CloudDocs/AI-Transcripts"
OUT="$HOME/JesseOS/vault/60-inbox/media"
LA="$HOME/Library/LaunchAgents"
UID_N="$(id -u)"

echo "==> creating folders"
mkdir -p "$INBOX" "$ICLOUD_TX" "$OUT"/{transcripts,originals,work,state,failed} \
         "~/.claude/logs" "$LA"
# Migrate away from the old in-inbox location (it caused WatchPaths retriggers).
if [ -d "$INBOX/_transcripts" ]; then
  mv -f "$INBOX/_transcripts"/* "$ICLOUD_TX"/ 2>/dev/null
  rmdir "$INBOX/_transcripts" 2>/dev/null
fi
chmod +x "$SKILL/scripts/"*.sh 2>/dev/null

# A README the user sees on their phone, right inside the drop folder.
cat >"$INBOX/README.txt" <<'EOF'
AI-Inbox — drop videos or audio here and your Mac transcribes them automatically.

From an iPhone:
  Photos / any app -> Share -> Save to Files -> iCloud Drive -> AI-Inbox
  (or Share -> Save to Files and pick AI-Inbox for a file from any app)

Within a few minutes the Mac will:
  - download the file
  - transcribe it with local Whisper (offline, private)
  - put the transcript in the AI-Transcripts folder (next to this one) so you can read it here
  - move the original off iCloud to free up your storage

You can also drop a .txt file containing a video URL and it will download + transcribe that.
EOF

# -----------------------------------------------------------------------------
# The iCloud drop-folder watcher is OPT-IN (MEDIA_INBOX_ICLOUD=1) because macOS
# TCC forbids a LaunchAgent from listing ~/Library/Mobile Documents without Full
# Disk Access. Left enabled without that grant it just logs FATAL every 2 minutes
# and pins QC red. The folder still works for agent-invoked drains either way.
# -----------------------------------------------------------------------------
ICLOUD_WATCH="${MEDIA_INBOX_ICLOUD:-0}"
if [ "$ICLOUD_WATCH" = "1" ]; then
  : >"$OUT/state/icloud-enabled"
else
  rm -f "$OUT/state/icloud-enabled" 2>/dev/null
fi

if [ "$ICLOUD_WATCH" = "1" ]; then
echo "==> writing LaunchAgent: com.jesse.mediainbox (watcher)"
cat >"$LA/com.jesse.mediainbox.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.jesse.mediainbox</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>$SKILL/scripts/process-inbox.sh</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>$HOME</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>WatchPaths</key><array><string>$INBOX</string></array>
  <!-- WatchPaths on an iCloud/FileProvider dir does not fire reliably for every
       remote arrival, so this interval is the real guarantee, not an optimisation. -->
  <key>StartInterval</key><integer>120</integer>
  <key>RunAtLoad</key><true/>
  <key>Nice</key><integer>5</integer>
  <key>StandardOutPath</key><string>~/.claude/logs/mediainbox.log</string>
  <key>StandardErrorPath</key><string>~/.claude/logs/mediainbox.log</string>
</dict></plist>
EOF
else
  echo "==> iCloud watcher DISABLED (set MEDIA_INBOX_ICLOUD=1 to enable; needs Full Disk Access)"
  launchctl bootout "gui/$UID_N/com.jesse.mediainbox" 2>/dev/null || true
  rm -f "$LA/com.jesse.mediainbox.plist" 2>/dev/null
fi

echo "==> writing LaunchAgent: com.jesse.mediainbox-qc (light QC 2x/day)"
cat >"$LA/com.jesse.mediainbox-qc.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.jesse.mediainbox-qc</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>$SKILL/scripts/media-inbox-qc.sh</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>$HOME</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartCalendarInterval</key><array>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>40</integer></dict>
    <dict><key>Hour</key><integer>21</integer><key>Minute</key><integer>40</integer></dict>
  </array>
  <key>StandardOutPath</key><string>$OUT/qc.cron.log</string>
  <key>StandardErrorPath</key><string>$OUT/qc.cron.log</string>
</dict></plist>
EOF

echo "==> writing LaunchAgent: com.jesse.mediainbox-qc-deep (deep QC 1x/day)"
cat >"$LA/com.jesse.mediainbox-qc-deep.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.jesse.mediainbox-qc-deep</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>$SKILL/scripts/media-inbox-qc.sh</string><string>--deep</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>$HOME</string>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartCalendarInterval</key><array>
    <dict><key>Hour</key><integer>5</integer><key>Minute</key><integer>10</integer></dict>
  </array>
  <key>StandardOutPath</key><string>$OUT/qc.cron.log</string>
  <key>StandardErrorPath</key><string>$OUT/qc.cron.log</string>
</dict></plist>
EOF

# Exact-label lookup. Deliberately avoids `launchctl list | grep -q`: under
# `set -o pipefail`, grep -q exits on first match, launchctl dies of SIGPIPE, and
# the pipeline reports 141 -- a false "not loaded". Also avoids substring matches
# (com.jesse.mediainbox is a prefix of com.jesse.mediainbox-qc).
launchctl_has() {
  local want="$1" pid st lbl
  while IFS=$'\t' read -r pid st lbl; do
    [ "$lbl" = "$want" ] && return 0
  done <<<"$(launchctl list 2>/dev/null)"
  return 1
}

echo "==> loading agents"
AGENTS="com.jesse.mediainbox-qc com.jesse.mediainbox-qc-deep"
[ "$ICLOUD_WATCH" = "1" ] && AGENTS="com.jesse.mediainbox $AGENTS"
for l in $AGENTS; do
  launchctl bootout "gui/$UID_N/$l" 2>/dev/null || true
  sleep 1                          # let the old job fully unload, else bootstrap EIO
  launchctl bootstrap "gui/$UID_N" "$LA/$l.plist" 2>/dev/null \
    || launchctl load -w "$LA/$l.plist" 2>/dev/null || true
  # `bootstrap` often reports "5: Input/output error" even on success, and
  # registration lags the call by a second or two -- so poll `launchctl list`
  # rather than trusting the exit code or a single immediate check.
  ok=0
  for _ in 1 2 3 4 5; do
    if launchctl_has "$l"; then ok=1; break; fi
    sleep 1
  done
  if [ "$ok" = 1 ]; then echo "    loaded: $l"; else echo "    WARN: $l did not load"; fi
done

echo
echo "Done. Drop folder (visible on your iPhone in Files -> iCloud Drive -> AI-Inbox):"
echo "  $INBOX"
echo "Transcripts land in:"
echo "  $OUT/transcripts/   (and $ICLOUD_TX/ so you can read them on the phone)"
