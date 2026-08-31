/**
 * Slide ordering. Owner: Yash.
 *
 * The only sanctioned way to change a carousel's slide order or membership.
 * Every function is pure and returns a new `Carousel`; nothing mutates in
 * place, so a drag that is cancelled half-way leaves the original untouched.
 *
 * Two invariants hold after every operation here, and are asserted by tests:
 *   - slide ids are unique
 *   - the slide count never leaves [0, SHOOGLE_MAX_SLIDES]
 *
 * Out-of-range indices are a no-op returning the same carousel, not a throw:
 * these are called from gesture handlers, where a stale index during a drag is
 * ordinary rather than exceptional.
 */

import {
  emptySlide,
  SHOOGLE_MAX_SLIDES,
  type Carousel,
  type CarouselSlide,
} from './types';

function withSlides(carousel: Carousel, slides: CarouselSlide[], now: string): Carousel {
  return { ...carousel, slides, updatedAt: now };
}

function inRange(carousel: Carousel, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < carousel.slides.length;
}

export function slideIndex(carousel: Carousel, slideId: string): number {
  return carousel.slides.findIndex((slide) => slide.id === slideId);
}

export function findSlide(carousel: Carousel, slideId: string): CarouselSlide | null {
  return carousel.slides.find((slide) => slide.id === slideId) ?? null;
}

/** Move a slide from one position to another. Out-of-range moves are no-ops. */
export function moveSlide(carousel: Carousel, from: number, to: number, now: string): Carousel {
  if (!inRange(carousel, from) || !inRange(carousel, to) || from === to) return carousel;
  const slides = [...carousel.slides];
  const [moved] = slides.splice(from, 1);
  if (moved === undefined) return carousel;
  slides.splice(to, 0, moved);
  return withSlides(carousel, slides, now);
}

export function moveSlideById(carousel: Carousel, slideId: string, to: number, now: string): Carousel {
  const from = slideIndex(carousel, slideId);
  return from === -1 ? carousel : moveSlide(carousel, from, to, now);
}

/** Nudge one position earlier. Already-first is a no-op. */
export function moveSlideEarlier(carousel: Carousel, slideId: string, now: string): Carousel {
  const from = slideIndex(carousel, slideId);
  return from <= 0 ? carousel : moveSlide(carousel, from, from - 1, now);
}

/** Nudge one position later. Already-last is a no-op. */
export function moveSlideLater(carousel: Carousel, slideId: string, now: string): Carousel {
  const from = slideIndex(carousel, slideId);
  if (from === -1 || from === carousel.slides.length - 1) return carousel;
  return moveSlide(carousel, from, from + 1, now);
}

/**
 * Insert a slide at `at`, or append when `at` is omitted.
 *
 * Refuses to exceed `SHOOGLE_MAX_SLIDES` — the caller should disable the "add"
 * control at the limit rather than relying on this, but a silent no-op is
 * better than an over-long carousel reaching a publisher.
 */
export function insertSlide(
  carousel: Carousel,
  slide: CarouselSlide,
  now: string,
  at?: number,
): Carousel {
  if (carousel.slides.length >= SHOOGLE_MAX_SLIDES) return carousel;
  if (slideIndex(carousel, slide.id) !== -1) return carousel;

  const slides = [...carousel.slides];
  const position = at === undefined ? slides.length : Math.max(0, Math.min(at, slides.length));
  slides.splice(position, 0, slide);
  return withSlides(carousel, slides, now);
}

/** Append a blank slide with a generated id. */
export function addSlide(carousel: Carousel, now: string, at?: number): Carousel {
  return insertSlide(carousel, emptySlide(nextSlideId(carousel)), now, at);
}

export function removeSlide(carousel: Carousel, slideId: string, now: string): Carousel {
  const slides = carousel.slides.filter((slide) => slide.id !== slideId);
  return slides.length === carousel.slides.length ? carousel : withSlides(carousel, slides, now);
}

export function replaceSlide(carousel: Carousel, slide: CarouselSlide, now: string): Carousel {
  const index = slideIndex(carousel, slide.id);
  if (index === -1) return carousel;
  const slides = [...carousel.slides];
  slides[index] = slide;
  return withSlides(carousel, slides, now);
}

/**
 * A slide id that is not already in use.
 *
 * Counter-based rather than random so that ids are stable and readable in
 * snapshots and bug reports; the collision loop covers a carousel whose slides
 * were reordered and removed enough to leave gaps.
 */
export function nextSlideId(carousel: Carousel): string {
  const used = new Set(carousel.slides.map((slide) => slide.id));
  let n = carousel.slides.length + 1;
  let candidate = `${carousel.id}-slide-${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${carousel.id}-slide-${n}`;
  }
  return candidate;
}

/** True when no two slides share an id. Asserted after every mutation in tests. */
export function hasUniqueSlideIds(carousel: Carousel): boolean {
  return new Set(carousel.slides.map((slide) => slide.id)).size === carousel.slides.length;
}
