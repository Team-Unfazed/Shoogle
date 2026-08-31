import type { MediaAsset } from '@/features/social';

import {
  addSlide,
  editSlide,
  emptySlide,
  failedSlides,
  hasUniqueSlideIds,
  insertSlide,
  isGenerating,
  isSlideEmpty,
  issuesForSlide,
  moveSlide,
  moveSlideEarlier,
  moveSlideLater,
  newCarousel,
  nextSlideId,
  removeSlide,
  replaceSlide,
  reviewCarousel,
  SHOOGLE_MAX_SLIDES,
  slideIndex,
  type Carousel,
  type CarouselSlide,
} from '../index';

const NOW = '2026-08-31T04:00:00.000Z';
const THEN = '2026-08-31T05:00:00.000Z';

function withSlides(ids: string[]): Carousel {
  return { ...newCarousel('c1', 'portrait_4_5', NOW), slides: ids.map(emptySlide) };
}

function filled(id: string, heading: string): CarouselSlide {
  return { ...emptySlide(id), content: { heading, body: null }, generation: 'generated' };
}

function media(format: MediaAsset['format'], altText: string | null = 'Alt'): MediaAsset {
  return {
    id: `m-${format}`,
    kind: 'image',
    format,
    uri: 'file:///a',
    width: 1080,
    height: 1350,
    byteSize: 1000,
    durationSeconds: null,
    altText,
  };
}

describe('carousel construction', () => {
  it('starts with two slides, because one slide is just a post', () => {
    const carousel = newCarousel('c1', 'square', NOW);
    expect(carousel.slides).toHaveLength(2);
    expect(carousel.slides.every(isSlideEmpty)).toBe(true);
    expect(hasUniqueSlideIds(carousel)).toBe(true);
  });

  it('keeps generation state and edit state as separate axes', () => {
    const generated = filled('s1', 'Written by a model');
    expect(generated.edit).toBe('untouched');

    const edited = editSlide(generated, { heading: 'Owner rewrote it' });
    // Still known to have been generated; now also known to be edited.
    expect(edited.generation).toBe('generated');
    expect(edited.edit).toBe('edited');
  });

  it('surfaces per-slide generation failures rather than leaving them blank', () => {
    const carousel: Carousel = {
      ...withSlides(['a', 'b']),
      slides: [
        { ...emptySlide('a'), generation: 'failed', generationError: 'The model returned nothing.' },
        { ...emptySlide('b'), generation: 'generating' },
      ],
    };
    expect(failedSlides(carousel).map((s) => s.id)).toEqual(['a']);
    expect(isGenerating(carousel)).toBe(true);
  });
});

