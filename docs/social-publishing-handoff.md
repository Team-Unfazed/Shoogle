# Shoogle Social Publishing — Handoff

> ## ⚠️ SCOPE SUPERSEDED — 2026-09-09
>
> **This document's platform scope is out of date. Do not act on §1, §5 or §15
> without reading this box first.**
>
> Facebook is a **real publishing target**, not merely an authentication
> prerequisite for Instagram. The final scope is **Instagram + Facebook +
> Google Business Profile**, in any combination the owner chooses. The
> statements below that Facebook "is NOT a publishing target" were reversed by
> the product owner and are retained only as a record of what was believed at
> the time.
>
> Still correct and unchanged: **LinkedIn is out of scope**, and Google Maps is
> not a separate integration (GBP local posts surface on Search and Maps).
>
> **Read instead:**
> - `docs/research/meta-facebook-pages.md` — Facebook publishing, and the
>   Instagram auth decision it reopened (resolved: the two OAuth flows stay
>   independent).
> - `docs/research/meta-instagram.md` — Instagram publishing.
> - `docs/agent-memory/yash-changes.md` — the 2026-09-09 entry.
>
> Two further corrections to this document:
> - The secret is **`META_APP_SECRET`**, not `INSTAGRAM_APP_SECRET` — one Meta
>   app serves both platforms, and `.env.local.example` already uses the correct
>   name. Every mention of `INSTAGRAM_APP_SECRET` below is wrong.
> - §12's four open decisions were all answered on 2026-09-08; see the change
>   log.

---


**Written:** 2026-09-03
**Author:** Yash (Claude Code session)
**Branch:** `feature/yash-social`
**HEAD:** `0732ad4`

> **Read this first.** Day 1 (the Social domain foundation) is **committed and
> verified**. Days 2+ were **planning and research only — no code was written
> after `0732ad4`.** Two planning sessions produced a scope change and one
> completed API research pass whose findings are captured in §5 of this document
> and **nowhere else in the repository.** Do not lose §5.
>
> **Nothing publishes. No integration is live. No credential exists in this repo.**

---

## 1. Product Goal

Shoogle's Social/Content Publishing vertical: an AI marketing operator that
composes, schedules and publishes marketing content for Indian local businesses
(salons, gyms, clinics, restaurants, bakeries, boutiques, repair shops) — and
reports honestly when it cannot.

The complete feature, end to end:

1. Owner opens Posts → Create post
2. Chooses a **content objective** (promote a service, announce an offer, share
   an update…) and **which platforms** to post to
3. Shoogle **generates platform-specific content** — not one caption copied
   everywhere — that is SEO/AEO/GEO-aware and reads like a human wrote it
4. Owner **adds/selects media**, **edits** the generated content per platform,
   and **previews** each surface as it will appear
5. Owner **saves a draft, schedules, or publishes now** (scheduling is the
   default — product rule 4)
6. A durable, server-side runner publishes at due time and records the real
   provider outcome — `scheduled → publishing → published` or `failed`, with the
   provider's own error text

### Current platforms — FINAL SCOPE

| Platform | In scope | Notes |
|---|---|---|
| **Instagram** | ✅ **Priority #1** | Via Meta's *Instagram API with Instagram Login* |
| **Google Business Profile (GBP)** | ✅ | Covers Google Search **and** Google Maps presence |

### Explicitly recorded scope decisions

