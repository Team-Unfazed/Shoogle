/**
 * DEVELOPMENT FIXTURES FOR features/seo — NOT CUSTOMER DATA.
 *
 * Read fixtures/README.md before using anything here. Same rules as
 * fixtures/index.ts, same gate, same visible marker: every value carries
 * `[FIXTURE]` so that if one reaches a screen by mistake it is obvious in a
 * screenshot rather than looking like a real business's numbers.
 *
 * The marker is load-bearing twice over. `features/seo/ai/gemini.ts` refuses
 * any prompt that does not contain it, so these values are also the only
 * material the development AI client will accept.
 */

import { isFixtureModeEnabled } from '@/lib/env';
import { ready, unavailable, type DataState } from '@/lib/state/DataState';
import type {
  DailyMetricSample,
  KeywordImpressionRow,
  LocalBusinessSchemaInput,
  PageSnapshot,
  SearchKeywordsReport,
} from '@/features/seo';

/** Fixed timestamp so snapshots are stable and nothing looks "live". */
const FIXTURE_TIMESTAMP = '2020-01-01T00:00:00.000Z';

/* -------------------------------------------------------------------------- */
/* Search keywords — the threshold union                                      */
/* -------------------------------------------------------------------------- */

/**
 * Deliberately mixed. Two exact readings, one measured zero, and three bounded
 * ones — which is roughly the shape a real neighbourhood business sees, and it
 * makes any screen that renders a bound as a number obviously wrong in review.
 */
export const fixtureKeywordRows: KeywordImpressionRow[] = [
  {
    keyword: '[fixture] hair salon nerul',
    monthStart: '2020-01-01',
    impressions: { kind: 'exact', value: 1240 },
  },
  {
    keyword: '[fixture] salon near me',
    monthStart: '2020-01-01',
    impressions: { kind: 'exact', value: 318 },
  },
  {
    keyword: '[fixture] bridal makeup seawoods',
    monthStart: '2020-01-01',
    impressions: { kind: 'below_threshold', threshold: 15 },
  },
  {
    keyword: '[fixture] hair spa offers',
    monthStart: '2020-01-01',
    impressions: { kind: 'below_threshold', threshold: 15 },
  },
  {
    keyword: '[fixture] kids haircut sunday',
    monthStart: '2020-01-01',
    impressions: { kind: 'below_threshold', threshold: 5 },
  },
  {
    // A measured zero. Google asked and answered "none" — a different fact from
    // "below 15" and a different fact again from "we did not fetch it".
    keyword: '[fixture] beard styling nerul east',
    monthStart: '2020-01-01',
    impressions: { kind: 'exact', value: 0 },
  },
];

export const fixtureSearchKeywordsReport: SearchKeywordsReport = {
  locationId: 'fixture-location-0001',
  monthStart: '2020-01-01',
  rows: fixtureKeywordRows,
  partial: false,
};

/* -------------------------------------------------------------------------- */
/* Daily metrics                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Includes the three states that must stay distinguishable:
 *   - a real number,
 *   - a real zero,
 *   - `null`, meaning the series was missing (which `toMetrics()` OMITS rather
 *     than turning into a 0),
 * plus the `DAILY_METRIC_UNKNOWN` sentinel, which must never be rendered.
 */
