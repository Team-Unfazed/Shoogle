/**
 * Area E — Photos & media. Weight 9 (3+4+2).
 * docs/research/local-seo-methodology.md §2 area E.
 *
 * Falsifiability rule enforced in the copy: `media.list` returns only what the
 * OWNER uploaded. A listing full of customer photos can fail E2 and still look
 * fine to a searcher, so every sentence here says "photos you've added" and
 * never "photos on your listing".
 *
 * Note also what is NOT here: photo VIEWS and photo COUNTS from the Performance
 * API were removed by Google on 2023-02-20 with no replacement (matrix §7c).
 * There is no check for them, and there never will be — they are
 * `not_supported` forever, not "coming soon".
 */

import type { CheckDefinition, MediaCategory } from '../types';

import {
  daysBetween,
  fail,
  need,
  newestTimestamp,
  notApplicable,
  notChecked,
  pass,
  warn,
} from './helpers';

/** The four things a searcher wants to see, and which media categories satisfy each. */
const PHOTO_BUCKETS: { label: string; categories: MediaCategory[] }[] = [
  { label: 'the front of your shop', categories: ['EXTERIOR', 'COVER'] },
  { label: 'inside', categories: ['INTERIOR', 'COMMON_AREA'] },
  { label: 'your team', categories: ['TEAMS', 'AT_WORK'] },
  { label: 'your work or products', categories: ['PRODUCT', 'FOOD_AND_DRINK', 'MENU'] },
];

const GOOD_PHOTO_COUNT = 8;

/** Uploading photos is possible, but no contract method performs it yet. */
const CAP_MEDIA_UPLOAD = {
  apiSupportsWrite: true,
  providerMethod: null,
  matrixNote:
    'docs/research/google-business-profile.md §8: accounts.locations.media create (v4) uploads ' +
    'photos, but contracts.ts declares no media method. Blocker recorded for Sunny.',
} as const;

/** E1 — a cover photo. Weight 3. */
const E1: CheckDefinition = {
  id: 'E1',
  area: 'media',
  weight: 3,
  scored: true,
  name: 'Cover photo exists',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_MEDIA_UPLOAD,
  sources: ['gbp.legacy'],
  needs: ['media'],
  leadingIndicator: 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH over 28 days.',
  failureCheck:
    'media.list excludes customer photos. If the listing visibly has a cover image chosen by Google ' +
    'from a customer upload, this finding is misleading and must be reworded.',
  evaluate(ctx) {
    const got = need(ctx, 'media');
    if (!got.ok) return got.evaluation;
    const { media } = got.data;

    const hasCover = media.ownerUploaded.some(
      (m) => m.category === 'COVER' || m.category === 'PROFILE',
    );
    if (hasCover) return pass();

    return fail({
      title: "You haven't added a cover photo",
      detail:
        'The cover photo is the first thing anyone sees, and a listing without one reads as closed ' +
        'or abandoned. One clear photo of your shopfront is enough.',
      observation: 'No owner-uploaded media item has category COVER or PROFILE.',
      evidence: [`Photos you have added: ${media.ownerUploaded.length}`, 'Cover or profile photo: none'],
    });
  },
};

