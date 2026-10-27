# Publishing AnotherLife and selling the packs

Five packs at **$4.99** each, plus a **$14.99** bundle. One-off purchases,
non-consumable, no subscription.

| Product ID (SKU) | Price | Pack |
|---|---|---|
| `anotherlife.pack.fighter`    | $4.99  | The Fight Game |
| `anotherlife.pack.mafia`      | $4.99  | Underworld |
| `anotherlife.pack.royalty`    | $4.99  | Bloodline |
| `anotherlife.pack.business`   | $4.99  | Founder |
| `anotherlife.pack.god`        | $4.99  | Rewrite |
| `anotherlife.pack.everything` | $14.99 | The Full Set |

These SKUs are defined in `www/js/store.js`. **They must match the Play Console
product IDs exactly**, character for character, or purchases silently fail.

---

## Why Play Billing and not Stripe

Google and Apple both require their own billing for digital goods sold inside
an app. Using Stripe/PayPal for these packs gets the app removed. The bundled
`cordova-plugin-purchase` talks to Google Play Billing and StoreKit; there is
no third-party revenue share beyond the store's own cut (15% on the first
$1M/year for both stores if you enrol in their small-business programmes).

---

## What you need before you can ship

| | Cost | Status |
|---|---|---|
| JDK 21 | free | **installed** (`~/java/jdk-21.0.12.1+1`) |
| Android SDK 35 + build-tools | free | **installed** (`~/Library/Android/sdk`) |
| Google Play developer account | $25 one-off | you need to create |
| Apple Developer account (iOS only) | $99/year | optional |
| Xcode (iOS only, needs a Mac) | free | **not installed** |

## 1. Toolchain (already installed)

Add this to `~/.zshrc` so new terminals can build:

```bash
export JAVA_HOME="$HOME/java/jdk-21.0.12.1+1/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Homebrew could not install the JDK — `/usr/local/share/man/man8` is not writable
by your user and casks need sudo. Temurin 21 was unpacked to `~/java` instead,
which needs no privileges. If you would rather use Homebrew later:

```bash
sudo chown -R $(whoami) /usr/local/share/man/man8
brew install openjdk@21
```

## 2. Android project (already generated)

`android/` exists and builds. To rebuild it from scratch at any point:

```bash
cd ~/Documents/Claude/anotherlife
npm install
npx cap add android
npm run assets          # launcher icons + splash from resources/
npm run sync
npm run build:apk
```

After changing anything in `www/`, run `npx cap sync android` before rebuilding.

## 3. Create the upload key — back this up

Lose it and you can never update the app again.

```bash
mkdir -p ~/keystores
keytool -genkey -v -keystore ~/keystores/anotherlife-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

`android/key.properties` (already gitignored):

```properties
storeFile=~/keystores/anotherlife-upload.jks
storePassword=CHANGEME
keyAlias=upload
keyPassword=CHANGEME
```

Wire it into `android/app/build.gradle` inside `android { }` — see README.

## 4. Create the products in Play Console

Play Console → your app → **Monetise → Products → In-app products → Create**.

For each row in the table above: set the product ID to the exact SKU, add a
name and description, set the price, and **Activate** it. Inactive products
return "item unavailable" at runtime.

Then Play Console → **Monetise → Monetisation setup** and complete the merchant
account, or purchases will not work at all.

## 5. Test purchases before going live

- Play Console → **Setup → License testing** → add your own Google account.
  Licence testers get real purchase flows charged at $0.
- Upload a build to **Internal testing** first. IAP does **not** work in a
  debug APK sideloaded outside a Play track — it must come from Play.
- Verify: buy a pack, force-stop, reopen, confirm it is still unlocked, then
  reinstall and use **Restore Purchases**.

## 6. Ship

```bash
npm run build:aab   # android/app/build/outputs/bundle/release/app-release.aab
```

Upload to Internal testing → Closed testing → Production.

**New personal developer accounts must run a closed test with 12+ testers for
14 days before production access is granted.** Start that clock early.

---

## Store listing checklist

- 512×512 icon — `www/icons/icon-512.png`
- 1024×500 feature graphic — needs making
- At least 2 phone screenshots
- **Content rating**: answer honestly. The game has simulated crime, gambling,
  drug and alcohol addiction, and violence. That lands around **Teen / PEGI 12
  or higher**. Understating it is the most common cause of removal.
- **Data safety**: declare **no data collected**. There is no network code, no
  analytics and no third-party SDK; all state is local `localStorage`.
- **Ads**: none. Declare accordingly.

---

## The testing unlock

`www/js/store.js` exposes an "Unlock everything (testing)" row that only
renders when `isNative()` is false — i.e. the browser preview. It cannot
appear in the Play build. If you would rather it did not exist at all, delete
the `devunlock` case in `www/js/main.js` and the block that renders it in
`storeSheet()`.

---

## Build log: problems already hit and fixed

Recorded so they don't have to be rediscovered.

1. **Homebrew could not install the JDK.** `/usr/local/share/man/man8` is not
   writable by this user and casks want sudo. Temurin 21 was unpacked to
   `~/java` instead. Fix if you want brew later:
   `sudo chown -R $(whoami) /usr/local/share/man/man8`

2. **compileSdk 34 vs androidx.core 1.15.0.** Capacitor 6 pins compileSdk 34,
   but the Play Billing plugin pulls androidx.core 1.15.0, which refuses to be
   consumed below 35. Raised to 35 with AGP 8.7.2 and Gradle 8.9. Needed
   anyway — Play requires new apps to target API 35.

