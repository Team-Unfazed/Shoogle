/**
 * Area F — Reviews & replies. Weight 18 (4+3+5+4+2), joint-heaviest area.
 * docs/research/local-seo-methodology.md §2 area F.
 *
 * Two rules from the research are enforced in code here, not in review:
 *
 * 1. `ready({ items: [] })` is a MEASURED ZERO and fails F1 with "you have no
 *    reviews yet". `unavailable(...)` is an UNKNOWN and makes F1 `not_checked`
 *    with no finding at all. Those are different sentences for different facts.
 *
 * 2. F3 and F4 assume the `reply` field reflects replies posted outside Shoogle.
 *    Until that has been confirmed for this account (`replyFieldTrusted`), both
 *    return `not_checked` — nagging an owner who already replied is worse than
 *    saying "we could not check this".
 *
 * Hard rule, stated once: Shoogle must never build, suggest or tolerate review
 * gating (pre-screening customers before sending them to Google). It is
 * prohibited by Google's fake-engagement policy. Any review-request flow implied
 * by F1/F5 sends the same link to everyone.
 */

import type { GbpReview } from '@/lib/providers/contracts';

import type { CheckDefinition } from '../types';
import { plural } from '../copy';

import {
  CAP_NO_API_WRITE,
  CAP_REVIEW_REPLY,
  daysBetween,
  fail,
  need,
  newestTimestamp,
  notChecked,
  pass,
  warn,
} from './helpers';

/** Practitioner heuristic (§1.3), not a Google fact: ~10 reviews reads as credible. */
const REVIEW_CREDIBILITY_FLOOR = 10;
/** Below this, a mean star rating is noise rather than a signal. */
const RATING_MIN_SAMPLE = 5;

const CAP_ASK_FOR_REVIEWS = CAP_NO_API_WRITE(
  '§14: no API creates, solicits or deletes reviews. Shoogle can only help the owner ask.',
);

const meanRating = (items: readonly GbpReview[]): number =>
  items.reduce((sum, r) => sum + r.starRating, 0) / items.length;

/** F1 — are there any reviews? Weight 4. */
const F1: CheckDefinition = {
  id: 'F1',
  area: 'reviews',
  weight: 4,
  scored: true,
  name: 'Has reviews',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'guided',
  capability: CAP_ASK_FOR_REVIEWS,
  sources: ['gbp.legacy'],
  needs: ['reviews'],
  leadingIndicator: 'Review count 28 days after the review link goes out.',
  failureCheck:
    'If the listing shows reviews publicly that reviews.list does not return, our read is wrong and ' +
    'this must not be raised.',
  evaluate(ctx) {
    const got = need(ctx, 'reviews');
    if (!got.ok) return got.evaluation;
    const { reviews } = got.data;
    const count = reviews.items.length;

    if (count === 0) {
      return fail({
        title: 'You have no Google reviews yet',
        detail:
          'This is the biggest single thing standing between you and the customer choosing the shop ' +
          'next door. Google gives your listing a short review link — we will show you where to ' +
          'find it. Send the same link to every customer after their visit, happy or not.',
        observation: 'reviews.list returned 0 reviews (a successful call, empty result).',
        evidence: ['Reviews on Google: 0'],
      });
    }

    if (count < REVIEW_CREDIBILITY_FLOOR) {
      return warn(count / REVIEW_CREDIBILITY_FLOOR, {
        title: `You have ${plural(count, 'review', 'reviews')}`,
        detail:
          'Around ten is where people start trusting a rating instead of scrolling past it. Google ' +
          'gives your listing a short review link, and we will show you where to find it.',
        observation: `reviews.list returned ${count} reviews.`,
        evidence: [`Reviews on Google: ${count}`],
        confidence: 'inferred',
      });
    }
    return pass();
  },
};

