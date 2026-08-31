/**
 * The check registry: 34 checks, 1 gate + 33 scored, across 9 areas.
 * docs/research/local-seo-methodology.md §2.
 *
 * Every check is a pure `(observations) => CheckOutcome`. Nothing in this
 * directory performs I/O, reads the clock, or imports React. That is what makes
 * the whole engine synchronously testable.
 */

import { AREA_WEIGHT, type AuditArea, type CheckDefinition, type CheckId } from '../types';

import { AREA_A_CHECKS } from './area-a-foundation';
import { AREA_B_CHECKS } from './area-b-nap';
import { AREA_C_CHECKS } from './area-c-categories';
import { AREA_D_CHECKS } from './area-d-hours';
import { AREA_E_CHECKS } from './area-e-media';
import { AREA_F_CHECKS } from './area-f-reviews';
import { AREA_G_CHECKS } from './area-g-posts';
import { AREA_H_CHECKS } from './area-h-description';
import { AREA_I_CHECKS } from './area-i-website';

export const ALL_CHECKS: readonly CheckDefinition[] = [
  ...AREA_A_CHECKS,
  ...AREA_B_CHECKS,
  ...AREA_C_CHECKS,
  ...AREA_D_CHECKS,
  ...AREA_E_CHECKS,
  ...AREA_F_CHECKS,
  ...AREA_G_CHECKS,
  ...AREA_H_CHECKS,
  ...AREA_I_CHECKS,
];

export const CHECKS_BY_ID: ReadonlyMap<CheckId, CheckDefinition> = new Map(
  ALL_CHECKS.map((c) => [c.id, c]),
);

/** The unscored gate. Kept as a named export so the gate logic cannot drift. */
export const GATE_CHECK_ID: CheckId = 'A1';

/**
 * Structural self-check on the registry, so a mis-weighted check is caught by a
 * test rather than by a wrong score in production. Returns the problems it
 * found; an empty array means the registry is internally consistent.
 */
export function validateRegistry(checks: readonly CheckDefinition[] = ALL_CHECKS): string[] {
  const problems: string[] = [];

  const seen = new Set<CheckId>();
  for (const c of checks) {
    if (seen.has(c.id)) problems.push(`Duplicate check id ${c.id}`);
    seen.add(c.id);
    if (c.scored && c.weight <= 0) problems.push(`${c.id} is scored but carries no weight`);
    if (!c.scored && c.weight !== 0) problems.push(`${c.id} is unscored but carries weight ${c.weight}`);
    if (c.needs.length === 0) problems.push(`${c.id} declares no observations, so it cannot be honest about coverage`);
    if (c.failureCheck.trim().length === 0) problems.push(`${c.id} has no falsifiability statement`);
  }

  const byArea = new Map<AuditArea, number>();
  for (const c of checks) {
    byArea.set(c.area, (byArea.get(c.area) ?? 0) + c.weight);
  }
  for (const [area, weight] of byArea) {
    const expected = AREA_WEIGHT[area];
    if (weight !== expected) {
      problems.push(`Area ${area} weights sum to ${weight}, but AREA_WEIGHT says ${expected}`);
    }
  }
  for (const area of Object.keys(AREA_WEIGHT) as AuditArea[]) {
    if (!byArea.has(area)) problems.push(`Area ${area} has no checks`);
  }

  const total = checks.reduce((sum, c) => sum + c.weight, 0);
  if (total !== 100) problems.push(`Check weights sum to ${total}, not 100`);

  return problems;
}
