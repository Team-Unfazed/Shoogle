/**
 * features/carousel — public surface. Owner: Yash.
 *
 * Other features import from '@/features/carousel' and nothing deeper.
 *
 * This feature depends on `@/features/social` (for `MediaAsset`, `Platform`
 * and the unverified platform checks) and nothing depends on it in return, so
 * the dependency runs one way only. Do not import carousel types back into
 * `features/social` — model generated slide copy as plain heading/body pairs
 * there instead, which is what `GeneratedSlideCopy` is for.
 */

export {
  CAROUSEL_ASPECT_LABEL,
  CAROUSEL_ASPECT_RATIO,
  editSlide,
  emptySlide,
  failedSlides,
  isGenerating,
  isSlideEmpty,
  newCarousel,
  SHOOGLE_MAX_SLIDES,
  SHOOGLE_MIN_SLIDES,
  type Carousel,
  type CarouselAspect,
  type CarouselSlide,
  type SlideContent,
  type SlideEditState,
  type SlideGenerationState,
} from './types';

export {
  addSlide,
  findSlide,
  hasUniqueSlideIds,
  insertSlide,
  moveSlide,
  moveSlideById,
  moveSlideEarlier,
  moveSlideLater,
  nextSlideId,
  removeSlide,
  replaceSlide,
  slideIndex,
} from './ordering';

export {
  issuesForSlide,
  reviewCarousel,
  type CarouselIssue,
  type CarouselProblem,
  type CarouselReview,
} from './validation';
