import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { addDays, daysBetween, isParsableDate, MS_PER_DAY } from '@/features/audit/dates';
import { formatTimeOfDay } from '@/features/gbp/components/profile/hoursModel';

/**
 * REGRESSION GUARDS for two bugs adversarial review found.
 *
 * 1. `daysBetween` and `addDays` each existed in several copies with DIFFERENT
 *    behaviour on bad input — NaN, null, throw, and "return the input
 *    unchanged". The last is the worst: a caller gets a plausible-looking date
 *    that is simply wrong.
 *
 * 2. `formatTimeOfDay` rejected hour 24, which `google.type.TimeOfDay`
 *    explicitly permits for closing times. A business open until midnight had
 *    its hours silently dropped.
 */

describe('one implementation of each date helper', () => {
  const FEATURES = join(process.cwd(), 'features');

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full);
    }
    return out;
  }

  const files = walk(FEATURES).filter((f) => !/__tests__/.test(f));

  it.each([['daysBetween'], ['addDays']])(
    '%s is declared exactly once, in features/audit/dates.ts',
    (name) => {
      const declaring = files.filter((f) =>
        new RegExp(`export function ${name}\\b`).test(readFileSync(f, 'utf8')),
      );
      expect(declaring.map((d) => d.replace(/\\/g, '/'))).toHaveLength(1);
      expect(declaring[0]?.replace(/\\/g, '/')).toMatch(/features\/audit\/dates\.ts$/);
    },
  );

  it('the scan is not vacuous', () => {
    expect(files.length).toBeGreaterThan(20);
  });
});

describe('daysBetween', () => {
  it('counts whole days forward and backward', () => {
    expect(daysBetween('2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z')).toBe(7);
    expect(daysBetween('2026-01-08T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(-7);
    expect(daysBetween('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(0);
  });

  /**
   * The reason this returns null rather than NaN: `NaN >= 7` is false, so an
   * unreadable timestamp behaved exactly like a fresh one and slipped past the
   * audit's staleness checks. Null cannot be silently compared.
   */
  it.each([['not a date'], [''], ['2026-13-45']])('returns null for %j, never NaN', (bad) => {
    const result = daysBetween(bad, '2026-01-01T00:00:00Z');
    expect(result).toBeNull();
    expect(Number.isNaN(result as unknown as number)).toBe(false);
  });

  it('a null result cannot be mistaken for "recent" by a comparison', () => {
    const age = daysBetween('garbage', '2026-01-01T00:00:00Z');
    // This is the trap the old code fell into: null coerces to 0.
    expect((age as unknown as number) <= 7).toBe(true);
    // ...which is why every call site must check for null explicitly first.
    expect(age).toBeNull();
  });

  it('MS_PER_DAY is a day', () => {
    expect(MS_PER_DAY).toBe(24 * 60 * 60 * 1000);
  });
});

describe('addDays', () => {
  it('moves a plain date forward and backward in UTC', () => {
    expect(addDays('2026-01-01', 7)).toBe('2026-01-08');
    expect(addDays('2026-01-08', -7)).toBe('2026-01-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('accepts a full timestamp and returns a plain date', () => {
    expect(addDays('2026-01-01T18:30:00Z', 1)).toBe('2026-01-02');
  });

  /** The old copies returned the INPUT here, which reads as a real answer. */
  it.each([['not a date'], [''], ['2026-99-99']])('returns null for %j, not the input', (bad) => {
    const result = addDays(bad, 1);
    expect(result).toBeNull();
    expect(result).not.toBe(bad);
  });

  it('rejects a non-integer day count rather than producing a fractional date', () => {
    expect(addDays('2026-01-01', 1.5)).toBeNull();
    expect(addDays('2026-01-01', Number.NaN)).toBeNull();
  });

  it('isParsableDate agrees with the others', () => {
    expect(isParsableDate('2026-01-01')).toBe(true);
    expect(isParsableDate('nonsense')).toBe(false);
  });
});

describe('formatTimeOfDay accepts hour 24, which Google uses for closing time', () => {
  /**
   * google.type.TimeOfDay: hours are 0-23, "An API may choose to allow the
   * value '24:00:00' for scenarios like business closing time." Rejecting it
   * dropped every business that closes at midnight — extremely common for an
   * Indian restaurant or salon — and made the audit's hours check fire against
   * a profile that was actually fine.
   */
  it('renders 24:00 as midnight rather than discarding the period', () => {
    expect(formatTimeOfDay({ hours: 24, minutes: 0 })).toBe('midnight');
  });

  it('does not render it as 12:00 am, which reads as the start of a day', () => {
    // "9:00 am - 12:00 am" would look like a fifteen-hour typo.
    expect(formatTimeOfDay({ hours: 24, minutes: 0 })).not.toBe('12:00 am');
  });

  it('still rejects 24 with minutes, which is not a real time', () => {
    expect(formatTimeOfDay({ hours: 24, minutes: 30 })).toBeNull();
  });

  it('still rejects genuinely out-of-range hours', () => {
    expect(formatTimeOfDay({ hours: 25, minutes: 0 })).toBeNull();
    expect(formatTimeOfDay({ hours: -1, minutes: 0 })).toBeNull();
  });

  it('an omitted field is still genuine midnight at the start of the day', () => {
    // proto3 omits zero values, so absent hours means 00:00, not "missing".
    expect(formatTimeOfDay({})).toBe('12:00 am');
  });

  it('renders ordinary times unchanged', () => {
    expect(formatTimeOfDay({ hours: 9, minutes: 0 })).toBe('9:00 am');
    expect(formatTimeOfDay({ hours: 20, minutes: 30 })).toBe('8:30 pm');
    expect(formatTimeOfDay({ hours: 12, minutes: 0 })).toBe('12:00 pm');
  });

  it('an absent time object is unknown, not midnight', () => {
    expect(formatTimeOfDay(undefined)).toBeNull();
  });
});
