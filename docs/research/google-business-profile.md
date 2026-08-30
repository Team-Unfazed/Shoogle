# Google Business Profile APIs — capability matrix for Shoogle

**Owner:** Pranay (`features/gbp/`, `features/audit/`, `features/seo/`, `app/(tabs)/business.tsx`, `app/seo/`)
**Researched:** 2026-08-30
**Verification rule:** only first-party Google documentation counts. Every claim below carries a
`developers.google.com` / `support.google.com` URL, or the literal word **UNVERIFIED**.
Blogs, Stack Overflow, Medium and model memory were used as leads only and are cited nowhere.

> **VERDICT: VIABLE WITH CONDITIONS.**
> The API surface Shoogle needs (locations, reviews + replies, local posts, media, hours,
> attributes, performance metrics) exists and is free. But **nothing returns data until an
> access request is approved** — an unapproved project sits at 0 QPM — and the approval
> requires a Business Profile that has been *verified and active for 60+ days* plus a website.
> Several metrics Shoogle would naturally want (photo views, post views, post CTA clicks,
> search-query breakdowns, driving-direction geography) were **permanently removed in 2023**
> and have **no replacement**. Those must render as `unavailable('not_supported', …)` forever —
> never as `0`.

---

## 0. TL;DR for the app

| Question | Answer |
|---|---|
| Can we ship a GBP integration today? | Only the *unconnected* and *fixture* states. No live data. |
| What blocks live data? | Approved API access request (0 QPM until then). |
| Cost | Free. |
| Sandbox | **None.** |
| Reviews read + reply | Yes — but **only for a verified location**. |
| Local posts create | Yes (STANDARD / EVENT / OFFER / ALERT). |
| Photo views / post views / post clicks | **REMOVED from the API. Permanently unavailable.** |
| Search terms | Yes, monthly — but low counts come back as a **threshold, not a number**. |
| Rankings ("where do I rank for X") | **Not possible via any GBP API.** |

---

## 1. Which APIs exist now

The Business Profile APIs were reorganised: the monolithic **Google My Business API v4** was split
into per-domain v1 APIs on separate hostnames. v4 was *not* fully retired — reviews, local posts
and media never got a v1 home, so v4 remains live for those while its `accounts.*` and `*.admins`
resources are deprecated in favour of the Account Management API.

Source for the family list: <https://developers.google.com/my-business/ref_overview>

| API | Version | Service endpoint (base) | Status | Source |
|---|---|---|---|---|
| Google My Business API (legacy) | v4.9 | `https://mybusiness.googleapis.com` | **Live but legacy.** Hosts reviews, localPosts, media. Its `accounts`, `accounts.admins`, `accounts.invitations`, `accounts.locations.admins` methods are **deprecated**. | <https://developers.google.com/my-business/reference/rest> · <https://developers.google.com/my-business/reference/rest/index> |
| My Business Account Management API | v1 | `https://mybusinessaccountmanagement.googleapis.com` | Live. Replaces v4 accounts/admins/invitations. | <https://developers.google.com/my-business/reference/accountmanagement/rest> |
| My Business Business Information API | v1 | `https://mybusinessbusinessinformation.googleapis.com` | Live. Locations, attributes, categories, chains, googleLocations. | <https://developers.google.com/my-business/reference/businessinformation/rest> |
| Business Profile Performance API | v1 | `https://businessprofileperformance.googleapis.com` | Live. Replaces v4 `reportInsights`. | <https://developers.google.com/my-business/reference/performance/rest> |
| My Business Verifications API | v1 | `https://mybusinessverifications.googleapis.com` | Live. Verification + Voice of Merchant. | <https://developers.google.com/my-business/reference/verifications/rest> |
| My Business Notifications API | v1 | `https://mybusinessnotifications.googleapis.com` | Live. Cloud Pub/Sub notification settings only (2 methods). | <https://developers.google.com/my-business/reference/notifications/rest> |
| My Business Place Actions API | v1 | `https://mybusinessplaceactions.googleapis.com` | Live. Booking/order/delivery action links. | <https://developers.google.com/my-business/reference/placeactions/rest> |
| My Business Lodging API | v1.2 | hostname **UNVERIFIED** (page not fetched) | Live. Hotels only. **Irrelevant to Shoogle.** | <https://developers.google.com/my-business/ref_overview> |
| My Business Business Calls API | v1 | `https://mybusinessbusinesscalls.googleapis.com` | **CONFLICTING DOCS — see below.** | <https://developers.google.com/my-business/reference/businesscalls/rest> |

