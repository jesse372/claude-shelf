# 🎲 AnotherLife

A text-based life simulator in the spirit of BitLife. You're born at random somewhere in the
world with random stats, and you age one year at a time until something kills you. Everything
in between — school, work, love, crime, prison, property, children — is up to you.

Styled after BitLife — blue chrome instead of red. Built as a **Capacitor** app: one mobile-first
web codebase that runs in any browser *and* compiles to a signed Android App Bundle for Google Play.

---

## Play it right now (no build tools needed)

```bash
cd ~/Documents/Claude/anotherlife
npm start          # serves www/ on http://localhost:8777
```

Open <http://localhost:8777> in any browser. On a phone, use "Add to Home Screen" and it runs
fullscreen like a native app (manifest + icons are already wired up).

---

## What's in the game

Roughly **660 distinct options** across every system, all reachable from the five tabs.

| System | Detail |
|---|---|
| **Storylines** | Choices set persistent **flags** that unlock follow-up events years later — start smoking at 15 and you'll face quitting at 30 and the consequences at 50; back a friend's startup and the buyout offer lands a decade on. **23 storyline threads**; 97% of lives play at least one end-to-end |
| **Character** | Random name/gender/city across **20 countries** (each with its own currency and cost of living), 4 stats, family wealth tier |
| **Aging** | One year per tap. **101 life events, 68 of them branching decisions** averaging 3 options each. Roughly **76% of years put a choice in front of you**. Events have cooldowns so the same prompt never recurs within a decade |
| **Education** | Elementary → Middle → High School, GED, university with **24 majors**, and **7 graduate tracks** (med, law, business, dental, vet, pharmacy, generic) that gate the top careers. **8 school clubs**, plus dropping out |
| **Careers** | **58 regular jobs** across 4 qualification tiers with **292 promotion rungs** between them. Performance tracking, raises, promotions, firings, retirement and pension |
| **Special careers** | **13 fame-driven paths** — actor, musician, singer, model, athlete, influencer, author, comedian, director, racing driver, astronaut, politician, military. You audition rather than apply; earnings scale with a live **fame** stat you grow via projects, publicists and scandals |
| **Relationships** | **15 relation types** (parents, siblings, grandparents, aunts/uncles, cousins, children, partners, exes, friends, best friend, coworkers) with **14 interactions** — spend time, talk, compliment, cinema, trips, gifts, give/ask for money, argue, insult, cut off, propose, try for a baby, IVF, divorce. Plus adoption |
| **Assets** | **14 properties** (appreciate), **13 vehicles** (depreciate), **10 luxury collectibles** with individual appreciation curves, **8 pets** with real lifespans |
| **Money** | **6 investment vehicles** from savings to startup equity, each with its own mean return and volatility · **5 insurance policies** that actually pay out against matching events · bank loans with interest and auto-repayment · bankruptcy |
| **Crime & Prison** | **14 crimes** (some rewarding smarts), sentencing, and **7 prison actions** — keep your head down, study, join a gang, conjugal visits, riot, appeal, escape |
| **Activities** | **26 activities** across Mind & Body, Leisure and Love |
| **Casino** | **5 real games** — slots, roulette, blackjack, poker, horses — with distinct win rates and payout curves. Blackjack and poker reward smarts; slots and roulette don't |
| **Premium modes** | The equivalents of BitLife's paid packs: **Fighter Mode** (4 disciplines, rankings, belts, accumulating head trauma), **Mafia** (5 families, 6 ranks to Godfather, rackets, hits, police heat, RICO), **Royalty** (born royal ~1%, succession, treasury, wars, revolutions), **Business** (6 sectors, capital, marketing, IPO), **God Mode** (edit any stat), **Time Machine** (undo the year you just lived), **Heirlooms** (5 items that pass down the family line) |
| **Legacy** | Die with children and continue as your heir — inheriting a share of the estate, the heirlooms and their bonuses, with your old family intact. Generation counter in the header |
| **Death** | Obituary, 5-star life score, **12 earnable ribbons**, and a persistent graveyard of past lives |

Everything auto-saves to `localStorage` after every year.

---

## Architecture

```
www/
  index.html         # app shell — title screen, game screen, sheet, modal, toast
  styles.css         # mobile-first dark theme, safe-area aware
  manifest.webmanifest
  icons/             # favicon, apple-touch-icon, 512 + 1024 PNGs
  js/
      util.js        # shared pure helpers
      data.js        # content tables
      events.js      # random life events
      engine.js      # pure simulation — no DOM access at all
      main.js        # all DOM rendering and event handling
capacitor.config.json
resources/           # 1024 icon + 2732 splash — source art for @capacitor/assets
```

The split matters: `engine.js` never touches the DOM, so the whole simulation is testable in
plain Node. That's how lifespan balance was verified (see below).

