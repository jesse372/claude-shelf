# ontap-api — accounts and per-brewery boards

A **second** Worker, separate from the one that publishes the original board. That one
writes a single tap list to a GitHub repo and has been running in a shed for days; it
must keep working, for free, whatever happens here. Nothing in this directory touches it.

## Why it looks like this

**Boards are public URLs.** A brewery's tap list is served from `/b/<slug>.json` with no
sign-in. The slug is long and random rather than secret. That keeps a board a cacheable
static read: free to serve, works when the venue's wifi drops, and a Fire Stick can never
be logged out of it.

**The browser does the password work.** Workers' free plan allows 10ms of CPU per request,
and a password hash worth having costs far more. So the browser derives an `authKey` from
the password with 250,000 PBKDF2 iterations salted with the email address, and only that
key is sent. The server applies a cheap second pass with a random per-user salt before
storing. The plaintext never leaves the device, and a stolen database still cannot be
cracked without redoing 250,000 iterations per guess — all without a paid plan.

**Conflict detection lives on the server.** Every save carries the `rev` it was based on
and is refused with 409 if the board has moved on. Two people with the editor open cannot
silently overwrite each other, which is exactly what kept happening on the single-file
version.

## Running it locally

No Cloudflare account needed:

```bash
cd api
npx wrangler d1 execute ontap --local --file=schema.sql
npx wrangler dev --local --port 8787
```

## Deploying (when you're ready)

```bash
npx wrangler d1 create ontap          # put the printed id into wrangler.toml
npx wrangler d1 execute ontap --remote --file=schema.sql
npx wrangler deploy
```

Free tier covers D1 (5GB, 5M reads/day) and Workers (100k requests/day) — no fixed cost
until there are real customers.

## Routes

| | |
|---|---|
| `GET /b/:slug.json` | the tap list — public, cached 30s |
| `POST /v1/signup` | `{ email, authKey, brewery }` |
| `POST /v1/login` | `{ email, authKey }` → `{ token, expires }` |
| `POST /v1/logout` | |
| `GET /v1/me` | |
| `GET /v1/board` | → `{ data, rev, updated }` |
| `PUT /v1/board` | `{ data, rev }` — 409 if `rev` is stale |

## Plans and billing

Allowances live in one table at the top of the Worker (`PLANS`) and are enforced server
side. Exceeding one returns **402** with a `plan_limit` code the editor acts on.

A Stripe webhook at `/v1/stripe/webhook` flips a brewery between `pro` and `free`. Its
signature check is the only thing protecting it, so it is verified properly: HMAC over
`timestamp.body`, compared in constant time, and anything older than five minutes is
refused so a captured request cannot be replayed. **With `STRIPE_WEBHOOK_SECRET` unset it
refuses everything**, which is the safe default.

It must read the raw body before anything parses it — a request body can only be read
once, and having the JSON parse run first made the endpoint unreachable while still
appearing, from outside, to reject things correctly.

## Password reset

`/v1/reset/request` always answers the same way whether or not the address has an
account, so it cannot be used to discover who your customers are. The link is **never
returned in the response** — only emailed, or logged where no provider is configured.
Tokens are single use, expire in 45 minutes, stored as a hash, and using one signs the
account out everywhere else.

Email sits behind one function. Set `RESEND_KEY` and `MAIL_FROM` and it sends; with
neither it logs and reports that it could not.

## Still to do

- A checkout link (needs a Stripe price id and key) — the webhook end is done
- Deploy: `wrangler d1 create`, `wrangler deploy`, and the secrets above
