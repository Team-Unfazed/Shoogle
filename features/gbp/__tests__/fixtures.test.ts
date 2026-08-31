import {
  fixtureGbpLocationWire,
  fixtureGbpServiceAreaLocationWire,
  fixtureKeywordRows,
  fixturePerformanceResponse,
  fixtureReviewsResponse,
  fixtureVoiceOfMerchantStates,
  getGbpFixtures,
  gbpFixtureState,
} from '@/fixtures/gbp';
import { GBP_PERMANENT_UNAVAILABLE_STATES } from '@/features/gbp/capabilities';
import { classifyReply, toReviewDetail } from '@/features/gbp/mappers';
import { buildMetrics, buildWindows } from '@/features/gbp/performance';
import { classifyVoiceOfMerchant } from '@/features/gbp/voiceOfMerchant';
import { LIVE_DAILY_METRICS } from '@/features/seo';

/** See performance.test.ts: null means the date maths regressed, not bad input. */
function mustBuildWindows(endDate: string, days: number) {
  const windows = buildWindows(endDate, days);
  if (windows === null) throw new Error(`buildWindows returned null for ${endDate}`);
  return windows;
}

/**
 * Google publishes no sandbox for the Business Profile APIs and recommends
 * mocked responses instead, so these fixtures ARE the sanctioned test path.
 * That makes it more important, not less, that they can never be mistaken for a
 * real business's data.
 */

let mockFixturesEnabled = false;
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return { ...actual, isFixtureModeEnabled: () => mockFixturesEnabled };
});

afterEach(() => {
  mockFixturesEnabled = false;
});

describe('gating', () => {
  it('returns nothing at all when fixture mode is off', () => {
    mockFixturesEnabled = false;
    expect(getGbpFixtures()).toBeNull();
  });

  it('returns every modelled state when fixture mode is on', () => {
    mockFixturesEnabled = true;
    const fixtures = getGbpFixtures();
    expect(fixtures).not.toBeNull();
    expect(fixtures?.locations).toHaveLength(2);
    expect(Object.keys(fixtures?.voiceOfMerchant ?? {})).toHaveLength(8);
  });

  it('reports not_connected rather than leaking a fixture when the flag is off', () => {
    mockFixturesEnabled = false;
    expect(gbpFixtureState({ any: 'value' })).toMatchObject({
      status: 'unavailable',
      reason: 'not_connected',
    });
  });

  it('marks a fixture-sourced value so the flag travels with the data', () => {
    mockFixturesEnabled = true;
    const state = gbpFixtureState({ any: 'value' });
    expect(state).toMatchObject({ status: 'ready', isFixture: true });
  });
});

describe('every visible fixture value is obviously invented', () => {
  it('marks business and reviewer names', () => {
    expect(fixtureGbpLocationWire.title).toContain('[FIXTURE]');
    expect(fixtureGbpServiceAreaLocationWire.title).toContain('[FIXTURE]');
    for (const review of fixtureReviewsResponse.reviews ?? []) {
      const name = review.reviewer?.displayName;
      if (name !== undefined) expect(name).toContain('[FIXTURE]');
      if (review.comment !== undefined) expect(review.comment).toContain('[FIXTURE]');
      if (review.reviewReply?.comment !== undefined) {
        expect(review.reviewReply.comment).toContain('[FIXTURE]');
      }
    }
    for (const row of fixtureKeywordRows) expect(row.keyword).toContain('[fixture]');
  });
});

describe('the fixtures cover all four Voice of Merchant outcomes', () => {
  it('classifies each one to a distinct state', () => {
    const kinds = Object.values(fixtureVoiceOfMerchantStates).map(
      (state) => classifyVoiceOfMerchant(state).kind,
    );
    expect(new Set(kinds)).toEqual(
      new Set([
        'has_voice_of_merchant',
        'verify',
        'wait_for_voice_of_merchant',
        'resolve_ownership_conflict',
        'comply_with_guidelines',
        'indeterminate',
      ]),
    );
  });
});

describe('the fixtures encode the honesty rules, not just shapes', () => {
  it('keeps a measured zero apart from an unreported day', () => {
    const windows = mustBuildWindows('2020-01-04', 4);
    const { metrics, omitted } = buildMetrics(fixturePerformanceResponse, windows, 'last 4 days');
    const byKey = new Map(metrics.map((metric) => [metric.key, metric]));

    // Real zero day included in a complete series.
    expect(byKey.get(LIVE_DAILY_METRICS.CALL_CLICKS.key)?.value).toBe(6);
    expect(byKey.get(LIVE_DAILY_METRICS.CALL_CLICKS.key)?.period).toBe('last 4 days');

    // Unreported days are excluded from the count AND labelled.
    expect(byKey.get(LIVE_DAILY_METRICS.WEBSITE_CLICKS.key)?.value).toBe(11);
    expect(byKey.get(LIVE_DAILY_METRICS.WEBSITE_CLICKS.key)?.period).toMatch(
      /reported 2 of 4 days/,
    );

    // A metric Google said nothing about is absent, not zero.
    expect(byKey.has(LIVE_DAILY_METRICS.BUSINESS_BOOKINGS.key)).toBe(false);
    expect(omitted).toContain('BUSINESS_BOOKINGS');
  });

  it('never lets the DAILY_METRIC_UNKNOWN sentinel become a metric', () => {
    const windows = mustBuildWindows('2020-01-04', 4);
    const { metrics } = buildMetrics(fixturePerformanceResponse, windows, 'last 4 days');
    expect(metrics.map((metric) => metric.key)).not.toContain('daily_metric_unknown');
  });

  it('models a keyword Google would only give a lower bound for', () => {
    expect(fixtureKeywordRows.some((row) => row.impressions.kind === 'below_threshold')).toBe(true);
    expect(fixtureKeywordRows.some((row) => row.impressions.kind === 'exact')).toBe(true);
  });

  it('models a reply in moderation and a reply Google rejected, and neither as published', () => {
    const kinds = (fixtureReviewsResponse.reviews ?? []).map((review) =>
      classifyReply(review.reviewReply).kind,
    );
    expect(kinds).toContain('no_reply');
    expect(kinds).toContain('state_not_understood');
    expect(kinds).toContain('rejected');
    expect(kinds).not.toContain('published');
  });

  it('models an anonymous reviewer without inventing a name', () => {
    const anonymous = (fixtureReviewsResponse.reviews ?? []).find(
      (review) => review.reviewer?.isAnonymous === true,
    );
    const mapped = anonymous === undefined ? null : toReviewDetail(anonymous);
    expect(mapped?.ok).toBe(true);
    if (mapped?.ok === true) {
      expect(mapped.review.isAnonymous).toBe(true);
      expect(mapped.review.authorDisplayName).not.toContain('undefined');
    }
  });
});

describe('permanently unavailable capabilities are values, not strings in a screen', () => {
  it('never offers a number for anything Google removed or never had', () => {
    for (const [capability, state] of Object.entries(GBP_PERMANENT_UNAVAILABLE_STATES)) {
      expect(state.status).toBe('unavailable');
      expect(state.reason).toBe('not_supported');
      expect(state.message.length).toBeGreaterThan(30);
      // Not "coming soon", not "0" — these are gone or never existed.
      expect(state.message).not.toMatch(/coming soon|not built yet/i);
      expect(capability.length).toBeGreaterThan(0);
    }
  });

  it('says Google publishes no rank position at all', () => {
    expect(GBP_PERMANENT_UNAVAILABLE_STATES.search_rank_position.message).toMatch(
      /does not publish where a business ranks/i,
    );
  });
});
