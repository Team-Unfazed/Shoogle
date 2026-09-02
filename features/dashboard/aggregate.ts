/**
 * The Home aggregation. Owner: Aryan.
 *
 * Pure functions only — no hooks, no I/O, no clock. Everything here takes
 * `DataState`s in and returns a view model out, which is why the honesty rules
 * below are testable rather than aspirational.
 *
 * ## The two rules, and why they differ
 *
 * A dashboard mixes two kinds of fact, and they need opposite treatment:
 *
 * 1. INDEPENDENT facts — the metric tiles, the module rows, the insight chips.
 *    Each keeps its own state. Instagram being unreachable must not blank the
 *    Google tile beside it. `combineData()` is deliberately NOT used for these:
 *    it collapses to a single non-ready state, which is right for one coherent
 *    row and wrong for a grid of separate readings.
 *
 * 2. COMBINED facts — anything summed or averaged ACROSS sources. Here every
 *    contributor must be ready, or the whole thing is `unavailable`. A total
 *    that silently omits a provider is not a partial answer, it is a wrong one:
 *    "312 views" when Instagram failed to load reads as the truth and is not.
 *    That is what `combineData()` is for, and `combinedTotal()` below uses it.
 *
 * Rule 2 is the one that gets broken under deadline pressure, so it has its own
 * regression test in `__tests__/aggregate.test.ts`.
 */

import {
  UNAVAILABLE_COPY,
  combineData,
  isReady,
  loading,
  mapData,
  ready,
  unavailable,
  type DataState,
} from '@/lib/state/DataState';
import type { Business, ProviderConnection, ProviderId } from '@/types/domain';
import type {
  HomeAlert,
  HomeBusinessIdentity,
  HomeMetricSource,
  HomeMetricTile,
  HomeModuleRow,
  HomeSources,
  HomeViewModel,
  SeoSummary,
  SocialSummary,
  WebsiteSummary,
} from './types';
import { rankSuggestions, suggestionsFrom } from './suggestions';

/* -------------------------------------------------------------------------- */
/* Business identity                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Initials for the header tile: two letters from the first two words, the
 * first two letters of a single-word name, and `?` when there is nothing to
 * work from — never a guessed letter.
 */
export function initialsFor(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0);

  const first = words[0];
  if (first === undefined) return '?';

  const second = words[1];
  const letters =
    second === undefined ? first.slice(0, 2) : `${first[0] ?? ''}${second[0] ?? ''}`;
  return letters.toUpperCase();
}

/**
 * The header identity, or null when the business is not loaded.
 *
 * Null rather than a filled-in placeholder: the screen decides what to show
 * when there is no business. It is not this function's job to invent the string
 * "Your business" and have it sit in the same slot as a name we fetched.
 */
export function businessIdentity(state: DataState<Business>): HomeBusinessIdentity | null {
  if (!isReady(state)) return null;
  const { name, locality } = state.value;
  return { name, locality: locality ?? '', initials: initialsFor(name) };
}

/* -------------------------------------------------------------------------- */
/* Metric tiles — independent facts                                           */
/* -------------------------------------------------------------------------- */

/**
 * One source becomes one tile, carrying its own state.
 *
 * Note what is absent: no branch produces a `value` of 0 for a non-ready state.
 * The only route to a number is `status === 'ready'`.
 */
export function toMetricTile(source: HomeMetricSource): HomeMetricTile {
  const { key, label, state } = source;

  if (state.status === 'ready') {
    return {
      key,
      label,
      value: state.value.value,
      changePct: state.value.changePct,
      note: null,
      isLoading: false,
    };
  }

  if (state.status === 'loading') {
    return { key, label, value: null, changePct: null, note: null, isLoading: true };
  }

  const note =
    state.status === 'unavailable' ? UNAVAILABLE_COPY[state.reason].title : 'Could not load';

  return { key, label, value: null, changePct: null, note, isLoading: false };
}

/**
 * Sum one metric across sources — the combined-fact rule.
 *
 * Every contributor must be ready. One unavailable Instagram makes the total
 * unavailable, because a cross-provider total missing a provider is a lie told
 * with a real-looking number. An EMPTY list is `insufficient_data`, not 0.
 *
 * Nothing on Home renders a cross-provider total today. This exists so that
 * whoever first wants one reaches for the honest implementation instead of
 * reducing over `unwrapOrNull` and defaulting the gaps to zero.
 */