export const fixtureDailyMetricSamples: DailyMetricSample[] = [
  { metric: 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH', total: 2418, period: 'last 28 days', changePct: 12 },
  { metric: 'BUSINESS_IMPRESSIONS_MOBILE_MAPS', total: 1902, period: 'last 28 days', changePct: null },
  { metric: 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', total: 214, period: 'last 28 days', changePct: -4 },
  { metric: 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS', total: 96, period: 'last 28 days', changePct: null },
  { metric: 'CALL_CLICKS', total: 61, period: 'last 28 days', changePct: 8 },
  { metric: 'WEBSITE_CLICKS', total: 0, period: 'last 28 days', changePct: null },
  { metric: 'BUSINESS_DIRECTION_REQUESTS', total: 44, period: 'last 28 days', changePct: null },
  { metric: 'BUSINESS_CONVERSATIONS', total: null, period: 'last 28 days', changePct: null },
  { metric: 'BUSINESS_BOOKINGS', total: null, period: 'last 28 days', changePct: null },
  { metric: 'DAILY_METRIC_UNKNOWN', total: 999, period: 'last 28 days', changePct: null },
];

/* -------------------------------------------------------------------------- */
/* A website to run the AI visibility check against                            */
/* -------------------------------------------------------------------------- */

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>[FIXTURE] Example Salon — Nerul</title>
    <meta name="robots" content="index,follow" />
  </head>
  <body>
    <h1>[FIXTURE] Example Salon</h1>
    <p>
      [FIXTURE] This paragraph is invented placeholder copy used to lay out the
      readability observations. It is not written by or about a real business.
      We open early on weekdays and take walk-ins for haircuts.
    </p>
    <h2>Services</h2>
    <ul>
      <li>[FIXTURE] Haircut</li>
      <li>[FIXTURE] Hair colour</li>
    </ul>
    <p>Call <a href="tel:+919000000000">+91 90000 00000</a></p>
  </body>
</html>`;

/**
 * Note the robots.txt: it blocks `Claude-SearchBot`, so the visibility check
 * produces a real critical finding rather than an all-green report that teaches
 * nobody anything in review.
 */
const FIXTURE_ROBOTS_TXT = `User-agent: *
Allow: /

User-agent: Claude-SearchBot
Disallow: /
`;

export const fixturePageSnapshot: PageSnapshot = {
  requestedUrl: 'https://fixture.example/',
  finalUrl: 'https://fixture.example/',
  httpStatus: 200,
  headers: { 'content-type': 'text/html; charset=utf-8' },
  html: FIXTURE_HTML,
  robotsTxt: FIXTURE_ROBOTS_TXT,
  fetchedAt: FIXTURE_TIMESTAMP,
};

/* -------------------------------------------------------------------------- */
/* Schema generation input                                                    */
/* -------------------------------------------------------------------------- */

export const fixtureSchemaInput: LocalBusinessSchemaInput = {
  name: '[FIXTURE] Example Salon',
  category: 'salon',
  typeOverride: null,
  url: 'https://fixture.example/',
  streetAddress: '[FIXTURE] 1 Example Road',
  addressLocality: '[FIXTURE] Example Locality',
  addressRegion: 'Maharashtra',
  postalCode: '400706',
  // Reserved test range, so it cannot dial a real person.
  telephone: '+919000000000',
  geo: { latitude: 19.03301, longitude: 73.01991 },
  priceRange: '₹300–₹1500',
  openingHours: [
    { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '10:00', closes: '20:00' },
    { days: ['Saturday', 'Sunday'], opens: '09:00', closes: '21:00' },
  ],
  imageUrls: ['https://fixture.example/photo.jpg'],
  areaServed: [],
  servesCuisine: [],
  description: '[FIXTURE] Invented description used only to lay out the schema card.',
};

/* -------------------------------------------------------------------------- */
/* AI prompt material                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The only kind of material the development Gemini client accepts: it carries
 * the `[FIXTURE]` marker, which that client checks for before sending anything.
 */
export const fixtureAiPromptPayload =
  '[FIXTURE] Example Salon is an invented salon in [FIXTURE] Example Locality. ' +
  'It offers haircuts, colour and bridal makeup. None of this describes a real business.';

/* -------------------------------------------------------------------------- */
/* Gated access                                                               */
/* -------------------------------------------------------------------------- */

export interface SeoFixtures {
  keywords: SearchKeywordsReport;
  dailyMetrics: DailyMetricSample[];
  pageSnapshot: PageSnapshot;
  schemaInput: LocalBusinessSchemaInput;
  aiPromptPayload: string;
}

/**
 * The ONLY sanctioned way to read these fixtures.
 *
 * Returns null unless `isFixtureModeEnabled()` — which requires a development
 * build AND `EXPO_PUBLIC_ENABLE_FIXTURES=1`. Callers must handle null, which
 * means the honest "nothing here" path is always exercised too.
 */
export function getSeoFixtures(): SeoFixtures | null {
  if (!isFixtureModeEnabled()) return null;
  return {
    keywords: fixtureSearchKeywordsReport,
    dailyMetrics: fixtureDailyMetricSamples,
    pageSnapshot: fixturePageSnapshot,
    schemaInput: fixtureSchemaInput,
    aiPromptPayload: fixtureAiPromptPayload,
  };
}

/**
 * Wraps an SEO fixture in a `DataState` with `isFixture: true`, so the flag
 * travels with the value. When fixture mode is off it returns
 * `unavailable('no_data_yet')` rather than the fixture — the same state a real
 * provider would report before any data exists.
 */
export function seoFixtureState<T>(value: T): DataState<T> {
  if (!isFixtureModeEnabled()) {
    return unavailable('no_data_yet', 'There is nothing to show yet.');
  }
  return ready(value, FIXTURE_TIMESTAMP, true);
}
