# Shared task routing and allowance policy

Jesse's instruction, 2026-10-22: Claude and Codex should choose the suitable agent,
preserve scarce allowances, and send ordinary conversational tasks to ChatGPT where
possible without reducing quality. This is a standing routing preference for both agents.

## Choose before spending

1. Use a deterministic local command for straightforward extraction, formatting,
   calculations, linting and checks when an LLM is unnecessary.
2. Ordinary ChatGPT is the preferred destination for self-contained brainstorming,
   copy drafts, summaries and explanations that need no project files, secrets or
   local execution. No supported automatic ordinary-ChatGPT submission interface was
   found in this audit. Prepare a short, self-contained handoff for Jesse to paste;
   clearly say it is awaiting manual submission, not already running. Do not open a
   Codex/ChatGPT Work task and claim it saves Codex allowance: those share usage.
3. Use Codex by default for code, tests, filesystem work, integrations and automation.
4. Use Claude when its demonstrated strengths or available allowance justify the
   switch and it can meet the same acceptance criteria. Do not assume one brand is
   always better at reasoning or writing. Record the concrete reason for switching.
5. Jesse has authorized sensible two-way routing in this conversation. Treat this as
   standing approval for a bounded, read-only Claude fallback when Codex is low or
   unavailable and Claude has fresh confirmed capacity, with equivalent expected
   quality. The helper's --approve-claude flag may attest to this standing approval
   only for those cases. Difficult/expensive escalations outside that case still need
   task-specific approval. Never purchase credits, redeem resets, enable paid API
   fallback, or allow overages automatically.

## Check allowances and share evidence

Before each model handoff, check the current owner's supported usage display and
the intended recipient's available status, when available. Codex desktop exposes
get_usage_limits; Codex CLI exposes /status. Claude's interactive /usage display or
an actual rate-limit response can supply evidence. No supported machine-readable
Claude percentage CLI was established; do not scrape credentials or call undocumented
OAuth billing endpoints to invent one. Authentication status does not prove capacity.

Use `.agent-collaboration/usage-status.json` as a shared observation, not an authority.
Update it with the source and timestamp after fresh checks. An observation older than
15 minutes is stale for routing; unknown is not zero, available, or unlimited. Never
estimate credits from token counts, or assume allowance windows reset simultaneously.
The 15-minute rule is an instruction, not an enforced background monitor.

At 20% remaining in either relevant window, conserve capacity: smaller task scopes,
shorter context and no redundant reviews. At 10%, prefer the other provider only
when capacity and equivalent quality are established. At exhaustion, do not repeatedly
retry the same provider. Unknown recipient capacity means one approved bounded probe
or pause; no blind switching, no retry loop. A reset time passing means recheck, not
proof of restored capacity. Capacity is shared across sessions and can change.

## Handoff contract

Include task ID, goal, minimal context, acceptance criteria, allowed files/actions,
current allowance observations, reason for recipient choice, and return location.
Return a result with tests, remaining work and any usage-limit response. The parent
owns final integration. Do not launch the same task in multiple places to race results.

Use the installed delegate.py for read-only CLI handoffs, one unique ID per attempt.
Both agents read SHARED_CONTEXT.md. Delegated children return findings rather than
delegating again. If the parent must reroute, first confirm the prior task stopped.
Edits require separate worktrees and one owner, as described in shared context;
the current helper does not implement write handoffs. Preserve all existing safety,
approval, deployment and credential boundaries.

## Honest operating limits

This is a shared routing policy, not an autonomous credit-balancing service.
No background polling, undocumented quota API, ordinary-ChatGPT automation or new
paid service was installed. Codex's receiver test passed; Claude's quota prevented
the two-way live test. Refresh capacity and complete that test before claiming full
automatic interchangeability. An existing running session may need to reread this
file; instruction changes do not interrupt or remotely control other sessions.

Official usage reference: https://learn.chatgpt.com/docs/pricing
