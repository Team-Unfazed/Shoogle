/**
 * Instagram post content. Owner: Yash.
 *
 * =============== WHAT MAKES THIS AN INSTAGRAM POST ==========================
 *
 * Not "a post with an Instagram label". The shape below can only describe
 * things Instagram actually publishes, and cannot describe things it does not:
 *
 *   - There is NO text-only variant. Instagram publishes no post without
 *     media; Facebook does. That is a structural difference, so it is a
 *     structural difference in the type.
 *   - There is NO link field. Instagram captions do not carry one.
 *   - `altText` exists ONLY on the image variants. Meta: the `alt_text` field
 *     is for image posts, and "Reels and stories are not supported". Putting
 *     alt text on a Reel is therefore not a validation error to catch later —
 *     it is a sentence that cannot be written.
 *   - A carousel holds `InstagramCarouselItem`s, each independently an image
 *     (with its own alt text) or a video, because Meta allows "images, videos,
 *     or a mix of the two".
 *
 * See `docs/research/meta-instagram.md` §3-§4.
 */

import { allHashtags, captionLength } from '../captions';
import { checkMediaAgainstSpec, INSTAGRAM_STORY_VIDEO } from '../mediaSpecs';
import {
  checkCaptionLength,
  checkHashtagCount,
  checkMediaFormat,
  isEnforceable,
  PLATFORM_CAPABILITIES,
} from '../platforms';
import type { Caption, MediaAsset } from '../types';

import type { ContentIssue, ContentReview } from './review';
import { reviewFrom } from './review';

/* -------------------------------------------------------------------------- */
/* Format                                                                     */
/* -------------------------------------------------------------------------- */

/** One slide of a carousel. Alt text belongs to images and only to images. */
export type InstagramCarouselItem =
  | { readonly kind: 'image'; readonly image: MediaAsset; readonly altText: string | null }
  | { readonly kind: 'video'; readonly video: MediaAsset };

/**
 * What Instagram is being asked to publish.
 *
 * `reel` and `video` are separate members even though both carry one video:
 * Meta exposes `media_type: REELS` distinctly, and a Reel is a different
 * surface with different placement. Collapsing them would lose the owner's
 * choice.
 */
export type InstagramFormat =
  | { readonly kind: 'single_image'; readonly image: MediaAsset; readonly altText: string | null }
  | { readonly kind: 'video'; readonly video: MediaAsset }
  | { readonly kind: 'reel'; readonly video: MediaAsset }
  | { readonly kind: 'story'; readonly media: MediaAsset }
  | { readonly kind: 'carousel'; readonly items: readonly InstagramCarouselItem[] };

export interface InstagramContent {
  readonly platform: 'instagram';
  /** Instagram's own word for the text, and hashtags are first-class here. */
  readonly caption: Caption;
  readonly format: InstagramFormat;
}

export function instagramContent(caption: Caption, format: InstagramFormat): InstagramContent {
  return { platform: 'instagram', caption, format };
}

/** Every media asset in a format, in publication order. */
export function instagramMedia(format: InstagramFormat): MediaAsset[] {
  switch (format.kind) {
    case 'single_image':
      return [format.image];
    case 'video':
    case 'reel':
      return [format.video];
    case 'story':
      return [format.media];
    case 'carousel':
      return format.items.map((item) => (item.kind === 'image' ? item.image : item.video));
  }
}

/**
 * Alt text Instagram will actually accept, as `alt_text` is image-only.
 * Returns an empty array for a Reel or Story because there is nowhere to put
 * it, not because the owner did not write any.
 */
