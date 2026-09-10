# Yash — changes

Running log for the Social vertical (Posts, carousel, captions, scheduling,
publishing). Append a new dated section every session.
**No secrets in this file — variable names only.**

---

## 2026-08-31 — Day 1: the Social domain foundation

### Branch

`feature/yash-social`, created from `f97bb07` (the tip of `feature/pranay-seo`).

**Why that base, and what it means.** At session start the only branch in the
repository — local or remote — was `feature/pranay-seo`. There is no `main`,
and the contract's stated baseline commit `9015a60` does not exist in this
repo's history (the foundation commit is `3caa0d3`). Branching from Pranay's
tip was confirmed with the product owner before any code was written; the
alternative was branching from `b0e683f`, the last commit before his SEO work,
which would have diverged from the current app shell. **My branch therefore
contains Pranay's 15 SEO commits as history. I have not edited any of his
files.**

### Task

Build the Social domain foundation: post model and state machine, carousel
architecture, captions, the scheduling contract, and the generator/publisher
interfaces — with no fake publishing anywhere.

### Completed

**`features/social/` — the domain**

| File | What it does |
|---|---|
| `types.ts` | `Platform`, `Caption`, `MediaAsset`, `Schedule`, `PublishStatus`/`PublishTarget`, `PostInsights`, `SocialPost`, `BusinessBrief` |
| `postState.ts` | 8-state lifecycle as a transition TABLE + `transition()`/`canTransition()` |
| `captions.ts` | Construction, hashtags, code-point length, provenance, `reviewCaption` |
| `platforms.ts` | Capability matrix + `checkCaptionLength/HashtagCount/MediaFormat/SlideCount` |
| `scheduling.ts` | `validateSchedule`, `isDue`, `nextDuePost`, `ScheduleRunner` contract |
| `time.ts` | `zonedParts`, `formatScheduleLabel`, `formatNextUpLabel`, `instantAtZonedTime` |
| `generator.ts` | `SocialContentGenerator` seam + `unconfiguredGenerator` |
| `publisher.ts` | `createSocialPublisher` (shared `SocialPublisher` + `attemptPublish`) |
| `store.ts` | `PostStore` interface + in-memory implementation (tests only) |
| `view.ts`, `usePostsView.ts` | `SocialPost[]` -> `PostsView` -> `DataState<PostsView>` |

**`features/carousel/`** — `types.ts` (Carousel, CarouselSlide, aspects),
`ordering.ts` (pure move/add/insert/remove, invariants), `validation.ts`
(`reviewCarousel`, blocking vs advisory issues).

**`app/(tabs)/posts.tsx`** — rewritten to render a `PostsView` through
`DataStateView`. The screen now derives nothing itself; every label on it comes
from a tested pure function.

**`fixtures/posts.ts`** — rewritten from wireframe display strings into real
`SocialPost` records, so the fixture path exercises the genuine derivation code
rather than a parallel one.

**Tests** — 7 new suites, ~130 tests: `postState`, `honesty`, `scheduling`,
`captions`, `publisher`, `view`, `android-viewports` (Posts at 390x844 and
412x915), plus `features/carousel/__tests__/carousel.test.ts`.

### Decisions that must not be quietly reversed

1. **Every entry in `PLATFORM_CAPABILITIES` is `null` / UNVERIFIED.** No Meta or
   LinkedIn research exists in `docs/research/`, so this feature knows no
   caption limit, no accepted image format and no slide count. Checks answer a
   third outcome, `'unverified'`, which callers must handle separately from
   `'ok'` — an unchecked limit is not a pass. `assumesFormatAccepted()` is
   asserted `false`, which is the standing guard against "PNG is probably fine".
2. **Shoogle owns the scheduling clock.** No platform is assumed to schedule.
   Adapters only ever publish NOW; a Shoogle-side runner wakes at due time.
3. **`schedule()` refuses while no platform adapter is wired up** and writes
   nothing. Accepting the schedule would show the owner upcoming posts that
   could never go out.
4. **A target reaches `succeeded` in exactly one place** (`applyPublishOutcome`)
   and only with a provider-issued remote id. `published` is a terminal state,
   and there is no `scheduled -> published` edge — everything passes through
   `publishing`.
