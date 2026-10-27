#!/usr/bin/env bash
# Applied after `npx cap add android`, because android/ is regenerable and
# therefore gitignored — without this the fixes below are silently lost.
#
# Capacitor 6 pins compileSdk 34, but androidx.core 1.15.0 (pulled in by the
# Play Billing plugin) requires callers to compile against 35+. Google Play
# also requires new apps to target API 35, so we need 35 either way.
set -euo pipefail
cd "$(dirname "$0")/../android"

python3 - <<'PY'
v = open('variables.gradle').read()
for a, b in [
    ('minSdkVersion = 22',     'minSdkVersion = 23'),   # Play Billing 9 needs 23
    ('compileSdkVersion = 34', 'compileSdkVersion = 35'),
    ('targetSdkVersion = 34',  'targetSdkVersion = 35'),
    ("androidxCoreVersion = '1.12.0'",     "androidxCoreVersion = '1.15.0'"),
    ("androidxActivityVersion = '1.8.0'",  "androidxActivityVersion = '1.9.3'"),
    ("androidxAppCompatVersion = '1.6.1'", "androidxAppCompatVersion = '1.7.0'"),
    ("androidxFragmentVersion = '1.6.2'",  "androidxFragmentVersion = '1.8.5'"),
    ("androidxWebkitVersion = '1.9.0'",    "androidxWebkitVersion = '1.12.1'"),
]:
    v = v.replace(a, b)
open('variables.gradle', 'w').write(v)

b = open('build.gradle').read()
b = b.replace("com.android.tools.build:gradle:8.2.1", "com.android.tools.build:gradle:8.7.2")
open('build.gradle', 'w').write(b)

w = open('gradle/wrapper/gradle-wrapper.properties').read()
w = w.replace('gradle-8.2.1-all.zip', 'gradle-8.9-all.zip')
open('gradle/wrapper/gradle-wrapper.properties', 'w').write(w)
print("android: compileSdk/targetSdk 35, AGP 8.7.2, Gradle 8.9")
PY

echo "sdk.dir=${ANDROID_HOME:-$HOME/Library/Android/sdk}" > local.properties
echo "android: local.properties written"
