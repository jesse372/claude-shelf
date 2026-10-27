---
name: ai-video-pipeline
description: One-prompt AI YouTube video production — research a topic, fact-check every claim, write the script in Jesse's voice, chunk it for voice cloning, then render avatar video with motion graphics and visually QC the result. Stage 1 (research/fact-check/script/chunk) works today with no third-party keys. TRIGGERS: 'make a video', 'video script', 'write a script', 'ai video', 'avatar video', 'heygen', 'elevenlabs', 'voice clone', 'video pipeline', 'youtube video', 'script in my voice'.
---
# ai-video-pipeline — one prompt in, finished video out

Rebuilt from the transcript of Jesse's own video describing the workflow
(`~/JesseOS/vault/60-inbox/media/transcripts/`). Staged and resumable: each stage
reads the previous stage's directory and writes only its own, so any stage can be
re-run without redoing the expensive ones.

## Commands
```bash
scripts/run.sh <slug> "<topic or source URL>"   # run everything possible
scripts/run.sh <slug> --status                  # stages done + credential gaps
scripts/run.sh <slug> --redo 01                 # force a stage to re-run
scripts/01-script.sh <slug> "<topic>"           # just the script stage
```
Projects live in `~/JesseOS/workspace/video-projects/<slug>/`.

## The five stages

| # | Stage | Needs | Status |
|---|---|---|---|
| 01 | Research → fact-check → script in-voice → sub-minute chunks | nothing (uses the authenticated `claude` CLI) | **working, tested** |
| 02 | Voice: ElevenLabs clone, one generation per chunk | `elevenlabs` key + voice ID | blocked on credential |
| 03 | Avatar: HeyGen Avatar-5 render per chunk | `heygen` key + avatar ID | blocked on credential |
| 04 | Assemble: ffmpeg stitch + word-level timing + HTML/GSAP graphics via headless Chrome | — | pending 02/03 |
| 05 | Visual QC: extract frames, review them, re-render what's off | — | pending 04 |

Stages 2–5 are **deliberately not stubbed with fake success.** A pipeline that
reports "done" without producing video is worse than one that stops and says
exactly which key it needs.

## Why the chunking matters
The single most important trick from the source video: **ElevenLabs voice clones
drift over long generations.** So the script is split at sentence boundaries into
~55-second pieces (`CHUNK_WORDS` ≈ 137 at 150 wpm) and each is synthesized
separately. Stage 1 enforces two invariants:
- no chunk exceeds the drift cap (`CHUNK_WORDS + 30`)
- **the chunks concatenated reproduce `script.md` exactly** — checked with `diff`,
  and the stage refuses to complete if it fails. Otherwise the rendered video
  would say something different from what was fact-checked.

A short trailing chunk (usually the sign-off) is folded into the previous one when
the result still fits under the cap — it saves a TTS call and avoids a clipped tail.

## Fact-checking is a hard gate
Stage 1 writes `facts.md`: every claim, its figure, its source URL, and
VERIFIED/UNVERIFIED. Unverified claims must be **cut, not softened**. The verifier
only flags an actual table row (`^\|.*UNVERIFIED`) — matching the bare word also
hits the "claims CUT (unverified…)" heading, which means the opposite.

## Voice
`templates/voice-playbook.md` holds the style rules the script is written against.
Drop more real transcripts into `reference/transcripts/` and they're fed in as
voice samples automatically — more samples, tighter match.

## Credentials
Never in the repo. Read via `auth-framework`'s `cred_get` (env var → Keychain):
```bash
security add-generic-password -s elevenlabs -a api -w
security add-generic-password -s heygen     -a api -w
```

## Model choice
Orchestration defaults to `claude-opus-5` ($5/$25 per MTok). Override the script
stage where writing quality shows:
```bash
VIDEO_SCRIPT_MODEL=claude-fable-5 scripts/01-script.sh …   # $10/$50, top tier
```

## Hardware reality
This box is a **4-core Intel i3, no GPU**. Stage 1 takes ~3.5 min. Stages 4–5
(headless-Chrome frame capture + ffmpeg encode) will be slow here — Whisper alone
runs at roughly real-time. There is no faster machine available: every other node
on the tailnet belongs to another user, and this mini is a tagged guest.

## Platform gotchas that bite on this box
- **`/bin/bash` is 3.2.57** (macOS ships GPLv2 bash). No `mapfile`/`readarray`, no
  negative array subscripts (`${a[-1]}`), no `${var^^}`. All three silently
  no-op or error rather than failing loudly — collect arrays with a glob loop and
  index from the front; uppercase via `tr`.
- **`timeout` does not exist** (GNU coreutils; `gtimeout` isn't installed either).
- **`${!var}` indirect expansion is bash-only** — it breaks under zsh, which is the
  login shell here. Use `eval "printf '%s' \"\${$name:-}\""` when a file may be
  sourced from either shell.
- Logging goes to **stderr**, because stage functions return paths on stdout.
