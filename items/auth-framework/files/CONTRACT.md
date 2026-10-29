# Claude authentication monitoring repair

- Trigger: existing Remote Control check every 5 minutes; existing auth keepalive every 6 hours and auth watchdog daily. No additional schedule.
- Goal: never mark an expired or empty Claude credential healthy; warn on the existing phone channel within 48 hours of refresh expiry.
- Scope: inspect only the Claude Code Keychain item in memory, return non-secret metadata, and use existing alert channels. Never write credentials or initiate a model request.
- Verifier: fixture tests for expiry boundaries, missing tokens, malformed data and timeout; shell checks for no healthy heartbeat on auth failure; real launchd execution.
- Budget: one Keychain read per tick, 10-second timeout; existing phone alert capped at 6 hours. No model tokens or paid APIs.
- State: existing logs, durable alert queue and Remote Control heartbeat. An unknown result must not emit a healthy heartbeat.
- Stop/escalate: expired, missing or unreadable credentials require the official `claude auth login --claudeai` flow. Do not restart working sessions repeatedly or copy credentials between applications.
