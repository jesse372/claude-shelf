#!/usr/bin/env bash
# Build the SIDELOAD APK with assets bundled — for putting on your own phone.
#
# This is signed with the Android DEBUG key. That is deliberate and fine for
# sideloading, but it is NOT the store build: Play rejects debug-signed
# artefacts, and a debug-signed install cannot later be upgraded over by a
# properly-signed one (different key — it has to be uninstalled first).
# For the store, use scripts/store-aab.sh.
#
# Refuses to run if a dev server.url has been left in the config.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

if grep -q '"server"' capacitor.config.json; then
  echo "capacitor.config.json still contains a dev server block. Remove it before"
  echo "building for release — a store build must not load its code from a URL."
  exit 1
fi

npx cap sync android >/dev/null
( cd android && ./gradlew assembleDebug -q )
mkdir -p dist
cp android/app/build/outputs/apk/debug/app-debug.apk dist/AnotherLife.apk
echo "built dist/AnotherLife.apk ($(du -h dist/AnotherLife.apk | cut -f1)) — assets bundled, DEBUG-SIGNED (sideload only; use scripts/store-aab.sh for Play)"