5. **Nothing calls `registerProvider()` for instagram/facebook/linkedin.** Same
   reasoning `features/gbp` records for Google: `app/(tabs)/business.tsx` shows
   "Integration not built yet" precisely while a provider is unregistered.
6. **No model SDK is imported anywhere in this feature.** The UI depends on
   `SocialContentGenerator`; the default implementation reports
   `unavailable('not_connected')` and performs no I/O.
7. **Generation and edit state are separate axes on a carousel slide**, and post
   lifecycle / per-target publish status / provider connection are three
   separate axes on a post.

### Bugs found and fixed on the way

- **Devanagari hashtags were being truncated.** `extractInlineHashtags` used
  `[\p{L}\p{N}_]+`, which excludes combining marks, so `#नवीमुंबई` became
  `#नव`. Product rule 12 explicitly allows Hindi/Marathi business content, so
  this would have published mangled tags. Fixed by adding `\p{M}`; covered by a
  test.
- **The next-up Preview/Edit buttons were 40px tall**, under Android's 44pt
  minimum touch target. The design draws them at 40, so rather than break the
  transcribed geometry they now carry 2px of vertical `hitSlop`. Caught by the
  new viewport suite, not by eye.

### API status

| Integration | Status |
|---|---|
| Instagram / Facebook (Meta) | **UNVERIFIED.** No research, no app, no credential. No `EXPO_PUBLIC_META_APP_ID` value set |
| LinkedIn | **UNVERIFIED.** Same |
| Google Business Profile (as a post target) | Pranay's adapter exists but is deliberately unregistered and has no approved quota |
| Content generation | **Not configured.** No endpoint, no approved model tier, no key anywhere in the repo |

Nothing was called. No credential was created, requested or used.

### Current state

Typecheck, lint and the full suite pass: **2,342 tests, 50 suites**. The Posts
tab renders honest loading / empty / ready / failed states at both target
viewports, with a labelled fixture banner when fixture mode is on.

### Known gaps (not bugs — unbuilt on purpose)

- No compose/create-post screen yet. The FAB and row actions toast "not built
  yet" rather than opening a dead end. No `app/posts/` route namespace exists.
- No carousel editor UI; the model and validation exist, the screens do not.
- `PostStore` has only an in-memory implementation.

### Blockers

1. **Meta and LinkedIn API research.** Nothing in `platforms.ts` can be filled
   in until `api-researcher` reports land in `docs/research/`. This blocks
   caption-length validation, format validation and carousel size limits.
2. **A durable post store and a server-side scheduled runner** — Sunny's area
   (Supabase + RLS + scheduled execution). Until both exist, scheduling cannot
   be offered to an owner honestly. An on-device timer is not an acceptable
   substitute: a sleeping phone cannot publish.
3. **A generation endpoint and an approved model tier.** Needs a STOP-AND-ASK
   before any paid usage. The key must be server-side — anything `EXPO_PUBLIC_*`
   ships inside the APK and is readable by anyone who downloads it.

### Next step

Run `api-researcher` for Meta (Instagram Graph publishing) and LinkedIn, commit
the reports to `docs/research/`, and replace the corresponding `unverified()`
entries with `verified(value, source)` plus tests. Then the compose flow, with
Schedule as the primary action and "Post now" secondary.

### Things that must not change

- The four honest states and `DataState<T>`; no `unwrapOr(state, 0)`.
- `published` stays terminal; nothing reaches it without a remote id.
- `PLATFORM_CAPABILITIES` stays unverified until first-party docs say otherwise.
- No `registerProvider()` for a provider that cannot complete a real OAuth flow.
- Fixtures stay dev-gated and bannered; `fixtures/posts.ts` records are
  `isFixture: true`.

---

## 2026-09-08 — Phase 0: Instagram research committed, capability matrix filled

### What landed

**1. `docs/research/meta-instagram.md`** — the Meta/Instagram publishing report.
The research pass ran on 2026-09-01 but its findings were never written to a
file, so they survived only inside `docs/social-publishing-handoff.md` §5. They
are now in `docs/research/` where the rest of the team looks, and
`docs/research/README.md` lists the report and the finding that changes the
build.

