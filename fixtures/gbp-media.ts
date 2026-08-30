/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA. Google Business Profile media.
 *
 * Read fixtures/README.md before using anything here.
 *
 * Google provides no sandbox for the Business Profile APIs and recommends
 * mocked responses instead, so these are the test path Google itself names.
 * Everything is invented, every visible string carries `[FIXTURE]`, and access
 * is gated by `isFixtureModeEnabled()` — which needs `__DEV__` AND
 * `EXPO_PUBLIC_ENABLE_FIXTURES=1`, so a release build cannot reach it.
 *
 * WHAT IS DELIBERATELY MODELLED
 * -----------------------------
 * 1. A library with GAPS. Two of the five coverage buckets are empty, because a
 *    coverage gap is the only photo finding that is actually observable and the
 *    screen has to be reviewable showing one.
 * 2. A photo Google returned with NO createTime. Its age is unknown and must
 *    render "Date not reported" — never "Today".
 * 3. A MEASURED ZERO library: Google answered, and the answer was zero photos.
 *    That is a different fixture from "not connected", and the screen must look
 *    different in each.
 * 4. Upload candidates that pass, that fail on the 250px short edge, that fail
 *    on the 10KB minimum, and one whose dimensions the picker did not report —
 *    which is `cannot_check`, not `ok`.
 *
 * WHAT IS DELIBERATELY ABSENT
 * ---------------------------
 * Any view count, impression count or "performance" number for a photo. Google
 * removed all of them on 2023-02-20. There is no field to put one in, so there
 * is no fixture that could accidentally teach the UI to render one.
 */

import type {
  GbpMediaItem,
  MediaCandidate,
  ScheduledMediaItem,
  // Type-only import of the pure model module: erased at compile time, so no
  // React component is pulled into a fixture file.
} from '@/features/gbp/components/media/model';
import { isFixtureModeEnabled } from '@/lib/env';
import { ready, unavailable, type DataState } from '@/lib/state/DataState';

/** Fixed timestamp so snapshots are stable and nothing looks "live". */
export const FIXTURE_MEDIA_TIMESTAMP = '2020-01-01T00:00:00.000Z';

/**
 * The fixture's own clock.
 *
 * Relative ages are rendered against this, not against the real device clock,
 * so "3 days ago" stays "3 days ago" in every screenshot and every test run.
 * It is part of the fixture and it sits under the fixture banner with the rest
 * of it.
 */
export const FIXTURE_MEDIA_NOW = '2020-01-08T00:00:00.000Z';

/* -------------------------------------------------------------------------- */
/* A library with real gaps                                                   */
/* -------------------------------------------------------------------------- */

export const fixtureMediaItems: GbpMediaItem[] = [
  {
    id: 'fixture-media-0001',
    format: 'PHOTO',
    category: 'EXTERIOR',
    createTime: '2020-01-05T00:00:00.000Z',
    description: '[FIXTURE] Shopfront from the road',
    publishedByShoogle: true,
  },
  {
    id: 'fixture-media-0002',
    format: 'PHOTO',
    category: 'INTERIOR',
    createTime: '2020-01-01T00:00:00.000Z',
    description: '[FIXTURE] Chairs and mirrors',
    publishedByShoogle: false,
  },
  {
    id: 'fixture-media-0003',
    format: 'VIDEO',
    category: 'AT_WORK',
    createTime: '2019-12-11T00:00:00.000Z',
    description: '[FIXTURE] Short clip of a haircut',
    publishedByShoogle: false,
  },
  {
    /**
     * Google returned this one with no `createTime`. Its age is UNKNOWN and the
     * tile must say so — the whole reason this fixture exists.
     */
    id: 'fixture-media-0004',
    format: 'PHOTO',
    category: 'INTERIOR',
    createTime: null,
    description: '[FIXTURE] Photo Google returned without a date',
    publishedByShoogle: false,
  },
];

