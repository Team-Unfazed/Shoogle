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
import * as keywordsModule from '../keywords';
import * as seoBarrel from '../index';
import type { KeywordImpressions as CanonicalKeywordImpressions } from '../keywords';
import type { KeywordImpressionRow, KeywordImpressions } from '../types';

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

/**
 * REGRESSION: three same-named `formatKeywordImpressions` functions once lived
 * in three barrels a single screen imports together — here, in
 * `features/gbp/types.ts` and in `features/audit/types.ts` — over unions whose
 * exact member was spelled differently (`value` vs `uniqueUsers`) and which
 * rendered differently (`1240` vs `1,240`). Whichever one a file happened to
 * name won, so the same reading could print two ways on one page.
 *
 * `features/seo/keywords.ts` is the owner. These tests pin the single
 * definition and the single rendering that everything else must import.
 */
describe('one canonical definition of keyword impressions', () => {
  it('is the same function object however it is imported', () => {
    expect(seoBarrel.formatKeywordImpressions).toBe(keywordsModule.formatKeywordImpressions);
    expect(seoBarrel.describeKeywordImpressions).toBe(keywordsModule.describeKeywordImpressions);
    expect(seoBarrel.exactImpressions).toBe(keywordsModule.exactImpressions);
    expect(seoBarrel.belowThresholdImpressions).toBe(keywordsModule.belowThresholdImpressions);
    expect(seoBarrel.parseInsightsValue).toBe(keywordsModule.parseInsightsValue);
  });

  it('resolves to the same TYPE from `../keywords` and from `../types`', () => {
    // A divergence between the two import paths is a compile error, not a
    // runtime one: the assignment below stops type-checking the moment the
    // re-export in `../types` stops pointing at the declaration in
    // `../keywords`.
    const canonical: CanonicalKeywordImpressions = { kind: 'exact', value: 3 };
    const viaTypesBarrel: KeywordImpressions = canonical;
    expect(formatKeywordImpressions(viaTypesBarrel)).toBe('3');
  });

  it('spells the exact member `value`, and only `value`', () => {
    const exact = exactImpressions(240);
    expect(exact).toEqual({ kind: 'exact', value: 240 });
    expect(Object.keys(exact ?? {}).sort()).toEqual(['kind', 'value']);
    expect(Object.prototype.hasOwnProperty.call(exact ?? {}, 'uniqueUsers')).toBe(false);
  });

  it('renders with thousands grouping, unlike the ad-hoc copies it replaces', () => {
    // The copies did `String(uniqueUsers)` and `` `<${threshold}` ``, so they
    // produced '1240' and '<1500'. Grouping is the canonical rendering.
    expect(formatKeywordImpressions({ kind: 'exact', value: 1240 })).toBe('1,240');
    expect(formatKeywordImpressions({ kind: 'exact', value: 1240 })).not.toBe('1240');
    expect(formatKeywordImpressions({ kind: 'below_threshold', threshold: 1500 })).toBe('<1,500');
    expect(formatKeywordImpressions({ kind: 'below_threshold', threshold: 1500 })).not.toBe('<1500');
  });

  it('exports the caption helper alongside the formatter, so no caller writes its own', () => {
    expect(typeof seoBarrel.describeKeywordImpressions).toBe('function');
    expect(typeof seoBarrel.isBelowThreshold).toBe('function');
    expect(typeof seoBarrel.groupThousands).toBe('function');
    expect(typeof seoBarrel.compareKeywordRows).toBe('function');
    expect(typeof seoBarrel.countBelowThreshold).toBe('function');
  });
});