/** F2 — the rating itself. Weight 3. */
const F2: CheckDefinition = {
  id: 'F2',
  area: 'reviews',
  weight: 3,
  scored: true,
  name: 'Rating',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'guided',
  capability: CAP_ASK_FOR_REVIEWS,
  sources: ['gbp.legacy'],
  needs: ['reviews'],
  leadingIndicator: 'Mean rating of reviews received in the next 28 days.',
  failureCheck: 'A mean over a handful of reviews swings wildly; below five it is suppressed entirely.',
  evaluate(ctx) {
    const got = need(ctx, 'reviews');
    if (!got.ok) return got.evaluation;
    const { reviews } = got.data;

    if (reviews.items.length < RATING_MIN_SAMPLE) {
      // Not a pass and not a fail: with four reviews an average is not a fact.
      return notChecked(
        'insufficient_data',
        `A star average needs at least ${RATING_MIN_SAMPLE} reviews before it means anything. You have ${reviews.items.length}.`,
      );
    }

    const mean = meanRating(reviews.items);
    const shown = mean.toFixed(1);
    const evidence = [`Your rating: ${shown}`, `Based on ${reviews.items.length} reviews`];

    if (mean >= 4.5) return pass();
    if (mean >= 4.0) {
      return warn(0.5, {
        title: `Your rating is ${shown}`,
        detail:
          'Getting a few recent happy customers to leave a review moves this faster than anything ' +
          'else. We will show you where to find your review link so you can send it after a visit.',
        observation: `Mean starRating is ${shown} over ${reviews.items.length} reviews.`,
        evidence,
        confidence: 'inferred',
      });
    }
    return fail({
      title: `Your rating is ${shown}`,
      detail:
        'Below four stars, most people scroll past without opening your listing. Replying to the ' +
        'unhappy reviews and asking recent happy customers for one is what moves it.',
      observation: `Mean starRating is ${shown} over ${reviews.items.length} reviews.`,
      evidence,
    });
  },
};

/** F3 — reply rate. Weight 5, and Shoogle can actually do this one. */
const F3: CheckDefinition = {
  id: 'F3',
  area: 'reviews',
  weight: 5,
  scored: true,
  name: 'Reply rate',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_REVIEW_REPLY,
  sources: ['gbp.legacy'],
  needs: ['reviews'],
  leadingIndicator: 'Reply rate 28 days after the drafts are approved.',
  failureCheck:
    'If replies posted outside Shoogle do not come back on the review resource, this check nags an ' +
    'owner who has already replied. replyFieldTrusted gates it.',
  evaluate(ctx) {
    const got = need(ctx, 'reviews');
    if (!got.ok) return got.evaluation;
    const { reviews } = got.data;

    if (!reviews.replyFieldTrusted) {
      return notChecked(
        'insufficient_data',
        'We have not yet confirmed that Google shows us replies you posted outside Shoogle, so we ' +
          'will not guess at your reply rate.',
      );
    }
    if (reviews.items.length === 0) {
      return notChecked('no_data_yet', 'There are no reviews to reply to yet.');
    }

    const total = reviews.items.length;
    const replied = reviews.items.filter((r) => r.reply !== null).length;
    const rate = replied / total;
    const evidence = [`Replied: ${replied}`, `Total reviews: ${total}`];

    if (rate >= 0.9) return pass();

    const draft = {
      title: `You have replied to ${replied} of ${total} reviews`,
      detail:
        'A reply under a review is read by the next customer, not just the one who wrote it. ' +
        'Shoogle can draft a reply to each one in your voice — you read it and approve before ' +
        'anything is posted.',
      observation: `${replied}/${total} reviews have a reply.`,
      evidence,
    };
    return rate >= 0.5 ? warn(rate, draft) : fail(draft);
  },
};

