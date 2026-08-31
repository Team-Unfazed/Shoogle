/**
 * Carousel validation. Owner: Yash.
 *
 * Two kinds of rule, kept apart deliberately:
 *
 *   SHOOGLE'S OWN  — slide count floor/ceiling, blank slides, unfinished
 *                    generation, missing alt text. Ours to state, so they are
 *                    stated as facts.
 *
 *   THE PLATFORM'S — accepted image formats, carousel size limits. All
 *                    UNVERIFIED today (`features/social/platforms.ts`), so
 *                    every one of those checks answers `unverified` and lands
 *                    in `unchecked`, never in `issues`.
 *
 * `ok: true` therefore means "Shoogle found nothing wrong", NOT "this will be
 * accepted". The editor must render `unchecked` alongside a valid carousel;
 * showing a green tick while four platform limits went unchecked is the exact
 * false claim the honesty rules exist to prevent.
 */

import { checkMediaFormat, checkSlideCount, type Platform } from '@/features/social';

import { isSlideEmpty, SHOOGLE_MAX_SLIDES, SHOOGLE_MIN_SLIDES, type Carousel } from './types';

export type CarouselProblem =
  | 'too_few_slides'
  | 'too_many_slides'
  | 'blank_slide'
  | 'generation_in_progress'
  | 'generation_failed'
  | 'unsupported_media_format'
  | 'missing_alt_text';

export interface CarouselIssue {
  problem: CarouselProblem;
  /** The slide at fault, when the problem is a slide's. */
  slideId: string | null;
  platform: Platform | null;
  /** Owner-facing sentence. */
  message: string;
  /**
   * `blocking` issues stop a publish. Advisory ones — missing alt text — are
   * shown but do not take the decision away from the owner.
   */
  blocking: boolean;
}

export interface CarouselReview {
  /** True when there are no blocking issues. Not a claim about the platform. */
  ok: boolean;
  issues: CarouselIssue[];
  /** Platforms whose limits could not be checked. Must be surfaced. */
  unchecked: Platform[];
}

export function reviewCarousel(
  carousel: Carousel,
  platforms: readonly Platform[] = [],
): CarouselReview {
  const issues: CarouselIssue[] = [];
  const unchecked = new Set<Platform>();

  /* -- Shoogle's own rules ------------------------------------------------ */

  if (carousel.slides.length < SHOOGLE_MIN_SLIDES) {
    issues.push({
      problem: 'too_few_slides',
      slideId: null,
      platform: null,
      message: `A carousel needs at least ${SHOOGLE_MIN_SLIDES} slides.`,
      blocking: true,
    });
  }
  if (carousel.slides.length > SHOOGLE_MAX_SLIDES) {
    issues.push({
      problem: 'too_many_slides',
      slideId: null,
      platform: null,
      message: `Shoogle carousels go up to ${SHOOGLE_MAX_SLIDES} slides.`,
      blocking: true,
    });
  }

  for (const slide of carousel.slides) {
    if (slide.generation === 'generating') {
      issues.push({
        problem: 'generation_in_progress',
        slideId: slide.id,
        platform: null,
        message: 'Shoogle is still writing this slide.',
        blocking: true,
      });
      // A slide still being written is not also "blank" — one message, not two.
      continue;
    }

    if (slide.generation === 'failed') {
      issues.push({
        problem: 'generation_failed',
        slideId: slide.id,
        platform: null,
        message: slide.generationError ?? 'Shoogle could not write this slide.',
        blocking: true,
      });
      continue;
    }

    if (isSlideEmpty(slide)) {
      issues.push({
        problem: 'blank_slide',
        slideId: slide.id,
        platform: null,
        message: 'This slide has no text and no image.',
        blocking: true,
      });
    }

    if (slide.media !== null && (slide.media.altText === null || slide.media.altText.trim() === '')) {
      issues.push({
        problem: 'missing_alt_text',
        slideId: slide.id,
        platform: null,
        message: 'This image has no description for screen readers.',
        blocking: false,
      });
    }
  }

  /* -- The platforms' rules, none of which are verified yet ---------------- */

  for (const platform of platforms) {
    const sizeCheck = checkSlideCount(platform, carousel.slides.length);
    if (sizeCheck.outcome === 'violation') {
      issues.push({
        problem: 'too_many_slides',
        slideId: null,
        platform,
        message: sizeCheck.message,
        blocking: true,
      });
    } else if (sizeCheck.outcome === 'unverified') {
      unchecked.add(platform);
    }

    for (const slide of carousel.slides) {
      if (slide.media === null) continue;
      const formatCheck = checkMediaFormat(platform, slide.media.format);
      if (formatCheck.outcome === 'violation') {
        issues.push({
          problem: 'unsupported_media_format',
          slideId: slide.id,
          platform,
          message: formatCheck.message,
          blocking: true,
        });
      } else if (formatCheck.outcome === 'unverified') {
        unchecked.add(platform);
      }
    }
  }

  return {
    ok: !issues.some((issue) => issue.blocking),
    issues,
    unchecked: [...unchecked],
  };
}

/** Issues for one slide, for rendering inline in the editor. */
export function issuesForSlide(review: CarouselReview, slideId: string): CarouselIssue[] {
  return review.issues.filter((issue) => issue.slideId === slideId);
}
