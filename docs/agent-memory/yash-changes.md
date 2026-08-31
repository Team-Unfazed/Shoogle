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
