# Facebook Page publishing — capability matrix for Shoogle

**Owner:** Yash (`features/social/`)
**Researched:** 2026-09-09
**Verification rule:** only first-party Meta documentation counts. Every claim carries a
`developers.facebook.com` URL or the literal word **UNVERIFIED**.
**Companion report:** [`meta-instagram.md`](./meta-instagram.md). Read both — the two platforms
share a Meta app and share nothing else.

> **VERDICT: VIABLE, AND EASIER THAN INSTAGRAM IN EVERY RESPECT THAT MATTERS.**
> Facebook Page publishing accepts **binary uploads** (no public hosting needed), accepts **PNG**,
> and **schedules natively**. Instagram does none of these. The cost is a hard prerequisite
> Instagram does not have — **the business must own a Facebook Page**, and the connecting person
> must hold the `CREATE_CONTENT` task on it — plus a heavier permission set that is entirely
> App-Review-gated.
>
> **The finding that changes the architecture:** Facebook publishing requires Facebook Login for
> Business, and *Instagram API with Facebook Login* also exists. So Instagram's auth path is now a
> real decision rather than a foregone conclusion. See §6.

---

## 0. TL;DR for the app

| Question | Facebook Page | Instagram | GBP |
|---|---|---|---|
| Publicly hosted media required? | **No — binary upload supported** | **Yes, images are URL-only** | **Yes, `sourceUrl` only** |
| PNG accepted? | **Yes** | **No — JPEG only** | UNVERIFIED |
| Native scheduling? | **Yes** | **No (undocumented)** | **Yes (`scheduledTime`)** |
| Prerequisite the owner must already have | **A Facebook Page** | An IG professional account | A verified GBP, 60+ days |
| Caption/message max length | **UNVERIFIED — none documented** | 2200 | **UNVERIFIED — none documented** |
| Review gate | App Review + Business Verification | App Review + Business Verification | GBP API access request |

**Three platforms, three genuinely different rule sets.** This is the strongest possible argument
against a single caption and a single media pipeline, and it is why `Limit<T>` carries a source
per platform rather than a shared constant.

---

## 1. Publishing a text/link post

`POST /{page-id}/feed` —
<https://developers.facebook.com/docs/graph-api/reference/page/feed/>

Parameters: `message`, `link`, `published`, `scheduled_publish_time`, `targeting`.

Requires **a Page access token** plus `pages_manage_posts`, `pages_read_engagement` and
`pages_show_list`, requested by *"someone who can perform the `CREATE_CONTENT` task on the Page
being queried"*.

**Maximum `message` length: UNVERIFIED.** The reference documents none. Do not hard-code one and
do not truncate — let Facebook reject and surface its own error. (This is the same posture the GBP
report takes on `LocalPost.summary`, for the same reason.)

---

## 2. Publishing a photo — and the first real divergence from Instagram

`POST /{page-id}/photos` —
<https://developers.facebook.com/docs/graph-api/reference/page/photos/>

**Both upload paths are supported:**

1. *"Use a photo that is already on the internet by publishing using the `url` parameter"*
2. *"Attach the photo as `multipart/form-data`"* — the binary path, parameter `source`

> **This is the single most consequential difference from Instagram.** Meta cURLs Instagram media
> from a public URL and offers **no binary path for images**, so an Instagram post is impossible
> without hosting. A Facebook photo is not. **A device-local photo can be published to Facebook
> today with no server at all.**

**Accepted formats:** *".jpeg, .bmp, .png, .gif, .tiff"* — **PNG is accepted**, which is the exact
opposite of Instagram's "JPEG is the only image format supported".

**Size:** *"Files can not exceed 10MB. For .png files, we recommend not exceeding 1MB or the image
may appear pixelated."* Note that the 1 MB PNG figure is a **recommendation, not a limit**, and
must not be enforced as a violation.

Facebook *"strips all location metadata before publishing and resizes images to different
dimensions"* — so no client-side aspect-ratio enforcement is warranted here. Instagram's
320–1440 px and 4:5–1.91:1 constraints are **Instagram's alone** and must not be applied to a
Facebook target.

`caption` is the photo's description and *"Supports Emoji"*.

Scheduling/staging on photos: `published=false` stores an unpublished photo *"for about 24 hours"*;
`scheduled_publish_time` schedules it; `temporary=true` is used *"if the photo is used in a
scheduled post"*.

