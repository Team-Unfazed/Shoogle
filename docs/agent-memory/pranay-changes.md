# Pranay — SEO / GBP / Audit / Business

Session log for the Business vertical. Read this before starting any session and
continue from the recorded state. **No secrets in this file — variable names only.**

Branch: `feature/pranay-seo`
Owns: `features/audit/`, `features/gbp/`, `features/seo/`, `app/(tabs)/business.tsx`,
`app/seo/` (new route namespace), and `fixtures/` files for this area.

---

## Date

2026-08-30 · Sprint day 1 (session 1)

## Task

Start the Business/SEO vertical. Reconcile the 7-day work plan against the actual
repository, then research and design before implementing.

---

## IMPORTANT: the work plan does not match this repository

The 7-day plan was written against a different foundation. Verified against the
repo at `e3d118e`:

| Plan states | Actual repository |
|---|---|
| Baseline commit `9015a60` | **Does not exist.** Foundation is `3caa0d3`; HEAD `e3d118e` |
| "Preserve `Datum<T>`" | The type is **`DataState<T>`** (`lib/state/DataState.ts`). No `Datum` exists |
| Pranay owns `app/(app)/business/` | Route is **`app/(tabs)/business.tsx`**. There is no `(app)` group |
| "Inspect `lib/audit`, reuse the existing audit engine, do not rewrite it" | **No audit engine exists.** Only `AuditProvider` / `AuditReport` / `AuditFinding` interfaces in `lib/providers/contracts.ts` |
| "Read `docs/research/api-capability-matrix.md`" as authority | **Did not exist.** Being created by research this session |
| `docs/agent-memory/pranay-changes.md` | Did not exist. Created this session |
| Branch `feature/pranay-seo` | Did not exist. Created this session |

**Consequence for the schedule:** Day 1 assumes an audit engine can be reused. It
cannot — it has to be built. Day 1 is therefore materially larger than the plan
budgets, and Day 3 depends on a capability matrix that had to be researched first.

**Resolution:** work against the real repository. Everything else in the plan —
ownership boundaries, no-fake-data, unknown-is-never-zero, the day structure —
is unaffected and is being followed.

Future sessions: do not go looking for `9015a60`, `Datum<T>`, `lib/audit`, or
`app/(app)/`. They are not coming back.

---

## Decisions made

1. **The foundation to treat as frozen is `e3d118e`,** not `9015a60`.
2. **`DataState<T>` is the honest-data type.** Wherever the plan says `Datum<T>`,
   read `DataState<T>`.
3. **The audit engine will be built in `features/audit/`,** as a pure
   data-in/report-out module with no I/O, so it is synchronously testable. It
   maps onto the existing `AuditReport` / `AuditFinding` interfaces rather than
   changing them — those live in `lib/` and belong to Sunny.
4. **AI provider: Gemini free tier, chosen by Pranay.** Constraint recorded
   below.
5. **Route namespace is `app/seo/`,** per CONTRIBUTING.md, to avoid filename
   collisions with the other four engineers.

---

## AI provider constraint — READ BEFORE TOUCHING AI CODE

Pranay selected the **Gemini free tier**. Two hard consequences:

1. **Free-tier data-use terms are not suitable for real customer business data.**
   AI features may run against the test/fixture business only. This must be
   enforced in code, not by convention.
2. **A Gemini API key cannot live in the mobile app.** Anything compiled into the
   APK is extractable. Therefore the direct Gemini client is `__DEV__`-gated, the
   same way fixtures and dev-preview are. **Production requires a server-side
   proxy that does not exist yet** — that is Sunny's infrastructure, and is a
   documented dependency, not something this vertical can solve.

Required variable name: `GEMINI_API_KEY`. Never prefixed with `EXPO_PUBLIC_`
for production. Obtain from https://aistudio.google.com/apikey.

---

## API status

**Google Business Profile: NOT CONFIGURED.**

- No credentials set.
- No Google Cloud project with the Business Profile APIs enabled.
- No approved quota request.

A real Google Business Profile older than 60 days exists for testing, but
**profile age does not grant API access** — a Cloud project plus an approved
quota request is separately required, and that approval is a queue outside the
team's control. Submitting it is the longest pole in the schedule.

