# On Tap — Fire TV app

A tiny full-screen shell around the live tap list at
`https://jesse372.github.io/beer-tap-list/`.

**The board itself is still the website.** The app is a WebView pointing at it, so
publishing an edit updates the TV with no rebuild and no reinstall. The app only adds
the things a browser can't:

- a real icon on the Fire TV home row (no opening Silk, no bookmarks)
- no address bar, ever
- `FLAG_KEEP_SCREEN_ON` — the proper OS-level way to stop the screen sleeping
- auto-retry if the WiFi isn't up yet when the Fire Stick boots
- Back exits cleanly; Menu forces an instant refresh

## Installing on the Fire Stick (no computer needed)

1. Fire Stick → **Settings → My Fire TV → Developer Options → Install unknown apps**
   → turn **ON** for **Downloader**.
   *(If Developer Options is hidden: Settings → My Fire TV → About → click
   **Fire TV Stick** seven times.)*
2. Install the free **Downloader** app from the Amazon Appstore.
3. Open Downloader, and in the URL box enter:

   ```
   jesse372.github.io/beer-tap-list/ontap.apk
   ```

4. **Download** → **Install** → **Open**.

Tip: typing that with the remote is painful — use the **Amazon Fire TV** phone app's
keyboard instead.

## Rebuilding

```bash
cd firetv-app
./build.sh          # -> build/ontap.apk
```

Then publish it:

```bash
cp build/ontap.apk ../ontap.apk
cd .. && git add ontap.apk && git commit -m "Update app" && git push
```

Bump `android:versionCode` in `AndroidManifest.xml` first so the Fire Stick treats it
as an upgrade.

### Toolchain

No Gradle and no AndroidX — just the SDK tools, so there is nothing to resolve and the
build takes about two seconds. It expects:

- `~/Android/jdk`  — JDK 17 (Temurin)
- `~/Android/sdk`  — Android SDK with `platforms;android-34` and `build-tools;34.0.0`

Override with `JAVA_HOME` / `ANDROID_SDK_ROOT` if yours live elsewhere.

### Signing key

`build.sh` generates a self-signed `keystore.jks` on first run. It's gitignored, since
it's a signing key. If it's ever lost you can just make a new one — the only
consequence is that the next install needs the old app uninstalled first, because the
signatures won't match.
