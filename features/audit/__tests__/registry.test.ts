/**
 * The registry has to be internally consistent before any score it produces can
 * mean anything. These assertions are cheap and catch the whole class of bug
 * where a check is added, mis-weighted, and silently shifts every score.
 */

import { AREA_WEIGHT, isFixableByShoogle, type AuditArea, type FixCapability } from '../types';
import { ALL_CHECKS, GATE_CHECK_ID, validateRegistry } from '../checks/registry';

/** Only ever reached if a lookup by id fails, which is itself an assertion above. */
const EMPTY_CAPABILITY: FixCapability = {
  apiSupportsWrite: false,
  providerMethod: null,
  matrixNote: 'google-business-profile.md: missing check',
};

describe('check registry', () => {
  it('is internally consistent', () => {
    expect(validateRegistry()).toEqual([]);
  });

  it('is 34 checks: 1 unscored gate plus 33 scored, matching the methodology', () => {
    expect(ALL_CHECKS).toHaveLength(34);
    expect(ALL_CHECKS.filter((c) => c.scored)).toHaveLength(33);
    const gate = ALL_CHECKS.filter((c) => !c.scored);
    expect(gate).toHaveLength(1);
    expect(gate[0]?.id).toBe(GATE_CHECK_ID);
  });

  it('weights sum to 100 overall and to the declared weight in every area', () => {
    expect(ALL_CHECKS.reduce((s, c) => s + c.weight, 0)).toBe(100);
    for (const area of Object.keys(AREA_WEIGHT) as AuditArea[]) {
      const sum = ALL_CHECKS.filter((c) => c.area === area).reduce((s, c) => s + c.weight, 0);
      expect({ area, sum }).toEqual({ area, sum: AREA_WEIGHT[area] });
    }
  });

  it('gives every check a falsifiability statement and a leading indicator', () => {
    for (const check of ALL_CHECKS) {
      expect(check.failureCheck.length).toBeGreaterThan(20);
      expect(check.leadingIndicator.length).toBeGreaterThan(5);
    }
  });

  describe('fixableByShoogle is gated on the capability matrix', () => {
    /**
     * The only write methods `GoogleBusinessProfileProvider` declares today.
     * If this list changes, it changes in lib/providers/contracts.ts first —
     * that is Sunny's file and a PR, not an edit from here.
     */
    const DECLARED_PROVIDER_METHODS = ['replyToReview', 'createLocalPost', 'updateBusinessHours'];

    it('never marks a check fixable without BOTH an API write and a provider method', () => {
      for (const check of ALL_CHECKS) {
        const fixable = isFixableByShoogle(check.capability);
        if (fixable) {
          expect(check.capability.apiSupportsWrite).toBe(true);
          expect(check.capability.providerMethod).not.toBeNull();
        }
        if (!check.capability.apiSupportsWrite) {
          expect(fixable).toBe(false);
          // A check with no API write must not claim a provider method either.
          expect(check.capability.providerMethod).toBeNull();
        }
      }
    });

    it('only names provider methods that actually exist on the contract', () => {
      for (const check of ALL_CHECKS) {
        if (check.capability.providerMethod !== null) {
          expect(DECLARED_PROVIDER_METHODS).toContain(check.capability.providerMethod);
        }
      }
    });

    it('cites the capability matrix for every claim it makes', () => {
      for (const check of ALL_CHECKS) {
        expect(check.capability.matrixNote).toContain('google-business-profile.md');
      }
    });

    it('is currently true only for the hours and review-reply checks', () => {
      // Everything else degrades to a guided fix until Sunny adds the methods.
      // If this list grows without a contract change, something is lying.
      const fixable = ALL_CHECKS.filter((c) => isFixableByShoogle(c.capability)).map((c) => c.id);
      expect(fixable.sort()).toEqual(['D1', 'D2', 'F3', 'F4']);
    });

    it('does not claim a one-tap fix for the Google post checks', () => {
      // G1/G2 used to name `createLocalPost`, which made them fixableByShoogle
      // and put a one-tap affordance on a composer this feature does not own:
      // `google_business` is a SocialPublisher target and no handoff into it
      // has been agreed. The API write existing is not the same fact as Shoogle
      // having somewhere to perform it from.
      for (const id of ['G1', 'G2'] as const) {
        const check = ALL_CHECKS.find((c) => c.id === id);
        expect(check).toBeDefined();
        expect(check?.capability.apiSupportsWrite).toBe(true);
        expect(check?.capability.providerMethod).toBeNull();
        expect(isFixableByShoogle(check?.capability ?? EMPTY_CAPABILITY)).toBe(false);
        expect(check?.capability.matrixNote).toContain('SocialPublisher');
      }
    });
  });
});
