---
name: media-inbox
description: Get video/audio into an agent's hands on this headless Mac and transcribe it offline with local Whisper. Solves "I have a video on my phone but Omnara/chat has no file upload" — paste a Google Drive share link (the Android path), any public video URL, or point at a local file. TRIGGERS: 'watch this video', 'transcribe this video', 'transcribe this audio', 'I cant send you the file', 'cant upload on Omnara', 'send you a video', 'here is a voice note', 'drive link', 'google drive link', 'what does this recording say', 'get this video to you', 'transcribe this recording'.
---
# media-inbox — get audio/video to this box, then transcribe it offline

This is a **headless Intel Mac mini** and Omnara has no file upload, so the job is
split in two: a **transport** (get the bytes here) and an **engine** (transcribe them).
The engine is transport-agnostic and fully tested; pick whichever transport fits.

## Transports, best first

### 1. Google Drive share link — the Android path (primary)
From the phone: share the video to **Google Drive**, then **Copy link**, and paste
that link to the agent. Then:
```bash
scripts/process-inbox.sh --url "https://drive.google.com/file/d/FILEID/view?usp=sharing"
```
**The link must be set to "Anyone with the link"** (Viewer is fine). Restricted links
cannot be fetched and the script says so explicitly rather than failing vaguely.
Handles all Drive URL shapes (`/file/d/…`, `?id=…`, `usercontent` download links) and
clears Google's "can't scan this file for viruses" HTML interstitial that large files
trigger — a naive `curl` silently saves that HTML page *as if it were the video*.
Drive **folder** links are rejected with a clear message; share the single file.

### 2. Any public video URL
```bash
scripts/process-inbox.sh --url "https://youtube.com/watch?v=…"
```
Uses `yt-dlp` (YouTube, TikTok, Instagram, X, …).

### 3. A file already on this Mac
```bash
scripts/process-inbox.sh --once /path/to/video.mp4
```

### 4. iCloud drop folder — OPT-IN, needs Full Disk Access
`~/Library/Mobile Documents/com~apple~CloudDocs/AI-Inbox/` still works **when an
agent invokes the drain** (Omnara has FDA, so it inherits access). It does **not**
work unattended — see the TCC section below. Enable the watcher only after granting FDA:
```bash
MEDIA_INBOX_ICLOUD=1 scripts/install.sh
```

## Where output lands
| What | Path |
|---|---|
| Transcripts (markdown) | `~/JesseOS/vault/60-inbox/media/transcripts/` |
| Most recent transcript | `…/transcripts/LATEST.md` |
| Timestamped subtitles | same dir, `.srt` beside each `.md` |
| Archived originals | `~/JesseOS/vault/60-inbox/media/originals/` |
| Run log | `~/JesseOS/vault/60-inbox/media/media-inbox.log` |
| Permanently failed | `~/JesseOS/vault/60-inbox/media/failed/` |

## Whisper model choice (4-core Intel i3, no GPU)
Runs at roughly **real-time on CPU** — a 10-minute video takes ~10 minutes.
Default `base`. `tiny`/`base`/`small` weights are pre-cached in `~/.cache/whisper`,
so it works fully offline.
```bash
MEDIA_INBOX_MODEL=small scripts/process-inbox.sh --url "…"   # more accurate, ~2-3x slower
```
Use `small` when the audio is technical (tool names, jargon) and accuracy matters.
Long videos: run it with `run_in_background` and poll `LATEST.md`.

## The TCC trap (the big lesson from building this)
**A LaunchAgent cannot read iCloud Drive, `~/Documents`, `~/Desktop`, or `~/Downloads`
without Full Disk Access.** Verified on this box — only `~/JesseOS`, `/tmp`, and
`~/Public` are accessible to a background agent.

The failure is *silent and actively deceptive*: `[ -d ]` and `[ -r ]` both return
**true**, `ls` fails with `Operation not permitted`, and a glob returns **zero
entries** — so a naive pipeline logs "inbox empty", looks perfectly healthy, and
never processes anything. `process-inbox.sh` now probes with a real `ls` and exits
loudly instead. **Any new automation touching those paths needs the same guard.**

Corollary: **QC must be judged from its launchd run, not a manual one.** An
interactive shell inherits the terminal's/Omnara's FDA grant and passes
misleadingly. Check `qc.cron.log`, not just your own invocation.

To enable unattended iCloud pickup you must grant FDA to `/bin/bash`
(System Settings → Privacy & Security → Full Disk Access) — which is broad, since
every launchd script then gets it. Prefer a transport that lands in `~/JesseOS`.

## Reliability (adopts `pipeline-qc`)
`media-inbox-qc.sh` runs light 2x/day (09:40, 21:40) and **deep** at 05:10.

| Stage | Repair | Notes |
|---|---|---|
| Core tooling | `brew install` | ffmpeg/ffprobe/whisper/brctl — critical |
| URL tooling | fetch standalone binary | yt-dlp — **soft**, never blocks the main path |
| Whisper model | force a weight download | keeps offline runs working |
| End-to-end | — | **deep only**: synthesizes speech, runs the real pipeline, asserts the words come back |
| Failed items | — | human-gate: anything in `failed/` |
| Disk hygiene | prune originals >60d | soft — videos are large |
| *(iCloud stages)* | | only registered when `state/icloud-enabled` exists |

An atomic `mkdir` lock guards concurrency and self-reclaims if a previous run died,
so a crash mid-transcode can't wedge the pipeline.

## Gotchas worth remembering (all found by testing, not by reading)
- `launchctl list | grep -q X` under `set -o pipefail` is a **false negative**:
  `grep -q` exits early, `launchctl` dies of SIGPIPE, the pipeline returns 141.
  Use an exact-match read loop. (Also: `com.jesse.mediainbox` is a *prefix* of the
  `-qc` labels, so substring matching lies too.)
- `grep -c . || echo 0` emits **`0\n0`** — `grep -c` exits 1 on zero matches, so the
  fallback fires *in addition* to its output. Use `wc -l`.
- A function returning a value via stdout must send its **logging to stderr**, or the
  log text gets captured as part of the return value.
- Never write pipeline output **inside** a `WatchPaths` directory — every success
  retriggers the watcher.
- Whisper returns **no text at all** for a sine tone, so smoke tests must use real
  speech (`say -o file.aiff "…"`).
- `brew install yt-dlp` fails on this box (root owns `/usr/local/share/man/man8`);
  use the standalone `yt-dlp_macos` binary in `~/.local/bin`.
- iCloud files on a headless Mac are dataless placeholders: detect via `stat %z`
  (logical) vs `stat %b` (allocated), materialize with `brctl download`.
