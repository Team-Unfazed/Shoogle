/**
 * Reviews — the arithmetic behind the screen. Owner: Pranay.
 *
 * Pure functions only. Nothing here fetches, and nothing here invents a value.
 * It exists so that the three questions the Reviews screen has to answer
 * honestly are answered in ONE place that a test can pin:
 *
 *   1. What is the star distribution, and what is it a distribution OF?
 *   2. Which counts are measured zeros and which are genuinely unknown?
 *   3. Which filters can this data support without lying?
 */

import type { GbpReplyModeration, GbpReviewDetail, GbpReviewPage } from '../../types';

/* -------------------------------------------------------------------------- */
/* Stars                                                                      */
/* -------------------------------------------------------------------------- */

/** Highest first, which is how a rating breakdown is read. */
export const STAR_VALUES = [5, 4, 3, 2, 1] as const;
export type StarValue = (typeof STAR_VALUES)[number];

export interface StarBucket {
  stars: StarValue;
  /**
   * How many of the reviews we hold carry this rating.
   *
   * `null` means we hold no reviews and Google did not tell us there are none,
   * so the count is UNKNOWN. `0` means we counted and found none — a measured
   * zero, which is a different fact and renders as `0`.
   */
  count: number | null;
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

export interface ReviewsSummary {
  /** Google's own figure. Null when Google did not send one. Never computed by us. */
  averageRating: number | null;
  /** Why the average is missing, when it is. */
  averageReason: string | null;
  /** Google's own figure. `0` is a real answer; null is not. */
  totalReviewCount: number | null;
  totalReason: string | null;

