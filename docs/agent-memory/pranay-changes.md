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
