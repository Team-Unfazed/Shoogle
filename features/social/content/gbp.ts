/**
 * Google Business Profile local post content. Owner: Yash.
 *
 * =================== WHAT MAKES THIS A GOOGLE POST ==========================
 *
 * GBP is the least like the other two, and the type says so:
 *
 *   - A local post has a TOPIC TYPE, and the topic decides which other fields
 *     exist. `EVENT` requires an event; `OFFER` requires an event AND carries
 *     coupon fields; `ALERT` carries an alert type. Neither Meta platform has
 *     anything of the kind, and a discriminated union is the only shape that
 *     makes "an OFFER without an event" impossible to write.
 *   - A local post has a CALL TO ACTION from a fixed set of six. Every one of
 *     them takes a URL except `CALL`, which takes none — so the URL cannot be
 *     a plain optional string.
 *   - `sourceUrl` is the ONLY supported media field. There is no binary upload
 *     path for a local post, unlike Facebook.
 *   - Google documents no `summary` character limit, so Shoogle enforces none.
 *   - There are no hashtags. None are modelled.
 *
 * See `docs/research/google-business-profile.md` §6.
 */

import { checkMediaAgainstSpec } from '../mediaSpecs';
import { checkCaptionLength, checkMediaFormat } from '../platforms';
import type { Caption, MediaAsset } from '../types';

import type { ContentIssue, ContentReview } from './review';
import { reviewFrom } from './review';

/* -------------------------------------------------------------------------- */
/* Topic                                                                      */
/* -------------------------------------------------------------------------- */

/** A local post's event window. Required by both EVENT and OFFER. */
export interface GbpEvent {
  title: string;
  /** ISO instant. Google's schema carries a date/time range. */
  startsAt: string;
  /** ISO instant, or null for an event with no stated end. */
  endsAt: string | null;
}

/** OFFER-only fields. All optional per Google; none invented by Shoogle. */
export interface GbpOffer {
  couponCode: string | null;
  redeemOnlineUrl: string | null;
  termsConditions: string | null;
}

export type GbpAlertType = 'COVID_19';

/**
 * `LocalPostTopicType`, as a union that carries each topic's own fields.
 *
 * `LOCAL_POST_TOPIC_TYPE_UNSPECIFIED` is deliberately absent: it is Google's
 * "not specified" placeholder, and a post Shoogle is about to publish always
 * has a topic. Modelling it would be modelling a state this feature cannot be
 * in.
 */
export type GbpTopic =
  | { readonly kind: 'STANDARD' }
  | { readonly kind: 'EVENT'; readonly event: GbpEvent }
  | { readonly kind: 'OFFER'; readonly event: GbpEvent; readonly offer: GbpOffer }
  | { readonly kind: 'ALERT'; readonly alertType: GbpAlertType };

/* -------------------------------------------------------------------------- */
/* Call to action                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The six documented CTAs. `GET_OFFER` is absent because Google discontinued
 * it in Q2 2021 — see the research report's change-log citation.
 */
export const GBP_CTA_TYPES = ['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'] as const;
export type GbpCtaType = (typeof GBP_CTA_TYPES)[number];

/**
 * `CALL` uses the location's own phone number and takes no URL; every other
 * CTA needs somewhere to send the customer. Expressed as a union so a
 * `LEARN_MORE` with no destination cannot be constructed.
 */
export type GbpCallToAction =
  | { readonly type: 'CALL' }
  | { readonly type: Exclude<GbpCtaType, 'CALL'>; readonly url: string };

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

export interface GbpContent {
  readonly platform: 'google_business';
  /** Google's own word for the text is `summary`. */
  readonly summary: Caption;
  readonly topic: GbpTopic;
  readonly callToAction: GbpCallToAction | null;
  /**
   * Media, published by `sourceUrl` only. A local post has no binary upload
   * path, so every asset here must resolve to a publicly fetchable URL before
   * publication — the same constraint Instagram has and Facebook does not.
   */
  readonly media: readonly MediaAsset[];
}

