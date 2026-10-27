---
name: voice
description: Voice-to-text and text-to-speech for this machine, shared by Claude Code and Codex. Speak replies aloud with free high-quality Microsoft Edge neural voices (edge-tts), falling back to macOS `say` offline; transcribe audio/voice-notes to text with local Whisper. Use to talk to the user out loud, read something aloud, transcribe a recording/voice note, or take dictation from the mic. TRIGGERS: 'say this out loud', 'read it to me', 'speak', 'text to speech', 'tts', 'transcribe this', 'voice to text', 'what does this audio say', 'dictate', 'take a voice note', 'listen to my mic'.
---
# voice — STT + TTS for your AI

Two abilities, both local-first and free:

## Text-to-speech (speak aloud)
```
~/.claude/skills/voice/scripts/speak.sh "Hello, this is your AI speaking." [voice]
```
- **Primary:** `edge-tts` — free Microsoft Edge **neural** voices (needs internet, no API key). Default voice `en-US-AriaNeural`. Much higher quality than `say`.
- **Fallback:** macOS `say` (offline) if edge-tts is unavailable or has no network.
- Good voices: `en-US-AriaNeural`, `en-US-GuyNeural`, `en-GB-RyanNeural`, `en-GB-SoniaNeural`, `en-AU-NatashaNeural`. List more: `scripts/voices.sh`.

## Speech-to-text (transcribe)
```
~/.claude/skills/voice/scripts/transcribe.sh <audio-file> [model]   # model: tiny|base|small (default base)
```
- Uses local **Whisper** (offline). Prints the transcript to stdout. Accepts wav/mp3/m4a/etc.

## Dictation (record mic → transcribe)
```
~/.claude/skills/voice/scripts/dictate.sh [seconds] [model]   # default 6s, base
```
- Records the default mic via ffmpeg, then transcribes. **Needs macOS microphone permission** for the terminal/Omnara app (System Settings → Privacy & Security → Microphone). List mic devices: `ffmpeg -f avfoundation -list_devices true -i ""`.

## How agents use this
When the user wants you to **talk**, call `speak.sh "..."`. When given an **audio file or voice note**, call `transcribe.sh <file>` and use the text. Keep spoken replies short and natural.