export function combinedTotal(sources: HomeMetricSource[]): DataState<number> {
  const first = sources[0];
  if (first === undefined) {
    return unavailable('insufficient_data', 'There are no sources to total.');
  }

  const valueOf = (source: HomeMetricSource): DataState<number> =>
    mapData(source.state, (metric) => metric.value);

  return sources
    .slice(1)
    .reduce<DataState<number>>(
      (acc, source) => mapData(combineData(acc, valueOf(source)), ([a, b]) => a + b),
      valueOf(first),
    );
}

/* -------------------------------------------------------------------------- */
/* The connection alert                                                       */
/* -------------------------------------------------------------------------- */

const PROVIDER_LABEL: Record<ProviderId, string> = {
  google_business: 'Google Business Profile',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
};

/** Worst first. Only these states are worth interrupting the owner for. */
const ALERT_ORDER = ['expired', 'revoked', 'error'] as const;

/**
 * At most one alert, because the design has one row and a stack of red rows
 * teaches people to ignore red rows.
 *
 * `not_connected` is deliberately NOT an alert. Never having linked Instagram
 * is not a fault to fix at the top of Home — it is an offer, and it belongs in
 * the module rows and the empty state. As a red banner it would nag every owner
 * who simply does not use Instagram.
 */
export function deriveAlert(state: DataState<ProviderConnection[]>): HomeAlert | null {
  if (!isReady(state)) return null;

  for (const status of ALERT_ORDER) {
    const hit = state.value.find((connection) => connection.status === status);
    if (hit === undefined) continue;

    const name = PROVIDER_LABEL[hit.provider];
    return {
      id: `alert-${hit.provider}-${status}`,
      title: status === 'error' ? `${name} is not responding` : `${name} needs permission again`,
      body:
        status === 'error'
          ? 'Shoogle could not reach it on the last try.'
          : 'Scheduled work for this account will not publish until you reconnect.',
      actionLabel: status === 'error' ? 'Retry' : 'Fix',
      href: '/(tabs)/business',
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Module rows — independent facts                                            */
/* -------------------------------------------------------------------------- */

/**
 * A module's one-line subtitle.
 *
 * The non-ready branches never say "0". "Nothing scheduled yet" is a claim we
 * can only make once Social has told us so; when it has not, we say we do not
 * know instead.
 */
function subtitleFor<T>(state: DataState<T>, describe: (value: T) => string): string {
  switch (state.status) {
    case 'ready':
      return describe(state.value);
    case 'loading':
      return 'Checking…';
    case 'unavailable':
      return UNAVAILABLE_COPY[state.reason].title;
    case 'error':
      return 'Could not load';
  }
}

function describeSocial(summary: SocialSummary): string {
  const parts: string[] = [];
  if (summary.failedCount > 0) parts.push(`${summary.failedCount} failed`);
  if (summary.scheduledCount > 0) parts.push(`${summary.scheduledCount} scheduled`);
  if (summary.draftCount > 0) {
    parts.push(`${summary.draftCount} draft${summary.draftCount === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Nothing scheduled yet';
}

function describeSeo(summary: SeoSummary): string {
  const parts: string[] = [];
  // Omitted when null. Never printed as "0 keywords improved".
  if (summary.improvedKeywordCount !== null && summary.improvedKeywordCount > 0) {
    parts.push(`${summary.improvedKeywordCount} keywords improved`);
  }
  if (summary.unansweredReviewCount > 0) {
    const plural = summary.unansweredReviewCount === 1 ? '' : 's';
    parts.push(`${summary.unansweredReviewCount} review${plural} unanswered`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Nothing needs attention';
}

function describeWebsite(summary: WebsiteSummary): string {
  switch (summary.status) {
    case 'none':
      return 'Not built yet';
    case 'draft':
      return 'Draft in progress';
    case 'awaiting_review':
      return 'Ready for your review';
    case 'published':
      return 'Live';
  }
}

/** True when the row should draw the eye. Only ever derived from a ready state. */
function emphasise<T>(state: DataState<T>, predicate: (value: T) => boolean): boolean {
  return isReady(state) && predicate(state.value);
}

export function moduleRows(sources: HomeSources): HomeModuleRow[] {
  return [
    {
      id: 'social',
      title: 'Social',
      subtitle: subtitleFor(sources.social, describeSocial),
      accent: 'blue',
      icon: 'social',
      href: '/(tabs)/posts',
      emphasis: emphasise(sources.social, (summary) => summary.failedCount > 0),
    },
    {
      id: 'seo',
      title: 'SEO / Local',
      subtitle: subtitleFor(sources.seo, describeSeo),
      accent: 'green',
      icon: 'seo',
      href: '/(tabs)/business',
      emphasis: emphasise(sources.seo, (summary) => summary.unansweredReviewCount > 0),
    },
    {
      id: 'website',
      title: 'Website',
      subtitle: subtitleFor(sources.website, describeWebsite),
      accent: 'amber',
      icon: 'website',
      href: '/(tabs)/business',
      emphasis: emphasise(sources.website, (summary) => summary.status === 'awaiting_review'),
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* The whole screen                                                           */
/* -------------------------------------------------------------------------- */

function allStates(sources: HomeSources): DataState<unknown>[] {
  return [
    sources.business,
    sources.connections,
    sources.social,
    sources.seo,
    sources.website,
    sources.suggestions,
    sources.insights,
    sources.unreadNotifications,
    ...sources.metrics.map((metric) => metric.state),
  ];
}

export function aggregateHome(sources: HomeSources): HomeViewModel {
  const states = allStates(sources);
  const metrics = sources.metrics.map(toMetricTile);
  const alert = deriveAlert(sources.connections);
  const business = businessIdentity(sources.business);
  const insights = isReady(sources.insights) ? sources.insights.value : [];

  const ranked = rankSuggestions(suggestionsFrom(sources));
  const headline = ranked[0] ?? null;

  /**
   * Empty means we know NOTHING — not that one source failed. A single real
   * metric, suggestion, alert or business name is enough to render the page,
   * because a page with one true thing on it beats an empty state that hides it.
   */
  const isEmpty =
    business === null &&
    headline === null &&
    alert === null &&
    insights.length === 0 &&
    metrics.every((tile) => tile.value === null);

  return {
    business,
    hasUnreadNotifications: isReady(sources.unreadNotifications)
      ? sources.unreadNotifications.value > 0
      : false,
    headline,
    moreSuggestions: Math.max(0, ranked.length - 1),
    insights,
    metricsPeriod: sources.metricsPeriod,
    metrics,
    alert,
    modules: moduleRows(sources),
    isLoading: states.some((state) => state.status === 'loading'),
    isFixture: states.some((state) => state.status === 'ready' && state.isFixture === true),
    isEmpty,
  };
}

/* -------------------------------------------------------------------------- */
/* The honest defaults                                                        */
/* -------------------------------------------------------------------------- */

const NOT_CONNECTED_MESSAGE = 'Connect this account to see data here.';

/**
 * Sources for an app where nothing has been connected and no feature has
 * registered a summary yet — which is the literal truth today.
 *
 * This is not a mock. It fabricates no data and claims no integration: every
 * field is `unavailable('not_connected')`, the same answer the provider
 * registry gives for a provider nobody has implemented.
 *
 * `connections` is `ready([])` rather than unavailable because we genuinely do
 * know the answer: there are no connections. That is a measured empty list, not
 * a missing one, and it is what stops `deriveAlert` inventing a warning.
 */
export function disconnectedSources(): HomeSources {
  const notConnected = <T>(): DataState<T> => unavailable('not_connected', NOT_CONNECTED_MESSAGE);

  return {
    business: notConnected<Business>(),
    connections: ready<ProviderConnection[]>([], new Date(0).toISOString()),
    metrics: [],
    metricsPeriod: 'Last 28 days',
    social: notConnected<SocialSummary>(),
    seo: notConnected<SeoSummary>(),
    website: notConnected<WebsiteSummary>(),
    suggestions: notConnected(),
    insights: notConnected(),
    unreadNotifications: notConnected<number>(),
  };
}

/** Every source still in flight. The state before the first fetch resolves. */
export function loadingSources(): HomeSources {
  return {
    business: loading(),
    connections: loading(),
    metrics: [],
    metricsPeriod: 'Last 28 days',
    social: loading(),
    seo: loading(),
    website: loading(),
    suggestions: loading(),
    insights: loading(),
    unreadNotifications: loading(),
  };
}