Before committing a single number I **re-fetched every cited Meta page** and
confirmed the quoted sentence was still on it. That was not ceremony: four of
these numbers are about to become executable validation, and a citation nobody
has opened is not a citation. Two lines could not be re-confirmed (the
"one successful API call before App Review" rule and the screencast/installable-
build requirement) and are labelled **NOT RE-CONFIRMED** in the report rather
than quietly promoted to fact.

**2. `SOCIAL_PLATFORMS` narrowed to `['instagram', 'google_business']`.**
LinkedIn left scope on 2026-09-01 and Facebook was never a publishing target.
Both remain valid `ProviderId`s — listing them as unconnected accounts in the
Business tab is *truthful* — but a platform Shoogle can never publish to does
not belong in an array that every capability check, target picker and publisher
loop iterates.

**3. `PLATFORM_CAPABILITIES` filled in, partially and visibly so.**

| Platform | Verified | Still `unverified()`, on purpose |
|---|---|---|
| Instagram | caption 2200 · hashtags 30 · images `['jpeg']` · video `['mp4','mov']` · carousel max 10 · `requiresAppReview` | carousel **min** · `providerSideScheduling` |
| Google Business | `providerSideScheduling: true` · `requiresAppReview` | `summary` length · hashtags · image + video formats · carousel bounds |

Each verified entry carries the Meta or Google URL the number came from.

### The decision worth recording: what to do with `assumesFormatAccepted()`

Day 1 shipped a guard asserting that **no** platform had a verified format list,
so that "PNG is probably fine" could never quietly become true. Filling in
Instagram's formats makes that guard fail — correctly, by its own design.

The wrong fix was to keep the test green by not writing Meta's documented
answer down. The guard was aimed at *being unresearched*, which is a temporary
state and not actually the thing worth protecting. So it was replaced by
`unsourcedLimits()`, which returns every limit claimed as verified **without a
first-party source** and is asserted to be empty. That claim never expires:
"I think it's 2200" still fails it, and a line quoting Meta still passes. The
guard got stronger by getting narrower.

`honesty.test.ts` was rewritten along the same line. It no longer asserts that
everything is unknown; it asserts that what is known is sourced and enforced,
and that what is unknown still answers `'unverified'` rather than `'ok'`.

### The PNG rule is now executable

> "JPEG is the only image format supported."

`checkMediaFormat('instagram', 'png')` was `'unverified'`. It is now a
`'violation'` carrying an owner-facing sentence, and the carousel review
surfaces it as blocking. WEBP and HEIC — both of which an Android picker
happily hands you — are violations too.

**This makes a server-side JPEG transcode a build requirement, not a nicety.**
Meta cURLs media from a public URL, so validating on the phone is not enough;
the file Meta fetches is the server's.

### The best test in this change

`features/carousel/__tests__/carousel.test.ts` now asserts, on a single review:
a PNG slide is a **blocking violation** for Instagram, **and** Instagram still
appears in `unchecked` — because Meta documents no carousel *minimum*, so the
slide-count check could not run. "We checked some of it" is the honest answer
and both halves have to render. A green tick there would be a lie about the
part nobody checked.

The GBP row is the other half of the same point: Google documents
`scheduledTime`, so provider-side scheduling is verified **true** — genuinely
different from Instagram — but documents no `summary` character limit, so
Shoogle refuses to claim one and will let Google's API reject an over-long post
with its own error rather than truncating on a guess.

### Verification

`npm run typecheck` clean · `npm run lint` clean · **2,355 tests / 50 suites
passing** (2,342 before; 13 net new). Baseline re-confirmed at `0732ad4` before
any edit.

### Still true, and worth repeating

**No Instagram post has ever been published by this code.** No Meta app exists,
no credential is in this repo, and `registerProvider('instagram', …)` is still
not called. Filling in a capability matrix is knowing the rules, not having an
integration.

### Next step

Phase 1 is blocked on two things, one of them a person:

