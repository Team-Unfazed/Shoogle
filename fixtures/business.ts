/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA.
 *
 * Content transcribed from "Shoogle SEO.dc.html" and "Shoogle Website.dc.html"
 * so the Business tab can be reviewed against the wireframe. Every value is
 * invented. Read fixtures/README.md before using it.
 */

export interface BusinessGridMetric {
  key: string;
  label: string;
  /** Pre-formatted for display. Null when unmeasured. */
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
  /**
   * No `unanswered` field. Whether GBP's review `reply` field reflects replies
   * posted outside Shoogle is unestablished, so an unanswered count cannot be
   * honestly measured — a fixture must not model data the real provider cannot
   * supply, or the UI gets built around a number that will never arrive.
   */
  reviews: { rating: number | null; total: number | null };
  rankings: { tracked: number; improved: number };
  gbpPosts: { status: string; needsAttention: boolean };
  website: { status: string; needsAttention: boolean };
  advice: { text: string; actionLabel: string };
}

export const businessFixture: BusinessFixture = {
  visibility: {
    label: 'YOUR LOCAL VISIBILITY',
    headline: 'Looking good',
    body: 'Is mahine 14% zyada log aapko Google par dhoondh rahe hain. 4 keywords improve hue.',
    filledSegments: 3,
  },

  metrics: [
    { key: 'views', label: 'Google views', value: '1,204', delta: '12%', direction: 'up' },
    { key: 'calls', label: 'Calls', value: '38', delta: '6%', direction: 'up' },
    { key: 'directions', label: 'Directions', value: '61', delta: '3%', direction: 'down' },
    { key: 'rank', label: 'Avg. rank', value: '#6.4', delta: '2.1', direction: 'up' },
  ],

  reviews: { rating: 4.8, total: 32 },
  rankings: { tracked: 6, improved: 4 },
  gbpPosts: { status: 'Last post expire ho gaya', needsAttention: true },
  website: { status: 'Ready for your review', needsAttention: true },

  advice: {
    text: 'Ek Google post daalne se aapki visibility 7 din tak zyada rehti hai.',
    actionLabel: 'Create now',
  },
};
