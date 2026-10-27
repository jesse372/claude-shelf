# Instagram → Google Business Profile (Zapier)

Mirror every new Instagram post to Google Business Profile as a "What's new" post,
with hashtags stripped and Reels/video skipped.

Created: 2026-10-01

---

## 0. Prerequisites (do these first — the Zap can't connect without them)

- [ ] Instagram account is **Business** or **Creator** (not Personal)
      IG app → Settings → Account type and tools → Switch to professional account
- [ ] Instagram is **linked to a Facebook Page** you admin
      (Zapier authenticates IG through the Facebook Graph API — no Page, no trigger)
- [ ] Google Business Profile is **verified** and you are an Owner or Manager
      A single location is simplest. Multi-location = one Zap per location, or a
      Looping step (paid Zapier feature).
- [ ] Zapier account. This Zap is **multi-step** (trigger + filter + code + action),
      which requires a **paid plan** (Starter or above). Free plans are
      single-step only.

---

## 1. Zap structure

    1. Trigger   Instagram for Business → "New Media Posted in My Account"
    2. Filter    Only continue if media is a photo (skips Reels/video)
    3. Code      Clean the caption (JS, below)
    4. Filter    Only continue if cleaned caption is non-empty
    5. Action    Google Business Profile → "Create Post"

---

## 2. Step-by-step

### Step 1 — Trigger
- App: **Instagram for Business**
- Event: **New Media Posted in My Account**
- Connect your IG account (OAuth via Facebook; grant all requested scopes)
- Test it. You should see your most recent post with fields:
  `id`, `caption`, `media_type`, `media_url`, `permalink`, `timestamp`, `thumbnail_url`

### Step 2 — Filter: photos only
- App: **Filter by Zapier**
- Condition: `Media Type` **(Text) exactly matches** `IMAGE`
- Add OR condition: `Media Type` **(Text) exactly matches** `CAROUSEL_ALBUM`

Why: GBP's post API handles photos reliably. Video support is inconsistent and
Reels will usually fail the action or post a broken thumbnail.

### Step 3 — Code: clean the caption
- App: **Code by Zapier**
- Event: **Run JavaScript**
- Input Data (left column = variable name, right = mapped Zap field):

      caption   →  Step 1 Caption
      permalink →  Step 1 Permalink

- Code: paste the contents of `clean-caption.js` (in this folder)
- Outputs it produces: `summary`, `shouldPost`, `charCount`

### Step 4 — Filter: skip empties
- App: **Filter by Zapier**
- Condition: `Should Post` (from Step 3) **(Text) exactly matches** `yes`

Why: posts that were nothing but hashtags come out blank after cleaning, and GBP
rejects an empty summary.

### Step 5 — Action: create the GBP post
- App: **Google Business Profile**
- Event: **Create Post**
- Account: your GBP account
- Location: the location to post to
- Post Type / Topic Type: **Standard** (a.k.a. "What's new")
- Summary: map to **Step 3 → Summary**
- Media / Photo URL: map to **Step 1 → Media URL**
- Button / Call to action: **Learn more** (optional)
  - Button URL: map to **Step 1 → Permalink**  ← sends people to the IG post
  - Or hardcode your website URL instead. Your choice.
- Test the step. Check the live profile on Google Maps/Search to confirm.

---

## 3. Turn it on

Publish the Zap. The IG trigger **polls** — it does not fire instantly:
- Starter plan: every 15 minutes
- Professional: every 2 minutes
So expect a delay between posting on IG and the post appearing on GBP.

---

## 4. Known gotchas

| Issue | What happens | Mitigation |
|---|---|---|
| **IG media_url expires** | The CDN link is signed and expires in hours. If the Zap errors and auto-replays later, the image 404s. | Replay failed Zaps promptly, or add an upload-to-Drive/S3 step if it becomes a recurring problem. |
| **Carousels** | Only the first image transfers. | Accepted limitation. |
| **GBP char limit** | 1,500 chars; the code truncates at 1,450 on a word boundary. | Handled. |
| **GBP image minimums** | Min 250×250px, 10KB–5MB. IG images always clear this. | No action needed. |
| **IG trigger silently stops** | The Facebook OAuth token expires (~60 days) or the Page link breaks. Zapier emails you, but it's easy to miss. | Register this in the `auth-framework` skill so keepalive catches it before it breaks. See §5. |
| **Duplicate posts** | Re-editing an IG caption does NOT re-trigger. Safe. | No action needed. |
| **Post volume** | GBP posts surface in local search. Many low-quality posts dilute the profile. | Consider adding a filter on a keyword/emoji you include only in posts you want mirrored. |

---

## 5. Follow-up: make it self-healing

The real failure mode is **silent death** — the Facebook token expires and posts
just quietly stop mirroring for weeks.

Register the Instagram/Facebook token as a target in the `auth-framework` skill so
`auth-keepalive.sh` flags it inside the 48h-to-expiry window. Also worth a weekly
`pipeline-qc` probe: "has a GBP post been created in the last N days where an IG
post exists in the same window?"

Ask Claude to wire both up once the Zap is live and confirmed working.
