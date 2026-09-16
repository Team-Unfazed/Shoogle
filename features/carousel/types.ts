/**
 * Carousel model. Owner: Yash.
 *
 * A carousel is an ordered list of slides that publishes as one post. Three
 * things shape this model:
 *
 * 1. **Slide text is data, not pixels.** `SlideContent` holds real strings and
 *    the editor renders them as `<Text>`. Burning copy into a bitmap would make
 *    it invisible to TalkBack and un-editable afterwards — see the feature
 *    README. Text is only rasterised at export, if the exported artwork itself
 *    requires it.
 *
 * 2. **Generation state and edit state are separate axes.** "The model wrote
 *    this and the owner has since changed it" is a real and common state, and
 *    a single enum cannot say it. Keeping them apart is what lets the editor
 *    offer "regenerate" without silently discarding an owner's edit.
 *
 * 3. **Order is the array.** There is no `index` field to drift out of sync
 *    with the array it indexes. `ordering.ts` is the only sanctioned way to
 *    change the order.
 */

import type { MediaAsset } from '@/features/social';

/* -------------------------------------------------------------------------- */
/* Slide                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Where a slide's copy came from.
 *
 * `failed` exists so a generator failure is visible on the slide that failed,
 * rather than being smoothed over by leaving the slide looking merely empty.
 */
export type SlideGenerationState = 'not_generated' | 'generating' | 'generated' | 'failed';

/** Whether an owner has changed this slide since it was last generated. */
export type SlideEditState = 'untouched' | 'edited';

export interface SlideContent {
  /** Big line. Null when nothing has been written or generated. */
  heading: string | null;
  /** Supporting line. Null, not '' — an empty string reads as "written, blank". */
  body: string | null;
}

export interface CarouselSlide {
  id: string;
  content: SlideContent;
  /** Background artwork. Null when the slide is text-only or not chosen yet. */
  media: MediaAsset | null;
  generation: SlideGenerationState;
  /** Owner-facing reason, present only when `generation` is 'failed'. */
  generationError: string | null;
  edit: SlideEditState;
}

export function emptySlide(id: string): CarouselSlide {
  return {
    id,
    content: { heading: null, body: null },
    media: null,
    generation: 'not_generated',
    generationError: null,
    edit: 'untouched',
  };
}

/** True when a slide would publish as a blank frame. */
export function isSlideEmpty(slide: CarouselSlide): boolean {
  const hasText =
    (slide.content.heading?.trim().length ?? 0) > 0 || (slide.content.body?.trim().length ?? 0) > 0;
  return !hasText && slide.media === null;
}

/**
 * Apply an owner edit. Always marks the slide `edited`, so a later
 * "regenerate all" can leave touched slides alone instead of overwriting work.
 */
export function editSlide(slide: CarouselSlide, patch: Partial<SlideContent>): CarouselSlide {
  return {
    ...slide,
    content: { ...slide.content, ...patch },
    edit: 'edited',
  };
}

/* -------------------------------------------------------------------------- */
/* Carousel                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The frame every slide is composed at.
 *
 * These are SHOOGLE's own template shapes, not claims about what a platform
 * accepts — nothing here says Instagram wants 4:5. Provider requirements live
 * in `features/social/platforms.ts` and are all unverified.
 */
export type CarouselAspect = 'square' | 'portrait_4_5' | 'story_9_16';

export const CAROUSEL_ASPECT_RATIO: Record<CarouselAspect, number> = {
  square: 1,
  portrait_4_5: 4 / 5,
  story_9_16: 9 / 16,
};

export const CAROUSEL_ASPECT_LABEL: Record<CarouselAspect, string> = {
  square: 'Square',
  portrait_4_5: 'Portrait',
  story_9_16: 'Story',
};

export interface Carousel {
  id: string;
  /** The post this renders into. Null while it is a standalone draft. */
  postId: string | null;
  aspect: CarouselAspect;
  /** Order is the array order. Change it only via `ordering.ts`. */
  slides: CarouselSlide[];
  createdAt: string;
  updatedAt: string;
  /** True when this came from a labelled development fixture. */
  isFixture?: boolean;
}

/**
 * Shoogle's own floor and ceiling for its editor.
 *
 * A one-slide "carousel" is just a post, and past ten slides the owner is
 * writing a document rather than a post. Platform limits are separate,
 * unverified, and checked additionally — see `validation.ts`.
 */
export const SHOOGLE_MIN_SLIDES = 2;
export const SHOOGLE_MAX_SLIDES = 10;

export function newCarousel(id: string, aspect: CarouselAspect, now: string): Carousel {
  return {
    id,
    postId: null,
    aspect,
    slides: [emptySlide(`${id}-slide-1`), emptySlide(`${id}-slide-2`)],
    createdAt: now,
    updatedAt: now,
  };
}

/** Whether any slide is still being written by a generator. */
export function isGenerating(carousel: Carousel): boolean {
  return carousel.slides.some((slide) => slide.generation === 'generating');
}

/** Slides whose generation failed. Surfaced per slide, never swallowed. */
export function failedSlides(carousel: Carousel): CarouselSlide[] {
  return carousel.slides.filter((slide) => slide.generation === 'failed');
}