1. **The Meta Developer App** (product owner, ~15 min in a browser) — Instagram
   product → **"API setup with Instagram login"**, NOT Facebook login.
2. **The server-side boundary decision.** Instagram token exchange needs
   `client_secret`, which cannot ship in an APK. Until that is settled, connect
   is not buildable at all.

Buildable meanwhile with no credentials: the `InstagramContent` type and format
union, and the compose flow against dev-gated fixtures.

---

## 2026-09-09 — Phase 1: Facebook restored, scheduling made per-target

### The scope correction

**Facebook is a real publishing target.** It was briefly removed from
`SOCIAL_PLATFORMS` on 2026-09-08 on the reading — recorded in the handoff — that
Meta was only ever an Instagram authentication detail. That was wrong. Final
scope is **Instagram + Facebook + GBP**, any combination. LinkedIn stays out.
Google Maps remains not-a-separate-integration: GBP local posts surface on
Search and Maps.

The narrowing is reverted. Nothing else from `d82350f` needed redoing — the
Instagram research, the sourced limits, `unsourcedLimits()` and the
PNG-is-a-violation rule were all orthogonal to the scope change.

### What the Facebook research turned up

`docs/research/meta-facebook-pages.md`, from Meta's live documentation.

**Facebook is the easiest of the three targets, not the hardest**, which was the
opposite of the working assumption:

| | Instagram | Facebook | GBP |
|---|---|---|---|
| Media source | public URL only | **URL *or* binary** | public URL only |
| PNG | rejected — JPEG only | **accepted** | unverified |
| Native scheduling | none documented | **yes** | **yes** |

Facebook takes a `multipart/form-data` upload, so **a device-local photo can be
published to Facebook with no media hosting at all.** It is the one target whose
publishing path has no server dependency, which is why it now sequences ahead of
Instagram.

The cost is a prerequisite Instagram does not have: the business must own a
Facebook Page and the connecting person must hold `CREATE_CONTENT` on it.

### The decision: two independent OAuth flows

Facebook needing a Page reopened Instagram's auth path — Meta's *Instagram API
with Facebook Login* could have served both targets through one connect flow.
Rejected, and confirmed by the product owner.

Instagram keeps Instagram Login; Facebook uses Facebook Login for Business; the
token lifecycles stay completely separate. The reason that decided it: an
Instagram professional account with no linked Page is a common shape for an
Indian local business, and the unified path would lock that owner out of
Instagram to serve a Facebook connection they never asked for. A Page is
**Facebook's** prerequisite; making it Instagram's would be Shoogle inventing a
requirement Meta does not impose.

Cost, stated plainly: two OAuth flows and two refresh paths. That is the correct
work — it buys each target the ability to fail on its own.

### Two real defects found in code written before today

Both in `scheduling.ts`, both latent because nothing publishes yet, and both
would have produced the worst outcome this product has: a post the owner watched
Shoogle accept, sitting in a tidy list of upcoming posts, which the platform was
always going to refuse.

1. **`MAX_SCHEDULE_HORIZON_DAYS = 90`.** Facebook documents at most 75 days, and
   arguably 30. Ninety exceeds both.
2. **`MIN_SCHEDULE_LEAD_MINUTES = 5`.** Facebook requires **10**.

**The fix is not a smaller constant.** The window belongs to the *targets*, not
to the module. `scheduleWindowFor(targets)` intersects every target's documented
window — strictest minimum lead, tightest horizon — because one post goes out at
one instant and must satisfy every platform it is aimed at. The module constants
survive as Shoogle's own floor and ceiling, which is all they ever honestly
were.

Rejection messages now name the platform responsible. "Too soon" is not
something an owner can act on; *"Facebook needs at least 10 minutes' notice"*
is.

### The decision worth recording: a third state for `Limit<T>`

Meta documents Facebook's scheduling horizon as **30 days** on the Pages API
posts guide and **75 days** on the `/{page-id}/feed` reference. Both are Meta's.

Neither existing state fits, and both available lies were available:

- `verified(30)` or `verified(75)` claims a number the provider does not agree
  with itself about, and attaches a single URL as though it settled the matter.
