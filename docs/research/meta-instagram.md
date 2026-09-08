# Instagram publishing via Meta — capability matrix for Shoogle

**Owner:** Yash (`features/social/`, `features/carousel/`, `app/(tabs)/posts.tsx`)
**Researched:** 2026-09-01 (`api-researcher` pass)
**Citations re-confirmed:** 2026-09-08 — every URL in §1–§5 was re-fetched and the quoted
sentence found on the live page. Lines that could not be re-fetched are labelled
**NOT RE-CONFIRMED** and say what they rest on.
**Verification rule:** only first-party Meta documentation counts. Every claim below carries a
`developers.facebook.com` URL, or the literal word **UNVERIFIED**. Blogs, Stack Overflow, Medium
and model memory were used as leads only and are cited nowhere.

> **VERDICT: VIABLE — AND SIMPLER THAN EXPECTED.**
> Meta's *Instagram API with Instagram Login* publishes single images, videos, Reels, Stories and
> carousels to an Instagram professional account **without a Facebook Page**, which removes the
> single biggest assumed blocker on this feature. The cost is three hard architectural
> requirements that no amount of app code works around: **media must be fetchable from a public
> URL** (Meta cURLs it — a device-local photo cannot be published), **images must be JPEG**
> (PNG is rejected outright), and **token exchange needs `client_secret`** and therefore a server.
> All three converge on the same missing piece: server-side infrastructure.
> Advanced Access — i.e. real customers — additionally requires **Business Verification and App
> Review**, which gate on a near-finished UI and should be started in parallel, not at the end.

---

## 0. TL;DR for the app

| Question | Answer |
|---|---|
| Can we publish to Instagram today? | Not yet — no Meta app exists. Nothing has ever been published by this code. |
| Is a Facebook Page required? | **No.** Verified — see §1. |
| Is Facebook a publishing target? | **No.** Out of scope by product decision (2026-09-01). |
| Can a phone publish a local photo directly? | **No.** Meta fetches media over HTTPS. §3. |
| Can we send a PNG? | **No. JPEG only.** §4. |
| Can we do OAuth entirely on-device? | **No.** `client_secret` cannot ship in an APK. §2. |
| Does Instagram schedule for us? | **UNVERIFIED — assume no.** Shoogle owns the clock. §6. |
| What can we build with no approvals? | The whole pipeline, publishing to accounts that hold a role on our app (Standard Access). §5. |
| What gates real customers? | Business Verification → App Review. §5. |
| Cost | No fee documented for the publishing APIs. Quota is the constraint, not price. |
| Sandbox | **None.** Testing means publishing to a real account we control. |

---

## 1. Which auth path — Instagram Login, not Facebook Login

Meta ships two ways to reach the same publishing endpoints. **Use Instagram Login.**

> "This API setup does not require a Facebook Page to be linked to the Instagram professional
> account."
> — <https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login>

