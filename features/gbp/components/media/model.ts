/**
 * Photos and videos — the vocabulary the Photos screen renders. Owner: Pranay.
 *
 * PURE. No React, no I/O, no clock: every function that needs "now" is handed
 * it. That is what makes the relative-age badges and the coverage observation
 * testable without freezing time.
 *
 * THE ONE THING THIS FILE EXISTS TO PROTECT
 * -----------------------------------------
 * Google DELETED photo performance from the API on 2023-02-20 —
 * `PHOTOS_VIEWS_MERCHANT`, `PHOTOS_VIEWS_CUSTOMERS`, `PHOTOS_COUNT_MERCHANT`,
 * `PHOTOS_COUNT_CUSTOMERS` and the whole `MediaInsights` object — with no
 * replacement (docs/research/google-business-profile.md §7c). `MediaItem.insights`
 * still exists on the v4 resource and is explicitly untrustworthy.
 *
 * So there is NO type in this file that can hold a view count, and no function
 * that can produce one. A screen that wants to talk about photo performance can
 * only reach `PHOTO_VIEWS_UNAVAILABLE`, which is an `UnavailableState`. You
 * cannot render a zero from this module because there is no number to render.
 *
 * What IS observable, and therefore what this file models:
 *   - which photos the owner has added, and their categories        (media.list)
 *   - when each was added, or that Google did not say                (createTime)
 *   - which media categories are empty                     (a coverage GAP, real)
 *   - whether a candidate file meets Google's documented minimums   (§8)
 */

import type { UnavailableState } from '@/lib/state/DataState';

import { removedCapabilityState } from '../../capabilities';

/* -------------------------------------------------------------------------- */
/* Categories — MediaItem.locationAssociation                                 */
/* -------------------------------------------------------------------------- */

/**
 * The thirteen `locationAssociation` category values Google documents
 * (research §8). This list is the picker; nothing else may be sent.
 */
export const MEDIA_CATEGORIES = [
  'COVER',
  'PROFILE',
  'LOGO',
  'EXTERIOR',
  'INTERIOR',
  'PRODUCT',
  'AT_WORK',
  'FOOD_AND_DRINK',
  'MENU',
  'COMMON_AREA',
  'ROOMS',
  'TEAMS',
  'ADDITIONAL',
] as const;

export type GbpMediaCategory = (typeof MEDIA_CATEGORIES)[number];

/** Owner-facing names. English UI, no Google jargon (product rule 12). */
export const MEDIA_CATEGORY_LABEL: Readonly<Record<GbpMediaCategory, string>> = Object.freeze({
  COVER: 'Cover photo',
  PROFILE: 'Profile picture',
  LOGO: 'Logo',
  EXTERIOR: 'Outside the shop',
  INTERIOR: 'Inside the shop',
  PRODUCT: 'Products',
  AT_WORK: 'At work',
  FOOD_AND_DRINK: 'Food and drink',
  MENU: 'Menu',
  COMMON_AREA: 'Common areas',
  ROOMS: 'Rooms',
  TEAMS: 'Your team',
  ADDITIONAL: 'Anything else',
});

/** One line of "when would I pick this?", shown under each picker option. */
export const MEDIA_CATEGORY_HINT: Readonly<Record<GbpMediaCategory, string>> = Object.freeze({
  COVER: 'The big picture at the top of your listing.',
  PROFILE: 'The small round picture next to your name.',
  LOGO: 'Your logo on a plain background.',
  EXTERIOR: 'The shopfront, so people recognise it from the street.',
  INTERIOR: 'What it looks like once someone walks in.',
  PRODUCT: 'What you sell, photographed clearly.',
  AT_WORK: 'You or your staff doing the work.',
  FOOD_AND_DRINK: 'Dishes and drinks you serve.',
  MENU: 'A readable photo of your menu or price list.',
  COMMON_AREA: 'Waiting area, reception, parking.',
  ROOMS: 'Rooms you rent or treat customers in.',
  TEAMS: 'Photos of the people who work here.',
  ADDITIONAL: 'Anything that does not fit the categories above.',
});

export type GbpMediaFormat = 'PHOTO' | 'VIDEO';

/* -------------------------------------------------------------------------- */
/* What Google will never tell us again                                       */
/* -------------------------------------------------------------------------- */

/** The date Google removed photo performance from the API. */
export const PHOTO_INSIGHTS_REMOVED_ON = '20 February 2023';

/** How many people saw a photo. Removed 2023, no replacement. Never a number. */
export const PHOTO_VIEWS_UNAVAILABLE: UnavailableState = removedCapabilityState('photo_views');

/** Merchant-vs-customer photo counts. Removed 2023, no replacement. */
export const PHOTO_COUNTS_UNAVAILABLE: UnavailableState = removedCapabilityState('photo_counts');