export function gbpContent(
  summary: Caption,
  topic: GbpTopic,
  options: { callToAction?: GbpCallToAction | null; media?: readonly MediaAsset[] } = {},
): GbpContent {
  return {
    platform: 'google_business',
    summary,
    topic,
    callToAction: options.callToAction ?? null,
    media: options.media ?? [],
  };
}

/* -------------------------------------------------------------------------- */
/* Review                                                                     */
/* -------------------------------------------------------------------------- */

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

export function reviewGbpContent(content: GbpContent): ContentReview {
  const issues: ContentIssue[] = [];
  const unchecked: string[] = [];

  const rendered = content.summary.body.trim();
  if (rendered === '') {
    issues.push({
      platform: 'google_business',
      code: 'summary_empty',
      message: 'This Google post has nothing to say yet.',
      blocking: true,
    });
  }

  /*
   * Google documents no character limit for `summary`, so this always answers
   * `unverified` and Shoogle never truncates. An over-long post is rejected by
   * Google with Google's own message, which is more useful to the owner than a
   * limit Shoogle guessed.
   */
  const lengthCheck = checkCaptionLength('google_business', rendered.length);
  if (lengthCheck.outcome === 'violation') {
    issues.push({ platform: 'google_business', code: 'summary_too_long', message: lengthCheck.message, blocking: true });
  } else if (lengthCheck.outcome === 'unverified') {
    unchecked.push(lengthCheck.message);
  }

  /* -- Topic-specific structure ------------------------------------------ */
  if (content.topic.kind === 'EVENT' || content.topic.kind === 'OFFER') {
    const { event } = content.topic;
    if (event.title.trim() === '') {
      issues.push({
        platform: 'google_business',
        code: 'event_title_missing',
        message: 'A Google event post needs a title.',
        blocking: true,
      });
    }
    if (Number.isNaN(new Date(event.startsAt).getTime())) {
      issues.push({
        platform: 'google_business',
        code: 'event_start_invalid',
        message: 'That event start time is not a valid date and time.',
        blocking: true,
      });
    }
    if (event.endsAt !== null) {
      const start = new Date(event.startsAt).getTime();
      const end = new Date(event.endsAt).getTime();
      if (Number.isNaN(end)) {
        issues.push({
          platform: 'google_business',
          code: 'event_end_invalid',
          message: 'That event end time is not a valid date and time.',
          blocking: true,
        });
      } else if (!Number.isNaN(start) && end < start) {
        issues.push({
          platform: 'google_business',
          code: 'event_ends_before_start',
          message: 'This event ends before it starts.',
          blocking: true,
        });
      }
    }
  }

  if (content.topic.kind === 'OFFER') {
    const { offer } = content.topic;
    if (offer.redeemOnlineUrl !== null && !looksLikeUrl(offer.redeemOnlineUrl)) {
      issues.push({
        platform: 'google_business',
        code: 'offer_url_invalid',
        message: 'That redemption link does not look like a web address.',
        blocking: true,
      });
    }
  }

  /* -- Call to action ---------------------------------------------------- */
  if (content.callToAction !== null && content.callToAction.type !== 'CALL') {
    if (!looksLikeUrl(content.callToAction.url)) {
      issues.push({
        platform: 'google_business',
        code: 'cta_url_invalid',
        message: 'That button link does not look like a web address.',
        blocking: true,
      });
    }
  }

  /* -- Media ------------------------------------------------------------- */
  for (const asset of content.media) {
    const formatCheck = checkMediaFormat('google_business', asset.format);
    if (formatCheck.outcome === 'violation') {
      issues.push({ platform: 'google_business', code: 'media_format', message: formatCheck.message, blocking: true });
    } else if (formatCheck.outcome === 'unverified') {
      unchecked.push(formatCheck.message);
    }

    for (const result of checkMediaAgainstSpec('google_business', asset)) {
      if (result.outcome === 'violation') {
        issues.push({ platform: 'google_business', code: 'media_spec', message: result.message, blocking: true });
      } else if (result.outcome === 'unverified') {
        unchecked.push(result.message);
      }
    }
  }

  return reviewFrom(issues, unchecked);
}
