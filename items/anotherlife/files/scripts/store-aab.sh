#!/usr/bin/env bash
# Build the SIGNED Android App Bundle for Play Console.
#
# This exists because scripts/release-apk.sh builds a *debug-signed* APK. That
# is fine for sideloading onto your own phone and is rejected by Play. Anything
# going to the store goes through here, and this script would rather fail
# loudly than hand you an artefact that looks finished and isn't.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

fail() { echo "REFUSING TO BUILD: $*" >&2; exit 1; }

# 1. a store build must never load its code from a URL
grep -q '"server"' capacitor.config.json && fail "capacitor.config.json still has a dev server block."

# 2. it must be signed with YOUR upload key, not the debug key
[ -f android/key.properties ] || fail "android/key.properties is missing — see STORE.md section 3.
  Without it Gradle produces an UNSIGNED bundle and Play will reject it."
grep -q 'CHANGEME' android/key.properties && fail "android/key.properties still contains CHANGEME."
STORE_FILE=$(grep '^storeFile=' android/key.properties | cut -d= -f2-)
[ -f "$STORE_FILE" ] || fail "keystore not found at: $STORE_FILE"

# 3. Play rejects a versionCode you have already uploaded
VC=$(grep -oE 'versionCode +[0-9]+' android/app/build.gradle | grep -oE '[0-9]+')
LAST=$(cat dist/.last-uploaded-versioncode 2>/dev/null || echo 0)
if [ "$VC" -le "$LAST" ]; then
  fail "versionCode is $VC but $LAST has already been uploaded.
  Bump versionCode in android/app/build.gradle first."
fi

npx cap sync android >/dev/null
( cd android && ./gradlew bundleRelease -q )

AAB=android/app/build/outputs/bundle/release/app-release.aab
[ -f "$AAB" ] || fail "gradle produced no bundle at $AAB"

# 4. prove it is actually signed before anyone tries to upload it
if ! unzip -l "$AAB" | grep -qE 'META-INF/.*\.(RSA|EC|DSA)'; then
  fail "the bundle came out UNSIGNED. Check android/key.properties."
fi

mkdir -p dist
cp "$AAB" dist/AnotherLife.aab
echo "built dist/AnotherLife.aab (versionCode $VC) — signed, ready for Play Console"
echo "after a successful upload, run:  echo $VC > dist/.last-uploaded-versioncode"