/** F4 — unanswered 1 and 2 star reviews. Weight 4, critical. */
const F4: CheckDefinition = {
  id: 'F4',
  area: 'reviews',
  weight: 4,
  scored: true,
  name: 'Negative reviews unanswered',
  severity: 'critical',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_REVIEW_REPLY,
  sources: ['gbp.legacy'],
  needs: ['reviews'],
  leadingIndicator: 'Unanswered negative count, 7 days after the drafts are approved.',
  failureCheck:
    'Same as F3: if externally posted replies are invisible to us, we would be accusing an owner who ' +
    'has already replied.',
  evaluate(ctx) {
    const got = need(ctx, 'reviews');
    if (!got.ok) return got.evaluation;
    const { reviews } = got.data;

    if (!reviews.replyFieldTrusted) {
      return notChecked(
        'insufficient_data',
        'We have not yet confirmed that Google shows us replies you posted outside Shoogle.',
      );
    }

    const negative = reviews.items.filter((r) => r.starRating <= 2);
    if (negative.length === 0) return pass();

    const unanswered = negative.filter((r) => r.reply === null);
    if (unanswered.length === 0) return pass();

    const oldest = unanswered.reduce((a, b) => (a.createTime < b.createTime ? a : b));
    return fail({
      title: `${plural(unanswered.length, 'unhappy review has', 'unhappy reviews have')} no reply`,
      detail:
        'An unanswered complaint is the first thing a new customer reads. A calm, short reply ' +
        'changes how it lands. We will draft one for each — you approve before anything is posted.',
      observation: `${unanswered.length} of ${negative.length} reviews rated 1-2 stars have reply === null.`,
      evidence: [
        `Unanswered 1-2 star reviews: ${unanswered.length}`,
        `Oldest of them: ${oldest.createTime.slice(0, 10)}`,
        `Total reviews: ${reviews.items.length}`,
      ],
    });
  },
};

/** F5 — review recency. Weight 2, minor, inferred. */
const F5: CheckDefinition = {
  id: 'F5',
  area: 'reviews',
  weight: 2,
  scored: true,
  name: 'Review recency',
  severity: 'minor',
  confidence: 'inferred',
  intendedFixMode: 'guided',
  capability: CAP_ASK_FOR_REVIEWS,
  sources: ['gbp.legacy'],
  needs: ['reviews'],
  leadingIndicator: 'Days since newest review, 28 days after the review link goes out.',
  failureCheck:
    'The "18-day rule" is a practitioner heuristic, not a Google statement. Never tell the owner ' +
    'Google will demote them — only that no review has arrived recently.',
  evaluate(ctx) {
    const got = need(ctx, 'reviews');
    if (!got.ok) return got.evaluation;
    const { reviews } = got.data;

    if (reviews.items.length === 0) {
      // F1 already says the useful thing. Repeating it here is noise.
      return notChecked('no_data_yet', 'There are no reviews yet, so there is no recency to measure.');
    }

    const newest = newestTimestamp(reviews.items.map((r) => r.createTime));
    if (newest === null) {
      return notChecked('insufficient_data', 'None of your reviews carry a usable date.');
    }

    const ageDays = daysBetween(newest, ctx.now);
    if (ageDays === null) {
      return notChecked('provider_error', 'Your newest review has a date we could not read.');
    }
    const evidence = [`Newest review: ${newest.slice(0, 10)}`, `That is ${ageDays} days ago`];
    if (ageDays <= 21) return pass();
    if (ageDays <= 90) {
      return warn(0.5, {
        title: `Your last review was ${ageDays} days ago`,
        detail:
          'A steady trickle matters more than a big pile. We will show you where to find your ' +
          'review link. Send the same one to every customer, happy or not.',
        observation: `Newest review is ${ageDays} days old.`,
        evidence,
      });
    }
    return fail({
      title: `Your last review was ${ageDays} days ago`,
      detail:
        'Nothing new in three months makes a listing look quiet even when the shop is busy. We will ' +
        'show you where to find your review link so you can send it after each visit.',
      observation: `Newest review is ${ageDays} days old.`,
      evidence,
    });
  },
};

export const AREA_F_CHECKS: CheckDefinition[] = [F1, F2, F3, F4, F5];