/** The whole `MediaInsights` object. Removed 2023; `MediaItem.insights` is untrustworthy. */
export const MEDIA_INSIGHTS_UNAVAILABLE: UnavailableState =
  removedCapabilityState('media_insights');

/* -------------------------------------------------------------------------- */
/* A photo we can actually see                                                */
/* -------------------------------------------------------------------------- */

/**
 * One item from `media.list`.
 *
 * `media.list` returns OWNER-uploaded media only. Customer photos are not in
 * it, which is why every string in this feature says "photos you have added"
 * and never "photos on your listing".
 *
 * There is deliberately no `views` field, and no `insights` field. See the
 * header.
 */
export interface GbpMediaItem {
  id: string;
  format: GbpMediaFormat;
  category: GbpMediaCategory;
  /**
   * RFC 3339 timestamp, or `null` when Google returned the item without one.
   * Never defaulted to "now" — an undated photo has an UNKNOWN age, which is a
   * different fact from a new photo.
   */
  createTime: string | null;
  /** The owner's own caption, settable only at creation. Null when absent. */
  description: string | null;
  /**
   * True only when Shoogle holds its own record of publishing this item.
   * Google does not say who uploaded what, so this is a claim about Shoogle's
   * records, never an inference from the API.
   */
  publishedByShoogle: boolean;
}

/* -------------------------------------------------------------------------- */
/* Relative age                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How old a photo is.
 *
 * `unknown` is a first-class member because Google can return a media item with
 * no `createTime`, and "we do not know when this was added" must not render the
 * same as "added today".
 */
export type MediaAge =
  | { kind: 'known'; days: number; label: string }
  | { kind: 'unknown'; label: string };

const MS_PER_DAY = 86_400_000;

/** Whole days between two RFC 3339 timestamps, or null if either is unparseable. */
export function daysBetween(fromIso: string, toIso: string): number | null {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.floor((to - from) / MS_PER_DAY);
}

/**
 * The badge that sits on a media tile, e.g. "3 days ago".
 *
 * A timestamp we cannot parse is UNKNOWN, not zero days old — a photo Google
 * dated badly must never be presented as fresh.
 */
export function describeMediaAge(createTime: string | null, nowIso: string): MediaAge {
  if (createTime === null) return { kind: 'unknown', label: 'Date not reported' };

  const days = daysBetween(createTime, nowIso);
  if (days === null) return { kind: 'unknown', label: 'Date not reported' };

  // A future timestamp is not something we can describe as an age. Say so.
  if (days < 0) return { kind: 'unknown', label: 'Date not reported' };

  if (days === 0) return { kind: 'known', days, label: 'Today' };
  if (days === 1) return { kind: 'known', days, label: 'Yesterday' };
  if (days < 7) return { kind: 'known', days, label: `${days} days ago` };

  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return { kind: 'known', days, label: weeks === 1 ? '1 week ago' : `${weeks} weeks ago` };
  }

  if (days < 365) {
    const months = Math.floor(days / 30);
    return { kind: 'known', days, label: months === 1 ? '1 month ago' : `${months} months ago` };
  }

  const years = Math.floor(days / 365);
  return { kind: 'known', days, label: years === 1 ? '1 year ago' : `${years} years ago` };
}

/* -------------------------------------------------------------------------- */
/* Coverage — the observation that replaces Grexa's promise                   */
/* -------------------------------------------------------------------------- */

/**
 * The five things a searcher looks for, and which Google categories satisfy
 * each. Buckets rather than raw categories, because "you have no INTERIOR
 * media item" is jargon and "there is nothing showing the inside" is a fact an
 * owner can act on this afternoon.
 *
 * This mirrors the audit's area E buckets on purpose — one definition of
 * "covered" across the audit report and this screen — with the branding bucket
 * added, since LOGO and PROFILE are pickable here.
 */
export interface MediaCoverageBucketDefinition {
  id: string;
  label: string;
  /** Why a searcher cares. Shown when the bucket is empty. */
  why: string;
  categories: readonly GbpMediaCategory[];
}

export const MEDIA_COVERAGE_BUCKETS: readonly MediaCoverageBucketDefinition[] = Object.freeze([
  {
    id: 'front',
    label: 'The front of your shop',
    why: 'People use it to recognise the place from the street.',
    categories: ['EXTERIOR', 'COVER'],
  },
  {
    id: 'inside',
    label: 'Inside',
    why: 'It answers "what am I walking into?" before anyone calls.',
    categories: ['INTERIOR', 'COMMON_AREA', 'ROOMS'],
  },
  {
    id: 'work',
    label: 'Your work or products',
    why: 'This is what someone is actually deciding to buy.',
    categories: ['PRODUCT', 'FOOD_AND_DRINK', 'MENU'],
  },
  {
    id: 'team',
    label: 'Your team',
    why: 'Faces make a small business look open and staffed.',
    categories: ['TEAMS', 'AT_WORK'],
  },
  {
    id: 'branding',
    label: 'Logo or profile picture',
    why: 'It is the small picture beside your name in search results.',
    categories: ['LOGO', 'PROFILE'],
  },
]);