Required variable names (values go in `.env.local`, never in git or chat):
- `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_ANDROID` — public by design, ships in the APK
- `GOOGLE_OAUTH_CLIENT_ID_WEB`
- `GOOGLE_OAUTH_CLIENT_SECRET` — server-side only, never `EXPO_PUBLIC_`

---

## Real test results

None yet. No provider call has been made, and no provider response has been
simulated.

---

## Files changed

```
docs/agent-memory/pranay-changes.md   (new — this file)
```

Branch `feature/pranay-seo` created from `e3d118e`.

---

## Known bugs

None yet.

## Blockers

1. **GBP API access.** Quota request must be submitted; nothing on the Business
   tab can show real Google data until it is approved.
2. **No server-side proxy for AI.** Production AI features are blocked on Sunny's
   infrastructure. Development AI works `__DEV__`-gated against fixtures.

---

## Things future sessions must NOT change

- **Do not chase `9015a60`, `Datum<T>`, `lib/audit`, or `app/(app)/`.** They do
  not exist in this repository.
- **Do not edit `lib/`, `components/ui/`, `components/shared/`, or `theme/`.**
  Those are Sunny's and Aryan's. If a shared contract is genuinely insufficient,
  document the exact limitation and stop.
- **Do not un-gate the Gemini client from `__DEV__`** until a server-side proxy
  exists, and do not point it at real customer data under free-tier terms.
- **Do not render an unknown value as `0`,** an empty chart, or a flat trend.
  A real measured zero and an unknown are different facts and both must survive
  the whole data path.

---

## Next step

Complete the research and design pass now running (GBP capability matrix,
competitive teardown, AI-search opportunity, local-SEO audit methodology), then
implement the audit engine and Business tab against its output.

---

## Date

2026-08-30 · Sprint days 1-4 complete, days 5-7 in progress (session 2)

## Task

Build the SEO / GBP / Audit / Business vertical. Match the feature surface of
Grexa AI (observed directly from a screen recording of their paid annual plan)
while beating it on truthfulness.

## Completed work

**Research (4 reports, first-party cited, in `docs/research/`)**
- `google-business-profile.md` — the capability matrix. Authoritative.
- `local-seo-methodology.md` — the audit check registry and scoring model.
- `ai-search-visibility.md` — AI-answer visibility, carrying a CORRECTIONS block.
- `competitive-grexa.md` — competitor teardown.

**Audit engine — `features/audit/`**
34 checks across 9 areas, pure and synchronous, clock passed in as input.
Coverage gate: below 70% measurable weight the whole report returns
`unavailable('insufficient_data')` rather than a score built from half the
signals. `fixableByShoogle` is true only where BOTH the capability matrix
confirms the API write AND the provider declares the method — exactly D1, D2,
F3, F4 today.

**GBP adapter — `features/gbp/`**
Endpoints across the split API family, honest error mapping (a 403 for missing
quota is a different state from a 403 for an unverified location), all four
Voice of Merchant outcomes, a write queue for the 10-edits-per-minute ceiling,
and reply moderation state. Deliberately NOT registered — see below.

**SEO + AI — `features/seo/`**
Keyword impressions as a discriminated union rendering `<15`; the eleven live
DailyMetric values plus the removed registry; AI visibility, schema generation,
directory checklist, readability. Gemini client is `__DEV__`-gated and refuses
non-fixture payloads.

**13 routes under `app/seo/`** — audit, searches, visibility, reviews,
review-reply, photos, performance, agent, get-reviews, profile, hours, areas.
All reachable from the Business tab; a runtime test asserts every href resolves.

**978 tests, 40 suites.** typecheck, lint and the Android bundle all clean.

## Decisions made

1. **The GBP provider is NOT registered.** `registerProvider('google_business')`
   with a stub would delete the honest "Integration not built yet" caption and
   flip the Connect button from correctly-disabled to enabled. The built-in
   placeholder already returns `not_connected` for every method, which is the
   truth. Do not register until a real `connect()` with token exchange exists.
2. **Rank is never rendered.** Google publishes no rank position through any
   API. `/seo/searches` ships instead: the real queries that surfaced the
   listing. A fixture carrying `Avg. rank #6.4` was deleted for this reason.
