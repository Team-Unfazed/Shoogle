/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA.
 *
 * Content for the Business tab, so the layout can be reviewed against
 * "Shoogle SEO.dc.html" before any provider is connected. Every value is
 * invented. Read fixtures/README.md before using it.
 *
 * TWO RULES THIS FILE LEARNED THE HARD WAY
 * ----------------------------------------
 * 1. A fixture must never model data the real provider cannot supply.
 *    This file previously carried `{ key: 'rank', label: 'Avg. rank',
 *    value: '#6.4', direction: 'up' }` and a `rankings: { tracked, improved }`
 *    block. Google publishes NO rank position through any API — not
 *    rate-limited, not approval-gated, it does not exist. Rendering one taught
 *    the team a capability that will never arrive and would have shipped as a
 *    lie the day a real business looked at it. Both are deleted.
 *
 * 2. Numeric values here are deliberately left in wireframe form rather than
 *    prefixed `[FIXTURE]`, because the whole point of this file is to let the
 *    layout be judged against the design. The protection is structural instead:
 *    `getBusinessFixture()` returns null outside development, and every screen
 *    rendering it shows the fixture banner. See fixtures/README.md.
 *    Business identity IS marked, because that is what a stray screenshot would
 *    be mistaken for.
 */

import { isFixtureModeEnabled } from '@/lib/env';

export interface BusinessGridMetric {
  key: string;
  label: string;
  /** Pre-formatted for display. Null when unmeasured — never 0. */
  value: string | null;
  delta: string | null;
  direction: 'up' | 'down' | 'flat' | null;
}

export interface BusinessFixture {
  visibility: {
    label: string;
    headline: string;
    body: string;
    filledSegments: number | null;
  };
  metrics: BusinessGridMetric[];
  reviews: { rating: number | null; total: number | null };
  gbpPosts: { status: string; needsAttention: boolean };
  website: { status: string; needsAttention: boolean };
  advice: { text: string; actionLabel: string };
}

/**
 * The four grid metrics are all drawn from the eleven DailyMetric values that
 * survive in the Performance API. Nothing here is a metric Google removed in
 * 2023 (post views, photo views, query breakdowns, driving-direction geography)
 * and nothing here is a rank.
 */
const businessFixture: BusinessFixture = {
  visibility: {
    label: 'YOUR LOCAL VISIBILITY',
    headline: 'Looking good',
    body: 'Is mahine 14% zyada log aapko Google par dhoondh rahe hain. 4 cheezein theek karne layak hain.',
    filledSegments: 3,
  },

  metrics: [
    // BUSINESS_IMPRESSIONS_* — real, still available.
    { key: 'views', label: 'Google views', value: '1,204', delta: '12%', direction: 'up' },
    // CALL_CLICKS — real.
    { key: 'calls', label: 'Calls', value: '38', delta: '6%', direction: 'up' },
    // BUSINESS_DIRECTION_REQUESTS — real. (The direction GEOGRAPHY breakdown was
    // removed in 2023; the request count itself survives.)
    { key: 'directions', label: 'Directions', value: '61', delta: '3%', direction: 'down' },
    // WEBSITE_CLICKS — real. Replaces the deleted rank tile.
    { key: 'website_clicks', label: 'Website taps', value: '96', delta: '9%', direction: 'up' },
  ],

  reviews: { rating: 4.8, total: 32 },
  gbpPosts: { status: 'Last post expire ho gaya', needsAttention: true },
  website: { status: 'Ready for your review', needsAttention: true },

  advice: {
    text: 'Ek Google post daalne se aapki visibility 7 din tak zyada rehti hai.',
    actionLabel: 'Create now',
  },
};

/** Business identity, marked — this is what a stray screenshot is mistaken for. */
export const businessFixtureIdentity = {
  name: '[FIXTURE] Vahan Ready',
  locality: '[FIXTURE] Nerul, Navi Mumbai',
} as const;

/**
 * The ONLY sanctioned way to read this fixture.
 *
 * Returns null unless `isFixtureModeEnabled()` — which requires a development
 * build AND an explicit flag. A release binary cannot reach the data at all.
 */
export function getBusinessFixture(): BusinessFixture | null {
  if (!isFixtureModeEnabled()) return null;
  return businessFixture;
}

/**
 * Permanent, owner-facing truth for the Search rankings row.
 *
 * Google exposes no rank position through any API. This is not "not yet" and
 * not "coming soon" — there is nothing to wait for. Any future ranking feature
 * requires a paid third-party provider and server infrastructure.
 */
export const RANK_NOT_MEASURABLE_MESSAGE = 'Google does not publish rank positions';
