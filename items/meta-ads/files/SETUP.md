# meta-ads — one-time setup (~10 minutes)

You have a Business Manager, so we use a **System User token**. Unlike a personal token
(which dies every ~60 days), a System User token does not expire — set this up once and
the automation keeps working.

Do these steps yourself; they need a logged-in browser and cannot be done headlessly.

---

## 1. Create a Meta app (if you don't have one)

1. Go to <https://developers.facebook.com/apps> → **Create App**
2. App type: **Business**. Name it anything, e.g. `jc-ads-automation`.
3. In the app dashboard, **Add Product → Marketing API**.
4. Note the **App ID** (you don't need the secret for this).

> The app is just a container that issues the token. Nothing is published and no App Review
> is needed, because the System User will live in the *same* Business Manager that owns the
> ad account. (App Review is only required to manage ad accounts belonging to *other*
> businesses.)

## 2. Create the System User

1. <https://business.facebook.com/settings> → **Users → System Users** → **Add**
2. Name: `ads-automation`. Role: **Admin**.
3. Click it → **Add Assets** → **Apps** → pick the app from step 1 → enable **Manage app**.
4. **Add Assets** → **Ad Accounts** → pick your ad account → enable **Manage campaigns**
   (the full-control toggle — "View performance" alone is read-only and edits will fail).

## 3. Generate the token

1. Still on the System User → **Generate New Token**
2. Select the app from step 1.
3. Tick these permissions:
   - `ads_management`  — create/duplicate/edit/pause
   - `ads_read`        — reporting
   - `business_management` — resolve the account
4. Generate, then **copy the token** (it is shown once).

## 4. Find your ad account id

Open <https://adsmanager.facebook.com>. The URL contains `act=XXXXXXXXXXXX`.
Your id is that number prefixed with `act_`, e.g. `act_YOUR_AD_ACCOUNT_ID`.

## 5. Store both on this machine

```bash
security add-generic-password -s meta-ads -a token   -w 'PASTE_TOKEN_HERE'
security add-generic-password -s meta-ads -a account -w 'act_YOUR_AD_ACCOUNT_ID'
```

These go in the macOS Keychain and are read by the shared `authlib.sh` accessor,
the same way every other credential on this box works. They are never written to disk
in plaintext and never committed to git.

## 6. Verify

```bash
~/.claude/skills/meta-ads/scripts/ads.sh doctor
```

Expected: your name, the ad account, its currency, `status=ACTIVE`, and a campaign count.

---

## If something breaks later

| Symptom | Cause | Fix |
|---|---|---|
| `error 190` | token invalidated (rare for system users — happens if the system user is removed or an admin resets credentials) | regenerate at step 3 and re-run the `security add-generic-password` command with `-U` to update |
| `error 200` | the System User has the ad account but only with view access | step 2.4 — turn on **Manage campaigns** |
| `error 100 ... version` | the pinned API version was retired | run with `META_API_VERSION=v24.0 ads.sh ...`, then bump the default in `scripts/metaads.py` |
| `error 17` / `613` | rate limited | the script already backs off and retries; if it persists, wait an hour |

To rotate the token: re-run step 3, then
`security add-generic-password -s meta-ads -a token -w 'NEW' -U`
