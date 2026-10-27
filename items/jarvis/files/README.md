# J.A.R.V.I.S — JesseOS Tactical Interface

A Batcomputer/JARVIS-style HUD for this Mac. Talk to Claude (voice or text) and it
**gets things done** — full tool access via the Claude Code CLI in headless mode.

**Open it:** http://localhost:1963

## What it does
- **Chat with full autonomy** — every directive is piped to `claude -p --dangerously-skip-permissions`,
  so it can read/write files, run commands, use all JesseOS skills & memory. Sessions resume
  across messages (`--resume`), so it keeps context until you hit NEW SESSION.
- **Push-to-talk** — hold the mic button or Space; audio is transcribed locally with Whisper.
- **Speaks replies** — edge-tts neural voice (en-GB-RyanNeural), falls back to macOS `say` offline.
  Toggle with VOICE.
- **Live HUD** — reactive arc-reactor orb (idle/listening/processing/speaking), tool-activity
  chips as Claude works, CPU/MEM/DISK/PWR readouts, session ID, clock.
- **ABORT** kills the running task; **EXEC**/Enter sends.

## Architecture
```
Browser HUD (public/index.html)
   │ SSE /api/ask ────► server.js ── spawn ──► claude -p --output-format stream-json --resume <id>
   │ POST /api/transcribe ─► voice skill transcribe.sh (whisper, local)
   │ POST /api/speak ──────► edge-tts → mp3 → browser playback (orb reacts via WebAudio)
   │ GET  /api/stats ──────► pmset / df / os module
```
Zero npm dependencies. Binds **127.0.0.1 only** — never expose this port (it runs Claude
with permissions bypassed).

## Always-on
LaunchAgent `com.jesseos.jarvis` keeps the server running:
```bash
launchctl unload ~/Library/LaunchAgents/com.jesseos.jarvis.plist   # stop
launchctl load   ~/Library/LaunchAgents/com.jesseos.jarvis.plist   # start
tail -f ~/.jarvis.log
```

## Files
- `server.js` — the bridge (Node, no deps, port 1963)
- `public/index.html` — the HUD (single file)
- `icons/` — 🦇 favicon + apple-touch-icon
- `.session` — current Claude session id (deleted on NEW SESSION)

## v2: app, speed, widgets
- **JARVIS.app** in /Applications — chromeless window, bat dock icon, own Chrome profile
  (grant mic once, it sticks). Auto-starts the server if it's down.
- **Speed**: token-by-token streaming (`--include-partial-messages`), whisper `tiny` for
  dictation, sentence-chunked TTS (first audio in ~1s), and a **FAST** toggle that routes
  to Haiku for instant answers.
- **Widgets** (left panel, refresh 60s, endpoint `/api/widgets`):
  - **UP BANK** — official API. Setup: get a token at https://api.up.com.au then
    `security add-generic-password -s upbank -a jesse -w 'up:yeah:yourtoken'`
  - **PORTFOLIO** — `portfolio.json` priced live via Yahoo Finance. Just tell JARVIS
    your holdings/trades in chat; it edits the file itself (system prompt teaches it).
  - **WEATHER** — Open-Meteo, auto-located.
  - **AGENDA** — macOS Calendar via ical-buddy. Install:
    `sudo chown -R $(whoami) /usr/local/share/man/man8 && brew install ical-buddy`

## Notes
- Mic requires browser microphone permission on first use.
- First voice reply needs internet (edge-tts); offline it falls back to `say`.
- One task at a time by design; ABORT clears a stuck one.