- `unverified()` is accurate but drops enforcement, letting Shoogle's own
  90-day default through — the exact defect above.

So a conflict became its own state. `conflicted(30, [bothUrls, why])` carries
the **conservative** end. `isVerified()` stays false, so nothing may present it
as settled; the new `isEnforceable()` is true, so a check may still refuse at
the tighter bound. The claim being made is precisely *"we do not know the true
limit, but we know it is at least this strict"* — which is true, and useful.

Erring tight costs the owner a scheduling option they can see and report to us.
Erring loose costs them a post they never learn did not go out.

`unsourcedLimits()` was extended to police the new state: a conflict must carry
**at least two** sources and a description of the disagreement, because one URL
cannot evidence a contradiction.

### Facebook's capability entry — what is verified and what is not

Verified with Meta URLs: `acceptedImageFormats: ['jpeg','png']`,
`providerSideScheduling: true`, `requiresAppReview: true`,
`scheduleMinLeadMinutes: 10`. Conflicted: `scheduleMaxHorizonDays: 30`.

Left unverified on purpose, and each for a specific reason:

- **`captionMaxCharacters`** — the `/feed` reference documents no maximum for
  `message`. Same posture as GBP's `summary`: let Facebook reject and surface
  its own error rather than truncating on a guess.
- **`acceptedVideoFormats`** — the video guide states no Page video spec. The
  upload-session docs name `pdf/jpeg/jpg/png/mp4`, but that is what the
  *resumable uploader* accepts, not a Page video specification, and recording it
  as one would be a fabrication.
- **Carousel bounds** — multi-photo posts exist; no documented count either way.