Both **business and creator** account types are eligible ("Instagram professionals — businesses
and creators", same page).

| | **Instagram Login** ✅ USE THIS | Facebook Login (older) |
|---|---|---|
| Facebook Page | **Not required** | **Required** |
| Publish scopes | `instagram_business_basic`, `instagram_business_content_publish` | `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` (+ ads scopes) |
| Graph host | `graph.instagram.com` | `graph.facebook.com` |
| OAuth host | `https://www.instagram.com/oauth/authorize` | Facebook Login for Business |
| Deprecated? | **No** | **No** |

The Instagram Login page lists four scopes in total: `instagram_business_basic`,
`instagram_business_content_publish`, `instagram_business_manage_messages`,
`instagram_business_manage_comments`. **Shoogle requests only the first two.** Messaging and
comment management are not part of this feature and asking for them would enlarge App Review for
no product reason.

**Trade-off accepted:** Instagram Login gives up hashtag search and competitor insights. Shoogle's
publishing feature needs neither.

**Consequence for the code:** Facebook is not a `Platform`. If Meta ever requires a Page for some
future surface, that is a **connect-screen prerequisite** (`ConnectionRequirement`), never a
composer target. See §7.

---

## 2. OAuth and tokens — the server is not optional

Source: <https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login>

| Step | Endpoint |
|---|---|
| Authorize | `https://www.instagram.com/oauth/authorize` |
| Code → short-lived token | `POST https://api.instagram.com/oauth/access_token` |
| Short-lived → long-lived (60 days) | `GET https://graph.instagram.com/access_token` |
| Refresh long-lived | `GET https://graph.instagram.com/refresh_access_token` |

- The **authorization code is valid for 1 hour and can only be used once.** Reuse is rejected with
  *"Matching code was not found or was already used."*
- **`client_secret` is required** for the code exchange and for the long-lived exchange. Meta's own
  wording: requests for long-lived tokens **"must be made in server-side code"**.
- Long-lived tokens last **60 days** and can be refreshed for a further 60.

> **This is a hard architectural constraint, not a preference.** `CLAUDE.md` § Secrets: only
> `EXPO_PUBLIC_*` variables exist on-device and everything with that prefix ships inside the APK.
> An app secret can therefore never reach the device. **Instagram connect is not buildable without
> a server-side token exchange.**

### Environment variable NAMES (names only — never values)

```
EXPO_PUBLIC_META_APP_ID       # publishable app id; already declared in lib/env, owner: Yash — Social
INSTAGRAM_APP_SECRET          # server-side ONLY. Never EXPO_PUBLIC_. Never committed.
```

Meta's docs call these `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`. `lib/env/index.ts` already
exposes `EXPO_PUBLIC_META_APP_ID`, and an Instagram app *is* a Meta app, so reusing that name is
accurate **and avoids editing shared foundation code**. The redirect URI comes from
`expo-auth-session`'s `makeRedirectUri({ scheme: 'shoogle' })` rather than a new variable.

---

## 3. Publishing mechanics — Meta fetches the media

> "We cURL media used in publishing attempts, so the media must be hosted on a publicly accessible
> server at the time of the attempt."
> — <https://developers.facebook.com/docs/instagram-platform/content-publishing>

You pass `image_url` / `video_url`. **There is no binary upload path for images.**
`rupload.facebook.com` offers resumable binary upload for **video only**.

**A device-local `file://` or `content://` photo cannot be published.** Public media hosting is a
build requirement, not an optimisation.

### Flow — host `graph.instagram.com`

1. `POST /<IG_ID>/media` → returns a **container id**
2. `GET /<IG_CONTAINER_ID>?fields=status_code` → poll until the container is ready
3. `POST /<IG_ID>/media_publish` → publishes the container
4. `GET /<IG_ID>/content_publishing_limit` → remaining quota

**Carousel:** create one container per item with `is_carousel_item=true`, then a parent container
with `media_type=CAROUSEL` and `children`, then publish the parent.

**Publishing quota:** "Instagram accounts are limited to 100 API-published posts within a 24-hour
moving period." **A carousel counts as one post.** Read `content_publishing_limit` before
committing a schedule rather than discovering the ceiling at publish time.

---

## 4. Formats and limits — the numbers that go into `platforms.ts`

**Image format — the single most consequential line in this document:**

> "JPEG is the only image format supported. Extended JPEG formats such as MPO and JPS are not
> supported."
> — <https://developers.facebook.com/docs/instagram-platform/content-publishing>

**PNG is rejected.** This turns `checkMediaFormat('instagram', 'png')` from `unverified` into a
real `violation`, and it makes a **server-side JPEG transcode step mandatory** for any
Shoogle-generated creative.

**Carousel maximum:** "Carousels are limited to 10 images, videos, or a mix of the two."
(same page)

**Caption and media specifications** —
<https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media>

| Item | Value |
|---|---|
| Caption | **"Maximum 2200 characters, 30 hashtags, and 20 @ tags."** |
| Image file size | 8 MB maximum |
| Image width | Minimum 320 px · maximum 1440 px |
| Image aspect ratio | Must be within **4:5 to 1.91:1** |
| Image colour space | sRGB |
| Video container | MOV or MP4 (MPEG-4 Part 14), no edit lists, `moov` atom at the front |
| Video codec | HEVC or H264, progressive scan, closed GOP, 4:2:0 chroma |
| Audio | AAC, 48 kHz maximum, 1–2 channels, 128 kbps |
| Video bitrate | VBR, 25 Mbps maximum |
| Frame rate | 23–60 FPS |
| Video duration | 3 s minimum · 15 min maximum |
| Video file size | 300 MB maximum |
| **Story** video | 3 s minimum · **60 s maximum** · **100 MB maximum** |

> ⚠️ **Read the URL.** That specification table lives in the **`instagram-graph-api`
> (Facebook Login) reference tree.** No Instagram-Login-specific specification page was found in
> either pass. There is no reason to believe the media specs differ — the endpoints and the
> ingestion pipeline are the same — but this is recorded as an open item in §8 and the values are
> cited to the page they actually appear on, not to a page that would be more convenient.

**`alt_text`:** "On March 24, 2025, we introduced the new `alt_text` field for image posts on the
`/<INSTAGRAM_PROFESSIONAL_ACCOUNT_ID>/media` endpoint. **Reels and stories are not supported.**"
— content-publishing page. So alt text is an **image-only** field.

**Not supported:** shopping tags, filters.

### What this means for the build

Any Shoogle-generated creative must, **server-side, where the media is already hosted**, be:
transcoded to **JPEG**, resized into **320–1440 px**, forced into a **4:5–1.91:1** aspect ratio,
and kept **under 8 MB** — before the URL is handed to Meta. Doing this client-side is not enough,
because the URL Meta fetches is the server's, not the phone's.

---

## 5. Access levels and review gates

Source: <https://developers.facebook.com/docs/graph-api/overview/access-levels>

- **Standard Access** — "Permissions with Standard Access can only be requested from app users who
  have a role on the requesting app." **This is enough to build and test the entire pipeline
  today**, using team Instagram accounts added as testers/role-holders.
- **Advanced Access** — "Permissions with Advanced Access can be requested from any app user."
  Required for real customers.
- **"Business Verification is required to get Advanced Access."** Real legal entity, real
  documents.
- **App Review** — "In some cases additional App Review on an individual permission and feature
  basis might be required." Both `instagram_business_basic` and
  `instagram_business_content_publish` were recorded as review-gated by the 2026-09-01 pass.

**NOT RE-CONFIRMED (2026-09-08)** — recorded by the 2026-09-01 pass, exact page not re-fetched.
Treat as true and plan for it; re-verify before submitting:

- At least one **successful API call** must have been made before submitting for App Review.
- App Review requires a **screencast** and an **externally installable, reviewer-testable build**.
  **Expo Go will not satisfy this** — a real EAS build is needed.

> **Sequencing consequence.** App Review depends on a near-finished UI *and* on Business
> Verification, which is a documents-and-waiting process. It therefore **cannot be left to the
> end**. Start Business Verification in parallel with development.

---

## 6. Scheduling — Instagram is not GBP

The documented publishing flow is container → publish, **with no scheduled-time parameter**.

**`providerSideScheduling` stays UNVERIFIED for Instagram.** Absence of a parameter in the docs is
not a citation that scheduling is unsupported, and this codebase does not record absence as fact.
Practically it changes nothing: `features/social/scheduling.ts` already assumes Shoogle owns the
clock and adapters only ever publish *now*.

This is the opposite of Google Business Profile, whose `LocalPost.scheduledTime` **is** documented
native scheduling — see [`google-business-profile.md`](./google-business-profile.md) §6. The two
platforms genuinely differ and the capability matrix records that difference rather than
flattening it.

---

## 7. What Shoogle can build, in order

### BUILDABLE NOW — no Meta approvals needed

1. Fill the verified values above into `features/social/platforms.ts` with sources.
2. `InstagramContent` type + the format union (single image, video, Reel, Story, carousel).
3. Client-side validation against the verified specs — including **PNG as a real violation**.
4. The compose flow, carousel editor and per-platform preview, against dev-gated fixtures.

### BUILDABLE ONCE A META APP EXISTS (Standard Access, team accounts)

5. OAuth via `expo-auth-session` + **server-side** token exchange (§2).
6. Long-lived token storage and 60-day refresh.
7. Connect UI, then `registerProvider('instagram', …)` — **only once a real token exists.**
8. `instagramPublisher` implementing `PlatformPublisher`: container → poll → publish.
9. **Publish one real post to an Instagram account we control and verify it on Instagram.**
   Until that happens, nothing in this repository may claim Instagram publishing works.

### BLOCKED ON SERVER-SIDE INFRASTRUCTURE

- Token exchange (`client_secret` cannot ship on-device) — §2
- Public media hosting + JPEG transcode/resize — §3, §4
- Publishing while the phone is off — the scheduling runner

**All three are the same missing piece.** One backend with functions and object storage unblocks
every one of them; none of them can be worked around in the app.

### BLOCKED ON META APPROVALS — production only

- Business Verification → Advanced Access → App Review → real customers.

---

## 8. Open items still marked UNVERIFIED

- **Whether the §4 specification table applies verbatim to the Instagram Login path.** The
  2200/30/20 caption limits and the image/video specs are cited from the `instagram-graph-api`
  (Facebook Login) reference tree. No Instagram-Login-specific specification page exists that
  either pass could find.
- **Carousel *minimum* item count.** Meta documents a maximum of 10 and no minimum. Two is
  near-certain; it is not documented, so it stays unverified.
  (`features/carousel` enforces Shoogle's own `SHOOGLE_MIN_SLIDES = 2`, which is a Shoogle rule
  and is not presented as Meta's.)
- **Stories on Creator accounts.** One Facebook-Login page indicated Stories are business-only;
  that could not be reproduced on the Instagram Login documentation. **Do not promise Stories to
  Creator accounts.**
- **Instagram provider-side scheduling** — see §6.
- App Review turnaround time.
- Business Verification document list for an **Indian** legal entity.
- Pricing / free-tier terms for the publishing endpoints (no fee found; none confirmed either).
- India-specific restrictions — none found, which is not the same as none existing.

---

## 9. Immediate actions

1. **Create the Meta Developer App** → add the **Instagram** product → choose
   **"API setup with Instagram login"**. ⚠️ **NOT** "API setup with Facebook login" — that choice
   is the entire reason no Facebook Page is required.
2. Add the existing Shoogle Instagram professional account as a **tester / role-holder**, which
   enables end-to-end publishing under Standard Access.
3. Put `EXPO_PUBLIC_META_APP_ID` and `INSTAGRAM_APP_SECRET` in `.env.local` (git-ignored via
   `.env*.local`). **Never** create `EXPO_PUBLIC_INSTAGRAM_APP_SECRET`.
4. **Start Business Verification now** — it gates App Review, which gates every real customer.
5. Settle the server-side boundary. Until it is settled, Instagram *connect* is not buildable at
   all, and steps 5–9 of §7 cannot begin.
