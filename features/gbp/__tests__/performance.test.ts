import type { Metric } from '@/lib/providers/types';
import {
  addDaysIso,
  buildMetrics,
  buildWindows,
  changePercent,
  daysInRange,
  extractSeries,
  missingMetrics,
  normaliseKeywordRow,
  normaliseKeywordRows,
  parseCount,
  parsePerformancePeriod,
  totalOver,
} from '@/features/gbp/performance';
import { formatKeywordImpressions } from '@/features/gbp/types';
import { LIVE_DAILY_METRIC_ORDER, LIVE_DAILY_METRICS } from '@/features/seo';
import type { GbpFetchMultiDailyMetricsResponse } from '@/features/gbp/types';

/**
 * "Unknown is not zero" has to survive Google's own serialisation: int64 values
 * arrive as strings, and a day with no value at all is indistinguishable from a
 * measured zero unless we refuse to guess. These tests pin the refusal.
 */

const day = (iso: string, value?: string) => {
  const [year = 0, month = 0, dayOfMonth = 0] = iso.split('-').map(Number);
  return { date: { year, month, day: dayOfMonth }, ...(value === undefined ? {} : { value }) };
};

const series = (
  entries: { metric: string; days: { iso: string; value?: string }[] }[],
): GbpFetchMultiDailyMetricsResponse => ({
  multiDailyMetricTimeSeries: [
    {
      dailyMetricTimeSeries: entries.map((entry) => ({
        dailyMetric: entry.metric,
        timeSeries: { datedValues: entry.days.map((d) => day(d.iso, d.value)) },
      })),
    },
  ],
});


/**
 * buildWindows / addDaysIso return null when a date will not parse. Every call
 * in this file passes a literal, valid date, so null here means the date maths
 * itself regressed — which should fail loudly rather than be cast away.
 */
function mustBuildWindows(endDate: string, days: number) {
  const windows = buildWindows(endDate, days);
  if (windows === null) throw new Error(`buildWindows returned null for a valid date: ${endDate}`);
  return windows;
}

function mustAddDays(iso: string, days: number): string {
  const result = addDaysIso(iso, days);
  if (result === null) throw new Error(`addDaysIso returned null for a valid date: ${iso}`);
  return result;
}

const WEEK = mustBuildWindows('2020-01-07', 7);
const sevenDays = (values: (string | undefined)[]) =>
  values.map((value, index) => ({ iso: mustAddDays('2020-01-01', index), value }));

describe('windows', () => {
  it('builds a window that ends on the last day we are willing to claim', () => {
    expect(WEEK.current).toEqual({ startDate: '2020-01-01', endDate: '2020-01-07' });
    expect(WEEK.previous).toEqual({ startDate: '2019-12-25', endDate: '2019-12-31' });
    expect(WEEK.combined).toEqual({ startDate: '2019-12-25', endDate: '2020-01-07' });
    expect(daysInRange(WEEK.current)).toBe(7);
  });

  it('refuses a period it cannot honestly report', () => {
    expect(parsePerformancePeriod('28d')?.days).toBe(28);
    expect(parsePerformancePeriod('last 28 days')?.days).toBe(28);
    expect(parsePerformancePeriod('this month')).toBeNull();
    expect(parsePerformancePeriod('')).toBeNull();
  });
});

describe('parseCount', () => {
  it('accepts the int64-as-string Google actually sends', () => {
    expect(parseCount('0')).toBe(0);
    expect(parseCount('1204')).toBe(1204);
  });

  it('treats anything that is not a whole non-negative number as unknown', () => {
    expect(parseCount(undefined)).toBeNull();
    expect(parseCount('')).toBeNull();
    expect(parseCount('abc')).toBeNull();
    expect(parseCount('-1')).toBeNull();
    expect(parseCount('1.5')).toBeNull();
  });
});

describe('a measured zero is not an unknown', () => {
  it('counts an explicit "0" day as reported', () => {
    const [entry] = extractSeries(
      series([{ metric: 'CALL_CLICKS', days: sevenDays(['0', '0', '0', '0', '0', '0', '0']) }]),
    );
    const total = totalOver(entry?.points ?? [], WEEK.current);
    expect(total).toEqual({ kind: 'total', total: 0, reportedDays: 7, totalDays: 7 });
  });

  it('counts a day with no value at all as NOT reported', () => {
    const [entry] = extractSeries(
      series([
        {
          metric: 'CALL_CLICKS',
          days: sevenDays([undefined, undefined, undefined, undefined, undefined, undefined, undefined]),
        },
      ]),
    );
    expect(totalOver(entry?.points ?? [], WEEK.current)).toEqual({ kind: 'unknown', totalDays: 7 });
  });

  it('produces a metric with value 0 for a genuine zero week, and no metric at all for an unknown week', () => {
    const zeroWeek = buildMetrics(
      series([{ metric: 'CALL_CLICKS', days: sevenDays(['0', '0', '0', '0', '0', '0', '0']) }]),
      WEEK,
      'last 7 days',
    );
    expect(zeroWeek.metrics).toHaveLength(1);
    expect(zeroWeek.metrics[0]?.value).toBe(0);

    const unknownWeek = buildMetrics(
      series([{ metric: 'CALL_CLICKS', days: [] }]),
      WEEK,
      'last 7 days',
    );
    expect(unknownWeek.metrics).toHaveLength(0);
    expect(unknownWeek.omitted).toEqual(['CALL_CLICKS']);
  });
});

