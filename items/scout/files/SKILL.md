---
name: scout
description: "Fan out parallel investigation across many sources, then synthesize ONE answer — instead of serial-searching the main thread. Use for breadth-first 'check everywhere / look through X, Y and Z' asks spanning multiple places (repos, local notes/vault, external drives, the desktop, the web). Shared by Claude (/scout or $scout) and Codex ($scout). TRIGGERS: 'scout', 'check everywhere', 'look through all', 'search across', 'fan out', 'check many places', 'look in X and Y and Z', 'go check all of'."
version: 1.0.0
pinned: false
metadata:
  tags: [Search, Orchestration, Meta]
  related: []
---

# Scout (parallel fan-out)

Turns a breadth-first "go check everywhere" request into 2–6 **parallel** investigations that each return
a small distillate, then one synthesized answer — instead of a slow serial march through the same sources
in a single thread. This is the day-to-day antidote to context-rot from long serial-search sessions.

## When to use
- The ask spans **multiple independent sources/angles** ("look through these repos and my notes vault and
  the external drive and the desktop…").
- You catch yourself about to send 3+ sequential "check here / now check there" turns.
- NOT for a single-location lookup (just read it) or a task needing shared evolving context across angles.

## Quick reference
| Environment | How to invoke | Parallel primitive |
|---|---|---|
| Claude Code | `/scout <question>` or this skill | `Agent` tool — `Explore` (read-only) / `general-purpose`, sent in ONE message |
| Codex | `$scout <question>` | spawn parallel subagents / delegated investigations |

## Procedure
1. **Decompose** the question into 2–6 INDEPENDENT angles/surfaces. Name them explicitly.
2. **Dispatch in parallel** (one message / one batch), each with a tight bounded brief and instruction to
   return a **~1–2k-token distillate** (conclusions + cited locations), NOT raw file dumps. Keep mechanical
   search on a **cheap model** (e.g. `model: "haiku"`/`"sonnet"`).
3. **Synthesize ONE answer**: the finding, which surface each fact came from, and flag anything unverified
   or contradictory between angles.

## Pitfalls
- **Shared-context tasks**: if angle B needs angle A's evolving result, don't fan out — that needs one
  thread. Fan-out is for INDEPENDENT angles.
- **Dumping raw output**: always instruct sub-agents to distill; raw dumps re-pollute the main context.
- **Over-fanning**: 2–6 angles is the sweet spot; more agents ≠ better and burns tokens.

## Verification
A good scout run ends with: one synthesized answer, every claim attributed to a surface, and no angle's
raw search transcript pasted into the main thread.

## Notifying yourself (optional)
This skill does not need to notify anyone — it returns its answer inline. If you wire scout into an
unattended/scheduled run and want a heads-up when it finishes, use a generic notifier instead of any
hosted chat/bot:

```sh
notify() {  # usage: notify "message"
  local msg="$1"
  osascript -e "display notification \"${msg}\" with title \"scout\"" 2>/dev/null
  mkdir -p ~/.claude/logs
  printf '%s\t%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$msg" >> ~/.claude/logs/scout.log
  # To also push to your phone, wire your own channel here, e.g.:
  #   curl -s -d "$msg" "https://ntfy.sh/<your-topic>"
  #   or a Telegram / email / Slack call of your choosing.
}
```

Any credentials such a notifier needs (bot tokens, ntfy URLs, SMTP creds) should come from your own
secret manager (macOS Keychain or 1Password) — see `~/JesseOS/workspace/security/README.md`. Do not
hardcode secrets in this skill.