describe('ordering', () => {
  it('moves a slide and preserves every other position', () => {
    const moved = moveSlide(withSlides(['a', 'b', 'c', 'd']), 0, 2, THEN);
    expect(moved.slides.map((s) => s.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(moved.updatedAt).toBe(THEN);
  });

  it('treats an out-of-range or no-op move as a no-op, not a throw', () => {
    const carousel = withSlides(['a', 'b']);
    expect(moveSlide(carousel, 5, 0, THEN)).toBe(carousel);
    expect(moveSlide(carousel, -1, 0, THEN)).toBe(carousel);
    expect(moveSlide(carousel, 1, 1, THEN)).toBe(carousel);
  });

  it('nudges earlier and later, stopping at the ends', () => {
    const carousel = withSlides(['a', 'b', 'c']);
    expect(moveSlideLater(carousel, 'a', THEN).slides.map((s) => s.id)).toEqual(['b', 'a', 'c']);
    expect(moveSlideEarlier(carousel, 'c', THEN).slides.map((s) => s.id)).toEqual(['a', 'c', 'b']);
    expect(moveSlideEarlier(carousel, 'a', THEN)).toBe(carousel);
    expect(moveSlideLater(carousel, 'c', THEN)).toBe(carousel);
  });

  it('keeps slide ids unique through every mutation', () => {
    let carousel = withSlides(['a', 'b']);
    carousel = addSlide(carousel, THEN);
    carousel = addSlide(carousel, THEN, 0);
    carousel = moveSlide(carousel, 0, 3, THEN);
    carousel = removeSlide(carousel, 'a', THEN);
    expect(hasUniqueSlideIds(carousel)).toBe(true);
  });

  it('refuses to insert a duplicate id', () => {
    const carousel = withSlides(['a', 'b']);
    expect(insertSlide(carousel, emptySlide('a'), THEN)).toBe(carousel);
  });

  it('will not grow past Shoogle’s own ceiling', () => {
    let carousel = withSlides(['a']);
    for (let i = 0; i < SHOOGLE_MAX_SLIDES + 5; i += 1) carousel = addSlide(carousel, THEN);
    expect(carousel.slides).toHaveLength(SHOOGLE_MAX_SLIDES);
  });

  it('generates an id that is free even after removals', () => {
    const carousel = withSlides(['c1-slide-1', 'c1-slide-2', 'c1-slide-3']);
    const shrunk = removeSlide(carousel, 'c1-slide-2', THEN);
    expect(shrunk.slides.map((s) => s.id)).not.toContain(nextSlideId(shrunk));
  });

  it('replaces a slide in place', () => {
    const carousel = withSlides(['a', 'b']);
    const updated = replaceSlide(carousel, filled('b', 'New'), THEN);
    expect(slideIndex(updated, 'b')).toBe(1);
    expect(updated.slides[1]?.content.heading).toBe('New');
  });
});

describe('validation', () => {
  it('blocks a one-slide carousel and a blank slide', () => {
    const single = { ...withSlides(['a']), slides: [filled('a', 'Only')] };
    expect(reviewCarousel(single).ok).toBe(false);
    expect(reviewCarousel(single).issues[0]?.problem).toBe('too_few_slides');

    const blank = { ...withSlides(['a', 'b']), slides: [filled('a', 'One'), emptySlide('b')] };
    const review = reviewCarousel(blank);
    expect(review.ok).toBe(false);
    expect(issuesForSlide(review, 'b')[0]?.problem).toBe('blank_slide');
  });

  it('blocks publishing while a slide is still being written', () => {
    const carousel = {
      ...withSlides(['a', 'b']),
      slides: [filled('a', 'One'), { ...emptySlide('b'), generation: 'generating' as const }],
    };
    const review = reviewCarousel(carousel);
    expect(review.ok).toBe(false);
    expect(issuesForSlide(review, 'b').map((i) => i.problem)).toEqual(['generation_in_progress']);
  });

  it('reports a generation failure with the reason, not as an empty slide', () => {
    const carousel = {
      ...withSlides(['a', 'b']),
      slides: [
        filled('a', 'One'),
        {
          ...emptySlide('b'),
          generation: 'failed' as const,
          generationError: 'The model returned nothing.',
        },
      ],
    };
    const issues = issuesForSlide(reviewCarousel(carousel), 'b');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      problem: 'generation_failed',
      message: 'The model returned nothing.',
    });
  });

  it('flags missing alt text without taking the decision away from the owner', () => {
    const carousel = {
      ...withSlides(['a', 'b']),
      slides: [
        { ...filled('a', 'One'), media: media('jpeg', null) },
        filled('b', 'Two'),
      ],
    };
    const review = reviewCarousel(carousel);
    expect(review.ok).toBe(true); // advisory, not blocking
    expect(review.issues[0]).toMatchObject({ problem: 'missing_alt_text', blocking: false });
  });

  /**
   * THE POINT OF THE WHOLE `unverified` MECHANISM: a carousel Shoogle finds no
   * fault with is not thereby "accepted by Instagram". Every platform check
   * lands in `unchecked` until the research is done.
   */
  it('never claims platform acceptance it has not verified', () => {
    const carousel = {
      ...withSlides(['a', 'b']),
      slides: [
        { ...filled('a', 'One'), media: media('png') },
        { ...filled('b', 'Two'), media: media('jpeg') },
      ],
    };

    const review = reviewCarousel(carousel, ['instagram', 'linkedin']);
    expect(review.ok).toBe(true);
    expect(review.issues).toEqual([]);
    expect(review.unchecked.sort()).toEqual(['instagram', 'linkedin']);
  });

  it('blocks media whose format could not even be read', () => {
    const carousel = {
      ...withSlides(['a', 'b']),
      slides: [{ ...filled('a', 'One'), media: media('unknown') }, filled('b', 'Two')],
    };
    const review = reviewCarousel(carousel, ['instagram']);
    expect(review.ok).toBe(false);
    expect(issuesForSlide(review, 'a')[0]?.problem).toBe('unsupported_media_format');
  });
});
