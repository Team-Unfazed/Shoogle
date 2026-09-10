/**
 * Per-platform post content. Owner: Yash.
 *
 * ================= ONE POST, THREE DIFFERENT OBJECTS ========================
 *
 * `PostContent` is a map from platform to that platform's OWN content type,
 * not a shared object with per-platform overrides. There is deliberately no
 * "base content" to inherit from, because the three do not share a base:
 * Instagram cannot publish without media, Facebook can publish words alone,
 * and Google requires a topic type that decides which other fields exist.
 *
 * A platform is present here only when the post targets it. Absence is
 * meaningful and is not the same as empty content.
 *
 * ================= PRODUCT RULE 13 APPLIES HERE TOO =========================
 *
 * Each `review*Content` function takes ONLY its own platform's content — the
 * same enforcement-by-signature as `availabilityFor`. `reviewPostContent` is a
 * pure fan-out with no shared state and no early return, so an invalid
 * Facebook post cannot make an Instagram post invalid, and a missing Facebook
 * Page cannot reach Instagram's review at all.
 */

import type { Platform } from '../types';

import { reviewFacebookContent, type FacebookContent } from './facebook';
import { reviewGbpContent, type GbpContent } from './gbp';
import { reviewInstagramContent, type InstagramContent } from './instagram';
import type { ContentReview } from './review';

export type PlatformContent = InstagramContent | FacebookContent | GbpContent;

/**
 * What a post says on each platform it targets.
 *
 * Every key optional: a post targeting Instagram alone carries Instagram
 * content and nothing else, and must never be made to invent a Facebook
 * message it will not publish.
 */
export interface PostContent {
  instagram?: InstagramContent;
  facebook?: FacebookContent;
  google_business?: GbpContent;
}

/** Platforms this post actually has content for, in canonical order. */
export function platformsWithContent(content: PostContent): Platform[] {
  const out: Platform[] = [];
  if (content.instagram !== undefined) out.push('instagram');
  if (content.facebook !== undefined) out.push('facebook');
  if (content.google_business !== undefined) out.push('google_business');
  return out;
}

export function hasAnyContent(content: PostContent): boolean {
  return platformsWithContent(content).length > 0;
}

/**
 * One line of text to show where only one line fits — a list row, or the
 * shared `Post.body` that Home and other features consume.
 *
 * Takes the FIRST targeted platform's own text rather than a merged or
 * synthesised summary. Three platforms genuinely say different things, and
 * inventing a fourth wording that no platform will publish would put words in
 * the owner's mouth. Empty string for a post with no content yet, which is what
 * the shared `Post` type expects.
 */
export function primaryText(content: PostContent): string {
  if (content.instagram !== undefined) return content.instagram.caption.body;
  if (content.facebook !== undefined) return content.facebook.message.body;
  if (content.google_business !== undefined) return content.google_business.summary.body;
  return '';
}

/**
 * Whether every targeted platform has something written. Used by the composer
 * to decide whether a post is finished, and by the Posts list to say what is
 * missing.
 */
export function missingContentFor(
  content: PostContent,
  targets: readonly Platform[],
): Platform[] {
  return targets.filter((platform) => content[platform] === undefined);
}

/**
 * Review one platform's content, judged only on itself.
 *
 * Note the parameter: a single platform's content object. As with
 * `availabilityFor`, there is no other platform in scope, so a cross-platform
 * rule is not something a reviewer has to catch — it does not compile.
 */
export function reviewPlatformContent(content: PlatformContent): ContentReview {
  switch (content.platform) {
    case 'instagram':
      return reviewInstagramContent(content);
    case 'facebook':
      return reviewFacebookContent(content);
    case 'google_business':
      return reviewGbpContent(content);
  }
}

/**
 * Every targeted platform's review, each computed from its own content.
 *
 * A pure fan-out. No accumulator, no ordering, no early return — one
 * platform's blocking issue leaves every other platform's review untouched.
 */
export function reviewPostContent(content: PostContent): Partial<Record<Platform, ContentReview>> {
  const out: Partial<Record<Platform, ContentReview>> = {};
  if (content.instagram !== undefined) out.instagram = reviewInstagramContent(content.instagram);
  if (content.facebook !== undefined) out.facebook = reviewFacebookContent(content.facebook);
  if (content.google_business !== undefined) {
    out.google_business = reviewGbpContent(content.google_business);
  }
  return out;
}

/**
 * Platforms whose content is ready to publish.
 *
 * The counterpart to `availablePlatforms()`: that one answers "can Shoogle
 * reach this platform", this one answers "is there something valid to send".
 * A post publishes to the platforms that satisfy BOTH, and a platform failing
 * either check takes no other platform down with it.
 */
export function publishablePlatforms(content: PostContent): Platform[] {
  const reviews = reviewPostContent(content);
  return platformsWithContent(content).filter((platform) => reviews[platform]?.ok === true);
}

export {
  facebookContent,
  facebookMedia,
  reviewFacebookContent,
  type FacebookContent,
  type FacebookFormat,
} from './facebook';

export {
  GBP_CTA_TYPES,
  gbpContent,
  reviewGbpContent,
  type GbpAlertType,
  type GbpCallToAction,
  type GbpContent,
  type GbpCtaType,
  type GbpEvent,
  type GbpOffer,
  type GbpTopic,
} from './gbp';

export {
  instagramAltText,
  instagramContent,
  instagramMedia,
  reviewInstagramContent,
  type InstagramCarouselItem,
  type InstagramContent,
  type InstagramFormat,
} from './instagram';

export { type ContentIssue, type ContentReview } from './review';
