# features/gbp

**Owner: Pranay**

Google Business Profile: locations, verification, posts, reviews and replies, hours, service areas.

## Where this appears
The Business tab, and GBP-specific routes beneath it.

## Boundary rules

1. Everything for this feature lives in this folder: screens, hooks, provider
   implementations, feature-specific types, and its own tests.
2. **Do not edit another feature's folder.** If you need something from one,
   ask its owner to export it from that feature's `index.ts`.
3. **Do not edit `components/ui/`, `components/shared/`, `theme/` or
   `lib/` to make this feature work.** Those are shared. If a primitive is
   missing a variant, raise it with the team and add it there with a test -
   never fork a copy in here and never restyle one with inline colours.
4. Register any provider implementation at runtime with
   `registerProvider(id, impl)` from `@/lib/providers`. Do not add your
   provider to `lib/providers/registry.ts` by hand.
5. Add routes under `app/` only for screens this feature owns.

## Data rules (non-negotiable)

- Return `DataState<T>` from anything that touches the network.
- **Unknown is not zero.** No placeholder `0`, no empty chart standing in for
  missing data, no invented percentages. Use `unavailable(reason, message)`.
- Never claim an integration exists before it does.
- Never present fixture data as the owner's real data. Fixtures live in
  `fixtures/`, are only readable when `isFixtureModeEnabled()` is true, and
  any screen showing them must pass `showsFixtureData` to `<Screen>`.

## Before you implement an integration

Run the API research agent (`.claude/agents/api-researcher.md`) and commit its
findings to `docs/research/`. Do not guess scopes, quotas, pricing or review
requirements.

## Watch out

- Most write operations require a **verified** location. Check
  `verificationState` before offering an action, and explain when it is
  blocked rather than failing silently.
- The GBP APIs require an approved quota request. Confirm the current
  requirements with the api-researcher agent before promising anything in UI.

---

## What is built (and what is deliberately not)

Everything here is implemented against
`docs/research/google-business-profile.md`, which is a first-party-cited
capability matrix. Where that document says UNVERIFIED, this folder treats the
answer as unknown rather than guessing.

| File | What it is |
|---|---|
| `endpoints.ts` | The endpoint map. The API family is split across **five hostnames** — v4.9 for reviews/localPosts/media, separate v1 hosts for Account Management, Business Information, Performance and Verifications. Also the quota constants. |
| `types.ts` | Wire types plus the honest domain types they map to: the search-keyword `exact \| below_threshold` union, `GbpKeywordReport` (rows **plus** the count Shoogle refused), the reply-moderation union, and the permanently removed capabilities. The `DailyMetric` registry is NOT here — it lives once in `features/seo/metrics.ts` and is imported from `@/features/seo`. |
| `voiceOfMerchant.ts` | The four documented remedial actions plus the healthy state and an `indeterminate` state we never treat as healthy. What each means to an owner, and how each maps to `DataState`. |
| `errors.ts` | Real Google error shapes → `DataState`, keeping the four different meanings of HTTP 403 apart. |
| `writeQueue.ts` | The **10 edits per minute per profile** ceiling, which Google says cannot be raised. Edits only — reads run at 300 QPM and are never queued. |
| `mappers.ts`, `performance.ts`, `hours.ts` | Pure wire→domain mapping, metric normalisation, and strict opening-hours validation. |
| `capabilities.ts` | The permanent "no" states, as values. |
| `provider.ts` | The adapter. Injected transport, `null` today. |

**Not built, on purpose:**

- **The provider is not registered.** `registerProvider('google_business', …)`
  is not called. `app/(tabs)/business.tsx` shows "Integration not built yet"
  only while `!isProviderRegistered('google_business')`; registering a stub that
  can only answer `not_connected` would delete that honest line and assert an
  integration exists. Register it the day `connect()` completes a real OAuth
  flow against an approved quota.
- **No Google post composer or scheduler.** `google_business` is already a
  target of Yash's `SocialPublisher`. Two authoring surfaces means two sources
  of truth. Needs written agreement with Yash first.
- **No business setup or onboarding screens.** Aryan's ownership.
- **No route under `app/website/`.** Devashish's, and it does not exist yet.

## Blockers for other owners

These need a change in a file this feature does not own. None of them is worked
around here with a parallel adapter.

1. **`lib/state/DataState.ts` (Sunny) — two missing `UnavailableReason`s.**
   `pending_provider_approval` ("Google has not approved our API access yet")
   and `provider_verification_required` ("this listing is not verified") are
   different facts with different owner actions, and both currently land on
   `not_supported`, which reads as "Google never offers this". The distinction
   survives in `GbpFailure.kind` and in the message, but the reason code is
   lossy. `errors.ts` documents exactly where.
2. **`lib/providers/contracts.ts` (Sunny) — `AuditReport.score: number`.**
   Requested: `number | null`. Until then, an audit with too little signal must
   return `unavailable('insufficient_data', …)` for the whole report rather than
   a report carrying a fabricated score.
3. **`lib/providers/contracts.ts` (Sunny) — `GbpReview` cannot express two real
   Google facts.**
   - `starRating: 1|2|3|4|5` has no member for `STAR_RATING_UNSPECIFIED`, so
     such a review is dropped from `listReviews`. Requested: `| null`.
   - `reply: { comment, updateTime } | null` cannot say whether a reply is
     PUBLISHED or sitting in moderation, and its `updateTime` is a required
     `string`, so a reply Google never timestamped cannot be expressed at all.
     Google moderates replies, so HTTP 200 is not publication. Requested: a
     moderation field and `updateTime: string | null`. Until then
     `toContractReview` sets `reply: null` and flags `replyOmitted` rather than
     borrowing the review's own timestamp, and callers use
     `GbpAdapter.submitReviewReply` / `listReviewsDetailed` for the real state.
4. **`lib/providers/types.ts` (Sunny) — `Paginated<T>` cannot report refusals.**
   When Google returns records we will not map, the count of skipped records has
   nowhere to go, so a shorter list would be indistinguishable from a complete
   one. Until `Paginated<T>` can carry a refusal count,
   `GoogleBusinessProfileProvider.listReviews` is **export-only**: it returns
   `failed(...)` if anything at all was lost on the way through, rather than a
   list that looks whole. In-app screens use `GbpAdapter.listReviewsDetailed`,
   whose `GbpReviewPage.skipped` names every loss.

## Open questions Google has not answered

Carried from the research doc; each is treated as unknown, not guessed.

- The `ReviewReplyState` enum members. `REVIEW_REPLY_STATE_MEANINGS` in
  `types.ts` is intentionally EMPTY, so no reply is ever reported as published
  on a guess. Fill it in only from the first-party reference.
- Whether an absent `DatedValue.value` is a measured zero or an unreported day.
  Treated as UNREPORTED, so it can never become a 0.
- Whether `localPosts.create` and `media.create` are gated on verification.
  Only `reviews.list` documents the gate, so only `reviews.list` is blocked on
  it.
- `LocalPost.summary` character limit, `locations.patch` `updateMask`
  semantics, and Performance API data latency and maximum range.
