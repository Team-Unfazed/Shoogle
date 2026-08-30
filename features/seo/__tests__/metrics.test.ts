/**
 * The metric registries.
 *
 * The rules under test: eleven live metrics and no more, the sentinel never
 * becomes a value, removed metrics can only ever produce
 * `unavailable('not_supported')`, and an unknown total is OMITTED from a
 * `Metric[]` rather than written as 0.
 */

import {
  LIVE_DAILY_METRICS,
  LIVE_DAILY_METRIC_ORDER,
  REMOVED_METRICS,
  REMOVED_METRIC_IDS,
  RENAMED_METRICS,
  dailyMetricLabel,
  isLiveDailyMetric,
  isRemovedMetric,
  isRenderableDailyMetric,
  omittedDailyMetrics,
  removedMetricState,
  removedMetricStateFor,
  renamedMetricFor,
  toMetrics,
  type DailyMetricSample,
} from '../metrics';
import { DAILY_METRIC_UNKNOWN, type RemovedMetricId } from '../types';

describe('the surviving DailyMetric set', () => {
  it('has exactly eleven members', () => {
    expect(Object.keys(LIVE_DAILY_METRICS)).toHaveLength(11);
    expect(LIVE_DAILY_METRIC_ORDER).toHaveLength(11);
  });

  it('orders every live metric exactly once', () => {
    expect([...LIVE_DAILY_METRIC_ORDER].sort()).toEqual(Object.keys(LIVE_DAILY_METRICS).sort());
  });

  it('gives every metric a distinct machine key and an owner-facing label', () => {
    const keys = Object.values(LIVE_DAILY_METRICS).map((definition) => definition.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const definition of Object.values(LIVE_DAILY_METRICS)) {
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.note.length).toBeGreaterThan(0);
    }
  });

  it('does not include any metric Google removed', () => {
    for (const removed of REMOVED_METRIC_IDS) {
      expect(isLiveDailyMetric(removed)).toBe(false);
    }
  });
});

describe('the DAILY_METRIC_UNKNOWN sentinel', () => {
  it('is never renderable', () => {
    expect(isRenderableDailyMetric(DAILY_METRIC_UNKNOWN)).toBe(false);
  });

  it('has no label, so nothing can put it on screen', () => {
    expect(dailyMetricLabel(DAILY_METRIC_UNKNOWN)).toBeNull();
  });

  it('is not in the live registry', () => {
    expect(isLiveDailyMetric(DAILY_METRIC_UNKNOWN)).toBe(false);
    expect(LIVE_DAILY_METRIC_ORDER).not.toContain(DAILY_METRIC_UNKNOWN);
  });

  it('is dropped even when the API attaches a number to it', () => {
    const samples: DailyMetricSample[] = [
      { metric: DAILY_METRIC_UNKNOWN, total: 999, period: 'last 28 days' },
    ];
    expect(toMetrics(samples)).toEqual([]);
  });
});

describe('toMetrics', () => {
  const samples: DailyMetricSample[] = [
    { metric: 'CALL_CLICKS', total: 61, period: 'last 28 days', changePct: 8 },
    { metric: 'WEBSITE_CLICKS', total: 0, period: 'last 28 days', changePct: null },
    { metric: 'BUSINESS_CONVERSATIONS', total: null, period: 'last 28 days' },
    { metric: DAILY_METRIC_UNKNOWN, total: 12, period: 'last 28 days' },
    { metric: 'NOT_A_REAL_METRIC', total: 12, period: 'last 28 days' },
  ];

  it('keeps a measured zero, because it is a real answer', () => {
    const metrics = toMetrics(samples);
    const websiteClicks = metrics.find((metric) => metric.key === 'gbp.actions.website_clicks');
    expect(websiteClicks?.value).toBe(0);
  });

  it('omits an unknown total rather than writing it as 0', () => {
    const metrics = toMetrics(samples);
    expect(metrics.some((metric) => metric.label === 'Messages started')).toBe(false);
    expect(metrics.every((metric) => Number.isFinite(metric.value))).toBe(true);
    expect(metrics).toHaveLength(2);
  });

  it('names what it omitted so the gap can be shown to the owner', () => {
    expect(omittedDailyMetrics(samples)).toEqual(['Messages started']);
  });

  it('leaves changePct null rather than inventing 0%', () => {
    const metrics = toMetrics(samples);
    const websiteClicks = metrics.find((metric) => metric.key === 'gbp.actions.website_clicks');
    expect(websiteClicks?.changePct).toBeNull();
  });
});

describe('the removed-metric registry', () => {
  const expected: RemovedMetricId[] = [
    'ALL',
    'QUERIES_DIRECT',
    'QUERIES_INDIRECT',
    'QUERIES_CHAIN',
    'PHOTOS_VIEWS_MERCHANT',
    'PHOTOS_VIEWS_CUSTOMERS',
    'PHOTOS_COUNT_MERCHANT',
    'PHOTOS_COUNT_CUSTOMERS',
    'LOCAL_POST_VIEWS_SEARCH',
    'LOCAL_POST_ACTIONS_CALL_TO_ACTION',
    'DRIVING_DIRECTION_GEOGRAPHY',
    'MEDIA_INSIGHTS',
  ];

  it('covers post performance, photo counts, query splits and direction geography', () => {
    expect([...REMOVED_METRIC_IDS].sort()).toEqual([...expected].sort());
  });

  it('can only ever produce unavailable(not_supported)', () => {
    for (const id of REMOVED_METRIC_IDS) {
      const state = removedMetricState(id);
      expect(state.status).toBe('unavailable');
      expect(state.reason).toBe('not_supported');
    }
  });

  it('carries a short honest explanation and a discontinuation date', () => {
    for (const id of REMOVED_METRIC_IDS) {
      const definition = REMOVED_METRICS[id];
      expect(definition.explanation.length).toBeGreaterThan(10);
      expect(definition.discontinuedOn).toMatch(/^2023-\d{2}-\d{2}$/);
      expect(definition.explanation).not.toMatch(/coming soon|soon|for now|yet/i);
    }
  });

  it('surfaces the explanation as the owner-facing message', () => {
    const state = removedMetricState('LOCAL_POST_VIEWS_SEARCH');
    expect(state.message).toBe(REMOVED_METRICS.LOCAL_POST_VIEWS_SEARCH.explanation);
  });

  it('recognises removed ids and refuses unknown ones', () => {
    expect(isRemovedMetric('PHOTOS_VIEWS_CUSTOMERS')).toBe(true);
    expect(isRemovedMetric('CALL_CLICKS')).toBe(false);
    expect(removedMetricStateFor('CALL_CLICKS')).toBeNull();
    expect(removedMetricStateFor('PHOTOS_COUNT_MERCHANT')?.reason).toBe('not_supported');
  });
});

describe('metrics that were renamed rather than deleted', () => {
  it('is kept apart from the removed registry, so we do not claim they are gone', () => {
    for (const renamed of RENAMED_METRICS) {
      expect(isRemovedMetric(renamed.legacyId)).toBe(false);
      expect(renamed.replacedBy.length).toBeGreaterThan(0);
      for (const replacement of renamed.replacedBy) {
        expect(isLiveDailyMetric(replacement)).toBe(true);
      }
    }
  });

  it('splits the old views metrics across desktop and mobile', () => {
    expect(renamedMetricFor('VIEWS_MAPS')?.replacedBy).toEqual([
      'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
      'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
    ]);
    expect(renamedMetricFor('NOPE')).toBeNull();
  });
});
