# Security system
- **Secrets** (API keys, passwords, tokens) belong in YOUR own password manager (macOS Keychain,
  1Password, etc.) — never inline in files or scripts. This folder stores NO secrets.
- **auth-watchdog.sh** checks that your agents stay authenticated: Claude Code, Codex, and Omnara.
  It runs daily (LaunchAgent `com.jesse.authwatchdog`), writes `auth-status.json`, and pops a macOS
  notification if any of them needs a re-login.