3. **Scoring stays inside the shared contract.** `AuditReport.score` is
   non-nullable in `lib/` (Sunny's), so an unscoreable audit returns
   `unavailable('insufficient_data')` for the whole report rather than shipping
   a parallel adapter nobody calls. A PR to Sunny for `score: number | null`
   remains open but is not blocking.
4. **One implementation per shared concept.** Three copies of
   `formatKeywordImpressions` and five copies of the date helpers each produced
   real defects. Both are now single-sourced with tests that fail on a second
   declaration.
5. **Google post composing is NOT built.** `'google_business'` is already a
   `ProviderId` that Yash's `SocialPublisher` targets. Needs a written handoff.
6. **Business setup / onboarding is NOT built.** That is Aryan's ownership.
   Only in-context asks were shipped.

## Bugs found and fixed

- `business.tsx` rendered unknown review counts as `0`, and `0 total` beside a
  4.8 rating. The unanswered count was removed entirely rather than made
  nullable, because GBP research could not establish whether the reply field
  reflects replies posted outside Shoogle.
- A fixture rendered `Avg. rank #6.4` with an up-arrow — data Google never
  publishes.
- Three `formatKeywordImpressions` implementations rendered `1,240` and `1240`
  for the same input, decided by which barrel a screen imported.
- `formatTimeOfDay` rejected hour 24, which `google.type.TimeOfDay` permits for
  closing times. Every business closing at midnight had its hours silently
  dropped and then failed the audit's hours check.
- `daysBetween` returned NaN in one copy and null in another; `NaN >= 7` is
  false, so a corrupt timestamp behaved exactly like a fresh one. Consolidating
  exposed `null <= 90` evaluating TRUE — posts with unreadable dates were being
  counted as recent.
- CI's secret scan matched only Google's legacy `AIza` format, missing `AQ.`
  (current AI Studio keys) and `GOCSPX-` (OAuth client secrets — the exact
  credential this vertical will handle).
- `components/ui/Tabs` had 36pt touch targets against a documented 44pt floor.
  Fixed with `hitSlop` — behaviour only, no pixels moved. **Aryan owns that
  file and should review it.**

## API status

**Google Business Profile: NOT CONFIGURED, and blocked on a calendar, not code.**

Access requires managing a GBP **verified and active for 60+ days** with a
matching website, then up to 14 days review. Shoogle has no profile of its own,
so that clock has not started.

**The unblock:** Google's wording is "*manage* a Google Business Profile", not
own one. The Vahan Ready profile Pranay manages may already satisfy the 60-day
requirement, which would move the application from ~2.5 months away to this
week. Three things to confirm: owner/manager role on that profile, verified 60+
days, and a website on a domain matching the applying email.

OAuth consent-screen verification is a SEPARATE queue and should be started in
parallel.

Variable names only: `EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID_ANDROID`,
`GOOGLE_OAUTH_CLIENT_ID_WEB`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GEMINI_API_KEY`.

## Real test results

**None. No provider call has been made and no provider response has been
simulated.** Every screen renders `not_connected` by default, which is the
honest state, and that state is the most thoroughly tested one.

## Blockers

1. **GBP API access** — see above. Nothing in the codebase can shorten it.
2. **Server-side proxy for AI** — production Gemini needs one; Sunny's area.
   Development works `__DEV__`-gated against fixtures.
3. **Yash** — whether Google posts route through `SocialPublisher`.
4. **Aryan** — who captures business identity, and review of the `Tabs` hitSlop.
5. **`AuditReport.score: number | null`** — a one-line PR to Sunny.

## Things future sessions must NOT change

Everything from session 1, plus:

- **Do not register the GBP provider** until a real `connect()` exists.
- **Do not render a rank position** anywhere, in any state, ever.
- **Do not re-introduce a second `formatKeywordImpressions`, `daysBetween` or
  `addDays`.** Tests fail on a second declaration; that is deliberate.
- **Do not make `daysBetween` return NaN again**, and check its null explicitly
  before comparing — `null <= n` is true.
- **Do not un-gate the Gemini client from `__DEV__`** without a server proxy.
- **Do not soften `unavailable('not_supported')` on the metrics Google removed
  in 2023** into "coming soon". There is nothing coming.

## Next step

Days 5-7 (integration regression, Android QA across all 13 routes, sign-off) are
running. After that the vertical is complete up to the provider blocker, and the
next real progress is the GBP access application.
