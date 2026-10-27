#!/usr/bin/env bash
# Build + sign the Fire TV APK. No Gradle, no AndroidX — just the SDK tools,
# which keeps this dependency-free and fast.
#
#   ./build.sh          -> firetv-app/build/ontap.apk
set -euo pipefail
cd "$(dirname "$0")"

JAVA_HOME="${JAVA_HOME:-$HOME/Android/jdk}"
# d8 / apksigner / keytool are wrapper scripts that call `java` from PATH.
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

SDK="${ANDROID_SDK_ROOT:-$HOME/Android/sdk}"
BT="$SDK/build-tools/34.0.0"
ANDROID_JAR="$SDK/platforms/android-34/android.jar"

for f in "$JAVA_HOME/bin/javac" "$BT/aapt2" "$BT/d8" "$BT/zipalign" "$BT/apksigner" "$ANDROID_JAR"; do
  [ -e "$f" ] || { echo "✗ missing: $f"; exit 1; }
done

OUT=build
rm -rf "$OUT"; mkdir -p "$OUT/res" "$OUT/gen" "$OUT/classes" "$OUT/dex"

echo "→ compiling resources"
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"

echo "→ linking resources + manifest"
"$BT/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest AndroidManifest.xml \
  --java "$OUT/gen" \
  --min-sdk-version 22 \
  --target-sdk-version 30 \
  "$OUT/res.zip"

echo "→ compiling java"
find "$OUT/gen" java -name '*.java' > "$OUT/sources.txt"
# NOTE: do not pipe javac - a pipeline hides its exit status and we would
# happily ship an APK with classes silently missing (this has bitten once).
if ! "$JAVA_HOME/bin/javac" \
      -source 8 -target 8 -nowarn \
      -bootclasspath "$ANDROID_JAR" \
      -classpath "$ANDROID_JAR" \
      -d "$OUT/classes" \
      @"$OUT/sources.txt" > "$OUT/javac.log" 2>&1; then
  echo "✗ javac failed:"; cat "$OUT/javac.log"; exit 1
fi
grep -v "bootstrap class path" "$OUT/javac.log" || true

# Every source file must have produced a class, or the build is a lie.
for src in $(find java -name '*.java'); do
  cls=$(basename "$src" .java)
  if ! find "$OUT/classes" -name "$cls.class" | grep -q .; then
    echo "✗ $cls.class missing after compile"; exit 1
  fi
done

echo "→ dexing"
find "$OUT/classes" -name '*.class' > "$OUT/classes.txt"
"$BT/d8" --min-api 22 --lib "$ANDROID_JAR" --output "$OUT/dex" @"$OUT/classes.txt"

echo "→ packaging"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
( cd "$OUT/dex" && zip -q ../unsigned.apk classes.dex )

echo "→ aligning"
"$BT/zipalign" -p -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

# Self-signed key. Fine for sideloading; it is not going through any store.
KS=keystore.jks
if [ ! -f "$KS" ]; then
  echo "→ creating signing key (first run only)"
  "$JAVA_HOME/bin/keytool" -genkeypair -v \
    -keystore "$KS" -alias ontap \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -storepass ontap123 -keypass ontap123 \
    -dname "CN=On Tap, OU=Home, O=MadLad Brewing, L=, S=, C=AU" >/dev/null 2>&1
fi

echo "→ signing"
"$BT/apksigner" sign \
  --ks "$KS" --ks-pass pass:ontap123 --key-pass pass:ontap123 \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out "$OUT/ontap.apk" "$OUT/aligned.apk"

"$BT/apksigner" verify --print-certs "$OUT/ontap.apk" >/dev/null && echo "→ signature OK"

rm -f "$OUT/unsigned.apk" "$OUT/aligned.apk" "$OUT/base.apk" "$OUT/res.zip" \
      "$OUT/sources.txt" "$OUT/classes.txt" "$OUT"/ontap.apk.idsig
rm -rf "$OUT/classes" "$OUT/gen" "$OUT/dex"

# Publish the APK + version manifest to the site root, so the app can find them.
# Generated from the manifest so the advertised version can never drift from the build.
VC=$(grep -o 'android:versionCode="[0-9]*"' AndroidManifest.xml | grep -o '[0-9]*')
VN=$(grep -o 'android:versionName="[^"]*"' AndroidManifest.xml | sed 's/.*="//;s/"//')

cp "$OUT/ontap.apk" ../ontap.apk
cat > ../version.json <<JSON
{
  "versionCode": $VC,
  "versionName": "$VN",
  "url": "https://jesse372.github.io/beer-tap-list/ontap.apk"
}
JSON

echo "→ published ../ontap.apk and ../version.json (v$VN, code $VC)"
echo
echo "✓ $(cd "$OUT" && pwd)/ontap.apk  ($(du -h "$OUT/ontap.apk" | cut -f1))"
