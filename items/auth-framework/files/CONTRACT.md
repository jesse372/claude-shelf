# Claude authentication monitoring repair

- Trigger: existing Remote Control check every 5 minutes; existing auth keepalive every 6 hours and auth watchdog daily. No additional schedule.
- Goal: never mark an expired or empty Claude credential healthy; warn on the existing phone channel within 48 hours of refresh expiry.
- Scope: inspect only the Claude Code Keychain item in memory, return non-secret metadata, and use existing alert channels. Never write credentials or initiate a model request.
- Verifier: fixture tests for expiry boundaries, missing tokens, malformed data and timeout; shell checks for no healthy heartbeat on auth failure; real launchd execution.
- Budget: one Keychain read per tick, 10-second timeout; existing phone alert capped at 6 hours. No model tokens or paid APIs.
- State: existing logs, durable alert queue and Remote Control heartbeat. An unknown result must not emit a healthy heartbeat.
- Stop/escalate: expired, missing or unreadable credentials require the official `claude auth login --claudeai` flow. Do not restart working sessions repeatedly or copy credentials between applications.

# YouTube upload access

- Trigger: existing auth keepalive every six hours; no extra schedule and no automatic uploads.
- Goal: after connection, refresh YouTube access and verify the channel binding, or report a failure.
- Scope: `youtube-upload/scripts/youtube.sh health --all --live` only. It can refresh each
  connected profile's existing OAuth token and read its channel. Never post a video, change consent, or broaden scopes.
- Verifier: health exits 0 with state OK and matching channel; missing/invalid access is not healthy.
- Budget: one subprocess per tick, 90-second wall-clock limit, no model calls. Dry-run reads
  metadata only. Skip an installation that has never completed connection.
- State: `~/.youtube-upload/profiles/*/channel.json` (or legacy base `channel.json`), mode-0600 token files, existing auth-framework log
  and durable alert queue. The token itself never appears in logs.
- Stop/escalate: no blind retries within the tick; desktop notification plus persisted alert
  capped at once per 24 hours asks for connectivity/access repair. New Google consent remains
  a user action. No claim that metadata-only inspection proves live access.
