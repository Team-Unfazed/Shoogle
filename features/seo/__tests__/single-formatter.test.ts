import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { formatKeywordImpressions } from '@/features/seo';
import { formatKeywordImpressions as fromGbp } from '@/features/gbp';
import { formatKeywordImpressions as fromAudit } from '@/features/audit';

/**
 * REGRESSION GUARD — three copies of this shipped, and the adversarial review
 * had to find them.
 *
 * `features/seo`, `features/gbp` and `features/audit` each declared their own
 * `KeywordImpressions` union and their own `formatKeywordImpressions`. The
 * unions used different field names (`value` vs `uniqueUsers`) and the
 * formatters rendered differently: seo grouped thousands, the other two did
 * not. So the same 1240 impressions displayed as "1,240" on one screen and
 * "1240" on another, purely by which module a screen imported from.
 *
 * `features/seo/keywords.ts` is the single owner. The other two re-export it.
 * These tests fail if anyone declares a second one.
 */

const FEATURES_DIR = join(process.cwd(), 'features');

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') walkTs(full, out);
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

describe('formatKeywordImpressions has exactly one implementation', () => {
  const files = walkTs(FEATURES_DIR);

  it('is declared in exactly one file, and that file is features/seo/keywords.ts', () => {
    const declaring = files
      // Test files are excluded because this one necessarily contains the
      // pattern it searches for.
      .filter((f) => !/__tests__/.test(f))
      .filter((f) => /export function formatKeywordImpressions/.test(readFileSync(f, 'utf8')));

    expect(declaring.map((d) => d.replace(/\\/g, '/'))).toHaveLength(1);
    expect(declaring[0]?.replace(/\\/g, '/')).toMatch(/features\/seo\/keywords\.ts$/);
  });

  it('the scan is not vacuous — it does find the one real declaration', () => {
    // Guards against the filter above quietly excluding everything.
    const all = files.filter((f) =>
      /export function formatKeywordImpressions/.test(readFileSync(f, 'utf8')),
    );
    expect(all.length).toBeGreaterThan(0);
  });

  it('is not re-implemented under a different name anywhere in features/', () => {
    // A copy usually reappears as a near-identical helper rather than the same
    // name, so look for the shape it always has: a `<${...}` threshold render.
    const suspects = files.filter((f) => {
      if (/features[\\/]seo[\\/]keywords\.ts$/.test(f)) return false;
      if (/__tests__/.test(f)) return false;
      const src = readFileSync(f, 'utf8');
      return /`<\$\{[^}]*threshold/.test(src);
    });

    expect(suspects.map((s) => s.replace(/\\/g, '/'))).toEqual([]);
  });
});

describe('every module renders impressions identically', () => {
  // The actual bug: same input, three different outputs.
  it.each([
    [{ kind: 'exact', value: 1240 } as const, '1,240'],
    [{ kind: 'exact', value: 0 } as const, '0'],
    [{ kind: 'exact', value: 999 } as const, '999'],
    [{ kind: 'exact', value: 1000000 } as const, '1,000,000'],
    [{ kind: 'below_threshold', threshold: 15 } as const, '<15'],
    [{ kind: 'below_threshold', threshold: 1500 } as const, '<1,500'],
  ])('renders %j the same way from all three barrels', (input, expected) => {
    expect(formatKeywordImpressions(input)).toBe(expected);
    expect(fromGbp(input)).toBe(expected);
    expect(fromAudit(input)).toBe(expected);
  });

  it('exports the identical function object, not a lookalike', () => {
    expect(fromGbp).toBe(formatKeywordImpressions);
    expect(fromAudit).toBe(formatKeywordImpressions);
  });

  it('still never renders a threshold as a bare number', () => {
    // The whole reason this type exists: "<15" is a lower bound, not a count,
    // and 15 or 0 would both be fabrications.
    const rendered = formatKeywordImpressions({ kind: 'below_threshold', threshold: 15 });
    expect(rendered).not.toBe('15');
    expect(rendered).not.toBe('0');
    expect(rendered.startsWith('<')).toBe(true);
  });

  it('renders a measured zero as 0, which is a real answer', () => {
    // Distinct from below_threshold: Google told us the number, and it was zero.
    expect(formatKeywordImpressions({ kind: 'exact', value: 0 })).toBe('0');
  });
});