  buckets: StarBucket[];
  /** Reviews we hold that carry a star rating. */
  ratedCount: number;
  /**
   * Reviews Google returned with `STAR_RATING_UNSPECIFIED`. Null when we hold
   * no reviews at all and cannot say.
   */
  unratedCount: number | null;
  /** Reviews we hold, rated or not. */
  loadedCount: number;
  /** Reviews Google returned that Shoogle refused to map. */
  skippedCount: number;
  /** True when the buckets cover every review Google says this listing has. */
  distributionComplete: boolean;
  /** One sentence saying exactly what the distribution counted. */
  distributionNote: string;
}

const NO_AVERAGE_REASON =
  'Google did not send an average rating for this listing. Shoogle will not average the reviews on this page and present it as Google’s figure — that would be an average of what loaded, not of the listing.';

const NO_TOTAL_REASON =
  'Google did not say how many reviews this listing has in total, so the number below the stars is what Shoogle loaded, not what exists.';

/**
 * Turn a page of reviews into what the summary card is allowed to claim.
 *
 * THE RULE THAT SHAPES THIS FUNCTION: a distribution computed from a page is a
 * distribution of THAT PAGE. Google's reviews.list does not return a star
 * breakdown, so there is no listing-wide one to read. Rather than drop the
 * breakdown (owners want it) or fake it (we will not), it is computed over the
 * reviews actually held and `distributionNote` says so in words, every time.
 */
export function summariseReviews(page: GbpReviewPage): ReviewsSummary {
  const loadedCount = page.reviews.length;
  const counts = new Map<StarValue, number>(STAR_VALUES.map((star) => [star, 0]));
  let unrated = 0;

  for (const review of page.reviews) {
    if (review.starRating === null) {
      unrated += 1;
      continue;
    }
    counts.set(review.starRating, (counts.get(review.starRating) ?? 0) + 1);
  }

  const ratedCount = loadedCount - unrated;
  const measuredZero = loadedCount === 0 && page.totalReviewCount === 0;
  const canCount = loadedCount > 0 || measuredZero;

  const buckets: StarBucket[] = STAR_VALUES.map((stars) => ({
    stars,
    count: canCount ? (counts.get(stars) ?? 0) : null,
  }));

  return {
    averageRating: page.averageRating,
    averageReason: page.averageRating === null ? NO_AVERAGE_REASON : null,
    totalReviewCount: page.totalReviewCount,
    totalReason: page.totalReviewCount === null ? NO_TOTAL_REASON : null,
    buckets,
    ratedCount,
    unratedCount: canCount ? unrated : null,
    loadedCount,
    skippedCount: page.skipped.length,
    distributionComplete: isDistributionComplete(page),
    distributionNote: distributionNote(page),
  };
}

function isDistributionComplete(page: GbpReviewPage): boolean {
  if (page.skipped.length > 0) return false;
  if (page.nextPageToken !== null) return false;
  if (page.totalReviewCount === null) return false;
  return page.reviews.length === page.totalReviewCount;
}

function distributionNote(page: GbpReviewPage): string {
  const loaded = page.reviews.length;
  const total = page.totalReviewCount;

  if (loaded === 0 && total === 0) {
    return 'Google reports no reviews on this listing yet. These zeros were measured, not assumed.';
  }
  if (loaded === 0) {
    return 'No reviews have been loaded, so there is nothing to count. These are unknown, not zero.';
  }
  if (isDistributionComplete(page)) {
    return `Counted across all ${loaded} reviews Google has for this listing.`;
  }
  if (total === null) {
    return `Counted across the ${loaded} reviews loaded here. Google did not say how many this listing has in total, so this may not be all of them.`;
  }
  return `Counted across the ${loaded} reviews loaded here. Google says this listing has ${total}, so this is a partial picture.`;
}

/** Google's average, to one decimal. Never called with null. */
export function formatAverageRating(value: number): string {
  return value.toFixed(1);
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The filters this data can support honestly.
 *
 * THERE IS DELIBERATELY NO "UNANSWERED" FILTER, AND NO UNANSWERED COUNT.
 * ---------------------------------------------------------------------
 * Grexa's Reviews tab has one. Shoogle does not, because the fact it would rest
 * on is not established. `Review.reviewReply` is Google's field, and
 * `docs/research/google-business-profile.md` §5 does not state whether it
 * reflects replies posted from the Google Business Profile app, from Search, or
 * by another tool — only replies made through `reviews.updateReply`. If it does
 * not, "12 unanswered" would be counting reviews the owner has already
 * answered, and would invite them to answer twice.
 *
 * A wrong number is worse than no number, so the filter is absent and the
 * screen says why. Ship it the day someone confirms the field's coverage
 * against the first-party reference — not before.
 *
 * A rating filter has no such problem: `starRating` is per-review, arrives with
 * the review, and filtering the reviews on screen by it makes a claim about
 * exactly those reviews and nothing more.
 */
export type ReviewFilter = 'all' | 'star_5' | 'star_4' | 'star_3' | 'star_2' | 'star_1' | 'unrated';

export const NO_UNANSWERED_FILTER_REASON =
  'There is no "unanswered" filter here. Google’s reply field is not documented as covering replies posted outside Shoogle, so a count of unanswered reviews could be wrong — and a wrong number would have you replying twice. It will appear when that is confirmed.';

const STAR_FILTERS: Readonly<Record<StarValue, ReviewFilter>> = Object.freeze({
  5: 'star_5',
  4: 'star_4',
  3: 'star_3',
  2: 'star_2',
  1: 'star_1',
});

export function starFilterFor(star: StarValue): ReviewFilter {
  return STAR_FILTERS[star];
}

export function matchesFilter(review: GbpReviewDetail, filter: ReviewFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unrated') return review.starRating === null;
  return review.starRating !== null && STAR_FILTERS[review.starRating] === filter;
}

export function filterReviews(
  reviews: readonly GbpReviewDetail[],
  filter: ReviewFilter,
): GbpReviewDetail[] {
  return reviews.filter((review) => matchesFilter(review, filter));
}

export interface ReviewFilterOption {
  value: ReviewFilter;
  label: string;
  /** A measured count over the reviews held. Always a real number. */
  count: number;
}

/**
 * The filter chips to offer.
 *
 * A star with no reviews behind it is still offered, with a count of 0 — that
 * zero is measured and telling an owner "no one has left you one star" is
 * useful. The "No rating" chip is only offered when such a review exists,
 * because otherwise it names a Google behaviour the owner has never met.
 */
export function reviewFilterOptions(reviews: readonly GbpReviewDetail[]): ReviewFilterOption[] {
  const options: ReviewFilterOption[] = [
    { value: 'all', label: 'All', count: reviews.length },
  ];
  for (const star of STAR_VALUES) {
    options.push({
      value: starFilterFor(star),
      label: `${star}★`,
      count: reviews.filter((review) => review.starRating === star).length,
    });
  }
  const unrated = reviews.filter((review) => review.starRating === null).length;
  if (unrated > 0) {
    options.push({ value: 'unrated', label: 'No rating', count: unrated });
  }
  return options;
}

/* -------------------------------------------------------------------------- */
/* Reply state                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Is this reply LIVE on Google?
 *
 * The only two kinds that may answer true are the two Google itself confirmed.
 * "Submitted", "state not understood" and "state not reported" are all false —
 * a reply that has been accepted for moderation is not a published reply, and
 * this function is the single place that distinction is decided.
 */
export function isPublishedOnGoogle(moderation: GbpReplyModeration): boolean {
  return moderation.kind === 'published' || moderation.kind === 'published_time_unknown';
}

/** Does a reply exist at all, whatever became of it? */
export function hasReply(moderation: GbpReplyModeration): boolean {
  return moderation.kind !== 'no_reply';
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Format an ISO timestamp as "1 January 2020", or null when it is unreadable.
 *
 * Null is returned rather than the raw string so a caller cannot accidentally
 * print a machine timestamp at an owner, and rather than "today" so a date we
 * cannot read never becomes a date we made up.
 */
export function formatReviewDate(iso: string | null): string | null {
  if (iso === null || iso.length === 0) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
