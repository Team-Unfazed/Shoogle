# features/seo

**Owner: Pranay**

Local search visibility: keyword rankings over time and what to do about them.

## Where this appears
The Business tab, plus rankings and keyword detail routes.

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

- `KeywordRanking.position` is `number | null`. `null` means not ranked or
  not measured, and must render as words - never as position 0 or position 100.

## What is built (2026-08-30)

Nothing here needs a credential, a billing account or the Google Business
Profile quota. Nothing here is registered with `registerProvider()` — `SeoProvider`
is not a `ConnectableProvider`, so importing this feature claims no integration.

| Module | What it is |
|---|---|
| `types.ts` | The eleven live `DailyMetric` values, the removed-metric ids, `SearchKeywordsReport`, `SeoFinding` (re-exports the keyword union from `keywords.ts`) |
| `keywords.ts` | **The** `KeywordImpressions` union (exact-or-bound) plus constructors, wire parsing and the ONLY sanctioned formatter — `"1,240"` or `"<15"`. Declared once, repo-wide: `features/gbp` and `features/audit` import it from `@/features/seo` rather than keeping their own copies. The exact member is spelled `value`. |
| `metrics.ts` | `LIVE_DAILY_METRICS` (11), `REMOVED_METRICS` (12, permanently `not_supported`), `RENAMED_METRICS`, and `toMetrics()` which OMITS unknown values |
| `provider.ts` | `seoProvider` — rankings are permanently `not_supported` |
| `ai/contract.ts` | `AiProvider`, the data-classification envelope, and `noAiProvider` (what production gets) |
| `ai/gemini.ts` | Development-only client. Dev-gated, fixture-data-only (the `[FIXTURE]` marker is checked on `input.payload`, never on the rendered prompt), key never `EXPO_PUBLIC_` |
| `ai/visibility.ts` | The AI Visibility Check — one fetch, no model, no score |
| `ai/schema.ts` | `LocalBusiness` JSON-LD for the seven verticals, plus inspection of markup already on a site |
| `ai/directories.ts` | The India directory checklist — owner-answered, counts not percentages |
| `ai/readability.ts` | Readability observations with cited reasons. No score, by design |

### Three facts that must stay distinguishable

| Fact | How it is represented |
|---|---|
| We could not ask | `unavailable(reason, message)` |
| We asked, the answer was none | `{ kind: 'exact', value: 0 }` / `Metric.value === 0` |
| We asked, the answer was a bound | `{ kind: 'below_threshold', threshold }` → renders `<15` |

### Consumed by other features

- `buildLocalBusinessSchema()` / `serializeLocalBusinessSchema()` are exported for
  **Devashish** to use in `features/website/`. Pranay owns the generator; it must
  never write into that folder.
- `toMetrics()` and `LIVE_DAILY_METRICS` are exported for `features/gbp` to use
  when implementing `getPerformance()`.

### Not built, and why

- **Rank position.** No Google API returns one. `getRankings()` is
  `not_supported` and `KeywordRanking.position` stays `null`.
- **Anything the free Gemini tier cannot legally see.** Real customer data needs
  a server-side proxy (Sunny). Until it exists, production gets `noAiProvider`.
- **NAP consistency across directories, "Ask an AI", live Google ratings.** All
  need a Maps Platform billing account or an edge function. See the blockers in
  `docs/research/ai-search-visibility.md` §7.
