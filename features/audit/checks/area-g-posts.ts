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
 * That is exactly why `CAP_GOOGLE_POST` below carries `providerMethod: null`:
 * the API write exists, the authoring surface is somebody else's, and no
 * handoff has been agreed. Both checks therefore degrade to `guided` and their
 * copy tells the owner what THEY do, with no promise of a post Shoogle writes
 * or schedules.
 */

import type { CheckDefinition, FixCapability } from '../types';

import {
  daysBetween,
  fail,
  need,
  newestTimestamp,
  notApplicable,
  pass,
  warn,
} from './helpers';

/**
 * The Business Information / legacy v4 API really does create local posts
 * (matrix §6, STANDARD/EVENT/OFFER/ALERT). Shoogle still cannot offer a one-tap
 * fix from here: the composer for the `google_business` target belongs to
 * SocialPublisher and there is no agreed handoff from the audit into it.
 * `providerMethod: null` is what makes `resolveFixMode` degrade G1/G2 to
 * `guided`, and the copy below has to match that.
 */
const CAP_GOOGLE_POST: FixCapability = {
  apiSupportsWrite: true,
  providerMethod: null,
  matrixNote:
    'docs/research/google-business-profile.md §6: accounts.locations.localPosts create exists, ' +
    "but the Google post authoring surface is SocialPublisher's google_business target, owned " +
    'outside features/audit with no agreed handoff. Guided until there is one.',
};

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
  capability: CAP_GOOGLE_POST,
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
          "week's work. Posting is done from the Google Business Profile app, and we will show " +
          'you where to tap.',
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
          'A post keeps your listing looking alive. Putting up one short post in the Google ' +
          'Business Profile app takes a couple of minutes — we will show you where to tap.',
        observation: `Newest local post is ${ageDays} days old.`,
        evidence,
      });
    }
    return fail({
      title: `You haven't posted to Google in ${ageDays} days`,
      detail:
        'A listing with nothing new on it for months reads as a shop that has gone quiet. One ' +
        'short post in the Google Business Profile app changes that — we will show you where to tap.',
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
  capability: CAP_GOOGLE_POST,
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
        'The Google Business Profile app lets you add one while you write the post, and we will ' +
        'show you where to tap.',
      observation: `${recent.length} posts in the last ${CADENCE_WINDOW_DAYS} days, ${withCta} with a call to action.`,
      evidence: [
        `Posts in the last three months: ${recent.length}`,
        `Of those, with a button: ${withCta}`,
      ],
    });
  },
};

export const AREA_G_CHECKS: CheckDefinition[] = [G1, G2];
