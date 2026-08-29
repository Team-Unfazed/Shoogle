/**
 * DEVELOPMENT FIXTURES - NOT CUSTOMER DATA.
 *
 * Read fixtures/README.md before using anything here.
 *
 * Everything in this file is invented. Names carry a visible [FIXTURE] prefix
 * so that if one ever reaches a screen by mistake it is immediately obvious in
 * a screenshot, a bug report or a demo - rather than looking like a real
 * business's numbers.
 *
 * Access is gated: `getFixtures()` returns null unless fixture mode is on, so
 * a release build physically cannot render any of it.
 */

import { isFixtureModeEnabled } from '@/lib/env';
import { ready, unavailable, type DataState } from '@/lib/state/DataState';
import type { Business, Post, SuggestedAction } from '@/types/domain';

/** Fixed timestamp so snapshots are stable and nothing looks "live". */
const FIXTURE_TIMESTAMP = '2020-01-01T00:00:00.000Z';

export const fixtureBusiness: Business = {
  id: 'fixture-business-0001',
  name: '[FIXTURE] Example Salon',
  category: 'salon',
  locality: '[FIXTURE] Example Locality',
  timezone: 'Asia/Kolkata',
};

export const fixturePosts: Post[] = [
  {
    id: 'fixture-post-0001',
    status: 'scheduled',
    body: '[FIXTURE] Example scheduled caption. This text is not from a real business.',
    scheduledFor: FIXTURE_TIMESTAMP,
    targets: [{ provider: 'instagram', status: 'scheduled', url: null }],
    isFixture: true,
  },
  {
    id: 'fixture-post-0002',
    status: 'draft',
    body: '[FIXTURE] Example draft caption.',
    scheduledFor: null,
    targets: [],
    isFixture: true,
  },
  {
    id: 'fixture-post-0003',
    status: 'failed',
    body: '[FIXTURE] Example post that failed to publish.',
    scheduledFor: FIXTURE_TIMESTAMP,
    targets: [{ provider: 'facebook', status: 'failed', url: null }],
    isFixture: true,
  },
];

export const fixtureSuggestions: SuggestedAction[] = [
  {
    id: 'fixture-suggestion-0001',
    title: '[FIXTURE] Example suggested action',
    rationale: 'Placeholder rationale used to lay out the suggestion card.',
    accent: 'blue',
    href: '/(tabs)',
  },
];

export interface Fixtures {
  business: Business;
  posts: Post[];
  suggestions: SuggestedAction[];
}

/**
 * The ONLY sanctioned way to read fixtures.
 *
 * Returns null unless `isFixtureModeEnabled()` - which requires a development
 * build AND `EXPO_PUBLIC_ENABLE_FIXTURES=1`. Callers must handle null, which
 * means the honest "nothing here" path is always exercised too.
 */
export function getFixtures(): Fixtures | null {
  if (!isFixtureModeEnabled()) return null;
  return {
    business: fixtureBusiness,
    posts: fixturePosts,
    suggestions: fixtureSuggestions,
  };
}

/**
 * Wraps a fixture in a `DataState` with `isFixture: true` set, so the flag
 * travels with the value. When fixture mode is off it returns
 * `unavailable('no_data_yet')` rather than the fixture - the same state a real
 * provider would report before any data exists.
 */
export function fixtureState<T>(value: T): DataState<T> {
  if (!isFixtureModeEnabled()) {
    return unavailable('no_data_yet', 'There is nothing to show yet.');
  }
  return ready(value, FIXTURE_TIMESTAMP, true);
}