export interface MediaCoverageBucket extends MediaCoverageBucketDefinition {
  /** How many owner-added items fall in this bucket. A real count, possibly 0. */
  count: number;
}

/**
 * What we observed about the photos Google listed.
 *
 * Everything here is counted from a list Google actually returned. There is no
 * "expected" total, no percentage of an invented target, and no score. If we
 * were never given the list, this object is not constructed at all — the screen
 * renders an unavailable state instead.
 */
export interface MediaCoverageObservation {
  buckets: MediaCoverageBucket[];
  /** Buckets with zero items. This is the actionable finding. */
  emptyBuckets: MediaCoverageBucket[];
  totalItems: number;
  /** Newest `createTime` among dated items, or null when none carried a date. */
  newestCreateTime: string | null;
  /** Items Google returned without a usable date. They cannot count toward recency. */
  itemsWithoutDate: number;
  /** Items Shoogle's own records say it published. */
  publishedByShoogle: number;
}

export function computeMediaCoverage(items: readonly GbpMediaItem[]): MediaCoverageObservation {
  const buckets: MediaCoverageBucket[] = MEDIA_COVERAGE_BUCKETS.map((definition) => ({
    ...definition,
    count: items.filter((item) => definition.categories.includes(item.category)).length,
  }));

  let newestCreateTime: string | null = null;
  let newestParsed = Number.NEGATIVE_INFINITY;
  let itemsWithoutDate = 0;

  for (const item of items) {
    if (item.createTime === null) {
      itemsWithoutDate += 1;
      continue;
    }
    const parsed = Date.parse(item.createTime);
    if (Number.isNaN(parsed)) {
      itemsWithoutDate += 1;
      continue;
    }
    if (parsed > newestParsed) {
      newestParsed = parsed;
      newestCreateTime = item.createTime;
    }
  }

  return {
    buckets,
    emptyBuckets: buckets.filter((bucket) => bucket.count === 0),
    totalItems: items.length,
    newestCreateTime,
    itemsWithoutDate,
    publishedByShoogle: items.filter((item) => item.publishedByShoogle).length,
  };
}

/**
 * The sentence that names what the coverage claim rests on.
 *
 * Grexa asserts photos "help you rank higher" and shows nothing behind it.
 * Every coverage statement Shoogle makes is followed by this, so the owner can
 * see the observation and disagree with it.
 */
export function coverageEvidenceSentence(observation: MediaCoverageObservation): string {
  const noun = observation.totalItems === 1 ? 'photo' : 'photos';
  const base = `Counted from the ${observation.totalItems} ${noun} Google lists as added by you. Photos your customers uploaded are not in that list, so your listing may show more than this.`;
  if (observation.itemsWithoutDate === 0) return base;
  const undated = observation.itemsWithoutDate;
  return `${base} ${undated} of them came back without a date, so ${undated === 1 ? 'it is' : 'they are'} left out of anything about recency.`;
}

/* -------------------------------------------------------------------------- */
/* Client-side validation before any upload path (research §8)                */
/* -------------------------------------------------------------------------- */

/** Google's documented minimum short edge, in pixels. */
export const MIN_SHORT_EDGE_PX = 250;

/** Google's documented minimum file size: 10KB. */
export const MIN_FILE_BYTES = 10_240;

/**
 * The two categories Google exempts from the minimums above.
 * Research §8: "except `PROFILE` and `COVER`".
 */
export const SIZE_EXEMPT_CATEGORIES: readonly GbpMediaCategory[] = Object.freeze([
  'PROFILE',
  'COVER',
]);

/** A file the owner has chosen but that has not been sent anywhere. */
export interface MediaCandidate {
  id: string;
  fileName: string;
  format: GbpMediaFormat;
  category: GbpMediaCategory;
  /** Pixel width, or null when the picker did not report it. */
  widthPx: number | null;
  /** Pixel height, or null when the picker did not report it. */
  heightPx: number | null;
  /** File size in bytes, or null when unknown. */
  byteSize: number | null;
}

/** A rule the file measurably breaks. */
export type MediaValidationProblem =
  | { kind: 'short_edge_too_small'; shortEdgePx: number; minimumPx: number }
  | { kind: 'file_too_small'; byteSize: number; minimumBytes: number };

/** Something we could not measure, and therefore cannot clear. */
export type MediaValidationGap = { kind: 'dimensions_unknown' } | { kind: 'file_size_unknown' };

