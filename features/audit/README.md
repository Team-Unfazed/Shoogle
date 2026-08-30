# features/audit

**Owner: Pranay**

Automated profile audit: what is missing or wrong across the owner's online presence, scored and turned into fixable findings.

## Where this appears
The Health section of the Business tab, plus its own detail routes.

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

- `Score` takes `number | null`. Pass `null` until an audit has genuinely
  run - a business that has never been audited does not have a score of 0.
- Report `uncheckedAreas` honestly. A score derived from half the signals must
  say so; `<Score uncheckedCount={n} />` renders that caveat.

## What exists now

The audit engine, built to `docs/research/local-seo-methodology.md`. It is
**pure**: data in, report out, no network, no storage, no React, and the current
time is an input rather than a call to `Date.now()`. That is what makes it
synchronously testable, and every test in `__tests__/` runs without a mock.

```
types.ts                  vocabulary: areas, weights, outcomes, observations
copy.ts                   owner-facing wording, including the unchecked reasons
checks/registry.ts        34 checks: 1 unscored gate + 33 scored, 9 areas
checks/area-*.ts          the checks themselves, one file per area
checks/helpers.ts         outcome constructors + the capability presets
data/india-holidays.ts    the festival calendar for D3 - read its header
scoring.ts                coverage arithmetic and the four gates
ordering.ts               the priority formula and the hard rules from §5.3
engine.ts                 runAuditEngine(input) -> AuditRun
test-support/build.ts     test scaffolding (NOT fixtures - different rules)
```

`features/gbp/` is responsible for turning provider responses into
`AuditObservations`. The engine never sees an HTTP response.

## The four rules this module is built around

1. **`fail` and `not_checked` are different outcomes.** A check we measured and
   that failed scores 0 and produces a finding. A check we could not measure
   leaves the numerator AND the denominator, produces no finding, and is named
   in `uncheckedAreas`. Neither ever becomes the other.
2. **A score is emitted only when it is honest.** All four gates in §3.3 must
   pass - identity, 70% coverage, breadth across the heavy areas, and freshness.
   Otherwise `report` is `unavailable('insufficient_data', ...)`. `AuditReport.score`
   is `number`, not `number | null`, so there is no half-honest middle option.
3. **A missing score never suppresses a finding.** `AuditRun.findings` always
   carries everything the checks that DID run found, whatever `report` says.
4. **`fixableByShoogle` requires two separate facts:** the GBP capability matrix
   confirms Google exposes the write, AND `GoogleBusinessProfileProvider`
   declares a method for it. Today that is true for six checks only; everything
   else degrades to a guided fix so no dead control ships.

## Known limitations, deliberately visible

- `data/india-holidays.ts` carries fixed-date holidays only. Every lunar festival
  (Diwali, Holi, Eid, Ganesh Chaturthi, Onam, Pongal, Durga Puja, Gudi Padwa) is
  absent because its Gregorian date was not verifiable here. The file declares
  `completeness: 'partial'`, and D3 therefore returns `not_checked` rather than
  concluding "no festival is coming". Resolving research open question 5 is what
  makes this check earn its weight.
- Write methods for categories, description, service items, attributes, special
  hours and media do not exist on the provider contract. That is a PR to
  `lib/providers/contracts.ts` reviewed by Sunny, not an edit from here.
- `fixHref` defaults to `null`. The engine does not know which routes exist; the
  screen rendering findings passes a resolver in.