---

## 3. Publishing a video

`POST /<PAGE_ID>/videos` on host **`https://graph-video.facebook.com/`** —
<https://developers.facebook.com/docs/video-api/guides/publishing>

Upload is via the **Resumable Upload API**: start a session at `/<APP_ID>/uploads`, upload chunks
to `/upload:<UPLOAD_SESSION_ID>`, receive an `UPLOADED_FILE_HANDLE`, then publish referencing
`fbuploader_video_file_chunk=<UPLOADED_FILE_HANDLE>`.

Permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, and `CREATE_CONTENT`
on the Page.

**Reels:** the page states *"The Video API allows you to publish Videos and Reels on Facebook
Pages"* but **details no separate Reels endpoint or process**. Treat Facebook Reels as
**UNVERIFIED** and out of the first implementation.

**Video format, size and duration limits: UNVERIFIED.** The publishing guide does not state them.
The upload documentation names supported file types as `pdf`, `jpeg`, `jpg`, `png`, `mp4` — which
is an upload-session list, **not** a Page video specification, and must not be recorded as one.

---

## 4. Scheduling — and a genuine conflict between two Meta pages

Facebook supports real provider-side scheduling: set `published=false` and supply
`scheduled_publish_time`.

**The two first-party pages disagree on the maximum horizon:**

| Page | Stated window |
|---|---|
| <https://developers.facebook.com/docs/pages-api/posts> | *"The publish date must be between 10 minutes and 30 days from the time of the API request."* |
| <https://developers.facebook.com/docs/graph-api/reference/page/feed/> | *"Must be date between 10 minutes and 75 days from the time of the API request."* |

**Both are Meta's own documentation and they cannot both be relied on.** This report does not pick
a winner.

**Recommended handling:** validate against the **conservative 30 days**, and let Facebook's own
error surface for anything it rejects between 30 and 75. Being told "Facebook only takes 30 days"
and being wrong costs the owner a scheduling option; being told 75 and being wrong costs them a
post they believed was scheduled.

> ⚠️ **This is a live bug risk in existing Shoogle code.** `scheduling.ts` sets
> `MAX_SCHEDULE_HORIZON_DAYS = 90`, which **exceeds both figures**. A post scheduled 60 days out
> passes Shoogle's validation today and would be rejected by Facebook. The horizon has to become
> per-platform, and the minimum lead time must respect Facebook's **10-minute** floor —
> `MIN_SCHEDULE_LEAD_MINUTES` is currently 5, which is **under** it.

---

## 5. Permissions, tokens and review gates

**Getting a Page access token** —
<https://developers.facebook.com/docs/pages-api/overview>:

> "Get a User Access Token from your app user through Facebook Login for Business. Query the
> `/me/accounts` endpoint to get the ID and Page Access Token."

Facebook Login for Business is *"the preferred authentication and authorization solution for Tech
Providers and business app developers"*.

