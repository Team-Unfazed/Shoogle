/**
 * The Home hook. Owner: Aryan.
 *
 * The only stateful thing in this feature. It picks the sources and memoises
 * the aggregation; every decision about what those sources MEAN lives in
 * `./aggregate` and `./suggestions`, which are pure and tested without a
 * renderer.
 *
 * ## Why this takes a flag instead of reading the session
 *
 * Preview mode belongs to `features/auth`, and reaching into another
 * engineer's folder to read it would couple this feature to theirs for one
 * boolean. The screen already knows whether it is in preview, so it passes it
 * down. That keeps the boundary rule intact and makes the hook trivial to test.
 *
 * ## What this does NOT do yet
 *
 * There is no fetching here, because there is nothing to fetch: no feature has
 * registered a summary and no provider is implemented. `disconnectedSources()`
 * reports that truthfully rather than spinning forever or showing zeroes. When
 * Social, SEO and Website export their summaries, they get subscribed to here
 * and the rest of the file is unchanged — that is the point of the seam.
 */

import { useMemo } from 'react';

import { isFixtureModeEnabled } from '@/lib/env';
import { aggregateHome, disconnectedSources } from './aggregate';
import { fixtureHomeSources } from './fixtureSources';
import type { HomeSources, HomeViewModel } from './types';

export interface UseHomeOptions {
  /**
   * True in the dev-preview build, where the shell renders the designed screens
   * without a session. Fixture data is permitted then, and is always banner-ed.
   */
  isPreview?: boolean;
}

/**
 * Choose the sources for this build.
 *
 * Fixtures are reachable only in a development build with
 * `EXPO_PUBLIC_ENABLE_FIXTURES=1`, or in dev preview. In every other build this
 * returns the honest not-connected sources, so a release APK physically cannot
 * render the demo business.
 */
export function useHomeSources({ isPreview = false }: UseHomeOptions = {}): HomeSources {
  return useMemo(
    () => (isFixtureModeEnabled() || isPreview ? fixtureHomeSources() : disconnectedSources()),
    [isPreview],
  );
}

/** The Home view model. The screen renders this and decides nothing itself. */
export function useHome(options: UseHomeOptions = {}): HomeViewModel {
  const sources = useHomeSources(options);
  return useMemo(() => aggregateHome(sources), [sources]);
}