describe('partial windows are labelled, not rounded up into a total', () => {
  it('says how many days Google actually reported', () => {
    const { metrics } = buildMetrics(
      series([
        {
          metric: 'WEBSITE_CLICKS',
          days: sevenDays(['7', undefined, undefined, '4', undefined, undefined, undefined]),
        },
      ]),
      WEEK,
      'last 7 days',
    );
    expect(metrics[0]?.value).toBe(11);
    expect(metrics[0]?.period).toMatch(/reported 2 of 7 days/);
  });

  it('leaves the period clean when every day is reported', () => {
    const { metrics } = buildMetrics(
      series([{ metric: 'WEBSITE_CLICKS', days: sevenDays(['1', '1', '1', '1', '1', '1', '1']) }]),
      WEEK,
      'last 7 days',
    );
    expect(metrics[0]?.period).toBe('last 7 days');
  });
});

describe('changePct', () => {
  it('is null unless both windows are complete', () => {
    expect(
      changePercent(
        { kind: 'total', total: 10, reportedDays: 7, totalDays: 7 },
        { kind: 'total', total: 5, reportedDays: 6, totalDays: 7 },
      ),
    ).toBeNull();
    expect(
      changePercent({ kind: 'unknown', totalDays: 7 }, {
        kind: 'total',
        total: 5,
        reportedDays: 7,
        totalDays: 7,
      }),
    ).toBeNull();
  });

  it('is null when the previous window was zero, rather than inventing a percentage', () => {
    expect(
      changePercent(
        { kind: 'total', total: 10, reportedDays: 7, totalDays: 7 },
        { kind: 'total', total: 0, reportedDays: 7, totalDays: 7 },
      ),
    ).toBeNull();
  });

  it('computes a real change when both windows are complete', () => {
    expect(
      changePercent(
        { kind: 'total', total: 15, reportedDays: 7, totalDays: 7 },
        { kind: 'total', total: 10, reportedDays: 7, totalDays: 7 },
      ),
    ).toBe(50);
  });
});

describe('the DAILY_METRIC_UNKNOWN sentinel never becomes a value', () => {
  it('is dropped before anything can label it', () => {
    const response = series([
      { metric: 'DAILY_METRIC_UNKNOWN', days: sevenDays(['9', '9', '9', '9', '9', '9', '9']) },
      { metric: 'NOT_A_REAL_METRIC', days: sevenDays(['9', '9', '9', '9', '9', '9', '9']) },
      { metric: 'CALL_CLICKS', days: sevenDays(['1', '1', '1', '1', '1', '1', '1']) },
    ]);
    expect(extractSeries(response).map((entry) => entry.metric)).toEqual(['CALL_CLICKS']);
    const { metrics } = buildMetrics(response, WEEK, 'last 7 days');
    expect(metrics).toHaveLength(1);
    expect(metrics[0]?.key).toBe(LIVE_DAILY_METRICS.CALL_CLICKS.key);
  });
});

describe('missingMetrics', () => {
  it('names every live metric Google reported nothing for', () => {
    const produced: Metric[] = [
      {
        key: LIVE_DAILY_METRICS.CALL_CLICKS.key,
        label: LIVE_DAILY_METRICS.CALL_CLICKS.label,
        value: 1,
        unit: 'count',
        period: 'last 7 days',
        changePct: null,
      },
    ];
    const missing = missingMetrics(LIVE_DAILY_METRIC_ORDER, produced);
    expect(missing).toHaveLength(LIVE_DAILY_METRIC_ORDER.length - 1);
    expect(missing).not.toContain('CALL_CLICKS');
  });
});

describe('search keyword impressions are a union, not a number', () => {
  it('keeps an exact value exact', () => {
    expect(
      normaliseKeywordRow({ searchKeyword: 'salon nerul', insightsValue: { value: '42' } }),
    ).toEqual({ keyword: 'salon nerul', impressions: { kind: 'exact', value: 42 } });
  });

  it('keeps a threshold a threshold and renders it as a lower bound', () => {
    const row = normaliseKeywordRow({
      searchKeyword: 'haircut price nerul',
      insightsValue: { threshold: '15' },
    });
    expect(row?.impressions).toEqual({ kind: 'below_threshold', threshold: 15 });
    expect(formatKeywordImpressions(row?.impressions ?? { kind: 'exact', value: 0 })).toBe(
      '<15',
    );
  });

  it('never renders a threshold as a bare number and never as zero', () => {
    expect(formatKeywordImpressions({ kind: 'below_threshold', threshold: 15 })).not.toBe('15');
    expect(formatKeywordImpressions({ kind: 'below_threshold', threshold: 15 })).not.toBe('0');
  });

  it('renders a genuine zero as zero', () => {
    expect(formatKeywordImpressions({ kind: 'exact', value: 0 })).toBe('0');
  });

  it('drops a row Google gave neither a value nor a threshold for', () => {
    expect(normaliseKeywordRow({ searchKeyword: 'x', insightsValue: {} })).toBeNull();
    expect(normaliseKeywordRow({ insightsValue: { value: '1' } })).toBeNull();
    expect(
      normaliseKeywordRows([
        { searchKeyword: 'a', insightsValue: { value: '1' } },
        { searchKeyword: 'b', insightsValue: {} },
      ]),
    ).toEqual({
      rows: [{ keyword: 'a', impressions: { kind: 'exact', value: 1 } }],
      skipped: 1,
    });
  });
});
