# Agents on this machine
- Claude Code (and Codex, if installed) share the same context, skills and memory, all under `~/JesseOS/`.
- Skills live in `~/JesseOS/workspace/skills/` and are mirrored into `~/.claude/skills` and `~/.codex/skills`.
- Memory lives in `~/JesseOS/vault/50-memory/`.
- Two sessions must never drive the same job at once: check for a running process or lock before starting one.
- Secrets (tokens, passwords, API keys) live in `~/.authframework/secrets/` (mode 600) or the macOS Keychain.
  Never in this folder, never in a prompt, never in a log.
