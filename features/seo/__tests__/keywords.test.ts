/**
 * The threshold union. These tests exist because rendering a "below threshold"
 * reading as a number fabricates data, and rendering it as 0 violates "unknown
 * is not zero" twice over.
 */

import {
  belowThresholdImpressions,
  compareKeywordRows,
  countBelowThreshold,
  describeKeywordImpressions,
  exactImpressions,
  formatKeywordImpressions,
  groupThousands,
  isBelowThreshold,
  parseInsightsValue,
} from '../keywords';
import type { KeywordImpressionRow } from '../types';

const row = (
  keyword: string,
  impressions: KeywordImpressionRow['impressions'],
): KeywordImpressionRow => ({ keyword, monthStart: '2020-01-01', impressions });

describe('formatKeywordImpressions', () => {
  it('renders an exact reading with thousands separators', () => {
    expect(formatKeywordImpressions({ kind: 'exact', value: 1240 })).toBe('1,240');
    expect(formatKeywordImpressions({ kind: 'exact', value: 318 })).toBe('318');
    expect(formatKeywordImpressions({ kind: 'exact', value: 1234567 })).toBe('1,234,567');
  });

  it('renders a bounded reading as "<15" and never as the bare number', () => {
    const formatted = formatKeywordImpressions({ kind: 'below_threshold', threshold: 15 });
    expect(formatted).toBe('<15');
    expect(formatted).not.toBe('15');
    expect(formatted).not.toBe('0');
  });

  it('renders a measured zero as 0, because that is a real answer', () => {
    expect(formatKeywordImpressions({ kind: 'exact', value: 0 })).toBe('0');
  });

  it('never renders a bounded reading as a plain integer string', () => {
    for (const threshold of [1, 5, 15, 100, 1000]) {
      const formatted = formatKeywordImpressions({ kind: 'below_threshold', threshold });
      expect(formatted.startsWith('<')).toBe(true);
      expect(Number.isNaN(Number(formatted))).toBe(true);
    }
  });
});

describe('describeKeywordImpressions', () => {
  it('explains that a bound is not a count', () => {
    expect(describeKeywordImpressions({ kind: 'below_threshold', threshold: 15 })).toBe(
      'Fewer than 15 people — Google does not report exact counts this low',
    );
  });

  it('says nothing about bounds for an exact reading', () => {
    expect(describeKeywordImpressions({ kind: 'exact', value: 2 })).toBe('2 people searched this term');
    expect(describeKeywordImpressions({ kind: 'exact', value: 1 })).toBe('1 person searched this term');
  });
});

describe('groupThousands', () => {
  it.each([
    [0, '0'],
    [7, '7'],
    [999, '999'],
    [1000, '1,000'],
    [1240, '1,240'],
    [999999, '999,999'],
    [1000000, '1,000,000'],
  ])('formats %s as %s', (input, expected) => {
    expect(groupThousands(input)).toBe(expected);
  });
});

describe('constructors', () => {
  it('accepts a measured zero as exact', () => {
    expect(exactImpressions(0)).toEqual({ kind: 'exact', value: 0 });
  });

  it('rejects a negative or fractional exact value rather than rounding it', () => {
    expect(exactImpressions(-1)).toBeNull();
    expect(exactImpressions(1.5)).toBeNull();
    expect(exactImpressions(Number.NaN)).toBeNull();
  });

  it('rejects a threshold below 1, because "below 0" is not a statement', () => {
    expect(belowThresholdImpressions(0)).toBeNull();
    expect(belowThresholdImpressions(-3)).toBeNull();
    expect(belowThresholdImpressions(15)).toEqual({ kind: 'below_threshold', threshold: 15 });
  });
});

describe('parseInsightsValue', () => {
  it('reads an exact value from the int64-as-string wire form', () => {
    expect(parseInsightsValue({ value: '1240' })).toEqual({ kind: 'exact', value: 1240 });
  });

  it('reads a threshold as a bound, not as a value', () => {
    expect(parseInsightsValue({ threshold: '15' })).toEqual({
      kind: 'below_threshold',
      threshold: 15,
    });
  });

  it('preserves a measured zero', () => {
    expect(parseInsightsValue({ value: '0' })).toEqual({ kind: 'exact', value: 0 });
  });

  it('returns null rather than zero when there is nothing to read', () => {
    expect(parseInsightsValue({})).toBeNull();
    expect(parseInsightsValue(null)).toBeNull();
    expect(parseInsightsValue(undefined)).toBeNull();
    expect(parseInsightsValue({ value: '' })).toBeNull();
    expect(parseInsightsValue({ value: 'nine' })).toBeNull();
  });

  it('refuses to guess when both members are present', () => {
    expect(parseInsightsValue({ value: '10', threshold: '15' })).toBeNull();
  });
});

describe('ordering and counting', () => {
  it('sorts exact readings above bounded ones', () => {
    const rows = [
      row('c', { kind: 'below_threshold', threshold: 15 }),
      row('a', { kind: 'exact', value: 5 }),
      row('b', { kind: 'exact', value: 900 }),
    ];
    expect([...rows].sort(compareKeywordRows).map((entry) => entry.keyword)).toEqual(['b', 'a', 'c']);
  });

  it('counts bounded rows without summing them into a total', () => {
    const rows = [
      row('a', { kind: 'exact', value: 5 }),
      row('b', { kind: 'below_threshold', threshold: 15 }),
      row('c', { kind: 'below_threshold', threshold: 5 }),
    ];
    expect(countBelowThreshold(rows)).toBe(2);
  });

  it('identifies a bound', () => {
    expect(isBelowThreshold({ kind: 'below_threshold', threshold: 15 })).toBe(true);
    expect(isBelowThreshold({ kind: 'exact', value: 0 })).toBe(false);
  });
});