/**
 * The verdict.
 *
 * `cannot_check` is separate from `ok` on purpose: a file whose dimensions the
 * picker did not report has NOT passed the 250px rule, and telling the owner it
 * did would be the same lie as rendering an unknown as zero.
 */
export type MediaValidation =
  | { kind: 'ok'; exempt: boolean }
  | { kind: 'rejected'; problems: MediaValidationProblem[]; gaps: MediaValidationGap[] }
  | { kind: 'cannot_check'; gaps: MediaValidationGap[] };

/**
 * Check a file against Google's documented minimums BEFORE any upload path.
 *
 * Research §8 says to enforce this client-side so the owner gets a specific
 * message rather than a server rejection. It is also the only part of the
 * upload story Shoogle can honestly ship today, since no credentials exist.
 */
export function validateMediaCandidate(candidate: MediaCandidate): MediaValidation {
  const exempt = SIZE_EXEMPT_CATEGORIES.includes(candidate.category);
  if (exempt) return { kind: 'ok', exempt: true };

  const problems: MediaValidationProblem[] = [];
  const gaps: MediaValidationGap[] = [];

  if (candidate.widthPx === null || candidate.heightPx === null) {
    gaps.push({ kind: 'dimensions_unknown' });
  } else {
    const shortEdgePx = Math.min(candidate.widthPx, candidate.heightPx);
    if (shortEdgePx < MIN_SHORT_EDGE_PX) {
      problems.push({ kind: 'short_edge_too_small', shortEdgePx, minimumPx: MIN_SHORT_EDGE_PX });
    }
  }

  if (candidate.byteSize === null) {
    gaps.push({ kind: 'file_size_unknown' });
  } else if (candidate.byteSize < MIN_FILE_BYTES) {
    problems.push({
      kind: 'file_too_small',
      byteSize: candidate.byteSize,
      minimumBytes: MIN_FILE_BYTES,
    });
  }

  if (problems.length > 0) return { kind: 'rejected', problems, gaps };
  if (gaps.length > 0) return { kind: 'cannot_check', gaps };
  return { kind: 'ok', exempt: false };
}

/** Bytes as an owner reads them. Used only for real, measured sizes. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb * 10) / 10} KB`;
  return `${Math.round((kb / 1024) * 10) / 10} MB`;
}

/** One line per problem or gap, in plain English. */
export function describeValidation(validation: MediaValidation): string[] {
  switch (validation.kind) {
    case 'ok':
      return validation.exempt
        ? ['Google sets no size minimum for cover photos and profile pictures.']
        : [`Meets Google's minimums: ${MIN_SHORT_EDGE_PX}px on the short edge and 10 KB.`];

    case 'rejected':
      return [
        ...validation.problems.map((problem) =>
          problem.kind === 'short_edge_too_small'
            ? `Too small: the short edge is ${problem.shortEdgePx}px and Google needs at least ${problem.minimumPx}px.`
            : `File is too small: ${formatBytes(problem.byteSize)}, and Google needs at least 10 KB.`,
        ),
        ...validation.gaps.map(gapSentence),
      ];

    case 'cannot_check':
      return validation.gaps.map(gapSentence);
  }
}

function gapSentence(gap: MediaValidationGap): string {
  return gap.kind === 'dimensions_unknown'
    ? `We could not read this file's size in pixels, so we cannot say whether it clears Google's ${MIN_SHORT_EDGE_PX}px minimum.`
    : 'We could not read this file’s size on disk, so we cannot say whether it clears Google’s 10 KB minimum.';
}

/** The requirements list, shown before anything is chosen. */
export const MEDIA_REQUIREMENTS: readonly string[] = Object.freeze([
  `At least ${MIN_SHORT_EDGE_PX} pixels on the short edge.`,
  'At least 10 KB as a file.',
  'Cover photos and profile pictures are exempt from both minimums.',
  'Pick the category that matches the photo — Google files it that way on your listing.',
]);

/* -------------------------------------------------------------------------- */
/* Scheduled media                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A photo Shoogle plans to publish.
 *
 * Google's media API has no scheduling: `media.create` publishes immediately.
 * So a scheduled item is Shoogle's own intention, and `queued` is the ONLY
 * state it can be in until a credential exists and a real call returns. There
 * is deliberately no `published` member here — that claim belongs to whatever
 * Google actually answers, not to a plan.
 */
export interface ScheduledMediaItem {
  id: string;
  /** RFC 3339. When Shoogle intends to publish it. */
  scheduledFor: string;
  category: GbpMediaCategory;
  caption: string;
}

/** "In 2 days", "Today", "Overdue" — the timeline's left rail. */
export function describeSchedule(scheduledForIso: string, nowIso: string): string {
  const days = daysBetween(nowIso, scheduledForIso);
  if (days === null) return 'Date not reported';
  if (days < 0) return 'Date has passed';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `In ${days} days`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'In 1 week' : `In ${weeks} weeks`;
}
