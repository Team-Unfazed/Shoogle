/**
 * features/dashboard - public surface. Owner: Aryan.
 *
 * Other features import from '@/features/dashboard' and nothing deeper.
 *
 * ## What is genuinely built here
 *
 * - `aggregateHome` and its parts: the pure aggregation that turns a set of
 *   `DataState` sources into the Home view model. It keeps INDEPENDENT facts
 *   independent (one dead provider does not blank the tile beside it) and
 *   refuses to produce a COMBINED fact unless every contributor is ready.
 * - `suggestionsFrom` / `rankSuggestions`: what Shoogle proposes next. A
 *   suggestion is only ever derived from a `ready` source.
 * - `useHome`: the hook the Home screen renders.
 * - The layout pieces in `./components`, which fetch nothing and default
 *   nothing.
 *
 * ## What other features owe this one
 *
 * Home has no provider. It aggregates over summaries that Social, SEO and
 * Website own. Those features export their own summary down to the shapes in
 * `./types` — `SocialSummary`, `SeoSummary`, `WebsiteSummary` — and this
 * feature never reaches into theirs.
 *
 * Nothing here implies an integration exists. Until a feature supplies a
 * summary, `disconnectedSources()` reports `not_connected` for every one.
 */

/* Types -------------------------------------------------------------------- */

export type {
  HomeAlert,
  HomeBusinessIdentity,
  HomeInsightChip,
  HomeMetricSource,
  HomeMetricTile,
  HomeModuleRow,
  HomeSources,
  HomeSuggestion,
  HomeViewModel,
  ModuleId,
  SeoSummary,
  SocialSummary,
  SuggestionKind,
  WebsiteSummary,
} from './types';

/* Aggregation -------------------------------------------------------------- */

export {
  aggregateHome,
  businessIdentity,
  combinedTotal,
  deriveAlert,
  disconnectedSources,
  initialsFor,
  loadingSources,
  moduleRows,
  toMetricTile,
} from './aggregate';

/* Suggestions -------------------------------------------------------------- */

export { rankSuggestions, suggestionsFrom } from './suggestions';

/* Hook --------------------------------------------------------------------- */

export { useHome, useHomeSources, type UseHomeOptions } from './useHome';

/* Layout ------------------------------------------------------------------- */

export {
  AlertRow,
  BusinessHeader,
  InsightStrip,
  MetricTile,
  ModuleRow,
  SuggestCard,
} from './components/HomeParts';

export {
  AccountCard,
  SettingsGroup,
  SettingsRow,
  SettingsToggle,
} from './components/SettingsParts';
