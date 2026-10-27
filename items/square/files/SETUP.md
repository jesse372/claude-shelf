# square — one-time setup (~5 min, needs a browser)

Square has no API for minting its own credentials, so this first step is manual. You only
do it once.

## 1. Create an application

1. Go to <https://developer.squareup.com/apps> and sign in with the **same Square login
   that takes the Luxe Beauty bookings**. (If you sign in with a different account you'll
   get a token for an empty catalogue — the most common way this goes wrong.)
2. Click **Create app**, name it something like `jesseos-catalog`. Any answers to the
   onboarding questions are fine.

## 2. Copy the production access token

1. Open the app, and in the left sidebar make sure the environment toggle says
   **Production**, not Sandbox.
2. Under **Credentials**, copy the **Production Access Token** (starts with `EAAA`).

That token carries your own account's permissions, which includes the catalogue read/write
(`ITEMS_READ` / `ITEMS_WRITE`) this skill needs. Treat it like your Square password: it can
read and change your live business data.

## 3. Install it on this Mac

```sh
~/.claude/skills/square/scripts/square.sh install-token 'EAAA…'
```

It goes into the macOS Keychain under service `square`, account `token`, reachable headlessly
by authlib — the same path meta-ads and gmail use. It is never written into the repo.

## 4. Verify

```sh
~/.claude/skills/square/scripts/square.sh doctor
```

Expect your business name, the Yanchep location, `currency=AUD`, and a non-zero count of
appointment services. Then:

```sh
~/.claude/skills/square/scripts/square.sh services
```

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `401 UNAUTHORIZED` | Token was copied from the **Sandbox** tab, or has been rotated/revoked. Re-copy from Production. |
| `doctor` shows 0 services | Signed in as the wrong Square account, or the services live under a different merchant. |
| `INSUFFICIENT_SCOPES` | Token came from an OAuth flow without `ITEMS_WRITE`. Use the app's own Production Access Token. |
| Everything lands in `only_in_square` | Name mismatch between site and Square — read the plan's buckets, they name the offenders. |

## If you ever rotate the token

Re-run `install-token` with the new one. The keepalive (`auth-keepalive.sh`) probes it every
~6h and will alert if it starts failing, rather than letting you discover it mid price change.
