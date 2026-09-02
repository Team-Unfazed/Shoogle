/**
 * The development fixture, adapted to `HomeSources`. Owner: Aryan.
 *
 * DEVELOPMENT ONLY — NOT CUSTOMER DATA. Reaching this module at all requires
 * `isFixtureModeEnabled()`, which the hook in `./useHome` checks; every state
 * it produces carries `isFixture: true`, so the flag travels with the value and
 * `<Screen showsFixtureData>` can put a banner over anything derived from it.
 *
 * ## Why the fixture is adapted rather than rendered directly
 *
 * `fixtures/home.ts` is shaped like the WIREFRAME: a pre-written module
 * subtitle, a pre-written alert, a headline chosen by hand. If the screen kept
 * reading it directly, the aggregation and the ranking would never run in
 * development, and the first time they ran would be against a live provider.
 *
 * So the fixture is decomposed back into the sources a real provider would
 * supply — counts, connection rows, metric readings — and the same aggregation
 * that will run in production rebuilds the screen from them. The subtitles and
 * the alert on screen in development are therefore GENERATED, and exercise the
 * code paths that matter, rather than being strings copied out of a design.
 */

import { ready } from '@/lib/state/DataState';
import type { Business, ProviderConnection, ProviderId } from '@/types/domain';
import { homeFixture } from '@/fixtures/home';
import type { HomeMetricSource, HomeSources, HomeSuggestion } from './types';

/** Fixed so snapshots are stable and nothing on screen looks live. */
const FIXTURE_TIMESTAMP = '2020-01-01T00:00:00.000Z';

const asFixture = <T>(value: T) => ready(value, FIXTURE_TIMESTAMP, true);

/**
 * Which provider each Home metric depends on.
 *
 * Kept beside the fixture because it is the fixture's own mapping. A real
 * implementation will get this from the feature that owns the metric.
 */
const METRIC_PROVIDER: Record<string, ProviderId> = {
  google_views: 'google_business',
  ig_reach: 'instagram',
  calls: 'google_business',
};

function metricSources(): HomeMetricSource[] {
  return homeFixture.metrics.map((metric) => ({
    key: metric.key,
    label: metric.label,
    provider: METRIC_PROVIDER[metric.key] ?? 'google_business',
    state: asFixture({ value: metric.value, changePct: metric.changePct }),
  }));
}

/**
 * The headline the design shows is an AUTHORED suggestion — a drafted post,
 * quoting generated Hinglish content, which product rule 12 permits. Nothing
 * derives it from counts, so it enters through the `suggestions` source exactly
 * as the content engine's output will.
 */
function authoredSuggestions(): HomeSuggestion[] {
  const { headline } = homeFixture;
  return [
    {
      id: headline.id,
      kind: 'content',
      label: headline.kind,
      accent: headline.accent,
      title: headline.title,
      body: headline.body,
      primaryLabel: headline.primaryLabel,
      href: '/(tabs)/posts',
    },
  ];
}

/**
 * The connection rows behind the wireframe's alert.
 *
 * The fixture states the alert as finished copy; the real system will only ever
 * have connection ROWS and must write that copy itself. So the row is what we
 * hand over, and `deriveAlert` produces the banner — in English, because an
 * alert is UI chrome and rule 12 keeps chrome English even where the fixture's
 * hand-written version was not.
 */
function connections(): ProviderConnection[] {
  return [
    {
      provider: 'google_business',
      status: 'connected',
      handle: '[FIXTURE] Vahan Ready',
      lastSyncedAt: FIXTURE_TIMESTAMP,
    },
    {
      provider: 'instagram',
      status: 'expired',
      handle: '[FIXTURE] @vahanready',
      lastSyncedAt: FIXTURE_TIMESTAMP,
      message: 'Access expired.',
    },
  ];
}

const business: Business = {
  id: 'fixture-business-home',
  name: homeFixture.business.name,
  category: 'other',
  locality: homeFixture.business.locality,
  timezone: 'Asia/Kolkata',
};

/**
 * The fixture as sources. Call only behind `isFixtureModeEnabled()`.
 *
 * The counts are read back out of the wireframe's own subtitles so that what
 * development renders still matches the design it was drawn from: 3 scheduled
 * and 1 draft in Social, 4 improved keywords and 1 unanswered review in SEO,
 * and a website waiting to be reviewed.
 */
export function fixtureHomeSources(): HomeSources {
  return {
    business: asFixture(business),
    connections: asFixture(connections()),
    metrics: metricSources(),
    metricsPeriod: homeFixture.metricsPeriod,
    social: asFixture({ scheduledCount: 3, draftCount: 1, failedCount: 0 }),
    seo: asFixture({ unansweredReviewCount: 1, improvedKeywordCount: 4 }),
    website: asFixture({ status: 'awaiting_review' as const }),
    suggestions: asFixture(authoredSuggestions()),
    insights: asFixture(homeFixture.insights),
    unreadNotifications: asFixture(homeFixture.unreadNotifications),
  };
}