One subtlety in the format list, commented in the file: Facebook documents
".jpeg, .bmp, .png, .gif, .tiff". `['jpeg','png']` is that set **intersected
with what `MediaFormat` can represent** — BMP, GIF and TIFF are genuinely
accepted by Facebook and are simply not things Shoogle can hold, so their
absence is a Shoogle limitation rather than a Facebook rule. WEBP and HEIC are
the opposite case: absent from Facebook's list, so real violations. The 1 MB PNG
figure on the same page is a *recommendation* ("or the image may appear
pixelated"), not a limit, and is never enforced as one.

### Naming

`.env.local.example` already declares **`META_APP_SECRET`** — one Meta app
serves both platforms, so an Instagram-specific name would be misleading. No
code or example file needed changing.

**Outstanding:** `docs/research/meta-instagram.md` still says
`INSTAGRAM_APP_SECRET` in its environment section, which contradicts
`.env.local.example`. Left as-is under an explicit instruction to keep the
Instagram research unchanged; the correction is recorded in the Facebook report
and in the handoff's superseded banner. **Worth fixing when that instruction
lifts.**

### Verification

`npm run typecheck` clean · `npm run lint` clean · **2,375 tests / 50 suites
passing** (2,355 before; 20 net new).

### Still true

**Nothing has been published by this code, on any platform.** No Meta app
exists, no credential is in the repository, no provider is registered, and no
Supabase directory was created. Phase 1 was code and documentation only, and
required no credentials.

### Next

Phase 2 — the per-platform content model (`InstagramContent`, `FacebookContent`,
`GbpContent`) and per-platform media specs, turning every row of the matrix into
a real refusal with the sentence that explains it. Needs no credentials.

---

## 2026-09-11 — Phase 2a: platform independence (product rule 13)

### The rule

**One platform never blocks another.** Platform availability is determined
independently per connected account. A missing credential, permission, Facebook
Page or authorization for one platform must never block, gate or hide another.

A Facebook Page is **optional at the product level**. Meta requires one to
publish *to Facebook*; that requirement belongs to the Facebook connection and
nowhere else. An Instagram professional account with no linked Page is a common
shape for an Indian local business and must work normally.

Recorded as **product rule 13 in `CLAUDE.md`** — a hard acceptance criterion,
not a UI preference — and enforced by
`features/social/__tests__/independence.test.ts`.

### The rule was already being violated, by code committed three days earlier

`publisher.ts` coupled targets in two places. Neither was reachable, because no
adapter exists for any platform, and both would have gone live with the first
one:

- **`schedule()`** refused the whole post when *any* target lacked a publisher.
- **`attemptPublish()`** refused the whole publish for the same reason — the
  worse of the two. At due time an expired Facebook token would have stopped a
  perfectly reachable Instagram post from going out at all.

Both were written as honesty guarantees, and about a *single* target they were
right. Across independent targets they were the coupling the rule forbids.

**What survived:** the refusal is still correct when *nothing* is reachable —
there is genuinely nothing to schedule, and storing a due date with no publisher
behind it would show the owner an upcoming post that can never go out. That
narrower guarantee is still asserted.

### The decision worth recording: a signature, not a comment

A product rule that lives in prose gets broken by the first convenient `if` —
which is precisely how those two coupling sites came to exist. So the rule is
enforced the way this codebase enforces its other invariants: by making the
violation unwriteable.

`availabilityFor(platform, { connection, hasAdapter })` receives **one**
platform's connection. Not a map, not a registry, not a lookup function. There
is no other platform in scope, so "check whether Facebook is connected before
offering Instagram" is not something a reviewer has to catch — it does not
compile. Passing a mismatched connection throws, because judging Instagram on
Facebook's state is a bug rather than a state an owner can be in.

`availabilityForAll()` is a pure fan-out over that function: no accumulator, no
ordering, no early return. Adding one would stand out.

Every unavailability reason is scoped to the platform that owns it.
`no_eligible_page` is a **Facebook** reason with a **Facebook** action and has no
representation anywhere Instagram or GBP can see it. That containment is the
whole of Meta's Page requirement.

### Per-target publishing

A multi-target post is three independent publications that share content, which
is what `PublishTarget` has modelled since Day 1 — per-platform `status`,
`failure` and `remoteId`. The all-or-nothing refusal was the anomaly.

With Instagram reachable and Facebook not:

- Instagram publishes and **keeps its `remoteId` and published status**
- Facebook is marked **`skipped`**, not `failed` — nothing was attempted and
  nothing went wrong with the post; Shoogle simply could not reach the platform.
  A failure invites "try again"; a skip invites "reconnect Facebook"
- The skip carries its own reason and is `retryable`, because reconnecting
  genuinely fixes it
- The post lands in the **attention** state reading *"Facebook skipped —
  reconnect Facebook"*, with a **Reconnect** action
- **Nothing ever claims Facebook published:** `remoteId`, `permalink` and
  `publishedAt` all stay null

**A skip is never quiet.** A broken connection now outranks an unfinished draft
in `needsAttention`: the draft is work the owner already knows about, the skip is
not. A post that went out to two of three platforms must not sit in the published
list looking complete.

### One subtlety: two kinds of skip

`skipOccurrence()` already existed for product rule 5 — the owner skipping a post
deliberately. That also produces `status: 'skipped'`. Collapsing the two would
either nag an owner about a choice they made on purpose, or bury a broken
connection among deliberate skips.

They are separated by the reason: a skip with `failure === null` is the owner's;
one carrying a `failure` is Shoogle's. `wasSkippedForUnavailability()` is the
predicate, and a test asserts the owner's deliberate skip never reaches the
attention list.

### Availability is judged at due time, not at scheduling time

Unreachable targets are deliberately **not** pre-marked skipped when a post is
scheduled. Availability now is not availability at due time — a token
reconnected this afternoon should publish tonight — so each target is judged
when it is actually attempted.

### Verification

`npm run typecheck` clean · `npm run lint` clean · **2,401 tests / 51 suites
passing** (2,375 before; 26 net new, of which 24 are the acceptance matrix).

### Still true

**Nothing has been published by this code, on any platform.** No Meta app, no
credential, no registered provider, no `supabase/` directory. `availability.ts`
performs no I/O, holds no token and completes no OAuth flow — it answers "may
Shoogle offer this platform, and if not, what does the owner do about it?" from
connections the caller supplies.

### Next

Phase 2b — the per-platform content model (`InstagramContent`,
`FacebookContent`, `GbpContent`) and per-platform media specs, turning each row
of the capability matrix into a real refusal carrying the sentence that explains
it. Needs no credentials.