The seven APIs to enable in the Cloud Console are named on
<https://developers.google.com/my-business/content/basic-setup>: Google My Business API,
My Business Account Management API, My Business Lodging API, My Business Place Actions API,
My Business Notifications API, My Business Verifications API, My Business Business Information API.
(The Business Profile Performance API must be enabled separately —
<https://developers.google.com/my-business/content/performance/change-log>.)

### Deprecated / discontinued — do not build on these

Full first-party table: <https://developers.google.com/my-business/content/sunset-dates>

| Thing | Type | Replacement | Support ended | Discontinued |
|---|---|---|---|---|
| My Business **Q&A API** | API | **none** | 2025-09-15 | **2025-11-03** |
| `getHealthProviderAttributes` | Method | none | 2024-06-17 | 2024-07-01 |
| `updateHealthProviderAttributes` | Method | none | 2024-06-17 | 2024-07-01 |
| `InsuranceNetworks` | API | none | 2024-06-17 | 2024-07-01 |
| My Business **Calls API** | API | none | 2023-02-21 | 2023-05-30 |
| `locations.associate` | Method | none | 2023-02-21 | 2023-05-30 |
| `locations.clearLocationAssociation` | Method | none | 2023-02-21 | 2023-05-30 |
| `accounts.locations.reportInsights` | Method | `locations.fetchMultiDailyMetricsTimeSeries` | 2022-11-21 | 2023-03-30 |
| `accounts.locations.localPosts.reportInsights` | Method | **none** | 2022-11-21 | 2023-02-20 |

(The metric-level removals from the same table are in §7c, where they matter most.)

> **CONFLICT, flagged not resolved.** The deprecation schedule lists "My Business Calls API"
> as discontinued 2023-05-30, while a live v1 reference page for
> `mybusinessbusinesscalls.googleapis.com` exists with no deprecation banner
> (<https://developers.google.com/my-business/reference/businesscalls/rest>).
> **Treat call-tracking insights as UNVERIFIED and do not build on them.** Shoogle already gets
> `CALL_CLICKS` from the Performance API, which is enough.

> **Q&A is gone.** Anything in Shoogle that imagined answering Google Q&A automatically is dead.
> `accounts.locations.questions` still appears in the v4 reference, but the API was discontinued
> 2025-11-03.

---

## 2. OAuth

**The single scope for every Business Profile API:**

```
https://www.googleapis.com/auth/business.manage
```

Verified verbatim on three separate first-party pages:
- <https://developers.google.com/my-business/content/basic-setup>
- <https://developers.google.com/my-business/reference/verifications/rest/v1/locations/getVoiceOfMerchantState> — "Requires the following OAuth scope: `https://www.googleapis.com/auth/business.manage`"
- <https://developers.google.com/identity/protocols/oauth2/scopes> — listed as "Manage your Business Profile on Google"

**Legacy scope still accepted by some v4 methods** (`reviews.list`, `localPosts.create` and
`media.create` each list *both*):

```
https://www.googleapis.com/auth/plus.business.manage
```

Sources: <https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list> ·
<https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create> ·
<https://developers.google.com/my-business/reference/rest/v4/accounts.locations.media/create>

**Use `business.manage` only.** `plus.business.manage` is a Google+ era relic; requesting it adds
consent-screen surface for nothing.

- OAuth 2.0 is mandatory: <https://developers.google.com/my-business/content/oauth-overview>
- Consent screen must carry app name, logo, homepage, privacy policy and ToS links:
  <https://developers.google.com/my-business/content/oauth-setup>
- **Whether `business.manage` is classified sensitive or restricted — and therefore whether Google
  OAuth app verification (3–5 business days for sensitive, potentially weeks for restricted) is
  required before public release — is UNVERIFIED.** The public scopes page carries no label, and
  the category is shown authoritatively only in the Cloud Console once the scope is added. Assume
  verification *is* needed and budget for it. Process:
  <https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification>

### Shoogle-specific OAuth constraint

`CLAUDE.md` forbids shipping `GOOGLE_OAUTH_CLIENT_SECRET` in the APK, and every `EXPO_PUBLIC_*`
value is readable by anyone who downloads the app. The Android OAuth client id is public by design;
**the code-for-token exchange and refresh must happen server-side** (Supabase Edge Function or
equivalent), with the app holding only short-lived access tokens. This is a Shoogle architecture
requirement, not a Google one.

---

## 3. Access / quota request — THE BLOCKER

**Yes. A request form is mandatory. Until it is approved the APIs return nothing.**

Source: <https://developers.google.com/my-business/content/prereqs>

Prerequisites, quoted:
- "Manage a Google Business Profile that is **verified and active for 60+ days**"
- "Have a **website** representing the business listed on the GBP."
- Plus: a Google Account, a Google Cloud project, and an Organization account.

Process:
1. Google Cloud Console → select project → read the **Project Number** from the Dashboard.
   <https://console.developers.google.com/project>
2. Submit the GBP API contact form and select **"Application for Basic API Access"**.
   <https://support.google.com/business/contact/api_default>
3. Submit from an email that is an **owner or manager on the business's GBP**. The form's email
   domain should match the business website domain
   (<https://developers.google.com/my-business/content/limits>).
4. Wait for the approval email. **"Requests are reviewed within 14 days."**
   <https://developers.google.com/my-business/content/faq>
5. Entry point for the application workflow:
   <https://support.google.com/business/workflow/16726127>

**How to tell whether you are approved** — check quota in the Cloud Console:
- **0 QPM → not approved**
- **300 QPM → approved**

Source: <https://developers.google.com/my-business/content/prereqs>

> **Implication for Shoogle's architecture.** Approval is granted to *our Google Cloud project*,
> not to each salon owner. One approved project then serves every merchant who OAuths in. But the
> *application itself* must come from a party that manages a verified, 60-day-old GBP with a
> matching website. Someone on the team has to own that profile. **This is on the critical path
> and no amount of code works around it.**

---

## 4. Verification gating

Two distinct things, and Shoogle must model both:

**a) Location verification** — the postcard / phone / SMS / email PIN flow.
Managed by the Verifications API: `locations.fetchVerificationOptions`, `locations.verify`,
`locations.verifications.list`, `locations.verifications.complete`.
<https://developers.google.com/my-business/reference/verifications/rest>
"A PIN code and the `locations.verifications.complete` method is usually required to complete the
verification of a business." `AUTO` verification exists for some locations, in which case "the
merchant need not perform any verification steps."
<https://developers.google.com/my-business/content/manage-verification>

**b) Voice of Merchant** — whether the profile is in good standing and edits actually propagate.
`GET https://mybusinessverifications.googleapis.com/v1/{name=locations/*}/VoiceOfMerchantState`
Returns `hasVoiceOfMerchant`, `hasBusinessAuthority`, and exactly one of four recommended actions:
`waitForVoiceOfMerchant`, `verify`, `resolveOwnershipConflict`, `complyWithGuidelines`
(the last carrying a `recommendationReason` — suspension or disablement).
<https://developers.google.com/my-business/reference/verifications/rest/v1/locations/getVoiceOfMerchantState>

### Does verification gate reads, writes, or both? — **BOTH, at least for reviews.**

**CONFIRMED gate on a READ.** `accounts.locations.reviews.list` states:

> "This operation is only valid if the specified location is verified."

<https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list>

**UNVERIFIED for other calls.** The reference pages for `localPosts.create` and `media.create`
do **not** state a verification requirement
(<https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create>,
<https://developers.google.com/my-business/reference/rest/v4/accounts.locations.media/create>).
The Voice of Merchant docs say edits only propagate to Maps once `hasVoiceOfMerchant` is true,
which strongly implies writes are gated in practice — but **Google does not say so per-method,
so Shoogle must not claim it.**

**How Shoogle must handle it:** call `getVoiceOfMerchantState` **first**, before any GBP read or
write, and drive the entire surface off it. This matches `GbpLocation.verificationState` in
`lib/providers/contracts.ts`, whose comment already says "Gates most write operations."

Mapping to `DataState` (`lib/state/DataState.ts`):

| Voice of Merchant result | Shoogle state |
|---|---|
| `hasVoiceOfMerchant: true` | proceed |
| action = `verify` | `unavailable('not_supported', 'This profile is not verified on Google yet. Reviews and posts stay hidden until it is.')` plus an explicit "Verify with Google" action |
| action = `waitForVoiceOfMerchant` | `unavailable('no_data_yet', …)` |
| action = `resolveOwnershipConflict` | `unavailable('not_supported', …)` with the conflict explained |
| action = `complyWithGuidelines` | `unavailable('not_supported', …)`, reason surfaced from `recommendationReason` |

Fetching reviews for an unverified location and rendering the failure as "0 reviews" would be
exactly the lie `CONTRIBUTING.md` rule 1 forbids.

---

## 5. Reviews

**Read: YES. Reply: YES. Delete reply: YES. Delete review: NO.**
API: Google My Business API **v4**, `accounts.locations.reviews`.
<https://developers.google.com/my-business/content/review-data>

| Operation | Method | Endpoint |
|---|---|---|
| List reviews | `accounts.locations.reviews.list` | `GET https://mybusiness.googleapis.com/v4/{parent=accounts/*/locations/*}/reviews` |
| Get one review | `accounts.locations.reviews.get` | v4 |
| Batch across locations | `accounts.locations.batchGetReviews` | v4 |
| Reply (create or update) | `accounts.locations.reviews.updateReply` | v4 — the same call creates a reply or replaces the existing one |
| Delete a reply | `accounts.locations.reviews.deleteReply` | v4 |

**Limits and response shape**
(<https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list>):
- `pageSize` — **maximum 50** reviews per page
- `pageToken` — cursor pagination
- `orderBy` — `rating`, `rating desc`, `updateTime desc` (default `updateTime desc`)
- Response also carries `averageRating` and `totalReviewCount` — real values, safe to render
- `ignoreRatingOnlyReviews` is available on the batch endpoint
- **Requires a verified location** (quoted in §4)

**Recent additions worth building on**
(<https://developers.google.com/my-business/content/latest-updates>):
- `2026-07-24` — review **reply URLs** returned by `reviews.get`, `reviews.list`, `batchGetReviews`
- `2026-07-01` — `PolicyViolation` field on `ReviewReply`: why a submitted reply was rejected
- `2026-04-01` — `ReviewReplyState`: the moderation status of a submitted reply
- `2026-04-20` — `ReviewMediaItem`: thumbnails and video URLs attached to a review

> **This changes Shoogle's review-reply UX materially.** A reply is **not** live on HTTP 200 — it
> enters moderation. `ReviewReplyState` and `PolicyViolation` are the only honest way to report the
> outcome. Per `CONTRIBUTING.md` rule 5 ("Only report success a provider confirmed"), the toast
> after `updateReply` must say "Reply submitted", and the row must then reflect the real
> `ReviewReplyState` — never an optimistic "Replied".

**Not available:** deleting a review, or flagging a review for removal. No first-party method was
found; treat as not possible.

---

## 6. Local Posts

**Create: YES.** API: Google My Business API **v4**, `accounts.locations.localPosts`.
`POST https://mybusiness.googleapis.com/v4/{parent=accounts/*/locations/*}/localPosts`
<https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create>

Methods: `create`, `get`, `list`, `patch`, `delete`.
(`reportInsights` still appears on the resource page but is **discontinued** — see §7c.)

**`LocalPostTopicType` enum**
(<https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts>):

| Value | Meaning |
|---|---|
| `LOCAL_POST_TOPIC_TYPE_UNSPECIFIED` | not specified |
| `STANDARD` | summary + images |
| `EVENT` | requires `event` |
| `OFFER` | requires `event`; carries `offer` (coupon code, redemption link, terms) |
| `ALERT` | high-priority, timely announcement; uses `alertType` |

**Product Posts cannot be created via the API.**
<https://developers.google.com/my-business/content/posts-data>

**Call-to-action types:** `BOOK`, `ORDER`, `SHOP`, `LEARN_MORE`, `SIGN_UP`, `CALL`.
<https://developers.google.com/my-business/content/posts-data>
`GET_OFFER` was discontinued in Q2 2021 —
<https://developers.google.com/my-business/content/change-log>

**Key `LocalPost` fields:** `summary`, `languageCode`, `callToAction`, `scheduledTime`, `event`,
`offer`, `alertType`, `media[]` (**`sourceUrl` is the only supported field** — a post takes a
publicly reachable URL, not a binary upload), `topicType`; output-only `state`, `searchUrl`,
`createTime`, `updateTime`.

**Scheduling and recurrence:**
- `scheduledTime` — future publication time. **Google natively supports Shoogle's "posts are
  scheduled by default" product rule; we are not simulating it.**
- `2026-04-07` — **`RecurrenceInfo` can be set when creating a `LocalPost`**, so recurring posts
  are a first-party feature. <https://developers.google.com/my-business/content/latest-updates>
- `recurringInstanceTime` on `LocalPost` is **deprecated** — use `event.recurring_instance_time`.

**Character limit for `summary`: UNVERIFIED.** The reference does not state one. Do not hard-code a
limit and do not silently truncate; let the API reject and surface the real error.

---

## 7. Performance / insights — READ THIS SECTION TWICE

This is where a wrong assumption costs the most, because Google **deleted** metrics and left no
replacement. Everything below marked "REMOVED — no replacement" must render as
`unavailable('not_supported', …)` in Shoogle **permanently** — never `0`, never an empty chart,
never a flat trend line.

### 7a. What still works

**Business Profile Performance API v1** — `https://businessprofileperformance.googleapis.com`
<https://developers.google.com/my-business/reference/performance/rest>

| Method | Endpoint |
|---|---|
| `locations.getDailyMetricsTimeSeries` | `GET /v1/{name=locations/*}:getDailyMetricsTimeSeries` |
| `locations.fetchMultiDailyMetricsTimeSeries` | `GET /v1/{location=locations/*}:fetchMultiDailyMetricsTimeSeries` |
| `locations.searchkeywords.impressions.monthly.list` | `GET /v1/{parent=locations/*}/searchkeywords/impressions/monthly` |

`fetchMultiDailyMetricsTimeSeries` takes `dailyMetrics[]` (repeated), `dailyRange`
(`start_date` / `end_date`) and optional `dailySubEntityType`. `location` must be
`locations/{locationId}` using an **unobfuscated** listing id.
<https://developers.google.com/my-business/reference/performance/rest/v1/locations/fetchMultiDailyMetricsTimeSeries>

**The complete `DailyMetric` enum — this is the entire universe of GBP metrics available today:**
<https://developers.google.com/my-business/reference/performance/rest/v1/DailyMetric>

| Metric | What it is |
|---|---|
| `BUSINESS_IMPRESSIONS_DESKTOP_MAPS` | impressions on Maps desktop; unique users, counted once per day |
| `BUSINESS_IMPRESSIONS_DESKTOP_SEARCH` | impressions on Search desktop; unique users, once per day |
| `BUSINESS_IMPRESSIONS_MOBILE_MAPS` | impressions on Maps mobile; unique users, once per day |
| `BUSINESS_IMPRESSIONS_MOBILE_SEARCH` | impressions on Search mobile; unique users, once per day |
| `BUSINESS_CONVERSATIONS` | message conversations received on the profile |
| `BUSINESS_DIRECTION_REQUESTS` | direction requests to the location |
| `CALL_CLICKS` | call button clicks |
| `WEBSITE_CLICKS` | website clicks |
| `BUSINESS_BOOKINGS` | bookings via Reserve with Google |
| `BUSINESS_FOOD_ORDERS` | food orders from the profile |
| `BUSINESS_FOOD_MENU_CLICKS` | menu clicks; unique users, once per day |
| `DAILY_METRIC_UNKNOWN` | default/unknown sentinel — **never render this as a value** |

Impressions are **deduplicated per unique user per day**, so "impressions" is not "views" — label
it accordingly. There are exactly **four** impression metrics; any single "profile views" number
must be presented as the sum of those four, with that stated, or not shown at all.

### 7b. Search keywords — the threshold trap

`locations.searchkeywords.impressions.monthly.list` returns `searchKeywordsCounts[]`, each a
`SearchKeywordCount` with `searchKeyword` (lowercased) and `insightsValue`.

**`insightsValue` is a union of `value` OR `threshold`:**
- `value` — "The sum of the number of unique users that used the keyword in a month, aggregated for
  each month requested"
- `threshold` — **"A threshold that indicates that the actual value is below this threshold"**

<https://developers.google.com/my-business/reference/performance/rest/v1/locations.searchkeywords.impressions.monthly/list>

> **This is the single most dangerous field in the API for Shoogle.** Low-volume keywords — which
> is *most* keywords for a neighbourhood salon in Nerul — come back as a lower bound, not a number.
> Rendering a `threshold` as if it were a `value` fabricates data. Rendering it as `0` violates
> "unknown is not zero" twice over.
>
> Model it explicitly in `features/seo/`:
>
> ```ts
> type KeywordImpressions =
>   | { kind: 'exact'; uniqueUsers: number }
>   | { kind: 'below_threshold'; threshold: number }; // render "<15" — never "15", never "0"
> ```
>
> A real measured zero, "below threshold", and "not fetched" are three different things.
> `DataState` covers the third; this union covers the first two.

**How far back keyword and daily data go, and the reporting latency: UNVERIFIED.** Neither
reference page states a maximum range or a data lag. Do not promise "today's numbers"; render
`ReadyState.fetchedAt` and let the last available day be whatever Google returns.

### 7c. REMOVED — permanently unavailable, no replacement

Authoritative: <https://developers.google.com/my-business/content/sunset-dates>
Migration notes: <https://developers.google.com/my-business/content/performance/change-log>

| Removed | Replacement | Discontinued |
|---|---|---|
| `accounts.locations.reportInsights` | `locations.fetchMultiDailyMetricsTimeSeries` | 2023-03-30 |
| `accounts.locations.localPosts.reportInsights` | **NONE** | 2023-02-20 |
| `ALL` metric | **NONE** | 2023-03-30 |
| `QUERIES_DIRECT` | **NONE** | 2023-03-30 |
| `QUERIES_INDIRECT` | **NONE** | 2023-03-30 |
| `QUERIES_CHAIN` | **NONE** | 2023-03-30 |
| `VIEWS_MAPS` | `BUSINESS_IMPRESSIONS_DESKTOP_MAPS` + `..._MOBILE_MAPS` | 2023-03-30 |
| `VIEWS_SEARCH` | `BUSINESS_IMPRESSIONS_DESKTOP_SEARCH` + `..._MOBILE_SEARCH` | 2023-03-30 |
| `ACTIONS_WEBSITE` | `WEBSITE_CLICKS` | 2023-03-30 |
| `ACTIONS_PHONE` | `CALL_CLICKS` | 2023-03-30 |
| `ACTIONS_DRIVING_DIRECTIONS` | `BUSINESS_DIRECTION_REQUESTS` | 2023-03-30 |
| `DrivingDirectionMetricsRequest` / `LocationDrivingDirectionMetrics` | **NONE** | 2023-03-30 |
| `PHOTOS_VIEWS_MERCHANT` | **NONE** | 2023-02-20 |
| `PHOTOS_VIEWS_CUSTOMERS` | **NONE** | 2023-02-20 |
| `PHOTOS_COUNT_MERCHANT` | **NONE** | 2023-02-20 |
| `PHOTOS_COUNT_CUSTOMERS` | **NONE** | 2023-02-20 |
| `LOCAL_POST_VIEWS_SEARCH` | **NONE** | 2023-02-20 |
| `LOCAL_POST_ACTIONS_CALL_TO_ACTION` | **NONE** | 2023-02-20 |
| `MediaInsights` object | **NONE** | 2023-02-20 |

Also gone with the v1 migration: batch calls using `locationNames` in the request body, and the
`Metric` / `MetricOption` objects together with their aggregated and breakdown options — v1 has
**no aggregation or breakdown** beyond `dailySubEntityType`.
<https://developers.google.com/my-business/content/performance/change-log>

**Concretely, Shoogle can never show:**
- how many people viewed a Google Post → `unavailable('not_supported', …)`
- how many people clicked a post's call-to-action → `unavailable('not_supported', …)`
- photo view counts, or merchant-vs-customer photo counts → `unavailable('not_supported', …)`
- "direct vs discovery vs branded" search-query splits → `unavailable('not_supported', …)`
- where driving-direction requests came from → `unavailable('not_supported', …)`

The `MediaItem.insights` field still appears on the v4 media resource
(<https://developers.google.com/my-business/reference/rest/v4/accounts.locations.media>), but
`MediaInsights` was discontinued 2023-02-20. **Treat any `insights` value on a media item as
untrustworthy and do not render it.**

---

## 8. Media / photos

**Upload: YES.** Google My Business API **v4**, `accounts.locations.media`.
`POST https://mybusiness.googleapis.com/v4/{parent=accounts/*/locations/*}/media`
<https://developers.google.com/my-business/reference/rest/v4/accounts.locations.media> ·
<https://developers.google.com/my-business/reference/rest/v4/accounts.locations.media/create>

Methods: `create`, `delete`, `get`, `list`, `patch`, `startUpload`.

Two upload paths:
1. **`sourceUrl`** — hand Google a publicly reachable URL and it fetches the file.
2. **`startUpload` → `MediaItemDataRef` → upload bytes → `create` with `dataRef`** — the binary path.

For a React Native app whose images live on-device, path 2 is the correct one; path 1 would force
Shoogle to host the image publicly first.

`MediaItem` fields: `name`, `mediaFormat` (`PHOTO` | `VIDEO`), `locationAssociation`, `googleUrl`
(read-only, "may change" — do not cache as a stable identifier), `createTime`, `dimensions`,
`attribution`, `description` (settable **only at creation**), `insights` (**do not use** — §7c).

`locationAssociation` category values: `COVER`, `PROFILE`, `LOGO`, `EXTERIOR`, `INTERIOR`,
`PRODUCT`, `AT_WORK`, `FOOD_AND_DRINK`, `MENU`, `COMMON_AREA`, `ROOMS`, `TEAMS`, `ADDITIONAL`.

Minimum photo requirements: **250px on the short edge and 10KB file size**, except `PROFILE` and
`COVER`. Enforce this client-side before upload so the owner gets a real, specific message rather
than a server rejection.

Also from the change log: **food menu photos support up to 200 dish images** (2026-04-07).
<https://developers.google.com/my-business/content/change-log>

---

## 9. Attributes, hours, service areas, services — writable?

**YES, all of it, via the Business Information API v1** (`locations.patch`,
`locations.updateAttributes`).
<https://developers.google.com/my-business/reference/businessinformation/rest> ·
<https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations>

| Field | Writable | Notes |
|---|---|---|
| `regularHours` | Yes | standard opening hours |
| `specialHours` | Yes | holidays; overrides regular hours — **the highest-value automation for Indian festival closures** |
| `moreHours` | Yes | department / special-customer hours |
| `serviceArea` | Yes | for service-area businesses (repair shops, mobile salons) |
| `categories` | Yes | primary + additional |
| `profile` | Yes | business description "in your own voice"; required for most categories |
| `phoneNumbers` | Yes | |
| `websiteUri` | Yes | |
| `openInfo` | Yes | open / closed / temporarily closed |
| `serviceItems` | Yes | "list of services like haircuts or installations" — maps directly onto Shoogle's verticals |
| `latlng` | Conditional | only returned if accepted at creation or set through the GBP UI |
| `metadata` | **No** | "Output only. Additional non-user-editable information." |

Supporting reads:
- `attributes.list` — which attributes are valid for a given primary category and country.
  **Call this before offering any attribute toggle; never hard-code an attribute list.**
- `categories.list` / `categories.batchGet`, `chains.search`, `googleLocations.search`
- `locations.getGoogleUpdated` and `locations.attributes.getGoogleUpdated` — the Google-updated
  version of a location, i.e. what Google changed behind the merchant's back.

`locations.patch` requires an `updateMask`. **Exact `updateMask` semantics: UNVERIFIED** from the
pages fetched — confirm against
<https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/patch>
before writing the first PATCH.

> **`locations.getGoogleUpdated` is the best audit primitive in the whole API family.** It surfaces
> Google-initiated edits the owner never made — precisely the "here is what changed on your listing
> without you" finding that makes `AuditProvider` worth shipping.

---

## 10. Rate limits and quotas

Source: <https://developers.google.com/my-business/content/limits>

| API | QPM | QPD |
|---|---|---|
| Business Information API | 300 | see per-operation caps below |
| Account Management API | 300 | — |
| Performance API | 300 | — |
| Verifications API | 300 | — |
| Lodging API | 300 | — |
| Place Actions API | 300 | — |
| Notifications API | 300 | — |

Business Information API per-operation daily caps:
- **Create Location — 300 QPD**
- **SearchGoogleLocation — 300 QPD**
- **Update Location — 10,000 QPD**
- **10 per minute per Google Business Profile — "cannot be increased"** ← a hard per-merchant
  ceiling that no quota increase touches.

**0 QPM means the access request was not approved.**
<https://developers.google.com/my-business/content/prereqs>

Quota increases: use the support form, select **"Quota Increase Request"**, and supply company
name, contact email and Google Cloud project number; the website domain and email domain should
match. Requests are typically denied when traffic is spiky rather than distributed, or when average
usage sits below roughly 70% of the current limit.
<https://developers.google.com/my-business/content/limits>

> **Design consequence.** The real constraint is **10 QPM per merchant profile**, not 300 QPM
> overall. A single "refresh everything" tap that fans out to locations + reviews + performance +
> attributes can trip it for one salon. Serialise per-merchant calls, back off on 429, and map
> throttling to `unavailable('rate_limited', …)` — a reason code `DataState` already has.

---

## 11. Pricing and billing

**Free.** "The Google My Business API is available to registered users at no charge."
<https://developers.google.com/my-business/content/pricing>

**Whether a Cloud Billing account or credit card must be attached to the project: UNVERIFIED.**
The pricing page states only that there are no usage fees for the API itself. Note that
**Cloud Pub/Sub** — required if Shoogle uses the Notifications API for real-time review alerts —
is a separately billed Google Cloud product and is *not* covered by that statement.

---

## 12. Sandbox / test environment

**There is none.**

> "There's no Sandbox environment for the Business Profile APIs"
> — <https://developers.google.com/my-business/content/basic-setup>

> "there's no direct way to create a fake GBP listing in prod either through GBP UI or API and test
> against it"
> — <https://developers.google.com/my-business/content/faq>

Google's own recommendations: test against a real listing you control (without changing its primary
information) or create one for your own company HQ; and **use mock API responses** for testing.
Some calls accept a **`validateOnly`** parameter to test a request without making changes
(<https://developers.google.com/my-business/content/basic-setup>).

> **This validates Shoogle's fixtures approach outright.** Google explicitly recommends mocked
> responses. `fixtures/gbp-*.ts`, dev-gated behind `EXPO_PUBLIC_ENABLE_FIXTURES` with the visible
> FIXTURE banner (`CONTRIBUTING.md` rule 3), is the sanctioned way to build every GBP screen before
> access is approved. Use `validateOnly` for the first real write.

---

## 13. Required environment variable NAMES

**Names only. Never values. Never commit real credentials.**

Already present in `.env.local.example` and sufficient for GBP:

```
EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_ANDROID   # public by design; ships inside the APK
GOOGLE_OAUTH_CLIENT_ID_WEB                   # server-side token exchange
GOOGLE_OAUTH_CLIENT_SECRET                   # server-side ONLY — must never reach the device
```

Proposed additions for this integration (server-side unless prefixed):

```
GOOGLE_CLOUD_PROJECT_NUMBER                  # required on the access-request form; not a secret
GBP_API_QUOTA_APPROVED                       # "0"/"1" — lets the app honestly distinguish
                                             #   "not connected" from "awaiting Google approval"
GOOGLE_PUBSUB_TOPIC_NAME                     # only if the Notifications API is used
```

Nothing new needs an `EXPO_PUBLIC_` prefix. The OAuth **client secret must not** be prefixed and
must not be reachable from `lib/env` — per `CLAUDE.md` § Secrets.

---

## 14. WHAT SHOOGLE CAN BUILD TODAY

### BUILDABLE NOW — no Google access required

These need zero credentials and zero approval.

1. **The whole GBP surface in its honest unconnected state.** `features/gbp/` registers a provider
   (via `registerProvider()`, never by editing `lib/providers/registry.ts`) whose every method
   returns `unavailable('not_connected', …)`. The registry already answers `not_connected` until
   then, so this is the truthful default, not a placeholder.
2. **`app/(tabs)/business.tsx` in full**, with every metric tile rendering `—` and a stated reason.
   Because the removed-metrics list in §7c is now known and permanent, those "not supported" tiles
   are not temporary scaffolding — **they are the final design.**
3. **The complete `DataState` matrix per GBP capability**, driven by fixtures: loading, ready,
   real-measured-zero, `unavailable` (`not_connected` / `not_supported` / `no_data_yet` /
   `rate_limited` / `auth_expired`), and error. Google itself recommends mock responses (§12).
4. **The verification-gate UX.** Voice of Merchant has four documented outcomes (§4); build all four
   screens now. For a small Indian salon this is likely the *most common* real state, and it
   deserves more design attention than the happy path.
5. **The keyword threshold model** in `features/seo/` — the `exact | below_threshold` union from
   §7b, rendered as `<15`. Getting this type right now prevents a fabricated-data bug later.
6. **`AuditProvider` findings that need no API**: whether a website URL exists, whether hours were
   ever supplied, whether a description exists, NAP consistency against what the owner told us.
   Every GBP-sourced check goes into `AuditReport.uncheckedAreas` with a stated reason — the
   contract already has that field for exactly this.
7. **Local post composition and scheduling UI** targeting the confirmed enum surface
   (`STANDARD` / `EVENT` / `OFFER` / `ALERT`; CTAs `BOOK` / `ORDER` / `SHOP` / `LEARN_MORE` /
   `SIGN_UP` / `CALL`), queued locally until a provider exists. Google's own `scheduledTime` means
   product rule 4 is natively supported rather than faked.
8. **Client-side media validation** — 250px short edge, 10KB minimum, category picker from the
   confirmed enum — before any upload path exists.
9. **The connect flow's dead-end honesty.** Per rule 7 ("no dead controls"), "Connect Google
   Business Profile" must currently disable itself or state that API access is pending Google
   approval. It must not spin.

### BUILDABLE AFTER QUOTA APPROVAL

Unlocked the moment the Cloud project shows 300 QPM. Items marked **[V]** additionally require the
merchant's location to be verified.

1. OAuth connect with `https://www.googleapis.com/auth/business.manage`, server-side token exchange.
2. `accounts.list` + `accounts.locations.list` → a real location picker (Account Management API v1
   + Business Information API v1).
3. `getVoiceOfMerchantState` → drive the whole GBP surface off the real verification state.
4. **[V]** Read reviews (50/page), `averageRating`, `totalReviewCount`, review media, reply URLs.
5. **[V]** Reply to reviews via `updateReply`, with honest `ReviewReplyState` moderation reporting
   and `PolicyViolation` surfaced on rejection.
6. Performance metrics — the eleven live `DailyMetric` values only (§7a), via
   `fetchMultiDailyMetricsTimeSeries`.
7. Monthly search keywords, with `value` vs `threshold` correctly distinguished.
8. Create, schedule and recur local posts, including `RecurrenceInfo`.
9. Photo upload via `startUpload` → `dataRef` → `media.create`.
10. Write hours, special hours (festival closures), attributes, service areas, `serviceItems`,
    description, phone and website via `locations.patch` / `locations.updateAttributes`.
11. **A genuinely differentiated audit** using `locations.getGoogleUpdated` and
    `locations.attributes.getGoogleUpdated` — "Google changed your hours and never asked you."
12. Place action links (booking / order / delivery) via the Place Actions API.
13. The location verification flow itself: `fetchVerificationOptions` → `verify` →
    `verifications.complete`.
14. Real-time review notifications via the Notifications API + Cloud Pub/Sub (Pub/Sub billed
    separately).

### NOT POSSIBLE VIA API — must render as `unavailable('not_supported', …)`

1. **Google Post views and post CTA clicks.** `localPosts.reportInsights` discontinued 2023-02-20,
   no replacement.
2. **Photo views** (merchant or customer) and **photo counts.** Discontinued 2023-02-20, no
   replacement.
3. **Search-query type breakdown** — `QUERIES_DIRECT` / `QUERIES_INDIRECT` / `QUERIES_CHAIN`.
   Discontinued 2023-03-30, no replacement.
4. **Driving-direction geography.** `LocationDrivingDirectionMetrics` discontinued 2023-03-30; only
   the total `BUSINESS_DIRECTION_REQUESTS` count survives.
5. **Google Q&A — reading questions, posting answers.** The Q&A API was discontinued **2025-11-03**.
   Any Shoogle feature that assumed Q&A automation is dead.
6. **Local search ranking** — "where do I rank for *salon near me*". No GBP API returns a rank
   position; nothing in the family exposes it. `SeoProvider.getRankings` must return
   `unavailable('not_supported', …)` unless a *different* provider is integrated, and
   `KeywordRanking.position` must stay `null` — never `0`, exactly as the contract already documents.
7. **Competitor data of any kind.** Not in the API family.
8. **Deleting or flagging a review.** No documented method.
9. **Creating Product Posts.** Explicitly excluded —
   <https://developers.google.com/my-business/content/posts-data>
10. **Aggregated or broken-down insights** beyond `dailySubEntityType`. `Metric` / `MetricOption`
    and the aggregation options were removed in the v1 migration.
11. **Any data at all before the access request is approved.** 0 QPM returns nothing.

---

## 15. Verdict

**VIABLE WITH CONDITIONS.**

Viable: every core Shoogle GBP capability — read reviews, reply to reviews, publish and schedule
posts, upload photos, fix hours and attributes, read real performance metrics — is supported,
documented and free.

The conditions, ordered by how much they can hurt:

1. **Access approval is on the critical path and cannot be engineered around.** It requires a GBP
   verified and active for 60+ days, a matching website, an owner/manager email, and up to 14 days
   of review. **Someone must start this today.** Everything in "buildable after quota approval" is
   idle until then.
2. **OAuth app verification for `business.manage` is UNVERIFIED** and may add days or weeks before
   public release. Assume it applies.
3. **10 QPM per merchant profile cannot be increased.** Design the refresh path around it now, not
   after the first throttle in production.
4. **A large slice of the "marketing dashboard" people expect no longer exists.** Post views, photo
   views, query breakdowns and direction geography were deleted in 2023 with no replacement.
   Shoogle's honesty rules turn that from an embarrassment into a differentiator — but only if the
   UI is designed around `—` from day one instead of retrofitted.
5. **No sandbox.** Fixtures and `validateOnly` are the only safe test path — and Google says so
   itself.

### Immediate actions

1. **Start the API access request now** — <https://support.google.com/business/contact/api_default>,
   "Application for Basic API Access". Needs the Cloud project number and an owner/manager email on
   a verified, 60-day-old GBP with a matching website. **Blocking; 14-day review.**
2. Create the Google Cloud project and enable the APIs so the 0-QPM / 300-QPM signal is readable.
3. Add `business.manage` to the OAuth consent screen and record the sensitivity category the console
   reports — that resolves the one open UNVERIFIED item with schedule impact.
4. Build everything under "BUILDABLE NOW" against dev-gated fixtures while the request is in review.

---

## Open items still marked UNVERIFIED

- Sensitivity classification of `https://www.googleapis.com/auth/business.manage`, and therefore
  whether Google OAuth app verification is required before public release.
- Whether a Cloud Billing account / credit card must be attached to the project.
- Whether `localPosts.create` and `media.create` are gated on a verified location (only
  `reviews.list` states the gate explicitly).
- Character limit for `LocalPost.summary`.
- Performance API data freshness / latency and maximum historical range.
- `updateMask` semantics for `locations.patch`.
- Lodging API service endpoint hostname (irrelevant to Shoogle; not fetched).
- **Business Calls API status — first-party docs conflict.** The deprecation schedule lists it as
  discontinued 2023-05-30; a live v1 reference page exists with no deprecation banner. Do not build
  on it.