### Balance testing

```bash
node --input-type=module -e '
global.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
import("./www/js/engine.js").then(E=>{
  const ages=[];
  for(let i=0;i<600;i++){
    const g=E.newGame(); let n=0;
    while(g.alive && n++<140){ E.ageUp(g);
      g.pendingChoices.slice().forEach(p=>E.resolveChoice(g,p.id,0)); }
    ages.push(g.age);
  }
  ages.sort((a,b)=>a-b);
  const q=p=>ages[Math.floor(ages.length*p)];
  console.log("p10",q(.1),"median",q(.5),"p90",q(.9),"max",ages.at(-1));
});'
```

A passive player (never visits the gym or a doctor) should land around **median 79, p90 91**;
an engaged player who exercises and sees doctors lands nearer **median 81**. If a content change
pushes the median below ~70 or above ~85, the balance has drifted.

---

## Shipping to Google Play

### 0. Install the toolchain (not currently on this Mac)

```bash
brew install --cask temurin@21        # JDK 21
brew install --cask android-studio    # SDK + build tools + emulator
```

Then open Android Studio once and let it install the SDK. Add to `~/.zshrc`:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
```

### 1. Generate the Android project

```bash
cd ~/Documents/Claude/anotherlife
npm install
npx cap add android      # creates android/ (gitignored — it's regenerable)
npm run assets           # generates every launcher icon + splash from resources/
npm run sync
```

### 2. Run it on a device

```bash
npm run build:apk        # android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Or `npm run open` to launch Android Studio and hit ▶.

### 3. Create the upload key (once — back this up or you can never update the app)

```bash
keytool -genkey -v -keystore ~/keystores/anotherlife-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Create `android/key.properties` (already gitignored):

```properties
storeFile=~/keystores/anotherlife-upload.jks
storePassword=CHANGEME
keyAlias=upload
keyPassword=CHANGEME
```

Wire it into `android/app/build.gradle` — inside `android { }`:

```gradle
def keyProps = new Properties()
def keyPropsFile = rootProject.file("key.properties")
if (keyPropsFile.exists()) keyProps.load(new FileInputStream(keyPropsFile))

signingConfigs {
    release {
        storeFile file(keyProps['storeFile'])
        storePassword keyProps['storePassword']
        keyAlias keyProps['keyAlias']
        keyPassword keyProps['keyPassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

### 4. Build the App Bundle

```bash
npm run build:aab        # android/app/build/outputs/bundle/release/app-release.aab
```

### 5. Play Console checklist

- **Package name**: `com.jessechance.anotherlife` — permanent, cannot be changed after upload.
- **Version**: bump `versionCode` (integer, must increase) and `versionName` in
  `android/app/build.gradle` for every release.
- **Store listing**: 512×512 icon (`www/icons/icon-512.png`), 1024×500 feature graphic,
  and at least 2 phone screenshots.
- **Content rating**: the questionnaire will ask about crime/gambling/alcohol references.
  Answer honestly — this game has simulated crime, gambling and drinking, which lands it
  around **Teen / PEGI 12**. Understating it is the most common cause of removal.
- **Data safety**: declare **no data collected** — there is no network code, no analytics,
  no third-party SDK. All state is local `localStorage`.
- **Target API**: Play requires a recent target SDK. Capacitor 6 targets API 34, which is
  current; re-check before each submission.
- **Testing track**: new personal developer accounts must run a closed test with 12+ testers
  for 14 days before production access. Start that clock early.

---

## Extending it

The two files you'll actually edit:

- **`www/js/data.js`** — add jobs to `JOBS`, special careers to `SPECIAL`, crimes to `CRIMES`,
  assets to `HOUSES`/`CARS`/`LUXURY`, activities to `ACTIVITIES`, ribbons to `RIBBONS`.
- **`www/js/events.js`** — add life events.
- **`www/js/engine.js`** — the rules.

An event is either automatic or a choice:

```js
// automatic — fires and logs
{ id:"raise_pet", min:5, max:80, w:4,
  req: g => g.money > 500,                     // optional precondition
  auto: g => ({ text:"A stray cat adopted you.", stats:{ happiness:+8 } }) }

// choice — pauses the game with a modal
{ id:"job_offer", min:22, max:60, w:3, choice:{
    text:"A rival company offers you double your salary.",
    choices:[
      { label:"Take it",  run: g => ({ text:"You jumped ship.", money:+20000 }) },
      { label:"Decline",  run: g => ({ text:"You stayed put.", stats:{ happiness:-4 } }) },
    ]}}
```

Result objects support `text`, `stats`, `money`, `fire`, `removePet`, and `kind`
(`"good"` / `"bad"` — controls the colour of the log entry's left border).

Weights (`w`) are relative within the pool of events valid for the current age.
