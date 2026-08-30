/**
 * Area G — Posts & freshness. Weight 7 (5+2).
 * docs/research/local-seo-methodology.md §2 area G.
 *
 * Falsifiability, stated plainly because it changes what we are allowed to
 * claim: posting has never been shown to move local ranking. G1's claim is about
 * how the listing LOOKS, and its leading indicator is impressions plus calls
 * over 28 days. If four weeks of weekly posts move neither, we stop recommending
 * weekly posting to that business and say so.
 *
 * Post VIEWS and post CTA CLICKS were removed from the API on 2023-02-20 with no
 * replacement (matrix §7c). There is no check for them and there never will be.
 *
 * These checks only ever produce a FINDING. Composing or scheduling the post
 * itself belongs to Yash's SocialPublisher, which already targets
 * 'google_business' — two scheduling surfaces would be two sources of truth.
 */

import type { CheckDefinition } from '../types';

import {
  CAP_LOCAL_POST,
  daysBetween,
  fail,
  need,
  newestTimestamp,
  notApplicable,
  pass,
  warn,
} from './helpers';

const STALE_POST_DAYS = 30;
const CADENCE_WINDOW_DAYS = 90;
const GOOD_CADENCE_POSTS = 12;

/** G1 — has anything been posted recently? Weight 5. */
const G1: CheckDefinition = {
  id: 'G1',
  area: 'posts',
  weight: 5,
  scored: true,
  name: 'Recent Google post',
  severity: 'important',
  confidence: 'inferred',
  intendedFixMode: 'assisted',
  capability: CAP_LOCAL_POST,
  sources: ['gbp.legacy', 'gbp.info'],
  needs: ['location', 'localPosts'],
  leadingIndicator: 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH + CALL_CLICKS over 28 days.',
  failureCheck:
    'If four weeks of weekly posts move neither impressions nor calls, stop recommending weekly ' +
    'posting to this business and record that.',
  evaluate(ctx) {
    const got = need(ctx, 'location', 'localPosts');
    if (!got.ok) return got.evaluation;
    const { location, localPosts } = got.data;

    if (!location.metadata.canOperateLocalPost) {
      return notApplicable('Google does not allow posts on this listing.');
    }

    if (localPosts.items.length === 0) {
      return fail({
        title: "You've never posted to Google",
        detail:
          'A post keeps your listing looking alive — an offer, a new service, a photo of this ' +
          "week's work. Shoogle can write one and schedule it for you every week.",
        observation: 'localPosts returned 0 posts (a successful call, empty result).',
        evidence: ['Google posts: 0'],
      });
    }

    const newest = newestTimestamp(localPosts.items.map((p) => p.createTime));
    if (newest === null) {
      return notApplicable('None of your posts carry a usable date.');
    }
    const ageDays = daysBetween(newest, ctx.now);
    if (ageDays <= STALE_POST_DAYS) return pass();

    const evidence = [`Last post: ${newest.slice(0, 10)}`, `That is ${ageDays} days ago`];
    if (ageDays <= 90) {
      return warn(0.5, {
        title: `You haven't posted to Google in ${ageDays} days`,
        detail:
          'A post keeps your listing looking alive. Shoogle can write and schedule one a week for ' +
          'you — you approve them in a batch.',
        observation: `Newest local post is ${ageDays} days old.`,
        evidence,
      });
    }
    return fail({
      title: `You haven't posted to Google in ${ageDays} days`,
      detail:
        'A listing with nothing new on it for months reads as a shop that has gone quiet. Shoogle ' +
        'can write and schedule one post a week for you.',
      observation: `Newest local post is ${ageDays} days old.`,
      evidence,
    });
  },
};

/** G2 — cadence and whether posts give people something to do. Weight 2, minor. */
const G2: CheckDefinition = {
  id: 'G2',
  area: 'posts',
  weight: 2,
  scored: true,
  name: 'Cadence & call-to-action',
  severity: 'minor',
  confidence: 'inferred',
  intendedFixMode: 'assisted',
  capability: CAP_LOCAL_POST,
  sources: ['gbp.legacy'],
  needs: ['location', 'localPosts'],
  leadingIndicator: 'CALL_CLICKS and WEBSITE_CLICKS over 28 days.',
  failureCheck: 'Post-level click data no longer exists in the API, so we can never prove a CTA worked.',
  evaluate(ctx) {
    const got = need(ctx, 'location', 'localPosts');
    if (!got.ok) return got.evaluation;
    const { location, localPosts } = got.data;

    if (!location.metadata.canOperateLocalPost) {
      return notApplicable('Google does not allow posts on this listing.');
    }

    const recent = localPosts.items.filter(
      (p) => daysBetween(p.createTime, ctx.now) <= CADENCE_WINDOW_DAYS,
    );
    if (recent.length === 0) {
      return notApplicable('There are no posts from the last three months to judge.');
    }

    const withCta = recent.filter((p) => p.hasCallToAction).length;
    const cadenceOk = recent.length >= GOOD_CADENCE_POSTS;
    const ctaOk = withCta / recent.length >= 0.5;
    if (cadenceOk && ctaOk) return pass();

    const problems: string[] = [];
    if (!cadenceOk) problems.push(`only ${recent.length} in three months`);
    if (!ctaOk) problems.push(withCta === 0 ? 'none of them had a button' : `only ${withCta} had a button`);

    const ratio = Math.min(
      0.9,
      0.5 * Math.min(1, recent.length / GOOD_CADENCE_POSTS) + 0.5 * (withCta / recent.length),
    );
    return warn(Math.max(0.05, ratio), {
      title: `Your Google posts: ${problems.join(', and ')}`,
      detail:
        'An offer, a price, or a "Call now" button gives people something to do after they read it. ' +
        'Shoogle can add one to each post before it goes out.',
      observation: `${recent.length} posts in the last ${CADENCE_WINDOW_DAYS} days, ${withCta} with a call to action.`,
      evidence: [
        `Posts in the last three months: ${recent.length}`,
        `Of those, with a button: ${withCta}`,
      ],
    });
  },
};

export const AREA_G_CHECKS: CheckDefinition[] = [G1, G2];