**Permissions named:** `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
`business_management`.

`pages_manage_posts` — <https://developers.facebook.com/docs/permissions/reference/pages_manage_posts>
— allows an app to *"create, edit and delete your Page posts"*, and **depends on**
`pages_read_engagement` **and** `pages_show_list`. Its allowed usages are exactly: publish, update
and delete a post, photo or video on the Page.

**Review gate, quoted:**

> "All Page-related Permissions and Features require approval through the App Review process before
> your app can use them when your app goes live."

Advanced Access additionally requires **Business Verification**
(<https://developers.facebook.com/docs/graph-api/overview/access-levels>: *"Business Verification is
required to get Advanced Access."*).

**Under Standard Access the whole Facebook pipeline is testable today** against a Page whose admin
holds a role on our app — the same arrangement Instagram uses.

---

## 6. THE ARCHITECTURAL DECISION: which Instagram auth path, now that Facebook is in scope

Meta offers two Instagram setups. From
<https://developers.facebook.com/docs/instagram-platform/overview>:

| | Instagram API **with Instagram Login** | Instagram API **with Facebook Login** |
|---|---|---|
| Facebook Page required | **No** — *"serves Instagram professional accounts with a presence on Instagram only"* | **Yes** — *"serves Instagram professional accounts that are linked to a Facebook Page"* |
| Graph host | `graph.instagram.com` | `graph.facebook.com` |
| Token type | Instagram User | Facebook User **or Page** |
| Scopes | `instagram_business_basic`, `instagram_business_content_publish` (+ comments, messages) | `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement` |
| Content publishing | ✅ | ✅ |

Neither is deprecated. Both publish.

**Why this is suddenly a live question:** the original scope decision chose Instagram Login
*because* it needs no Facebook Page. Now that Facebook is a publishing target, a Page is required
anyway for any owner who wants Facebook — so the Facebook Login path could serve **both** targets
through **one** connect flow and one token family.

**But it is not free.** Choosing Facebook Login for Instagram means an Instagram professional
account that is *not* linked to a Page becomes unconnectable — Instagram would inherit Facebook's
prerequisite. For Indian local businesses, an active Instagram alongside a neglected or absent
Facebook Page is a common shape, and that owner would lose Instagram entirely.

**Recommendation: keep the two connections independent.** Instagram via Instagram Login,
Facebook via Facebook Login for Business. Rationale:

1. The product requires **any combination** of three targets. Independent connections model that
   directly; a shared login couples two targets that the owner chose separately.
2. It preserves the verified "no Facebook Page required" property for Instagram — the single
   biggest de-risking finding in the Instagram report.
3. A Page is a **Facebook** prerequisite. Making it an Instagram prerequisite too would be
   Shoogle imposing a requirement Meta does not.

Cost, stated honestly: two OAuth flows, two token lifecycles (Instagram's 60-day refreshable user
token vs Facebook's Page token), and two refresh paths. That is real work, and it is the correct
work — it buys each target the ability to fail independently.

---

## 7. Additional requirements Facebook introduces that Instagram did not

| Requirement | Who owns it | Notes |
|---|---|---|
| **The business must own a Facebook Page** | Product owner / each customer | Not something code can supply. An owner with no Page simply has no Facebook target — the publisher already models an unreachable target honestly. |
| **The connecting person needs the `CREATE_CONTENT` task on the Page** | Each customer | An admin/editor. A Page role short of this cannot publish. |
| **Facebook Login for Business** (not Instagram Login) | Yash | A second OAuth flow. |
| **`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`** | Yash | All three App-Review-gated. `pages_manage_posts` requires the other two. |
| **`business_management`** | Yash | Named in the Pages overview; needed only for Business-Manager-owned Pages. **Request it only if a real Page requires it** — every extra scope enlarges App Review. |
| **A Page picker in the connect UI** | Yash | `/me/accounts` can return several Pages. Shoogle must not guess which one. |
| **Page access token storage** | Sunny (server) | Derived from the user token server-side; never on the device. |
| **A Shoogle Facebook Page for testing** | Product owner | Needed to publish end-to-end under Standard Access. **Does one exist?** |

**No new app credentials.** Facebook and Instagram share the same Meta app, so the same app id and
secret serve both.

> **Naming consequence:** the secret should be `META_APP_SECRET`, **not** `INSTAGRAM_APP_SECRET`
> as the Instagram report proposed. One Meta app now serves two platforms and an Instagram-specific
> name would be actively misleading. The public id stays `EXPO_PUBLIC_META_APP_ID`, which was
> already the right call.

---

## 8. Open items still marked UNVERIFIED

- **Maximum `message` length for a Page post.** None documented.
- **The scheduling horizon — 30 days or 75.** Two Meta pages conflict (§4). Unresolved.
- **Facebook Reels.** Stated to be supported by the Video API; no endpoint or process documented
  on the publishing guide.
- **Page video format, size and duration limits.**
- **Whether `business_management` is required for an ordinary Page** or only Business-Manager-owned
  ones.
- Whether an unpublished photo's *"about 24 hours"* retention is a hard expiry.
- App Review turnaround; Business Verification document list for an Indian entity.

---

## 9. Immediate actions

1. **Create the Meta Developer App** (still not done) — it now needs **two** products: Instagram
   *and* Facebook Login for Business.
2. **Confirm a Shoogle Facebook Page exists**, and that the product owner holds `CREATE_CONTENT`
   on it. Add it under Standard Access for end-to-end testing.
3. **Start Business Verification.** It now gates two platforms rather than one, so it is on the
   critical path twice over.
4. **Fix the scheduling horizon before any Facebook code ships** — 90 days exceeds both documented
   Facebook maxima, and the 5-minute minimum lead is under Facebook's 10-minute floor (§4).