/**
 * One scheduled item, so the vertical timeline is reviewable.
 *
 * It is Shoogle's own intention and nothing more: Google's media API has no
 * scheduling, so this has not been accepted by anyone and the timeline badges
 * it "Not sent yet".
 */
export const fixtureScheduledMedia: ScheduledMediaItem[] = [
  {
    id: 'fixture-scheduled-0001',
    scheduledFor: '2020-01-11T04:30:00.000Z',
    category: 'PRODUCT',
    caption: '[FIXTURE] Weekend offer board',
  },
];

/* -------------------------------------------------------------------------- */
/* Upload candidates — one per validation outcome                             */
/* -------------------------------------------------------------------------- */

export const fixtureMediaCandidates: MediaCandidate[] = [
  {
    id: 'fixture-candidate-ok',
    fileName: '[FIXTURE] shopfront.jpg',
    format: 'PHOTO',
    category: 'EXTERIOR',
    widthPx: 1600,
    heightPx: 1200,
    byteSize: 480_000,
  },
  {
    /** 180px short edge — under Google's documented 250px minimum. */
    id: 'fixture-candidate-small-edge',
    fileName: '[FIXTURE] tiny-thumbnail.jpg',
    format: 'PHOTO',
    category: 'EXTERIOR',
    widthPx: 320,
    heightPx: 180,
    byteSize: 64_000,
  },
  {
    /** 4KB — under Google's documented 10KB minimum. */
    id: 'fixture-candidate-small-file',
    fileName: '[FIXTURE] over-compressed.jpg',
    format: 'PHOTO',
    category: 'INTERIOR',
    widthPx: 1024,
    heightPx: 768,
    byteSize: 4_096,
  },
  {
    /**
     * The picker reported no dimensions. This is `cannot_check` — NOT `ok`.
     * A file we could not measure has not passed the 250px rule, and saying it
     * did would be the same lie as rendering an unknown as zero.
     */
    id: 'fixture-candidate-unmeasured',
    fileName: '[FIXTURE] no-metadata.jpg',
    format: 'PHOTO',
    category: 'INTERIOR',
    widthPx: null,
    heightPx: null,
    byteSize: 220_000,
  },
];

/* -------------------------------------------------------------------------- */
/* Gated access                                                               */
/* -------------------------------------------------------------------------- */

export interface GbpMediaFixtures {
  /** A library with gaps and one undated item. */
  items: GbpMediaItem[];
  /**
   * A MEASURED ZERO: Google answered and listed nothing. Kept separate from
   * `items` so a screen can render both and prove they look different.
   */
  emptyItems: GbpMediaItem[];
  scheduled: ScheduledMediaItem[];
  candidates: MediaCandidate[];
  /** When the fixture library was "observed". */
  fetchedAt: string;
  /** The fixture's clock, for relative ages. */
  now: string;
}

/**
 * The ONLY sanctioned way to read the media fixtures.
 *
 * Returns null unless `isFixtureModeEnabled()`, so the honest "we have not seen
 * your photos" path is always exercised too.
 */
export function getGbpMediaFixtures(): GbpMediaFixtures | null {
  if (!isFixtureModeEnabled()) return null;
  return {
    items: fixtureMediaItems,
    emptyItems: [],
    scheduled: fixtureScheduledMedia,
    candidates: fixtureMediaCandidates,
    fetchedAt: FIXTURE_MEDIA_TIMESTAMP,
    now: FIXTURE_MEDIA_NOW,
  };
}

/**
 * Wrap a media fixture in a `DataState` carrying `isFixture: true`.
 *
 * With fixture mode off this returns `not_connected` rather than the fixture —
 * the same state the real adapter reports today, and the state the Photos
 * screen is designed around.
 */
export function gbpMediaFixtureState<T>(value: T): DataState<T> {
  if (!isFixtureModeEnabled()) {
    return unavailable(
      'not_connected',
      'No Google Business Profile is connected, so Shoogle has not seen your photos.',
    );
  }
  return ready(value, FIXTURE_MEDIA_TIMESTAMP, true);
}