3. **minSdk 22 vs Play Billing 9.** `com.android.billingclient:billing:9.0.0`
   declares minSdk 23; the manifest merger refuses. Raised to 23 (Android 6.0).

All three live in `scripts/android-fix.sh`, which is re-applied by
`npm run android:init`, because `android/` is gitignored and regenerable.

## Everyday commands

```bash
source scripts/env.sh          # JDK + SDK on PATH
npx cap sync android           # after any change under www/
cd android && ./gradlew assembleDebug     # debug APK
cd android && ./gradlew bundleRelease     # signed AAB, once the keystore exists
```

---

## Two APK flavours

`npm run apk:dev` — **development build.** The WebView loads `www/` from a live
server instead of the copy inside the APK, so editing a file and pulling down
to refresh on the phone shows the change immediately. No rebuild, no
reinstall. Defaults to this Mac's LAN address, which survives tunnel restarts;
pass a URL to point it elsewhere:

```bash
npm run apk:dev                                     # http://<lan-ip>:8777
./scripts/dev-apk.sh https://xyz.trycloudflare.com  # works off the home network
```

The script restores `capacitor.config.json` on exit, including on failure, so
a dev `server.url` can never be left behind.

`npm run apk:release` — **production build** with assets bundled. It refuses to
run if a dev server block is still present in the config.

**Never ship a build with `server.url` set.** It breaks offline play and an app
that fetches its own code from a URL is a policy problem on both stores. The
two scripts exist to keep that mistake impossible rather than merely unlikely.

### Knowing which build you're on, and refreshing it

The dev APK shows a yellow **DEV ⟳** chip in the top bar. The production build
never shows it — the check is whether the content came from a real host, since
a production Capacitor build serves itself from `localhost` and "is it native"
would be true for both.

Tap the chip to reload. You rarely need to: the app polls `/__rev` (a hash of
every html/css/js file under `www/`, served by `serve.py`) every three seconds
and reloads itself when it changes. If a question or a menu is open it waits,
shows "Update ready — finish this, then it'll reload", and applies once you're
idle — reloading mid-decision would throw away the question on screen.

---

## Content rating and the 18+ switch

The game ships with an **Adult content (18+)** toggle, **off by default**, under
Menu → Settings. When off, none of that content can occur. When on, it only
ever applies to a character aged 18 or over — both conditions are checked, so
the switch alone never exposes it to a child character. Verified: 0 adult
events reached an under-18 across 400 lives with the switch on.

**This affects your Play rating, and the switch now carries real weight.**
Behind it are nine named drugs with use and dealing mechanics, four tiers of
sex work, and paying for sex. The questionnaire asks what the app is *capable*
of showing, not what the default is, so you must declare:

- **Drugs** — references to and simulated use of illegal drugs, by name
- **Sex** — references to prostitution and sexual content
- **Violence** — assault, murder, prison violence
- **Crime** — theft, dealing, organised crime
- **Gambling** — simulated, no real money

That is **Mature 17+ on Play and 17+ on the App Store** — the same rating
BitLife itself carries for the same reasons. Answering for the default-off
state would be a misdeclaration, and misdeclaration is the most common cause
of removal.

Apple is stricter than Google here. Expect App Store review to push back on
the sex-work content specifically; it is survivable but you may need to
argue it, or ship Android first.

If you would rather stay at Teen, delete the `adult: true` events from
`www/js/events-wild.js` and the toggle from `menuSheet()` in `www/js/main.js`.

---

## iOS

The iOS project is scaffolded at `ios/App` with the web assets staged and the
billing plugin registered. It cannot be built on this machine yet: **Xcode is
not installed**, and CocoaPods can't be installed either because it compiles
native extensions using Xcode's toolchain. Only the command line tools are
present.

To finish it:

1. Install **Xcode** from the App Store (~15GB, needs an Apple ID). This is a
   manual step — it can't be scripted.
2. Open Xcode once and accept the licence.
3. `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
4. `npm run ios:setup` — installs CocoaPods, syncs and runs `pod install`
5. `npm run ios:open`

In Xcode, under **Signing & Capabilities**: pick your team, then add the
**In-App Purchase** capability. Without it the packs silently fail.

Then create the same six product IDs in **App Store Connect** that you created
in Play Console — they are separate catalogues, but `www/js/store.js` uses one
set of SKUs for both, so they must match on each side.

Costs: **$99/year** for the Apple Developer Program. Apple review is stricter
than Google's; expect questions about the 18+ content, particularly the sex
work. Shipping Android first is the lower-friction path.

---

## Comp codes for friends

Tap the **dice logo seven times** to open a redeem screen. The code is
`MATESRATES` and unlocks all five packs plus the bundle.

The check is a hash rather than the plain string, so the code isn't sitting in
the bundle in readable form — but this is obfuscation, not security. Anyone who
unzips the APK and reads `www/js/store.js` can work it out, and if it spreads
you cannot revoke it.

For anything you actually care about, both stores issue proper promo codes:

- **Play Console → Monetise → Promotions** — up to 500 codes per product per
  quarter, revocable, redeemed against the real product
- **App Store Connect → your app → Promo Codes** — 100 per app per version

Those are the right tool for giving the app away to people you know. The
built-in code is a convenience, not a substitute.

To change it, edit `COMP_HASH` in `www/js/store.js`. Generate a new value with:

```bash
python3 -c 'h=5381
for c in "YOURCODE".upper(): h=((h*33)^ord(c))&0xFFFFFFFF
print(h)'
```