export function instagramAltText(format: InstagramFormat): string[] {
  switch (format.kind) {
    case 'single_image':
      return format.altText === null ? [] : [format.altText];
    case 'carousel':
      return format.items
        .filter((item): item is Extract<InstagramCarouselItem, { kind: 'image' }> => item.kind === 'image')
        .map((item) => item.altText)
        .filter((text): text is string => text !== null);
    case 'video':
    case 'reel':
    case 'story':
      return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Review                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Shoogle's carousel bounds. `SHOOGLE_MIN_SLIDES` is ours — Meta documents a
 * maximum of 10 and no minimum, so the lower bound must never be presented as
 * Instagram's rule. The upper bound IS Meta's, and comes from
 * `PLATFORM_CAPABILITIES` rather than being repeated here.
 */
const SHOOGLE_MIN_CAROUSEL_ITEMS = 2;

export function reviewInstagramContent(content: InstagramContent): ContentReview {
  const issues: ContentIssue[] = [];
  const unchecked: string[] = [];

  /* -- Caption ---------------------------------------------------------- */
  const rendered = `${content.caption.body} ${content.caption.hashtags.join(' ')}`.trim();
  if (rendered === '') {
    issues.push({
      platform: 'instagram',
      code: 'caption_empty',
      message: 'This Instagram post has no caption yet.',
      blocking: true,
    });
  }

  const lengthCheck = checkCaptionLength('instagram', captionLength(content.caption));
  if (lengthCheck.outcome === 'violation') {
    issues.push({ platform: 'instagram', code: 'caption_too_long', message: lengthCheck.message, blocking: true });
  } else if (lengthCheck.outcome === 'unverified') {
    unchecked.push(lengthCheck.message);
  }

  const tagCheck = checkHashtagCount('instagram', allHashtags(content.caption).length);
  if (tagCheck.outcome === 'violation') {
    issues.push({ platform: 'instagram', code: 'too_many_hashtags', message: tagCheck.message, blocking: true });
  } else if (tagCheck.outcome === 'unverified') {
    unchecked.push(tagCheck.message);
  }

  /* -- Carousel size ----------------------------------------------------- */
  if (content.format.kind === 'carousel') {
    const count = content.format.items.length;
    if (count < SHOOGLE_MIN_CAROUSEL_ITEMS) {
      issues.push({
        platform: 'instagram',
        code: 'carousel_too_small',
        // Attributed to Shoogle, not to Instagram, because Meta documents no
        // minimum. See `carouselMinSlides` in platforms.ts.
        message: `A carousel needs at least ${SHOOGLE_MIN_CAROUSEL_ITEMS} slides.`,
        blocking: true,
      });
    }
    const max = capabilityMaxCarousel();
    if (max !== null && count > max) {
      issues.push({
        platform: 'instagram',
        code: 'carousel_too_large',
        message: `Instagram takes at most ${max} slides. This one has ${count}.`,
        blocking: true,
      });
    }
  }

  /* -- Media ------------------------------------------------------------- */
  const media = instagramMedia(content.format);
  if (media.length === 0) {
    issues.push({
      platform: 'instagram',
      code: 'media_missing',
      // Instagram genuinely cannot publish without media. This is not a
      // Shoogle preference and it is not true of Facebook.
      message: 'Instagram needs a photo or video. It cannot publish text on its own.',
      blocking: true,
    });
  }

  for (const asset of media) {
    const formatCheck = checkMediaFormat('instagram', asset.format);
    if (formatCheck.outcome === 'violation') {
      issues.push({ platform: 'instagram', code: 'media_format', message: formatCheck.message, blocking: true });
    } else if (formatCheck.outcome === 'unverified') {
      unchecked.push(formatCheck.message);
    }

    for (const result of checkMediaAgainstSpec('instagram', asset)) {
      if (result.outcome === 'violation') {
        issues.push({ platform: 'instagram', code: 'media_spec', message: result.message, blocking: true });
      } else if (result.outcome === 'unverified') {
        unchecked.push(result.message);
      }
    }
  }

  /* -- Stories have their own, tighter video limits ---------------------- */
  if (content.format.kind === 'story' && content.format.media.kind === 'video') {
    const asset = content.format.media;
    const max = INSTAGRAM_STORY_VIDEO.maxDurationSeconds;
    if (isEnforceable(max) && asset.durationSeconds !== null && asset.durationSeconds > max.value) {
      issues.push({
        platform: 'instagram',
        code: 'story_too_long',
        message: `An Instagram Story takes up to ${max.value} seconds of video. This one is ${Math.round(asset.durationSeconds)}.`,
        blocking: true,
      });
    }
  }

  return reviewFrom(issues, unchecked);
}

/**
 * Meta's documented carousel maximum, or null while unverified.
 * Read from the capability matrix rather than repeated here, so the number
 * lives in exactly one place with its source attached.
 */
function capabilityMaxCarousel(): number | null {
  const limit = PLATFORM_CAPABILITIES.instagram.carouselMaxSlides;
  return isEnforceable(limit) ? limit.value : null;
}
