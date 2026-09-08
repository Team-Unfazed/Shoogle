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
