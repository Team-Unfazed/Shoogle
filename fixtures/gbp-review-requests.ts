/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA. Review requests.
 *
 * Read fixtures/README.md before using anything here.
 *
 * Everything is invented and every identifier carries `FIXTURE`, so a stray
 * screenshot of this screen is unmistakably a development build. Access is
 * gated by `isFixtureModeEnabled()`, which requires `__DEV__` AND
 * `EXPO_PUBLIC_ENABLE_FIXTURES=1`, so a release build cannot reach it.
 *
 * WHAT IS DELIBERATELY MODELLED HERE
 * ----------------------------------
 * - A place id, because the review link is DERIVED from one and cannot be
 *   derived from anything else. The fixture place id is obviously fake, so the
 *   fixture review URL and the fixture QR are obviously fake too — a QR that
 *   scanned to a real business would be the worst possible fixture bug.
 * - A request log built RELATIVE to a supplied `now`, so the weekly counter has
 *   something to count. A fixed timestamp would always fall outside the current
 *   week and the card would show 0, which is the one number this screen must
 *   never show by accident.
 * - A review count with a Monday baseline, so the "+2 this week, not
 *   attributed" state can be seen. `totalAtWeekStart: null` is the other state
 *   and is reachable from the same builder.
 */

import type {
  ReviewCountChange,
  ReviewRequestEntry,
} from '@/features/gbp/components/getReviews';
import { isFixtureModeEnabled } from '@/lib/env';
import { ready, unavailable, type DataState } from '@/lib/state/DataState';

/** Fixed timestamp so `ready()` metadata is stable and nothing looks "live". */
const FIXTURE_TIMESTAMP = '2020-01-01T00:00:00.000Z';

/**
 * An invented place id.
 *
 * Real Google place ids start `ChIJ` and are opaque base64-ish strings. This one
 * says FIXTURE in the middle, so the URL it produces — and the QR built from
 * that URL — is visibly not a real business anywhere it appears.
 */
export const fixturePlaceId = 'ChIJ-FIXTURE-PLACE-ID-0001';

/** A pasted-link example, for exercising the owner-supplied path. */
export const fixturePastedReviewLink = 'https://g.page/r/FIXTURE-SHORT-LINK-0001/review';

/**
 * Three confirmed requests inside the current week, spaced across days.
 *
 * Built from `now` rather than pinned, because the whole point of the card is
 * "this week" and a pinned date would silently exercise the empty state.
 */
/**
 * Three requests, always inside the CURRENT week.
 *
 * This previously placed them at `now`, `now - 1 day` and `now - 2 days`. That
 * looks harmless and is not: `startOfWeek` is Monday-based, so from Monday
 * 00:00 until Wednesday the older two entries fall into the PREVIOUS week and
 * the screen's weekly count drops from 3 to 1. The test asserting "3" passed
 * six days out of seven and failed on the seventh — a flake that arrives
 * overnight, blames whoever committed last, and is hard to reproduce because it
 * fixes itself by Wednesday.
 *
 * Anchoring to the start of the week instead makes the fixture mean what it
 * says on every day it runs: three confirmed requests this week.
 */
export function buildFixtureRequestLog(now: Date): ReviewRequestEntry[] {
  const dayMs = 24 * 60 * 60 * 1000;

  // Local midnight on the Monday of this week, matching `startOfWeek`, which
  // is deliberately local — an owner in IST sending at 1am Monday means Monday.
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);

  const elapsed = now.getTime() - weekStart.getTime();
  // Spread across the part of the week that has actually happened, so no entry
  // is ever in the future and none escapes backwards past Monday.
  const step = Math.min(dayMs, Math.max(0, elapsed) / 3);
  const at = (stepsBack: number): string =>
    new Date(Math.max(weekStart.getTime(), now.getTime() - stepsBack * step)).toISOString();

  return [
    { id: 'fixture-request-0001', confirmedAt: at(0), channel: 'whatsapp' },
    { id: 'fixture-request-0002', confirmedAt: at(1), channel: 'whatsapp' },
    { id: 'fixture-request-0003', confirmedAt: at(2), channel: 'in_person' },
  ];
}

/**
 * A review count that moved by two this week.
 *
 * Two facts, deliberately separate from the three requests above: the fixture
 * exists to prove the screen does NOT join them.
 */
export const fixtureReviewCountChange: ReviewCountChange = {
  total: 34,
  totalAtWeekStart: 32,
  rating: 4.6,
};

/** The same profile before Shoogle had a Monday reading. Change is unknown, not 0. */
export const fixtureReviewCountNoBaseline: ReviewCountChange = {
  total: 34,
  totalAtWeekStart: null,
  rating: 4.6,
};

export interface ReviewRequestFixtures {
  placeId: string;
  pastedReviewLink: string;
  reviewCount: ReviewCountChange;
  reviewCountNoBaseline: ReviewCountChange;
  buildRequestLog: (now: Date) => ReviewRequestEntry[];
}

/**
 * The ONLY sanctioned way to read these fixtures.
 *
 * Returns null unless `isFixtureModeEnabled()`, so the honest "nothing here"
 * path is always exercised too.
 */
export function getReviewRequestFixtures(): ReviewRequestFixtures | null {
  if (!isFixtureModeEnabled()) return null;
  return {
    placeId: fixturePlaceId,
    pastedReviewLink: fixturePastedReviewLink,
    reviewCount: fixtureReviewCountChange,
    reviewCountNoBaseline: fixtureReviewCountNoBaseline,
    buildRequestLog: buildFixtureRequestLog,
  };
}

/**
 * Wrap a fixture in a `DataState` carrying `isFixture: true`, so the flag
 * travels with the value rather than depending on someone remembering.
 *
 * With fixture mode off this returns `not_connected` — the same state the real
 * adapter reports today, which is the point.
 */
export function reviewRequestFixtureState<T>(value: T): DataState<T> {
  if (!isFixtureModeEnabled()) {
    return unavailable(
      'not_connected',
      'No Google Business Profile is connected, so Shoogle cannot read your review count.',
    );
  }
  return ready(value, FIXTURE_TIMESTAMP, true);
}