/** E2 — enough photos, and the right kinds. Weight 4. */
const E2: CheckDefinition = {
  id: 'E2',
  area: 'media',
  weight: 4,
  scored: true,
  name: 'Enough photos, right mix',
  severity: 'important',
  confidence: 'inferred',
  intendedFixMode: 'assisted',
  capability: CAP_MEDIA_UPLOAD,
  sources: ['gbp.legacy'],
  needs: ['media'],
  leadingIndicator: 'BUSINESS_IMPRESSIONS_MOBILE_MAPS over 28 days.',
  failureCheck:
    'Photo counts here exclude customer uploads, so a photo-rich listing can fail this. Never say ' +
    '"photos on your listing".',
  evaluate(ctx) {
    const got = need(ctx, 'media');
    if (!got.ok) return got.evaluation;
    const { media } = got.data;

    const total = media.ownerUploaded.length;
    const missingBuckets = PHOTO_BUCKETS.filter(
      (b) => !media.ownerUploaded.some((m) => b.categories.includes(m.category)),
    ).map((b) => b.label);
    const covered = PHOTO_BUCKETS.length - missingBuckets.length;

    if (total === 0) {
      // A measured zero: we asked Google for your photos and it returned none.
      return fail({
        title: "You haven't added any photos",
        detail:
          'Listings with a shopfront photo, a few shots from inside, and pictures of your work get ' +
          'looked at far longer than ones without. We will show you where to add them from your phone.',
        observation: 'media.list returned 0 owner-uploaded items.',
        evidence: ['Photos you have added: 0'],
      });
    }

    if (total >= GOOD_PHOTO_COUNT && covered >= 3) return pass();

    const ratio = Math.min(
      0.9,
      0.5 * (covered / PHOTO_BUCKETS.length) + 0.5 * Math.min(1, total / GOOD_PHOTO_COUNT),
    );
    return warn(Math.max(0.05, ratio), {
      title: `You have added ${total} ${total === 1 ? 'photo' : 'photos'}`,
      detail:
        missingBuckets.length > 0
          ? `You have nothing showing ${missingBuckets.join(', ')}. Those are the shots people look ` +
            'at longest before deciding. We will show you where to add them from your phone.'
          : 'A few more photos gives people more to look at before they decide. We will show you ' +
            'where to add them from your phone.',
      observation: `${total} owner-uploaded photos covering ${covered} of ${PHOTO_BUCKETS.length} kinds.`,
      evidence: [
        `Photos you have added: ${total}`,
        ...(missingBuckets.length > 0 ? [`Nothing showing: ${missingBuckets.join(', ')}`] : []),
      ],
    });
  },
};

/** E3 — is anything recent? Weight 2, minor. */
const E3: CheckDefinition = {
  id: 'E3',
  area: 'media',
  weight: 2,
  scored: true,
  name: 'Photos are recent',
  severity: 'minor',
  confidence: 'inferred',
  intendedFixMode: 'assisted',
  capability: CAP_MEDIA_UPLOAD,
  sources: ['gbp.legacy'],
  needs: ['media'],
  leadingIndicator: 'BUSINESS_IMPRESSIONS_MOBILE_MAPS over 28 days.',
  failureCheck: 'A business that genuinely has not changed in a year is not doing anything wrong.',
  evaluate(ctx) {
    const got = need(ctx, 'media');
    if (!got.ok) return got.evaluation;
    const { media } = got.data;

    if (media.ownerUploaded.length === 0) {
      return notApplicable('You have not added any photos yet, so there is no age to check.');
    }

    const newest = newestTimestamp(media.ownerUploaded.map((m) => m.createTime));
    if (newest === null) {
      return notApplicable('None of your photos carry a usable date.');
    }

    const ageDays = daysBetween(newest, ctx.now);
    if (ageDays === null) {
      // A photo whose date we cannot read is not a recent photo.
      return notChecked('provider_error', 'Your newest photo has a date we could not read.');
    }
    const evidence = [`Newest photo you added: ${newest.slice(0, 10)}`, `That is ${ageDays} days ago`];
    if (ageDays <= 90) return pass();
    if (ageDays <= 365) {
      return warn(0.5, {
        title: `Your newest photo is ${ageDays} days old`,
        detail:
          'A fresh photo this month tells people you are open and busy. One picture from your phone ' +
          'is enough.',
        observation: `Newest owner-uploaded media is ${ageDays} days old.`,
        evidence,
      });
    }
    return fail({
      title: `You have not added a photo in over a year`,
      detail:
        'A listing whose newest picture is a year old reads as a shop that may have closed. One ' +
        'photo from your phone this week fixes that.',
      observation: `Newest owner-uploaded media is ${ageDays} days old.`,
      evidence,
    });
  },
};

export const AREA_E_CHECKS: CheckDefinition[] = [E1, E2, E3];
