#!/bin/bash
# TCC permission audit for a given bundle ID
# Usage: tcc-audit.sh <bundle_id>
# Example: tcc-audit.sh <your-omnara-app-bundle-id>

set -euo pipefail

BUNDLE_ID="${1:-}"
if [[ -z "$BUNDLE_ID" ]]; then
  echo "Usage: $0 <bundle_id>" >&2
  echo "Example: $0 com.anthropic.claudefordesktop" >&2
  exit 1
fi

TCC_DB="$HOME/Library/Application Support/com.apple.TCC/TCC.db"

# Three critical permissions for remote control:
SERVICES=(
  "kTCCServiceSystemPolicyAllFiles"  # Full Disk Access
  "kTCCServiceScreenCapture"         # Screen Recording
  "kTCCServiceAccessibility"         # Accessibility
)

LABELS=(
  "Full Disk Access"
  "Screen Recording"
  "Accessibility"
)

echo "TCC Audit for bundle ID: $BUNDLE_ID"
echo "----------------------------------------"

for i in "${!SERVICES[@]}"; do
  SERVICE="${SERVICES[$i]}"
  LABEL="${LABELS[$i]}"

  # Query TCC database (allowed=1 means granted)
  RESULT=$(sqlite3 "$TCC_DB" \
    "SELECT allowed FROM access WHERE service='$SERVICE' AND client='$BUNDLE_ID';" 2>/dev/null || echo "")

  if [[ "$RESULT" == "1" ]]; then
    STATUS="✅ ALLOWED"
  elif [[ "$RESULT" == "0" ]]; then
    STATUS="❌ DENIED"
  else
    STATUS="⚠️  NOT_FOUND"
  fi

  printf "%-25s %s\n" "$LABEL:" "$STATUS"
done

echo "----------------------------------------"
echo "To grant missing permissions:"
echo "1. Connect via screen-share (Screen Sharing.app, or a 3rd-party client over your VPN mesh)"
echo "2. System Settings → Privacy & Security → [permission name]"
echo "3. Click lock, add the app bundle, toggle ON"
