---
name: daily-reels
description: "Daily Instagram Reels for Jesse Chance Wedding Photographers (@jessechancewedding). Renders a branded 9:16 reel + caption every day from the couples' albums ALREADY APPROVED on jessechance.com, plus wedding-film excerpts, and drops a week ahead into iCloud Drive/Reels. Use to see what's posting, re-render a day, reject a frame, add a film, or change the rotation/look. TRIGGERS: 'reels', 'daily reel', 'instagram reel', 'make a reel', 'today's reel', 'reel for', 'add a film to the reels', 'remove that photo from the reel', 'reel schedule', 'what's posting'."
---

# daily-reels

Code: `~/JesseOS/workspace/reels/` · LaunchAgent `com.jesseos.reels` (05:30 daily) · log `daily.log`
Output: `iCloud Drive/Reels/<date> <Dow> - <id>/` → `reel.mp4`, `caption.txt`, `cover.jpg` (7 days ahead)
Approve page: `https://jc-reels.madlad-taps.workers.dev/<.share-token>/` — Cloudflare WORKER `jc-reels` (worker/), NOT the jessechance site. Static assets = site/ (built by publish.py) + `/api/state`, `POST /api/approve`. Approve -> IG container (video_url = the Worker's own mp4 URL); a 1-min cron is the single writer that publishes when the container is FINISHED. KV `jc-reels-state` holds per-day status. No IG secrets -> dry run. Old `jc-reels.pages.dev/<token>/` 301s here (root is blank - never redirect `/*`, it leaks the token).
Jesse's flow (2026-10-22): ONE approval per WEEK. Page groups Mon-Sun; "Approve this week" -> each reel `scheduled`; Worker cron posts it on its day at POST_TIME (19:00 Perth, wrangler.toml) -> container -> publish. Per-reel "Don't post" toggle (skipped) and editable caption (KV `cap:<day>` override, max 2200 chars / 30 hashtags). share_to_feed=false (Reels tab only - Jesse doesn't want them on the grid). daily.py renders through the end of NEXT week and NEVER re-renders a day that is approved/skipped/posted (reads Worker /api/state) - the Worker also refuses to post if the reel id changed since approval.
Venue tags: venues.json = handles the venue links from ITS OWN website only (6 of 9; Olive Estate, Anderson Point, Quarry Farm have none - ask Jesse, never guess). Showcase reels get "📍 Venue @handle" in the caption + user_tags; if IG rejects the tag the Worker retries untagged.

| file | job |
|---|---|
| `catalog.py` | reads couples + albums from `~/Projects/jessechance-2026` (STORIES in gen_stories.py, albums on recent-work.html). **Read-only: parses with `ast`. NEVER `runpy`/import the site's gen_*.py — gen_stories runs gen_venues at import and rewrites 10 venue pages in the repo.** |
| `plan.py` | rotation per week from EPOCH: viral on i%7 in (1,3,5) alternating tips/funny; other days showcase (11 couples × story/fast/venue CRT cycle) with the film slot on i%7==4. Music: one running counter per mood across all formats (no neighbour repeats). `plan.py list 14` |
| `engine.py` | v2 edit engine for ALL photo reels: beat-locked segments, transitions (cut/dissolve/push whip w/ motion blur/zoom punch/flash), animated type (rise/grow/pop), loop ending (hero again), light grain, OpenCV warpAffine (PIL transform was 15x slower). Text placement is FACE-AWARE: YuNet (models/face_yunet.onnx, cache models/faces.json) picks the safe-zone y that covers no faces |
| `viral.json` | viral script bank: `tips` (advice lists) + `funny` (setup/punchline/montage). Photos auto-matched by tags vs published alt text; `require` forces e.g. a couple in frame. Rules at top of file |
| `render.py` | spec → reel (film path here; photo reels delegate to engine.py). Photo reels: PIL frames → ffmpeg (Ken Burns / pans, brand fonts Cormorant + Jost, hook in IG safe zone, CTA close). Film reels: full 16:9 over blurred fill, film audio kept |
| `daily.py` | refresh catalog → render+verify next 7 days → deliver to iCloud → prune → notify. `--redo YYYY-MM-DD` forces one day |
| `publish.py` | phone download page → Cloudflare Pages `jc-reels`. GOTCHA: under launchd cwd is `/` and wrangler dies on `mkdir /.wrangler/cache` — deploy runs with `cwd=HERE` and the plist sets WorkingDirectory |
| `music/` | `harvest.mjs` (headed Chrome, Pixabay; only tracks WITHOUT "Content ID Registered"), `music.py build` (download + tempo/beat/hot-start analysis -> library.json), `reject.json` (vetoed track slugs). plan.py rotates soft (story/venue) / upbeat (fast) |
| `connect_ig.py` | Instagram API **with Instagram Login** (graph.instagram.com; Worker var IG_GRAPH). Token in Keychain jc-reels-ig/ig_token (60-day long-lived). `--check` runs daily: verifies + REFRESHES when >7 days old (refresh_access_token) and re-puts the Worker secret. App: 'Jesse social-IG', @jessechancewedding is Instagram Tester |
| `reject.json` | `{"slug": ["n", ...]}` frames to drop (child in frame, bad crop) |
| `films.json` | film excerpts `{id, couple, film, start, dur}` — check every second for children before adding |

## Rules (inherited from jessechance-2026/CLAUDE.md)
- Photos come ONLY from albums Jesse approved on the site. The model never picks a gallery; it may only reject.
- No children in any frame — films especially ([redacted] has kids at ~4:40).
- Captions: published facts only. Never AI / hand-edited / star ratings / review counts / prices / naming who's in a frame.
- Instagram's API can't attach library/trending sounds, so photo reels have Pixabay music baked in (Jesse chose free royalty-free). Never use a "Content ID Registered" track.

## Not done (needs Jesse)
- CONNECTED 2026-10-21 (verified with an unpublished test container -> FINISHED). Posting happens only on Jesse's Approve tap.
- If the token dies (code 190): regenerate at developers.facebook.com -> app -> Instagram API -> API setup with Instagram login -> Generate token. On Android, turn OFF Instagram's "Open supported links" first or the login opens the IG app.
- Gmail alerts on failure only work after `gmail.sh auth`; until then failures are macOS notifications + `status.json`.

## Storage (2026-10-22)
`reels/out` and `reels/site` are SYMLINKS. Currently -> `reels/local-data/{out,site}` (internal disk) because
launchd jobs block on an invisible macOS "removable volume" prompt. When Jesse has granted **Full Disk Access to
Homebrew Python.app** (`/usr/local/Cellar/python@3.14/3.14.2_1/Frameworks/Python.framework/Versions/3.14/Resources/Python.app`),
switch to his drive: `rsync -a local-data/out/ "/Volumes/Back Up/JC Reels/out/"`, then repoint both symlinks at
`/Volumes/Back Up/JC Reels/{out,site}` and kickstart com.jesseos.reels - `on_drive()` turns the 20s child-process
drive probe on automatically. HARD RULE: on that drive only ever write inside `JC Reels/`.
Declines: Worker status `replacing` -> com.jesseos.reels.watch (10 min) -> declined.json ban -> new reel -> /api/replaced.

## v4 edit engine + review page + weekly email (2026-10-22)
- engine.py v4: subject-aware camera (faces -> push-ins drift to them, landscape pans LAND on them, crops clamped
  inside the photo), 'settle' snap-in opener, accents (push/zoom/flash) on DOWNBEATS via Edit.on_bar, synthesized
  whoosh/hit SFX (write_sfx, no licensing) mixed under music then loudnorm -14, hooks visible on frame 0 (Block lead),
  loop ends pushed-in on the opening frame, text placement scans the safe zone every 40px and shrinks type
  (1.0/0.82/0.68) before it will cover a face. Bump ENGINE_VERSION to re-render unapproved days; APPROVED days stay frozen.
- Review page = Instagram Reels viewer replica (templates/card.html + page.html, avatar.jpg from the Graph API):
  header, side icons, avatar + 'jessechancewedding and <collab>' + Follow, caption with '... more', audio marquee.
  CSS gotcha: `.btn{display:block}` beats the hidden attribute -> keep `[hidden]{display:none!important}`.
- weekly_email.py (LaunchAgent com.jesseos.reels.email: Fri 09:00 summary, Sun 17:00 nudge only if unapproved).
  Self-only Gmail SMTP with an App Password in Keychain `gmail-app-password` / you@example.com.
  No Gmail API client exists on this Mac; Cloudflare Email Sending returns Unauthorized 2036 and would add senders
  to a p=reject domain.

## State 2026-10-22 (read this first in a new session - don't re-explore)
- 5 slots/day from 2026-10-26 (plan.py WEEK/SLOT_TIMES, spec_for_slot); legacy approved 7pm reel = slot 4 to Nov 1.
- Formats: story/fast/venue/tips/funny (viral.json 32 tips, 15 funny), filmreel (filmlib), review (reviews.json verbatim),
  offer (prices parsed live from site packages.html), burst (bursts/ + assets/burst_intro.mp4 = Jesse's dial clip).
- Films: 13 masters on '/Volumes/Back Up/JC Reels/films'. Screened+verified (filmlib/screen.json verified=true): [redacted],
  [redacted], [redacted], [redacted], Feb-19th. NOT yet screened: Copy-of-Final, Copy-of-UPDATED, Copy-of-film, FILM-2.0,
  Gemma-Luke, [redacted], [redacted], aimee-dane. Screening = film_scan sheets -> whitelist -> film_verify.py 3-frame pass
  -> verified=true -> 'REELS_INTERACTIVE=1 film_clips.py prewarm'. Mid-frame pass alone missed a child once.
- Storage 20:23: launchd test STILL hangs on the Back Up drive (Python FDA not effective) -> out/site/filmlib back on INTERNAL (local-data); copies remain in 'Back Up/JC Reels'. Film masters only on the drive (interactive screening only). Re-test with a throwaway LaunchAgent before moving again.
- (old) Jesse granted the Back Up drive. /tmp/move_to_drive.sh moves out/site/filmlib media to 'Back Up/JC Reels'.
  LaCie drive (/Volumes/LaCie, 931GB) = free for us to use (Jesse 2026-10-22).
- Not built: vow/speech-line reels (Whisper). Jesse wants BTS phone clips in rotation when he supplies them.
- CREDITS: Jesse is cost-sensitive. Avoid reading images unless needed for child-safety QC; batch work; start fresh sessions.

## 2026-10-23 changes (Jesse: "not professional enough")
- KV QUOTA INCIDENT: free KV 100k reads/day blown -> Worker 429 until 00:00 UTC. Cause: /api/state did 2 reads x every
  slot and the page polled every 5s while a reel was 'replacing'. Now: page + Mac read ONE key `snap` (patched on every
  write, rebuilt hourly at :07 by cron); cron never reads a slot before its date and only writes `pending` on change;
  page polls 30s busy / 120s idle and STOPS when the tab is hidden. Free limits: 100k reads, 1k writes/day.
- Decline watcher looped all night: a stale partial render dir (only reel.tmp.mp4, from the disk-full incident) made
  publish.py refuse -> /api/replaced never called -> re-render every 10 min. publish.py now skips a partial dir when the
  slot has a finished reel; watcher failures are logged; daily run WAITS (<=90 min) for the lock instead of silently
  skipping (missed 05:30 on 10-23).
- Reviews: ONLY over the reviewer's own wedding (reviews.json "couple": slug, added only when Jesse confirms).
  Unmatched -> slot falls back to a story. Candidates to confirm: Jade->[redacted], Ny->[redacted], a Jessica->[redacted],
  kirsten->[redacted] (film only).
- Bursts: >= 10 frames (MIN_BURST) and boomerang playback max 2x (5-frame burst looped 7x = "same photo over and over").
- plan.spec_for_slot: no couple/film (all excerpts of a film = one couple) twice within 3 days, incl. fixed approved
  daily reels ahead. Warm-up guards the previous 6 days so neighbours agree (_G memo).
- Jesse keeps 5/day, keeps all formats incl. funny ("good if done well"), kept the 2 scheduled funny reels.
- Google: gmail.py SCOPES now + drive.readonly + calendar.events (one consent). Needs Jesse to create the OAuth
  Desktop client (Gmail/Drive/Calendar APIs enabled, app PUBLISHED to avoid 7-day expiry). Phone consent: he pastes the
  failed localhost:8765 redirect URL back; curl it on the Mac while `gmail.sh auth` waits.
- The Google Drive films = the 13 masters already downloaded (films_drive.json). 8 still unscreened.
- (later 10-23) Reel openers must be the COUPLE: photos_for swaps a non-couple hero ([redacted] = bridal party) for the best
  couple+landscape frame (couple_shot() on alt text). Film openers: plan.opener_score (2 faces +2, face >22% frame height -2,
  + brightness; cache filmlib/opener.json). Bursts: couple-only (screen note regex) and >= 10 frames -> steph-03, steph-10.
- USE .venv/bin/python for anything touching engine/plan - system python3 has no cv2 and detect_faces silently returns [].
- Funny bank replaced by 7 Codex-written scripts (funny2-*; old bank kept as funny_retired_2026_10_23). Tone: wry/premium,
  joke on the photographer or the light, never the couple.
- daily.py: if /api/state can't be read, existing renders are NOT touched (was: re-render everything incl. approved).
- Google: Jesse connected claude.ai connectors (Gmail, Drive, Calendar, Docs, Sheets) - available in NEW sessions. Reminders
  -> Google Calendar events. gmail.py OAuth path unused. Codex has its own Google connection too.
- Codex delegation pattern: `codex exec --skip-git-repo-check -s workspace-write -C /tmp/<dir> "<prompt>"`, ask for a JSON file
  in that dir, review before merging. Jesse: use Codex/ChatGPT for work not worth Claude credits.
- Reviews: Jesse can't match first names to couples (2026-10-23). So NO review reels for now (slots -> stories). Idea for a
  new session with the Gmail connector: Google Business "new review" emails carry the reviewer's full name -> propose
  matches to Jesse. Alternative he hasn't chosen: quote on a plain brand card (no wedding photo).
- Review reels (Jesse 10-23): quote with NO name over any film footage -> plan.review_spec/_review_on (wide shots under the quote, close-up under CTA, '…' if excerpt starts lowercase, shade 0.8). filmlib/shot_flags.json (Codex visual screen) excludes drinking/child/unflattering shots from film + review reels. New shared-Drive films: films_drive_shared.json (12 highlights downloading 10-23; NOT screened yet).
- RESTYLE 2026-10-23 (Jesse's 5 reference reels; Codex brief /tmp/ref-reels/brief.md - copy kept in reels/docs if saved):
  engine.CLEAN=True -> photos static + hard cuts, no whoosh/hit SFX (film clips keep motion/dissolves); titles upright
  Cormorant 500; hooks = one statement (+1 small line); funny text = line_block (no white pills); plan.varied() drops
  near-duplicate frames by alt-text overlap. DM-us CTA kept on tips/highlights (Jesse OK'd).
- New recipes: sdcard (A, 7.5s, 13 frames, SD-card prop, mood groove) Tue.1 + Sun.5; little (B, 9s, 6 small moments of
  one wedding mono->colour, CTA last) Thu.1 + Sat.3. Replaced a photo, a burst and an offer slot.
- Music: harvest.mjs queries now modern cinematic/indie + moods groove/playful (funny -> playful); title blocklist
  (child/cartoon/wedding march...). Chrome on :9455 sometimes has no tab -> curl -X PUT 'http://127.0.0.1:9455/json/new?about:blank'.
- AI b-roll for recipes C/D/E: no genuinely free + commercial + unwatermarked + >=1080p AI video exists (Oct 2026) ->
  use REAL Pixabay stock footage (free commercial, no attribution) - fits Jesse's rule (non-wedding footage only).
- Codex has a ChatGPT usage cap (hit 08:00, resets 12:19) - don't assume it's always available.

## NEXT SESSION START HERE (handoff 2026-10-23 09:15)
Done today: KV-quota fix, restyle (CLEAN), recipes A sdcard + B little in WEEK, 43-track music (soft/upbeat/groove/playful),
nameless review reels over film (6.5s floor), shot_flags.json, 12 shared-Drive films downloaded (UNSCREENED), drafts
Oct 26-Nov 1 rendered + published 09:13, no fails. Jesse is reviewing the page.
TODO, in order:
1. Recipes C ("The camera" -> "The photos", 8.4s), D ("I'M A PHOTOGRAPHER but I'm also a..." labels, 8s),
   E ("The gallery is sent." / "Me, waiting for your reaction.", 6.8s) - spec in reels/docs/reference-reels-brief.md.
   B-roll = REAL Pixabay stock video (free commercial, no attribution) via headed Chrome on :9455 (open a tab first
   with curl -X PUT 'http://127.0.0.1:9455/json/new?about:blank'); /tmp/stock-probe/probe.mjs is a starting point.
   Shots: hands lifting a mirrorless camera; hands packing camera gear into a bag; fingers drumming beside a laptop.
   Store under reels/assets/broll/ with a licence note. Then add to WEEK + render + QC one each.
2. Screen the 12 new films (films_drive_shared.json -> filmlib scan/whitelist/film_verify 3-frame pass) - children!
   Ask Jesse if westmirrorweddings films ([redacted] v1.0, [redacted]) are his to use.
3. Reminders via Google Calendar connector (now available in new sessions).
Cost: Jesse is credit-sensitive. Don't print big files (use grep -n / sed -n ranges). Use Codex for vision/research
(ChatGPT plan; it has a usage cap).

## 2026-10-23 (afternoon) - Drive footage, recipes C/D/E, 11 films verified (Jesse away until ~10-30)
- DRIVE INVENTORY: every non-owned video in Jesse's Drive (576) -> reels/local-data/drive_shared_videos_2026-10-23.json.
  The earlier "shared" fetch only got 12. claude.ai Drive connector downloads cap at 10 MB -> use anonymous
  drive.usercontent URL (link-shared files only) or rclone (installed ~/JesseOS/workspace/bin/rclone; consent
  listener `rclone authorize drive` drive.readonly, waiting for Jesse's phone consent - see below).
- Anonymous Drive downloads hit "Quota exceeded" after ~6 GB. reels/drive_pull.sh = paced resumable downloader
  (queue local-data/pull_queue.json, log drive_pull.log, backs off 20 min -> 2 h). Running detached (nohup).
  Queue: [redacted] raw (185 Sony clips ~90 GB -> /Volumes/LaCie/JC Reels/raw/[redacted]/{2,3}) +
  [redacted] Continuous Film 17 GB (-> Back Up/JC Reels/films). 7 raw clips + DJI WAV done so far.
- LOGIN-ONLY (not link-shared): Lewis 'Highlight film.mov' (10/07/25, id 1z7Z5xylbuKaVc0_S7VJ0BNdZORgKT8mh),
  [redacted] (westmirror, 1vkO9yfNzA9MnBD2UwbKO2BWFO4UKvahZ), shared drive 'Drive' 0AGow542vUQTHUk9PVA (July 2025
  raws: folders 1/2/3/Groom + Bride.MP4 43 GB, ~200 GB, couple unknown). Need rclone token (Jesse pastes the
  127.0.0.1:53682 redirect URL from his phone) -> `rclone config create gdrive drive scope=drive.readonly token=...`.
- Jesse 10-23: EVERYTHING in his shared Drive is his to use (incl. westmirrorweddings: [redacted], [redacted]).
- New long-form (indexed, NOT whitelisted - for future vow/speech reels): 251025-ceremony ([redacted]),
  Ceremony.mov + Speeches.mov (Lewis Sep 2026), [redacted]-Ceremony, [redacted] full ceremony. Speeches.mov = 2 shots.
- FILMS: 11 more verified (1st pass mid-frame + film_verify 3-frame, notes in screen.json): Highlight (Jacob &
  Taylor 29/11/25 - names from title card), [redacted], [redacted], [redacted] (MANY kids - tight whitelist),
  Jess-and-Brent-v1.0, [redacted]-High-Res, [redacted] highlights, [redacted] (kids), finak ([redacted], Barrett
  Lane), Morgan-Kirra-Showreel, Ruth-stuart (church ceremony, altar-server child - tight). 16 verified, 663 shots.
  Backup of screen.json before: local-data/screen.json.bak-2026-10-23. Final.mov == Copy-of-Final.mov (skip).
- RECIPES C/D/E built (plan.camera_spec/photographer_spec/waiting_spec; engine.build_camera/build_photographer/
  build_waiting, broll_clip). Stock inserts in assets/broll (Pixabay Content License, LICENSE.md + sources.json).
  WEEK2 rotation from 2026-11-02 (Mon funny->waiting, Wed photo->camera, Fri tip->photographer); the approved
  week keeps WEEK. Type enlarged vs brief (76->120 px etc.) - brief sizes read tiny at phone size. D picks a
  film shot where heading + label rows cover no face (cache filmlib/photog_fit.json); ceremony shots excluded.
  Previews: local-data/creative-previews/cde-2026-10-23/ (rendered, QC'd: 1080x1920 30fps, -14 LUFS, no silence).
- TIKTOK (2026-10-23, Jesse chose option 1 = inbox drafts): tiktok.py + LaunchAgent com.jesseos.reels.tiktok (5 min).
  Sandbox app "JC Reels" (client key sbaweml4bvmlbzqgkp; key/secret + tokens in Keychain jc-reels-tiktok; access 24 h
  auto-refresh, refresh 365 d). Worker: /tiktok/callback/ (code -> KV 60 min), /<SHARE>/api/tiktok_code, /legal/privacy|terms/,
  /app-icon.png (assets/app-icon-1024.png copied by publish.py). PER_DAY=2 approved slots by PRIORITY (filmreel first),
  sent at their post_time to Jesse's TikTok INBOX (he taps Post); sent log local-data/tiktok_sent.json; TikTok caption ->
  <reel dir>/caption_tiktok.txt (inbox API takes no caption - not yet shown on the review page: TODO copy button).
  First test draft OK 18:3x (SEND_TO_USER_INBOX). NEXT: Direct Post audit (production app, demo video, privacy UI) for
  public auto-posting; then switch upload() to /v2/post/publish/video/init/. rclone remote 'gdrive' (drive.readonly) uses
  rclone's retiring shared client_id - make our own before it dies.
- 2026-10-24 viral-format research (Jesse: "find the best performing wedding photography reels and copy them"):
  biggest reported hits are photographer-BTS moments (Briggs rainbow ~20M, film-rocks 2.4-6M, guest-camera 14M) -
  need footage of Jesse working (ask; also check Lewis raw footage for BTS of Jesse); "POV: your photographer took it
  TOO seriously" ~32M; reaction-promise hooks ("Watch her face."). Built recipe F reaction (plan.reaction_spec,
  hand-picked filmlib/reactions.json - hook names only what is visible) and G trailer (plan.trailer_spec: 4 DISTINCT
  sharp couple shots via plan.sharpness -> filmlib/sharp.json, letterbox + black title cards; engine.build_trailer).
  WEEK2: Tue.2 + Sat.2 tip -> reaction, Thu.4 funny -> trailer. Previews local-data/creative-previews/fg-2026-10-24/.
- Recipe H BEFORE/AFTER (2026-10-24): source = ~/Projects/sculpt-training/drive4/{before,finals-all} (3356 camera-JPG vs
  edit pairs, 4 weddings). Only pairs whose final is a PUBLISHED site photo (dHash match -> local-data/beforeafter_matches.json;
  47 pairs: [redacted], [redacted], [redacted]; [redacted] not on the site). beforeafter.py prep aligns camera frame ->
  site photo (ORB+CLAHE similarity), one face-centred 9:16 crop for both, pre-renders wipe clips assets/beforeafter/*.mp4
  (+index.json, sorted by edit delta). plan.beforeafter_spec: 3 different scenes from one wedding, reject.json respected.
  WEEK2: Wed.3 tip -> beforeafter, Sun.1 photo -> beforeafter. Don't unpickle drive4/aligned-cache (*.pkl).
- STORAGE 2026-10-24: launchd probe (Python FDA now effective) reads/writes BOTH drives fine -> out/, site/, filmlib/{proxies,
  shots,clips}, local-data/creative-previews now symlinks into /Volumes/LaCie/JC Reels/ (local-data/move_to_lacie.sh).
  daily.DRIVE = parent of the out/ symlink target. LaCie is exFAT: NO hard links -> publish.py copies on link failure.
  Internal disk was at 0.2 GB (05:30 run aborted); now ~10 GB free. Long-form/unscreened proxies in LaCie/JC Reels/proxies-*.
- publish.window_end extends to already-rendered later weeks (cap 21 days) - `daily.py --ahead 16` showed Nov 2-8 early.
- plan.filmreel_spec only uses shots >= 1.9 s (Morgan-Kirra showreel quick cuts made a 4.7 s reel).
- Review page (2026-10-24): videos use data-src; IntersectionObserver 'near' (rootMargin 150%) attaches src and UNLOADS far ones - phones cap <video> players (73 reels -> 'everything paused'). Probe: max 3 loaded, last reel plays.
- LEARNING LOOP 2026-10-24 (Jesse: "train yourself to make viral reels"): ig_learn.py (LaunchAgent com.jesseos.reels.learn
  05:10) pulls IG insights for every reel (views, reach, shares, saves, ig_reels_avg_watch_time), maps our posts via Worker
  media_id -> local-data/posted_formats.json (persists past pruning), scores formats vs account median ->
  local-data/format_scores.json. plan.adapt(): odd ISO weeks swap a proven-weak format (n>=3, score<0.6) for the best
  proven one (score>=1.0); even weeks explore. Account history (37 reels): Jesse's face-cam skits + BTS win (2.8-5.8k views,
  8-12 s watch, most shares); couple slideshows + our photo reels lose (360-800, 3.4-4 s).
- Recipe I IMAGINE: assets/imagine/jesse_facepalm.mp4 (his 5.8k-view intro, audio stripped) + dark band hiding baked
  '$2999' (stale price) + price-free copy, then 9 photos of one couple. Fri.4 in WEEK2. NEEDS: more face-cam reaction clips
  from Jesse (no text) - one intro repeated weekly will wear out.
- Pixieset: fetch-gallery.mjs downloads any gallery by URL; Gmail has 200+ Pixieset notifications naming collections but NO
  links. Full list needs the Pixieset studio dashboard (Jesse login) - asked 2026-10-24.
- PIXIESET FULL ACCESS 2026-10-24: login in Keychain (service 'pixieset', account you@example.com); session lives in
  the pixieset Chrome profile (:9444). Dashboard API (no rate-limited client pages): /api/web/dashboard_listings?page=N
  (239 collections, url_key), /api/web/collections/<id>/galleries (sets), /api/web/galleries/<set>?expand=photos
  (path_xxlarge, filename, capture_date). pixieset/api_manifest.mjs -> LaCie/JC Reels/pixieset-all/manifest.json
  (156,517 photos, 203 collections; 36 skipped: tests/travel/raws/sneak peeks/newborn). api_download.sh = resumable
  6-way CDN download -> pixieset-all/<url_key>/<set>/<rank>_<file>.jpg (~8 h, ~130 GB). The old paced client-page queue
  (pixieset/galleries -> LaCie/JC Reels/pixieset) is superseded. ALL of these are delivered client galleries: Jesse
  approved reel use 2026-10-24, but EVERY frame still needs the child screen + cull before any reel uses it.
- COMPETITOR RESEARCH 2026-10-24 (Jesse: research OTHER people's high performers, not his): 262 TikToks from 5 wedding-
  photographer hashtags; stats for 66 (TikTok blocks the rest) -> reels/local-data/competitor_tiktok_2026-10-24.json.
  Top: photographer camera trick 12.4M (2,946x followers, 6s), Briggs excited-photographer 6.1M, lens-swap-over-water
  gimmick 4.0M, cinematic film excerpt 3.8M (4.1% share+save), 'photographed the most beautiful wedding yesterday 🥹'
  5-s photo montage 1.5M (382x followers), 'Which photo is your favourite? 🥹' 8-s 320k (3% shares). NEXT: download
  top ~15 (yt-dlp hung; use browser video src), frame-study, build the photo-only ones (5-s 'most beautiful wedding
  yesterday' montage; 'which is your favourite' numbered picks) + ask Jesse for camera-trick/BTS clips.
- WEBSITE POSTS PROJECT: plan + state in ~/Projects/jessechance-2026/tools/POSTS_PLAN.md (start there).
- 2026-10-25 PHOTO-ONLY COMPETITOR FORMATS: recipe J `beautiful` (plan.beautiful_spec / engine.build_beautiful, 5.5s:
  one wedding, 11 x 0.42s + 0.9s closer, "Photographed the most / beautiful wedding" on screen - 'yesterday' DROPPED,
  only true the day after a wedding) and recipe K `favourite` (plan.favourite_spec / engine.build_favourite, 9.3s:
  6 numbered frames x 1.2s, question in the top band, numerals in the band below, then a 2x3 numbered grid
  local-data/fav-grids + "COMMENT THE NUMBER"). Frames: plan._one_wedding = approved album, varied() + image dHash
  _distinct() (alt-text dedupe missed two near-identical pampas poses). In rotation via WEEK3 from 2026-11-09
  (Fri.5 photo -> favourite, Sat.1 photo -> beautiful); Nov 2-8 untouched. Previews: local-data/creative-previews/jk-2026-10-25/.
- WEBSITE POSTS: first 5 built as private preview (posts-preview.jessechance.pages.dev) - see
  ~/Projects/jessechance-2026/tools/POSTS_PLAN.md 'STATE 2026-10-25'. Those 5 albums are NOT in reels catalog.json until
  Jesse approves and they go live.
- 2026-10-25 EXPOSURE GATE (Jesse: "too dark, shouldn't have gotten through"): run ~/JesseOS/workspace/pixieset/exposure.py
  (reels venv) on every frame chosen for a post OR reel. Reject when face luma < 105, or no face and centre-subject luma < 105,
  or > 35% near-black - then LOOK at the flagged ones (bright wides can trip it). Calibrated on his 3 examples: backlit couple
  (face 54), cow through dark gate (subject 89), couple on shaded bench (face 68). Dark sheds, night/flash dance floors and
  moody overcast roads all count as too dark for him.
- 2026-10-25 EXPERIMENTAL REELS TAB: review page pill "Experimental reels · N new" -> previews/ (local-data/creative-previews/
  index.html: New section, then 'Earlier experiments' (cde/fg/h/i, preload=none), then Round 2 tips). publish.py counts
  videos above "Earlier experiments". J/K picks now gated by plan._bright() (cache local-data/exposure_cache.json) and
  couple-required in every favourite frame but the detail; _distinct min_bits 18. Bright frames per live album:
  tayla 22/24, danja 13/18, steph 10/20, nyomi 9/13, jade 8/25, melissa 8/25, nat 8/15, josie 8/16, jamie 7/13,
  [redacted] 3/15, shona 2/17 -> other recipes (photo_pool) are NOT gated yet; ask Jesse before gating globally.