- **LinkedIn is NOT part of this feature.** Removed from scope by the product
  owner on 2026-09-01. It remains in shared foundation code (`ProviderId`,
  `LinkedInProvider`, the Business tab's account list) because those are shared
  files and listing LinkedIn as an unconnected account is *truthful* — but the
  Social feature will never target it.
- **Facebook is NOT a publishing target.** Shoogle will not post to a Facebook
  Page.
- **Facebook/Meta may only be involved where technically required for Instagram
  authentication/API access.** Per Meta's own documentation (see §5), the
  Instagram Login path requires **no Facebook Page at all**, so as things stand
  Facebook is involved *only* in the sense that the developer app lives in the
  Meta App Dashboard.
- **"Google Maps posts" is not a separate integration.** Verified in
  `docs/research/google-business-profile.md`: Maps posts *are* GBP local posts,
  one API family (`accounts.locations.localPosts`).

---

## 2. Work Completed So Far

Everything below is **committed in `0732ad4`** and passes typecheck, lint and the
full test suite. Nothing is stubbed to look finished.

### 2.1 `features/social/types.ts` — domain vocabulary

**Implemented:** `Platform`, `Caption`, `MediaAsset`, `Schedule`, `PublishStatus`,
`PublishTarget`, `PublishFailure`, `PostInsights`, `SocialPost`, `BusinessBrief`.

**Important logic:**
- `SOCIAL_PLATFORMS` is a `const` array with a **compile-time assertion** that
  every member is a real `ProviderId`. Currently
  `['instagram','facebook','linkedin','google_business']` — **must be narrowed to
  `['instagram','google_business']`** per the scope change (not yet done).
- Every provider-supplied number is `number | null`: `reach`, `saves`,
  `width`, `height`, `byteSize`, `durationSeconds`. Never `0` as a placeholder.
- `MediaFormat` includes `'unknown'` as a real member — an Android
  `content://` URI does not always disclose its type, and guessing is forbidden.
- `describeInsights()` returns `null` unless `reportedAt` is set, so an
  unmeasured post cannot render numbers.
- `isConfirmedPublished()` requires `status === 'succeeded'` **and** a non-null
  `remoteId`.

**Limitations:** `caption` is a **single** `Caption` for the whole post. This is
the main thing the per-platform content work must change.

### 2.2 `features/social/postState.ts` — lifecycle state machine

**Implemented:** 8 states (`draft`, `generating`, `ready`, `scheduled`,
`publishing`, `published`, `failed`, `skipped`), 14 events, and a **transition
table** (`TRANSITIONS`) rather than `if` statements.

**Architectural decision — why a table:** every dishonest outcome this product
must avoid is reachable by an `if`. As a table, each is a *missing edge*:
- `published` is **terminal** — zero outgoing edges. You cannot un-publish.
- There is **no `scheduled → published` edge.** Everything passes through
  `publishing`, the only state a provider call is made from.
- `generating --generation_failed--> draft`, never `ready`. A failed generation
  never yields content.
- `content_edited` from `ready`/`scheduled`/`failed` returns to `draft`, because
  edited content has not been re-validated.

`transition()` throws on an illegal move; `canTransition()` is for owner-driven
paths so controls disable rather than throw at the user.

`toSharedStatus()` narrows onto the shared `PostStatus` the design system's
`PostStatusBadge` understands (`generating`/`ready` → `'draft'`), because adding
a badge variant would mean editing shared `components/ui/Badge.tsx`.

### 2.3 `features/social/platforms.ts` — capability matrix

**Implemented:** `Limit<T>` (`value | verification | source`), `unverified()`,
`verified(value, source)`, `PLATFORM_CAPABILITIES`, and four checks
(`checkCaptionLength`, `checkHashtagCount`, `checkMediaFormat`,
`checkSlideCount`).

**Architectural decision — the third outcome.** Checks return
`'ok' | 'violation' | 'unverified'`. `unverified` is **not a pass**; callers must
surface it separately. This is what stops "we validated this" becoming a false
claim.

**Current state: EVERY limit for EVERY platform is `null` / UNVERIFIED.** That
was correct on Day 1 (no research existed). **It is now out of date for
Instagram** — §5 has verified, citable values ready to be entered.

`assumesFormatAccepted()` is hard-wired to return `false` and asserted by a test,
so "PNG is probably fine" cannot quietly become true.

### 2.4 `features/social/captions.ts`

**Implemented:** `ownerCaption`, `generatedCaption`, `editCaption`,
`normaliseHashtags`, `extractInlineHashtags`, `renderCaption`, `captionLength`,
`allHashtags`, `reviewCaption`.

**Important logic:**
- Length is counted in **Unicode code points** via the shared
  `countCharacters`, not `String.length` — a Marathi or emoji caption would
  otherwise measure roughly double.
- **Provenance is preserved:** `editCaption` on generated copy yields
  `generated_edited` and keeps `generatedBy`. Generated copy can never become
  `owner`.
- `extractInlineHashtags` uses `/#[\p{L}\p{M}\p{N}_]+/gu`. The `\p{M}` is
  load-bearing — **this was a real bug found on Day 1**: without it `#नवीमुंबई`
  truncated to `#नव`, because Devanagari vowel signs are combining marks.

### 2.5 `features/social/scheduling.ts` + `time.ts`

**Implemented:** `MIN_SCHEDULE_LEAD_MINUTES = 5`, `MAX_SCHEDULE_HORIZON_DAYS =
90`, `validateSchedule`, `isDue`, `bySoonestDue`, `nextDuePost`, the
`ScheduleRunner` contract; and in `time.ts`, `zonedParts`,
`formatScheduleLabel`, `formatNextUpLabel`, `instantAtZonedTime`,
`zonedDateAhead`.

**Architectural decision — Shoogle owns the clock.** No platform is assumed to
schedule. Adapters only ever publish *now*; a Shoogle-side runner wakes at due
time. (Note: GBP *does* natively support `scheduledTime` — see §6 — so GBP can
delegate. Instagram, as documented, cannot.)

**Timezone handling is real.** Labels are computed in the business's IANA zone
via `Intl.DateTimeFormat`, never the device's. If the zone is unusable the code
falls back to UTC and **suffixes the label " UTC"** — a visibly odd label the
owner can report, rather than a plausible time that is silently 5½ hours out.
`instantAtZonedTime` converges on the correct instant by asking the platform what
its own conversion produced, rather than hard-coding an offset.

**Limitation:** `ScheduleRunner` is a **contract only**. Nothing implements it.

### 2.6 `features/social/generator.ts` — the AI seam

**Implemented:** `SocialContentGenerator` interface (`isConfigured`,
`generateCaption`, `generateSlideCopy`), `CaptionRequest`, `SlideCopyRequest`,
`GeneratedCaption`, `GeneratedSlideCopy`, `unconfiguredGenerator`,
`setSocialContentGenerator`, `getSocialContentGenerator`,
`isGenerationAvailable`.

**Architectural decision:** no screen imports a model SDK. `unconfiguredGenerator`
performs no I/O and returns `unavailable('not_connected', …)`.

**Limitation:** **nothing is behind the seam.** No Gemini implementation exists
in this feature.

### 2.7 `features/social/publisher.ts`

**Implemented:** `createSocialPublisher`, `PlatformPublisher`, `PublishOutcome`,
`applyPublishOutcome`, `toDomainPost`, `ShooglePublisher` (shared
`SocialPublisher` + `attemptPublish`).

**The central guarantee — with an empty `publishers` map (the app's real state):**
- `availableTargets()` → `ready([])` — a genuine known zero
- `schedule()` → `unavailable('not_connected')` **and writes nothing**
- `attemptPublish()` → `unavailable('not_connected')`, no request built

**Why the refusal is the feature:** accepting a schedule with no publisher and no
runner behind it would show the owner a tidy list of upcoming posts, not one of
which could ever go out.

`applyPublishOutcome` is the **only** place a target becomes `succeeded`, and it
requires a provider-issued `remoteId`. `attemptPublish` enters `publishing` and
persists *before* any request leaves, so a crash mid-flight leaves a visibly
in-progress post rather than one that looks scheduled but may already be live.

**Limitation:** no `PlatformPublisher` implementation exists for any platform.

### 2.8 `features/social/store.ts`

**Implemented:** `PostStore` interface (`list`, `get`, `put`, `remove`) and
`createInMemoryPostStore` — **volatile, used by tests only**, documented as such.

**Limitation:** no durable implementation. The real store is Supabase (Sunny's).

### 2.9 `features/social/view.ts` + `usePostsView.ts`

**Implemented:** `buildPostsView` (pure), `isPostsViewEmpty`, `postsViewState`,
`usePostsView`, `NO_POSTS_TITLE`, `NO_POSTS_BODY`.

**Important logic:**
- `lastReach` uses `find` on the most recent published post, **never a sum** —
  adding reach across posts double-counts the same followers, which would be a
  fabricated number from real inputs.
- A published row's result line is either genuinely reported numbers **or** the
  time it went out (`Published Sun · 9:00 AM`). Never invented.
- A post only enters `published` rows if a target carries a `remoteId`.
- `posts === null` (no source at all) → `unavailable('not_connected')`;
  `posts === []` (source answered, nothing there) → `ready` + empty. Two
  different, honest states.

### 2.10 `features/carousel/`

**Implemented:** `types.ts` (`Carousel`, `CarouselSlide`, `SlideContent`,
`CarouselAspect`, `SHOOGLE_MIN_SLIDES = 2`, `SHOOGLE_MAX_SLIDES = 10`),
`ordering.ts` (pure `moveSlide`, `moveSlideEarlier/Later`, `insertSlide`,
`addSlide`, `removeSlide`, `replaceSlide`, `nextSlideId`, `hasUniqueSlideIds`),
`validation.ts` (`reviewCarousel`, `issuesForSlide`).

**Architectural decisions:**
- **Generation state and edit state are separate fields**
  (`SlideGenerationState` × `SlideEditState`). "A model wrote this and the owner
  has since changed it" is a real state one enum cannot express. This is what
  lets "regenerate all" skip touched slides.
- **Order is the array.** No `index` field to drift out of sync.
- Ordering functions are pure and treat out-of-range indices as **no-ops, not
  throws**, because they are driven by gesture handlers where a stale index
  during a drag is ordinary.
- `reviewCarousel(...).ok` means *Shoogle found no fault* — **not** "the platform
  will accept this". Platform checks land in `unchecked`.
- Slide copy is real `<Text>`, never burned into a bitmap (TalkBack).

**Limitation:** model and validation only. **No editor UI exists.**

### 2.11 `app/(tabs)/posts.tsx` — rewritten

Rewritten from Pranay-era wireframe UI reading display strings into a screen that
renders a `PostsView` through `DataStateView`. **The screen derives nothing
itself** — every label comes from a tested pure function.

### 2.12 `fixtures/posts.ts` — rewritten

Converted from wireframe display strings into real `SocialPost` records with
relative ISO instants, so the fixture path exercises the **genuine** derivation
code (including timezone conversion) rather than a parallel one. All records
carry `isFixture: true`.

### 2.13 Two real defects found and fixed on Day 1

1. **Devanagari hashtag truncation** (§2.4) — would have published mangled tags
   for Hindi/Marathi content, which product rule 12 explicitly supports.
2. **Sub-minimum touch targets** — the next-up Preview/Edit buttons are 40 px,
   under Android's 44 pt floor. The design draws them at 40, so they now carry
   2 px vertical `hitSlop`. Caught by the new viewport suite, not by eye.

### 2.14 Work completed AFTER Day 1

**No code.** Two sessions of planning and research:

- **2026-09-01:** Full repository gap analysis; scope narrowed (LinkedIn
  removed); the `Platform` vs `ConnectionRequirement` distinction identified.
- **2026-09-01/03:** **`api-researcher` completed a full Meta/Instagram
  publishing research pass.** Findings in §5. **These were deliberately not
  written to `docs/research/` because the product owner asked that no files be
  modified.** Committing that report is an early task for tomorrow.

---

## 3. Current Code Architecture

| Component | Lives in | Does now | Missing |
|---|---|---|---|
| **Domain types** | `features/social/types.ts` | `SocialPost` + parts; nullable everything provider-supplied | **Per-platform content** — `caption` is single-valued |
| **Lifecycle** | `features/social/postState.ts` | 8-state table, terminal `published` | Nothing. Complete and correct |
| **Platform capabilities** | `features/social/platforms.ts` | `Limit<T>` + 3-outcome checks; all `null` | **Verified Instagram values from §5**; GBP values from existing research; narrow to 2 platforms |
| **Captions/content** | `features/social/captions.ts` | Construction, hashtags, code-point length, provenance, review | Per-platform content shapes; SEO/AEO/GEO; humanization guardrails |
| **Carousel** | `features/carousel/` | Model, pure ordering, validation | Editor UI; max-10 from verified spec |
| **Scheduling** | `features/social/scheduling.ts`, `time.ts` | Validation, due queue, tz-correct labels, runner *contract* | **Runner implementation** (server-side) |
| **Generator** | `features/social/generator.ts` | Seam + honest unconfigured default | **Any implementation** |
| **Publisher** | `features/social/publisher.ts` | Full orchestration; refuses with no adapter | **Any `PlatformPublisher`**; media pipeline |
| **Store** | `features/social/store.ts` | Interface + in-memory (tests) | **Durable persistence** |
| **Posts view-model** | `features/social/view.ts`, `usePostsView.ts` | `SocialPost[]` → `PostsView` → `DataState` | Reads from a real store |

### Existing architecture I consume but must NOT edit

| Area | Owner | What it gives me |
|---|---|---|
| `lib/state/DataState.ts` | Foundation | `loading/ready/unavailable/error`; `unwrapOrNull` only — no `unwrapOr(state, 0)` |
| `lib/providers/contracts.ts` | Shared | `SocialPublisher`, `PublishRequest`, `InstagramProvider`, `GoogleBusinessProfileProvider` |
| `lib/providers/registry.ts` | Shared | `registerProvider()` at runtime — never edit the file |
| `types/domain.ts` | Shared | `ProviderId`, `PostStatus`, `Post`, `Business` |
| `components/ui/`, `components/shared/` | Shared | 21 primitives, `Screen`, `DataStateView`, `FixtureBanner` |
| `theme/` | Shared | All tokens. Never hard-code a colour/size |
| **`features/seo/ai/`** | **Pranay** | **`AiProvider` contract + a free-tier Gemini client with executable data-classification guards.** See §7 — build on this, do not fork |
| **`features/gbp/`** | **Pranay** | `createGoogleBusinessProfileProvider`, `GbpTransport`/`GbpSession` seams, `GBP_OAUTH_SCOPE`. See §6 |
| `features/auth/` | **Sunny** | `SessionProvider`, `registerSignInHandler` — **never called; auth is unimplemented** |
| `lib/supabase/client.ts` | **Sunny** | `getSupabase()` returns `null` while unconfigured |

**Relevant business architecture:** `BusinessProvider.getBusiness()` exists in
the shared contracts but has **no implementation**. `Business.timezone` is the
correct source for schedule display; the Posts screen currently falls back to a
documented `FALLBACK_TIME_ZONE = 'Asia/Kolkata'` constant.

---

## 4. Current UI

### ✅ Implemented

- **`app/(tabs)/posts.tsx`** — Posts tab. Header + Calendar button, three-way
  `Tabs` (Posts / Photos / Performance), scrolling list, floating Create post
  FAB. Renders through `DataStateView`: loading skeleton, honest empty
  ("Nothing scheduled" + connect/skip-pause copy), ready, failed. Verified at
  **390×844 and 412×915** — no horizontal overflow, every control has an
  accessible name, every measurable touch target ≥44 pt.
- **`features/social/components/PostsParts.tsx`** — `MediaPlaceholder`,
  `NextUpCard`, `StatTile` (renders `—` for null, never `0`), `SectionLabel`,
  `ScheduledRow`, `AttentionRow`, `PublishedRow`, `FailedRow`,
  `CreatePostButton`.

### 🟡 Partially implemented

- **Photos / Performance tabs** — render an honest "part of the Social feature
  and is not built yet" empty state. Deliberate: no dead controls, no fake data.

### 🎭 Fixture/demo only

- All Posts content comes from `fixtures/posts.ts`, gated on
  `isFixtureModeEnabled() || isPreview`, with an undismissable `FixtureBanner`.
  `.env.local` currently has `EXPO_PUBLIC_ENABLE_FIXTURES=1` and
  `EXPO_PUBLIC_DEV_PREVIEW=1`, so **the app you see on screen today is fixtures**.

### ❌ Not implemented

**No compose flow. No carousel editor. No Instagram connect screen. No preview
screen. No post detail screen.** There is **no `app/posts/` route namespace at
all** — the only Posts route is the tab.

Every unbuilt action toasts `"<X> is not built yet."` — the Calendar button,
Create post FAB, row taps, Preview, Edit, Retry.

---

## 5. Instagram — CURRENT STATUS

> ### 🚨 PRESERVE THIS SECTION
> These findings come from a completed `api-researcher` pass against Meta's own
> documentation. **They are not in `docs/research/` yet.** Committing them is
> task #1 tomorrow.

### Status summary

| Item | Status |
|---|---|
| Instagram code in this repo | **None.** No adapter, no auth, no publisher |
| Capabilities represented in `platforms.ts` | **All `null` / UNVERIFIED** — now out of date |
| Content formats represented | **None.** No `InstagramContent` type |
| Authentication | **Not started.** No OAuth code |
| Meta Developer App | **Does not exist / not created** |
| Instagram account | **A Shoogle Instagram Professional/Business account exists** (product owner) — not yet connected to any app |
| Publishing | **Not implemented** |
| **Real publish tested?** | **❌ NO. No Instagram post has ever been published by this code.** |
| Credentials present | **None.** `.env.local` holds no Meta values |

### ✅ VERIFIED: no Facebook Page required

> "This API setup does not require a Facebook Page to be linked to the Instagram
> professional account."
> — Meta, *Instagram API with Instagram Login*
> `https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login`

**Both Business and Creator account types are eligible.** Use this path.

| | **Instagram Login** ✅ USE THIS | Facebook Login (older) |
|---|---|---|
| Facebook Page | **Not required** | **Required** |
| Publish scopes | `instagram_business_basic`, `instagram_business_content_publish` | `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` (+ ads scopes) |
| Graph host | `graph.instagram.com` | `graph.facebook.com` |
| OAuth host | `https://www.instagram.com/oauth/authorize` | Facebook Login for Business |
| Deprecated? | **No** | **No** |

Trade-off: Instagram Login gives up hashtag search and competitor insights.
Shoogle's publishing feature needs neither.

### ✅ VERIFIED: publishing mechanics

**Media must be a publicly reachable URL. Binary upload is not available for
images.**

> "We cURL media used in publishing attempts, so the media must be hosted on a
> publicly accessible server at the time of the attempt."
> — Meta, *Content Publishing*

You pass `image_url` / `video_url`. **A device-local photo cannot be published.**
`rupload.facebook.com` offers resumable binary upload for **video only**.

**Flow** (host `graph.instagram.com`):
1. `POST /<IG_ID>/media` → container ID
2. `GET /<IG_CONTAINER_ID>?fields=status_code` → poll until ready
3. `POST /<IG_ID>/media_publish`
4. `GET /<IG_ID>/content_publishing_limit` → remaining quota

**Carousel:** one container per item with `is_carousel_item=true`, then a parent
with `media_type=CAROUSEL` + `children`, then publish the parent.

**Token exchange requires `client_secret` and CANNOT complete on-device.**
- code → short-lived: `POST https://api.instagram.com/oauth/access_token`
- short → long-lived (60 days): `GET https://graph.instagram.com/access_token`
- refresh: `GET https://graph.instagram.com/refresh_access_token`

Authorization code is valid **1 hour, single use**.

### ✅ VERIFIED: formats and limits

| Item | Value |
|---|---|
| Single image / single video / Reels / Stories / Carousel | ✅ all publishable |
| Carousel **max** | **10** items (images/videos/mixed) |
| Carousel **min** | **UNVERIFIED** — Meta documents no minimum |
| **Image format** | **JPEG ONLY.** *"JPEG is the only image format supported."* |
| **PNG** | **❌ NOT ACCEPTED** |
| Caption | **2200 chars, 30 hashtags, 20 @-mentions** |
| Image size / width / ratio | ≤8 MB · 320–1440 px · 4:5 to 1.91:1 · sRGB |
| Video | MP4/MOV, H264/HEVC, AAC 48 kHz, ≤25 Mbps, 23–60 fps, 3 s–15 min, ≤300 MB |
| Story video | ≤60 s, ≥3 s, ≤100 MB |
| **Publishing quota** | **100 API posts / 24 h rolling.** A carousel counts as **one** |
| `alt_text` | Images only since 2025-03-24; **not** Reels or Stories |
| Shopping tags / filters | Not supported |

**The JPEG-only rule is a build requirement.** Any Shoogle-generated creative
must be transcoded to JPEG, resized into 320–1440 px, forced into 4:5–1.91:1 and
kept under 8 MB before the URL is handed to Meta. Do it server-side where the
media is already hosted.

### ✅ VERIFIED: access and review gates

- **Standard Access** — only works for accounts holding a **role on your app**.
  Enough to build and test the entire pipeline today with team accounts as
  testers.
- **Advanced Access** — required for real customers. **App Review is mandatory**
  for `instagram_business_basic` and `instagram_business_content_publish`.
- **Business Verification is mandatory** for Advanced Access (since 2023-02-01).
  Real legal entity + documents.
- **At least one successful API call is required before submitting for review.**
- Review needs a **screencast** and an externally installable, reviewer-testable
  build. **Expo Go will not satisfy this.**

**Sequencing consequence:** App Review depends on a near-finished UI, so it
cannot be left to the end. **Start Business Verification in parallel with
development.**

### Environment variable names

```
EXPO_PUBLIC_META_APP_ID       # app id — publishable, already exists in lib/env
INSTAGRAM_APP_SECRET          # server-side ONLY — never EXPO_PUBLIC_
```

> **Naming note (open decision):** Meta's docs call these
> `EXPO_PUBLIC_INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`. `lib/env/index.ts`
> already exposes `EXPO_PUBLIC_META_APP_ID` in a section labelled *"owner: Yash
> — Social"*. **Reusing `EXPO_PUBLIC_META_APP_ID` avoids editing `lib/env`,
> which is shared foundation code.** An Instagram app *is* a Meta app, so the
> name is accurate. Redirect URI can come from `expo-auth-session`'s
> `makeRedirectUri({ scheme: 'shoogle' })` rather than a new variable.
> **Not yet decided.**

### UNVERIFIED — do not assert

- **Stories on Creator accounts.** One Facebook-Login page said Stories are
  business-only; could not be reproduced on the Instagram Login docs. **Do not
  promise Stories to Creator accounts.**
- **Carousel minimum item count.** (2 is near-certain; Meta doesn't document it.)
- **Whether the spec table applies verbatim to the Instagram Login path** — the
  2200/30/20 and image specs are cited from the Facebook-Login reference tree.
  No reason to think they differ; no Instagram-Login-specific spec page found.
- **Instagram provider-side scheduling.** The documented flow is
  container→publish with no scheduled-time parameter. Absence is not a citation.
  Keep `providerSideScheduling` UNVERIFIED for Instagram.
- App Review turnaround; Business Verification document list for an Indian
  entity; pricing/free tier; India-specific restrictions (none found).

### Exact remaining work

1. Commit the above to `docs/research/meta-instagram.md`
2. Create the Meta app (Instagram product → **API setup with Instagram login**)
3. Fill verified values into `platforms.ts`; narrow `SOCIAL_PLATFORMS`
4. `InstagramContent` type + format union
5. Server-side token exchange (**blocked — see §8**)
6. Connect UI + `registerProvider('instagram', …)` **only once a real token exists**
7. Media pipeline: JPEG transcode/resize + public hosting (**blocked**)
8. `instagramPublisher` implementing `PlatformPublisher`
9. Add team IG accounts as app testers; publish end-to-end under Standard Access
10. Business Verification → App Review

---

## 6. GBP — CURRENT STATUS

### ⚠️ Facts of record

- **Shoogle's GBP is approximately 4 days old.**
- **VahanReady is a separate, older business/account.**
- **VahanReady's GBP API access request is currently PENDING.**
- **Shoogle currently does NOT have GBP API access.**
- **We do NOT have usable GBP API credentials.**
- **GBP API access is NOT approved. Live GBP publishing does NOT work.**

Google's prerequisites require a profile **verified and active for 60+ days**
with a **matching website**. A ~4-day-old profile does not qualify. The
VahanReady request is the live path, and it is pending.

### Already implemented (Pranay's — `features/gbp/`, do not edit)

A substantial adapter: `endpoints.ts` (request construction incl.
`createLocalPostRequest`), `mappers.ts`, `errors.ts` (failure classification),
`voiceOfMerchant.ts` (verification gate), `writeQueue.ts` (per-profile edit
queue), `performance.ts`, `hours.ts`, plus 13 test suites.

**Deliberately NOT registered.** `registerProvider('google_business', …)` is
never called, because `app/(tabs)/business.tsx` shows *"Integration not built
yet"* precisely while a provider is unregistered. Registering a provider that
can only answer `not_connected` would replace a true statement with a false one.

**`transport: GbpTransport | null` defaults to `null`.** While null, no request
is built and every method reports `not_connected`.

**Pranay explicitly did not build a GBP post composer**, recording that
`google_business` is a target of *Yash's* `SocialPublisher` and a second
authoring surface would mean two sources of truth. **The GBP composer is mine.**

### Local Post capabilities — VERIFIED in `docs/research/google-business-profile.md` §6

- API: **Google My Business API v4**, `accounts.locations.localPosts`
  (`create`, `get`, `list`, `patch`, `delete`)
- **Topic types:** `STANDARD` · `EVENT` · `OFFER` · `ALERT`
- **CTAs:** `BOOK` · `ORDER` · `SHOP` · `LEARN_MORE` · `SIGN_UP` · `CALL`
  (`GET_OFFER` discontinued Q2 2021)
- **Product Posts cannot be created via the API**
- **Media: `sourceUrl` is the ONLY supported field** — a publicly reachable URL,
  **not a binary upload**. Same hosting requirement as Instagram.
- **`scheduledTime` is supported natively** — GBP scheduling is *real API
  scheduling*, not Shoogle simulating it. `RecurrenceInfo` is also supported.
- **`summary` character limit: UNVERIFIED.** Do not hard-code or truncate; let
  the API reject and surface the real error.
- Post views and post CTA clicks were **removed from the API in 2023** and must
  render `unavailable('not_supported')` **permanently**.

### OAuth architecture

Single scope `https://www.googleapis.com/auth/business.manage`
(`GBP_OAUTH_SCOPE`, exported from `@/features/gbp`). Server-side token exchange
required. `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_ANDROID` exists in `lib/env` but is
**empty**.

### Blocked by Google's API access

Everything live: OAuth connect, location listing, publishing local posts,
reviews, performance. **A project sits at 0 QPM until approved; 300 QPM once
approved.**

### Remains once access is approved

1. Server-side token exchange + `GbpTransport` HTTP adapter (Pranay's seam)
2. `GbpContent` type (topic type, CTA, event/offer fields) — **mine**
3. `gbpPublisher` implementing `PlatformPublisher` over Pranay's provider — mine
4. Location picker, Voice-of-Merchant gating (Pranay's)
5. Public media hosting for `sourceUrl`
6. `registerProvider('google_business', …)` — **only when OAuth genuinely completes**

---

## 7. Gemini — CURRENT STATUS

### What exists

**`features/social/generator.ts` (mine, IMPLEMENTED):** the
`SocialContentGenerator` seam. Default `unconfiguredGenerator` performs no I/O,
reports `unavailable('not_connected')`. **Nothing is behind it.**

**`features/seo/ai/` (Pranay's, IMPLEMENTED — consume, do not fork):**
- `contract.ts` — `AiProvider`, and an `AiRequestEnvelope<T>` carrying an
  explicit `AiDataClassification` of `'fixture' | 'customer'`. There is
  deliberately no "probably fine" member.
- `gemini.ts` — a **free-tier, development-only** Gemini client, model
  `gemini-2.5-flash`, endpoint `generativelanguage.googleapis.com/v1beta/models`.

**Its guards are executable, not comments:**
- Variable is `GEMINI_API_KEY`. `assertNoPublicGeminiKey()` makes the client
  **refuse to run** if `EXPO_PUBLIC_GEMINI_API_KEY` ever exists.
- Gated on `__DEV__` **and** `isFixtureModeEnabled()` — same gate as fixtures.
  Both non-development EAS profiles force fixture mode off, so a **release build
  cannot reach the network call at all**.
- Refuses real customer data **twice**: the envelope's `classification` must be
  `'fixture'`, **and** the payload itself must contain the `[FIXTURE]` marker.
  Mislabelling real data as fixture still fails, because real data lacks the
  marker. The marker is checked against the **payload only**, never the rendered
  prompt.

### What is NOT wired

- No `SocialContentGenerator` implementation exists.
- `GEMINI_API_KEY` is **not set** in `.env.local`.
- No production server-side proxy exists.

### ⚠️ Critical constraint

**A bare `GEMINI_API_KEY` cannot reach the device.** Expo inlines only
`EXPO_PUBLIC_*` variables into the bundle, and that prefix is **forbidden** for a
generation key (the APK is a zip anyone can unpack). So on a real phone
`process.env.GEMINI_API_KEY` is `undefined` **by design**.

**Consequence: supplying the key enables real generation in Jest/Node — NOT in
Expo Go on the phone.** To see generation in the app you need a proxy.

### Development/testing plan

Implement `geminiSocialContentGenerator` **on top of Pranay's `AiProvider`**, so
his classification guards apply automatically and there is no parallel Gemini
client. Development generation runs against `[FIXTURE]`-marked business data
only. **Free tier is for development/testing only.**

**Open decision:** a small local Node dev-proxy script (holding the key on the
Mac, called over LAN, `__DEV__`-gated, never shipped) would make generation
visible in Expo Go today. Not yet approved.

### Production plan

A **billed/production Gemini configuration** behind a Supabase Edge Function
holding the key server-side, on a tier whose data-use terms permit customer data.
**The free tier must never see a real customer's data** — its terms permit Google
to use submitted content to improve its products.

### Security constraints

- **No Gemini API key appears in this document, and none must ever be committed.**
- Key belongs in `.env.local` (git-ignored via `.env*.local`) as `GEMINI_API_KEY`.
- **Never** `EXPO_PUBLIC_GEMINI_API_KEY`.
- Production key stays server-side.
- Enabling paid usage costs money → **STOP AND ASK** first.

---

## 8. Supabase / Infrastructure

### IMPLEMENTED (exists in the repo)

- `lib/supabase/client.ts` (**Sunny's**) — `getSupabase()` returns `null` while
  unconfigured; never throws at import.
- `features/auth/handlers.ts` (**Sunny's**) — `registerSignInHandler` seam.
  **Never called anywhere. Auth is not implemented.**
- `features/social/store.ts` (**mine**) — `PostStore` interface +
  in-memory implementation for tests.

### NOT IMPLEMENTED — and deliberately so

- **`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are EMPTY
  STRINGS in `.env.local`.** No Supabase project is configured.
- **There is no `supabase/` directory.** No migrations, no Edge Functions.
- No durable `PostStore` implementation.
- No media storage.
- No server-side publishing or scheduling runner.

**I have intentionally implemented none of the above**, because DB schema, RLS,
Storage and Edge Functions are **Sunny's ownership** under the team isolation
contract, and no authorization to cross that boundary has been given.

### PROPOSED (design only — nothing written)

**PROPOSED — social persistence schema.** A `social_posts` table mirroring
`SocialPost` (id, business_id, title, state, per-platform content JSONB, media
refs, targets JSONB incl. provider remote ids/permalinks/failures, schedule
due_at + timezone, insights, timestamps), plus a `publish_attempts` table
recording every attempt with provider error text. RLS scoping every row to the
owning business via the authenticated user.

**PROPOSED — media storage.** A public (or publicly-fetchable-signed) Storage
bucket, because **both Instagram and GBP fetch media by URL**. Plus a
server-side **JPEG transcode + resize + aspect-ratio** step, mandatory for
Instagram (§5).

**PROPOSED — `ig-token-exchange` Edge Function.** Holds `INSTAGRAM_APP_SECRET`,
performs code→short-lived→long-lived exchange and the 60-day refresh.

**PROPOSED — `publish-runner` Edge Function.** Claims due posts, marks in-flight
(so two runners cannot double-post), calls the platform adapter, records the real
outcome. This is what makes `scheduled → publishing → published` work while the
phone is off.

**PROPOSED — provider credential storage.** Long-lived tokens in a
service-role-only table, never reaching the device.

### The convergence — most important structural fact

**Three separate requirements all block on the same missing piece:**

| Need | Why it needs a server |
|---|---|
| Instagram token exchange | `client_secret` cannot ship in the APK |
| Public media hosting + JPEG transcode | Meta and Google both cURL a URL |
| Publish-while-phone-off scheduling | The app is closed at publish time |

**One Supabase project with Edge Functions + Storage unblocks all three.** It is
the single highest-leverage dependency in this feature.

---

## 9. Credentials & External Dependencies

**No secret values appear in this document or anywhere in the repository.**

| Dependency | Current Status | Owner | Required For | Next Action |
|---|---|---|---|---|
| **Meta Developer App** | ❌ Not created | Yash / product owner | All Instagram work | Create app → add Instagram product → **"API setup with Instagram login"** (NOT Facebook login) |
| **Shoogle Instagram Professional/Business account** | ✅ **Exists** | Product owner | Instagram publishing | Add as a **tester/role-holder** on the Meta app to publish under Standard Access |
| **`EXPO_PUBLIC_META_APP_ID`** | ⬜ Empty in `.env.local`; name already in `lib/env` | Yash | Instagram OAuth | Fill after the Meta app exists |
| **`INSTAGRAM_APP_SECRET`** | ❌ Not present | Yash | Token exchange | Server-side only. **Never** `EXPO_PUBLIC_` |
| **Meta Business Verification** | ❌ Not started | Product owner | Advanced Access → real customers | **Start early — it gates App Review** |
| **Meta App Review** | ❌ Not started | Yash | Publishing for non-role accounts | Needs a near-final UI + screencast + installable build |
| **Gemini API key** | ❌ Not set | Product owner | Real content generation | Supply as `GEMINI_API_KEY` in `.env.local` when M4 starts |
| **Gemini production (billed) config** | ❌ Not set up | Product owner | Customer-data generation | Requires paid tier — **STOP AND ASK** before enabling |
| **GBP API access (Shoogle)** | ❌ **Not approved.** Profile is ~4 days old; Google needs 60+ days | Product owner | Any live GBP call | Cannot apply yet — profile too new |
| **GBP API access (VahanReady)** | 🟡 **PENDING** | Product owner | Any live GBP call | Await Google's decision (reviewed within 14 days) |
| **Google OAuth credentials** | ⬜ `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_ANDROID` empty; no web client/secret | Pranay | GBP connect | Blocked behind API access |
| **VahanReady Google Cloud project** | 🟡 Exists; quota **0 QPM until approved** | Product owner | GBP | Check quota — 0 = not approved, 300 = approved |
| **Shoogle Google Cloud project** | ❓ Status unknown to me | Product owner | GBP (future) | Confirm whether one exists |
| **Supabase project** | ❌ **Not configured** — URL and anon key are empty | Sunny | Persistence, token exchange, media, scheduling | **Highest-leverage unblock.** Needs Sunny |
| **Server-side infrastructure** | ❌ No `supabase/` dir, no Edge Functions | Sunny | Live publishing + scheduling | Blocked on the above |
| **Auth implementation** | ❌ `registerSignInHandler` never called | Sunny | RLS-scoped rows | Blocked on Sunny |

---

## 10. Tests & Verification

### Verified today (2026-09-03)

| Check | Command | Result |
|---|---|---|
| **Typecheck** | `npm run typecheck` | ✅ **PASS** — clean, no output |
| **Lint** | `npm run lint` | ✅ **PASS** — exit code 0, no warnings |

### From the full run immediately before commit `0732ad4`

| Check | Result |
|---|---|
| **Tests** | ✅ **2,342 passed / 2,342** across **50 suites** |

**Provenance note:** the test figure is from the complete `npm test` run executed
immediately before committing. **No application code has changed since that
commit** (`git status` shows only a pre-existing `package-lock.json`
modification), so the figure still stands — but **re-run `npm test` tomorrow to
confirm rather than trusting this line.**

### Social/carousel test suites added on Day 1 (8 suites)

| Suite | Covers |
|---|---|
| `features/social/__tests__/postState.test.ts` | Every legal edge, and the illegal ones: `published` terminal, no `scheduled→published`, failed generation → draft |
| `features/social/__tests__/honesty.test.ts` | **All limits null**; `assumesFormatAccepted() === false`; JPEG *and* PNG both answer `unverified`; no `succeeded` without `remoteId`; insights never fabricated; a real zero ≠ unknown |
| `features/social/__tests__/scheduling.test.ts` | Timezone-correct labels, midnight as 12:00 AM, TODAY/TOMORROW only when true, UTC fallback marked, all 5 rejection reasons |
| `features/social/__tests__/captions.test.ts` | Devanagari hashtags, code-point counting, provenance non-laundering, "nothing wrong" vs "nothing checked", generator seam |
| `features/social/__tests__/publisher.test.ts` | **With no adapter: nothing is stored**; `publishing` before any request leaves; no insights on publish; skip/cancel; refuses to skip a published post |
| `features/social/__tests__/view.test.ts` | reach null vs reported; no summing across posts; unconfirmed publications excluded |
| `features/social/__tests__/android-viewports.test.tsx` | Posts at 390×844 and 412×915: overflow, labels, 44 pt floor, both data states |
| `features/carousel/__tests__/carousel.test.ts` | Ordering invariants, unique ids, generation vs edit axes, blocking vs advisory issues, `unchecked` never claimed as accepted |

### Known issues / warnings

- **No build has been run.** `npm run build:android:*` (EAS) has not been
  executed this session. There is no `npm run build` script.
- `features/social/__tests__/android-viewports.test.tsx` imports the walker from
  `__tests__/android-qa.test`, which re-runs that file's own describes inside
  this suite. Noisy but harmless, and it follows the existing precedent in
  `features/seo/__tests__/android-viewports.test.tsx` (which documents why the
  walker is imported rather than forked).
- An Expo **web dev server may still be running** from an earlier session
  (`expo start --web`, port 8081). Harmless; kill it if a port conflict appears.

---

## 11. Git State

```
Branch:  feature/yash-social
HEAD:    0732ad482294f33e7e4d39877519033c42b93ae0
         0732ad4 feat(social): establish posts carousel and scheduling foundation
Date:    2026-09-01 00:00:57 +0530
```

### `git status --short`

```
 M package-lock.json
```

### ⚠️ Pre-existing modification — MUST NOT be attributed to this work

**`package-lock.json` was already modified before this work began** (it appeared
in `git status` at the very first inspection of the first session, from an
earlier `npm install`). It is **deliberately not staged and not committed**.
**Do not commit it as part of Social work, and do not discard it** — it is not
mine to revert.

### Untracked files

**None.** Everything created for Day 1 is committed.

### Commits made during this work

Exactly **one**:

```
0732ad4 feat(social): establish posts carousel and scheduling foundation
```

Files in that commit: `app/(tabs)/posts.tsx` (modified), `fixtures/posts.ts`
(rewritten), `features/social/*` (11 new + 3 modified),
`features/carousel/*` (4 new + 2 modified), `docs/agent-memory/yash-changes.md`
(new).

### Branch provenance — important

`feature/yash-social` was created from **`f97bb07`, the tip of
`feature/pranay-seo`**, with the product owner's explicit approval. There is no
`main` branch in this repository, and the contract's stated baseline commit
`9015a60` **does not exist** in this history (the foundation commit is
`3caa0d3`).

**Consequence: this branch contains Pranay's 15 SEO commits as history.** That is
expected. **No file of Pranay's has been edited.**

### Branches present

```
  feature/pranay-seo
* feature/yash-social
  remotes/origin/feature/pranay-seo
```

`feature/yash-social` has **not been pushed**.

---

## 12. Known Blockers

### Code blockers

- `SOCIAL_PLATFORMS` still contains `facebook` and `linkedin`. Must narrow to
  `['instagram','google_business']`; `honesty.test.ts`, `publisher.test.ts` and
  `view.test.ts` iterate it and will need updating.
- `SocialPost.caption` is single-valued — blocks per-platform content.
- `PLATFORM_CAPABILITIES` is all-null and now **out of date** for Instagram.
- No `PostStore` durable implementation → Posts screen can only show fixtures.
- **No compose route namespace exists** (`app/posts/` absent).

*None of these block live functionality — they are simply unwritten.*

### Instagram/Meta blockers

| Blocker | Blocks |
|---|---|
| **No Meta Developer App exists** | Everything Instagram |
| **No server-side token exchange** | Connect — `client_secret` cannot ship on-device |
| **No public media hosting** | Publishing — Meta cURLs the URL; device-local files cannot publish |
| **No JPEG transcode pipeline** | Publishing any non-JPEG creative |
| **App Review not started** | 🔸 *Production only* — Standard Access works today with tester accounts |
| **Business Verification not started** | 🔸 *Production only* — but gates App Review, so start early |

### GBP/Google blockers

| Blocker | Blocks |
|---|---|
| **Shoogle GBP is ~4 days old** — Google requires 60+ days verified | Applying at all |
| **VahanReady API access PENDING** | All live GBP calls (0 QPM until approved) |
| **No Google OAuth credentials** | Connect |
| **No server-side token exchange** | Connect |
| **No public media hosting** | Local post media (`sourceUrl` only) |

### Gemini blockers

| Blocker | Blocks |
|---|---|
| **`GEMINI_API_KEY` not set** | Any real generation |
| **Key cannot reach the device** (Expo inlines only `EXPO_PUBLIC_*`) | Generation **in the app**; tests are unaffected |
| **No production proxy / billed tier** | 🔸 *Production only* — free tier must never see customer data |

### Supabase/infrastructure blockers

| Blocker | Blocks |
|---|---|
| **No Supabase project configured** (URL + anon key empty) | Persistence, token exchange, media, scheduling |
| **No `supabase/` dir, no Edge Functions** | Live publishing and scheduled execution |
| **Auth unimplemented** (`registerSignInHandler` never called) | RLS-scoped rows |

### Product decisions — ALL FOUR STILL OPEN

These were asked but never answered; **implementation should not start until they
are settled**:

1. **Server-side boundary** — do I (a) build adapters in my feature and write
   schema/RLS/Edge Functions as a **proposal doc** for Sunny [recommended],
   (b) create `supabase/` myself (crosses Sunny's ownership), or (c) defer all
   server work and ship device-durable only?
2. **Env naming** — reuse `EXPO_PUBLIC_META_APP_ID` (zero shared-file edits)
   [recommended], or add `EXPO_PUBLIC_INSTAGRAM_APP_ID` (requires editing
   `lib/env/index.ts`, which is Sunny's)?
3. **Gemini reach** — build the local dev-proxy script [recommended], tests-only,
   or wait for the Edge Function?
4. **Credentials** — which of Gemini key / Meta app / GBP access / Supabase can
   actually be supplied?

### Blocking LIVE functionality vs blocking PRODUCTION only

| Blocks LIVE (nothing works without it) | Blocks PRODUCTION only |
|---|---|
| Meta app, token exchange, media hosting | App Review, Business Verification |
| GBP API access approval | Billed Gemini tier |
| Gemini key (for generation) | Auth + RLS (dev can use device-durable) |
| Supabase project (for scheduled publishing) | |

---

## 13. Remaining Work — PRIORITIZED

> **Instagram is priority #1.** GBP is deliberately last: it is hard-blocked on
> Google's pending access request, which no amount of code works around.

### Phase 0 — Immediate (no credentials needed, ~1 session)

- [ ] Commit §5 to `docs/research/meta-instagram.md` (the research is done; the
      file was not written because file changes were paused)
- [ ] Answer the four open product decisions in §12
- [ ] Narrow `SOCIAL_PLATFORMS` to `['instagram','google_business']`; update the
      three tests that iterate it
- [ ] Fill **verified** Instagram values into `platforms.ts` with sources:
      caption 2200, hashtags 30, `acceptedImageFormats: ['jpeg']`,
      `acceptedVideoFormats: ['mp4','mov']`, `carouselMaxSlides: 10`,
      `requiresAppReview: true`. Leave carousel **min** and
      `providerSideScheduling` **unverified**
- [ ] Fill verified GBP values from `docs/research/google-business-profile.md`
      (`providerSideScheduling: true` — natively supported; summary limit stays
      unverified)
- [ ] Add a test asserting PNG is now a **violation** for Instagram, not
      `unverified`

### Phase 1 — Instagram Foundation

- [ ] Create the Meta Developer App → Instagram product → **API setup with
      Instagram login**
- [ ] Add the existing Shoogle Instagram Professional account as a **tester/role
      holder** (enables Standard Access publishing)
- [ ] `EXPO_PUBLIC_META_APP_ID` into `.env.local`; `INSTAGRAM_APP_SECRET`
      server-side only
- [ ] `Platform` vs **`ConnectionRequirement`** split — a Page (if ever required)
      is a connect-screen prerequisite, **never** a composer target
- [ ] `instagram_business_basic` + `instagram_business_content_publish` scopes
- [ ] OAuth via `expo-auth-session`, `makeRedirectUri({ scheme: 'shoogle' })`
- [ ] **Server-side token exchange** (blocked — decision 1)
- [ ] Long-lived token storage + 60-day refresh
- [ ] Connect UI; `registerProvider('instagram', …)` **only once a real token
      exists**

### Phase 2 — Instagram Publishing

- [ ] Public media hosting (blocked — decision 1)
- [ ] **JPEG transcode + resize (320–1440 px) + aspect (4:5–1.91:1) + ≤8 MB**
- [ ] `MediaHost` seam with real client-side validation against verified specs
- [ ] Single-image publish: container → poll `status_code` → `media_publish`
- [ ] Carousel: per-item containers (`is_carousel_item=true`) → parent
      (`media_type=CAROUSEL`) → publish
- [ ] Reels / Stories (**note: Stories on Creator accounts is UNVERIFIED**)
- [ ] `alt_text` for image posts
- [ ] Read `content_publishing_limit` before scheduling (100/24 h)
- [ ] Error handling → real `PublishFailure` with the provider's own message
- [ ] Persist `remoteId` + `permalink`; **never `succeeded` without a remote id**
- [ ] **Publish one real post to the Shoogle IG account and verify it on
      Instagram** ← the only thing that makes "publishing works" true

### Phase 3 — Shoogle Compose Flow

- [ ] `app/posts/` route namespace (no `(app)` group — foundation freeze)
- [ ] Objective picker → platform picker → generate → media → per-platform edit →
      preview → draft / schedule / publish
- [ ] **Schedule primary, "Post now" secondary** (product rule 4)
- [ ] Per-platform preview tabs
- [ ] Carousel editor: add / remove / reorder / edit / preview / validate
- [ ] Single-image and UGC-style Instagram formats
- [ ] Keep generation state and edit state separate (Day 1 decision)

### Phase 4 — Content Intelligence

- [ ] `BusinessContext` (name, category, services, location, description,
      keywords, audience, objective) as the **single source of truth**
- [ ] Platform-specific prompt builders — Instagram ≠ GBP, never one caption
      copied across
- [ ] SEO: natural keyword usage, local search intent
- [ ] AEO: question-answering structure for answer engines
- [ ] GEO: neighbourhood/locality/service-area relevance
- [ ] **Humanization guardrails as executable tests:** keyword-stuffing detector,
      AI-cliché blocklist, repetition/burstiness checks
- [ ] **Fabrication guard:** reject any claim, number, service or offer not
      traceable to `BusinessContext`
- [ ] `geminiSocialContentGenerator` over Pranay's `AiProvider` (**not** a
      parallel Gemini client)
- [ ] Provenance: `generated` → `generated_edited`, never silently `owner`

### Phase 5 — Scheduling

- [ ] Durable persistence (`AsyncStoragePostStore` and/or `SupabasePostStore`)
- [ ] Server-side runner: claim due → mark in-flight → publish → record outcome
- [ ] Double-publish prevention (in-flight claim)
- [ ] Retries with real backoff; record every attempt
- [ ] Timezone respected end to end (`Business.timezone`, not the device's)
- [ ] Posts screen reads the real store instead of fixtures

### Phase 6 — GBP (only after API access is approved)

- [ ] Confirm quota shows **300 QPM** (0 = still not approved)
- [ ] `GbpContent` type: `STANDARD`/`EVENT`/`OFFER`/`ALERT` + the 6 CTAs
- [ ] GBP-specific generation — **not** Instagram captions copied over
- [ ] `gbpPublisher` over Pranay's `GbpTransport`
- [ ] Use GBP's **native `scheduledTime`** rather than Shoogle's runner
- [ ] Media via `sourceUrl` (public URL, no binary upload)
- [ ] Let the API reject an over-long `summary`; never truncate silently
- [ ] Post views / CTA clicks stay `unavailable('not_supported')` **permanently**

---

# EXACT NEXT STEP TOMORROW

## → Create the Meta Developer App with Instagram Login, and commit the Instagram research.

The research proving **no Facebook Page is required** is complete but **exists
only inside this handoff** (§5). Everything in Phase 1 depends on a Meta app
existing, and creating it is a **you** action I cannot do — but I can commit the
research and land Phase 0 in parallel.

**Your action (~15 minutes, in a browser):**

1. Go to <https://developers.facebook.com/apps> → **Create App**
2. Add the **Instagram** product
3. Choose **"API setup with Instagram login"** — ⚠️ **NOT** "API setup with
   Facebook login". This is the whole reason no Facebook Page is needed.
4. Copy the **Instagram App ID** and **Instagram App Secret**
5. Under *Roles* / *Instagram Testers*, add the existing **Shoogle Instagram
   Professional account** so it can publish under Standard Access
6. Put them in `.env.local` — **never paste them into chat:**

```bash
EXPO_PUBLIC_META_APP_ID=<the app id>
INSTAGRAM_APP_SECRET=<the app secret>
```

`.env.local` is git-ignored via `.env*.local`. **Never** create
`EXPO_PUBLIC_INSTAGRAM_APP_SECRET`.

**My first actions tomorrow (no credentials needed):**

```bash
git status                    # expect: only ' M package-lock.json'
git log --oneline -1          # expect: 0732ad4
npm test                      # confirm 2342/50 still green
```

Then Phase 0: commit `docs/research/meta-instagram.md`, narrow
`SOCIAL_PLATFORMS`, and fill the verified Instagram/GBP values into
`platforms.ts` — turning PNG from `unverified` into a real `violation`.

**Files to inspect first:**

| File | Why |
|---|---|
| `docs/social-publishing-handoff.md` | This document — §5 especially |
| `features/social/platforms.ts` | The all-null matrix Phase 0 fills in |
| `features/social/types.ts` | `SOCIAL_PLATFORMS` to narrow |
| `features/social/publisher.ts` | Where `instagramPublisher` plugs in |
| `features/seo/ai/contract.ts` | Pranay's `AiProvider` — build on it |
| `docs/research/google-business-profile.md` §6 | Verified GBP local-post capabilities |
| `docs/agent-memory/yash-changes.md` | Day 1 decision log |

**Also answer the four open decisions in §12** — implementation should not start
until decision 1 (the server-side boundary) is settled, because it determines
whether Instagram connect is buildable at all.

---

## 15. Decisions We Must NOT Forget

- **Instagram + GBP only.**
- **No LinkedIn.** Removed from scope 2026-09-01.
- **Facebook is not a publishing target.**
- **Use the existing Shoogle Instagram Professional/Business account.**
- **Prefer Instagram Login** — officially supported for our publishing needs
  **without** a Facebook Page (verified, §5).
- **Do not assume a Facebook Page is required.**
- **Verify current Meta requirements against official Meta documentation** before
  implementing.
- **GBP API access is currently pending.**
- **VahanReady's GBP API request is currently pending.**
- **Shoogle's GBP is new (~4 days) and does not have API access.**
- **Supabase production infrastructure belongs to Sunny.**
- **Do not modify Sunny's Supabase infrastructure without authorization.**
- **Gemini free tier is for development/testing only.**
- **Production Gemini must use the billed/production configuration.**
- **Never hardcode or commit API keys/secrets.** Never `EXPO_PUBLIC_` on a
  secret.
- **Never claim an integration works without testing it against the real
  provider.**
- **Preserve the current architecture and seams** unless there is a concrete
  reason to change them.
- **Do not redo completed work** — Day 1 is done, committed and green.

### Day 1 architectural decisions that must survive

- `published` is **terminal**; there is **no `scheduled → published`** edge.
- `succeeded` is set in **exactly one function** and requires a provider
  `remoteId`.
- Checks answer **`ok` / `violation` / `unverified`** — an unverified check is
  **not** a pass.
- **Unknown is not zero.** No `unwrapOr(state, 0)` exists, deliberately.
- **No `registerProvider()`** for a provider that cannot complete a real OAuth
  flow — the Business tab's "Integration not built yet" is true only while
  unregistered.
- The publisher **refuses to store a schedule** it cannot honour.
- Generation state and edit state are **separate axes** on a carousel slide.
- **Do not edit** `components/ui/`, `components/shared/`, `theme/`, `lib/`,
  `features/gbp/`, `features/seo/`, `features/auth/`.

---

## 16. Tomorrow's Checklist

```
[ ] Read this handoff (§5 is the irreplaceable part — the Instagram research
    exists nowhere else)
[ ] git status                 -> expect only ' M package-lock.json' (pre-existing,
                                  do NOT commit it, do NOT discard it)
[ ] git rev-parse --abbrev-ref HEAD   -> expect feature/yash-social
[ ] git log --oneline -1              -> expect 0732ad4
[ ] npm test                          -> confirm 2342 passing / 50 suites
[ ] Answer the four open decisions in §12 (decision 1 gates Instagram connect)
[ ] Continue from EXACT NEXT STEP TOMORROW: create the Meta app with
    Instagram Login; commit docs/research/meta-instagram.md; land Phase 0
[ ] Do not redo completed work — Day 1 is committed and green
[ ] Test each real integration against the real provider before claiming
    completion. No Instagram post has been published yet, so nothing may
    claim Instagram publishing works.
```
