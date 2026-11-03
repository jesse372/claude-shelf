# Lash Photo Studio

A one-page phone website for a lash or beauty artist. Send a phone photo of a client's lashes, pick a look
(Soft studio, Warm luxe, Bright & airy or Moody editorial) and a shape, and about a minute later you get back
an Instagram-ready shot. **No OpenAI API bill:** a Mac at home does the edit with the Codex CLI signed in to
your normal ChatGPT plan, using Codex's built-in image tool.

The prompt forbids changing the lashes, eyes, brows or face. Only lighting, background, sharpness and a light
skin retouch are allowed, so the photo stays an honest example of the work.

```
phone ──▶ Cloudflare Worker + Durable Object queue (free) ◀── Mac polls ── codex exec -i photo ── ChatGPT plan
```

## Set up
1. **Website:** `npm i -g wrangler && wrangler login && wrangler deploy`, then
   `wrangler secret put ACCESS_CODE` (what you type on your phone) and
   `wrangler secret put AGENT_TOKEN` (a long random string).
2. **Mac:** install Codex (`npm i -g @openai/codex`) and run `codex login` with your ChatGPT account.
   Put the same token in `agent/.agent_token`, set your Worker URL in `agent/agent.py` (`BASE`),
   then try `python3 agent/agent.py --once`.
3. **Keep it running:** add a LaunchAgent with `KeepAlive` that runs `python3 agent/agent.py`.
   Use **`ProcessType` Interactive, not Background**: macOS throttles Background jobs so badly that each edit times out.

Each edit takes about 1 minute and uses your ChatGPT/Codex allowance. Photos are deleted from the queue after 24h,
and from the Mac right after upload. If the Mac is off, the page says so and the photo waits in the queue.
