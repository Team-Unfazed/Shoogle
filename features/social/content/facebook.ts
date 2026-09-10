/**
 * Facebook Page post content. Owner: Yash.
 *
 * ================ WHAT MAKES THIS A FACEBOOK POST ===========================
 *
 * Every difference below is structural, not cosmetic. Facebook is the platform
 * this codebase was most at risk of modelling as "Instagram with another
 * label", and it is not:
 *
 *   - `text` is a REAL FORMAT. A Facebook Page post can be words alone.
 *     Instagram publishes nothing without media, and its type has no such
 *     member. This is the single clearest reason the two cannot share a model.
 *   - `link` is a first-class field (`POST /{page-id}/feed` takes `link`).
 *     Instagram captions carry no link at all.
 *   - There is NO hashtag limit and no hashtag concept in the API. Hashtags
 *     travel inside the message text like any other words; Meta documents no
 *     count, so Shoogle enforces none rather than borrowing Instagram's 30.
 *   - There is NO documented message length, so Shoogle imposes none and lets
 *     Facebook reject with its own error.
 *   - PNG is accepted, and the media specs are looser (10 MB, no aspect rule,
 *     Facebook resizes server-side).
 *
 * See `docs/research/meta-facebook-pages.md` §1-§3.
 */

import { checkMediaAgainstSpec } from '../mediaSpecs';
import { checkCaptionLength, checkMediaFormat } from '../platforms';
import type { Caption, MediaAsset } from '../types';

import type { ContentIssue, ContentReview } from './review';
import { reviewFrom } from './review';

/* -------------------------------------------------------------------------- */
/* Format                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What the Page is being asked to publish.
 *
 * `text` and `link` reach `/{page-id}/feed`; `photo` and `multi_photo` reach
 * `/{page-id}/photos`; `video` reaches `/{page-id}/videos` on the
 * `graph-video` host. Three endpoints, so three shapes.
 */
export type FacebookFormat =
  /** Words alone. Instagram structurally cannot do this. */
  | { readonly kind: 'text' }
  | { readonly kind: 'link'; readonly url: string }
  | { readonly kind: 'photo'; readonly photo: MediaAsset }
  | { readonly kind: 'multi_photo'; readonly photos: readonly MediaAsset[] }
  | { readonly kind: 'video'; readonly video: MediaAsset };

export interface FacebookContent {
  readonly platform: 'facebook';
  /** Facebook's own word for the text is `message`, so that is what it is. */
  readonly message: Caption;
  readonly format: FacebookFormat;
}

export function facebookContent(message: Caption, format: FacebookFormat): FacebookContent {
  return { platform: 'facebook', message, format };
}

export function facebookMedia(format: FacebookFormat): MediaAsset[] {
  switch (format.kind) {
    case 'text':
    case 'link':
      return [];
    case 'photo':
      return [format.photo];
    case 'multi_photo':
      return [...format.photos];
    case 'video':
      return [format.video];
  }
}

/* -------------------------------------------------------------------------- */
/* Review                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A URL Shoogle is willing to hand to Facebook.
 *
 * Deliberately shallow: this rejects what is obviously not a link, and leaves
 * everything else to Facebook. Shoogle does not own the definition of a valid
 * URL and a stricter pattern here would reject links that work.
 */
function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

export function reviewFacebookContent(content: FacebookContent): ContentReview {
  const issues: ContentIssue[] = [];
  const unchecked: string[] = [];

  const rendered = `${content.message.body} ${content.message.hashtags.join(' ')}`.trim();

  /*
   * A Facebook post needs SOMETHING — words, a link, or media. Which of the
   * three is up to the owner, and that latitude is the point: an empty message
   * on a photo post is fine, and on a text post it is not.
   */
  const media = facebookMedia(content.format);
  const hasWords = rendered !== '';
  const hasLink = content.format.kind === 'link';
  if (!hasWords && !hasLink && media.length === 0) {
    issues.push({
      platform: 'facebook',
      code: 'post_empty',
      message: 'This Facebook post is empty. Add a message, a link or a photo.',
      blocking: true,
    });
  }
  if (content.format.kind === 'text' && !hasWords) {
    issues.push({
      platform: 'facebook',
      code: 'message_empty',
      message: 'A text-only Facebook post needs something to say.',
      blocking: true,
    });
  }

  /*
   * Message length. Facebook documents no maximum, so this reports
   * `unverified` and never a violation. Borrowing Instagram's 2200 would be
   * inventing a Facebook rule — exactly what the capability matrix exists to
   * prevent.
   */
  const lengthCheck = checkCaptionLength('facebook', rendered.length);
  if (lengthCheck.outcome === 'violation') {
    issues.push({ platform: 'facebook', code: 'message_too_long', message: lengthCheck.message, blocking: true });
  } else if (lengthCheck.outcome === 'unverified') {
    unchecked.push(lengthCheck.message);
  }

  // No hashtag check at all. Facebook documents no limit and hashtags are not
  // an API concept there — an absent check is more honest than an invented one.

  if (content.format.kind === 'link' && !looksLikeUrl(content.format.url)) {
    issues.push({
      platform: 'facebook',
      code: 'link_invalid',
      message: 'That link does not look like a web address. It should start with http:// or https://.',
      blocking: true,
    });
  }

  for (const asset of media) {
    const formatCheck = checkMediaFormat('facebook', asset.format);
    if (formatCheck.outcome === 'violation') {
      issues.push({ platform: 'facebook', code: 'media_format', message: formatCheck.message, blocking: true });
    } else if (formatCheck.outcome === 'unverified') {
      unchecked.push(formatCheck.message);
    }

    for (const result of checkMediaAgainstSpec('facebook', asset)) {
      if (result.outcome === 'violation') {
        issues.push({ platform: 'facebook', code: 'media_spec', message: result.message, blocking: true });
      } else if (result.outcome === 'unverified') {
        unchecked.push(result.message);
      }
    }
  }

  if (content.format.kind === 'multi_photo' && content.format.photos.length === 0) {
    issues.push({
      platform: 'facebook',
      code: 'photos_missing',
      message: 'This Facebook post has no photos in it yet.',
      blocking: true,
    });
  }

  return reviewFrom(issues, unchecked);
}
