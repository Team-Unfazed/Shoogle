/**
 * Per-platform media specifications. Owner: Yash.
 *
 * ================ WHY THIS IS NOT ONE SHARED SPEC ==========================
 *
 * The three platforms disagree about media more than they agree, and the
 * disagreements are not cosmetic — they decide whether a file can be published
 * at all:
 *
 *   Instagram   JPEG only. 320-1440px. 4:5 to 1.91:1. <=8MB. Public URL only.
 *   Facebook    JPEG and PNG. <=10MB. No aspect rule - Facebook resizes.
 *   GBP         Format list UNDOCUMENTED. 250px short edge, >=10KB.
 *
 * A single "image spec" would have to pick one platform's rules and be wrong
 * for the other two. So each platform gets its own, every number carries the
 * documentation URL it came from, and anything the provider does not document
 * stays `unverified()` — where the check answers `'unverified'` rather than
 * `'ok'`, because an unchecked file is not an accepted one.
 *
 * See `docs/research/meta-instagram.md` §4, `meta-facebook-pages.md` §2-§3 and
 * `google-business-profile.md` §8.
 */

import {
  isEnforceable,
  unverified,
  verified,
  type CheckResult,
  type Limit,
} from './platforms';
import { aspectRatio, PLATFORM_LABEL, type MediaAsset, type Platform } from './types';

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

const IG_MEDIA_REFERENCE =
  'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media';
const FB_PAGE_PHOTOS = 'https://developers.facebook.com/docs/graph-api/reference/page/photos/';
const GBP_MEDIA =
  'https://developers.google.com/my-business/reference/rest/v4/accounts.locations.media';

/* -------------------------------------------------------------------------- */
/* The specs                                                                  */
/* -------------------------------------------------------------------------- */

export interface ImageSpec {
  maxBytes: Limit<number>;
  minWidth: Limit<number>;
  maxWidth: Limit<number>;
  /** Minimum width/height ratio, e.g. 4:5 = 0.8. */
  minAspectRatio: Limit<number>;
  /** Maximum width/height ratio, e.g. 1.91:1 = 1.91. */
  maxAspectRatio: Limit<number>;
  /** Smallest acceptable short edge, in pixels. */
  minShortEdge: Limit<number>;
}

export interface VideoSpec {
  maxBytes: Limit<number>;
  minDurationSeconds: Limit<number>;
  maxDurationSeconds: Limit<number>;
}

export interface PlatformMediaSpec {
  platform: Platform;
  image: ImageSpec;
  video: VideoSpec;
}

function noImageSpec(): ImageSpec {
  return {
    maxBytes: unverified(),
    minWidth: unverified(),
    maxWidth: unverified(),
    minAspectRatio: unverified(),
    maxAspectRatio: unverified(),
    minShortEdge: unverified(),
  };
}

function noVideoSpec(): VideoSpec {
  return {
    maxBytes: unverified(),
    minDurationSeconds: unverified(),
    maxDurationSeconds: unverified(),
  };
}

/**
 * "8 MB" as 8 MiB, and why the ambiguity is resolved this way.
 *
 * Meta writes "8 MB maximum" without saying whether that is 8,000,000 or
 * 8,388,608 bytes. Enforcing the smaller reading would reject files between
 * the two that Meta may well accept — blocking an owner from posting a valid
 * photo, which they cannot work around. Enforcing the larger reading lets such
 * a file through to Meta, which answers with its own real error that this
 * architecture already surfaces honestly.
 *
 * The wrong direction here is the one the owner cannot recover from.
 */
const MB = 1024 * 1024;

export const MEDIA_SPECS: Record<Platform, PlatformMediaSpec> = {
  /** docs/research/meta-instagram.md §4 — the strictest of the three. */
  instagram: {
    platform: 'instagram',
    image: {
      maxBytes: verified(8 * MB, IG_MEDIA_REFERENCE),
      minWidth: verified(320, IG_MEDIA_REFERENCE),
      maxWidth: verified(1440, IG_MEDIA_REFERENCE),
      // "Must be within a 4:5 to 1.91:1 range"
      minAspectRatio: verified(0.8, IG_MEDIA_REFERENCE),
      maxAspectRatio: verified(1.91, IG_MEDIA_REFERENCE),
      /** Meta states a width range, not a short-edge floor. Not the same rule. */
      minShortEdge: unverified(),
    },
    video: {
      maxBytes: verified(300 * MB, IG_MEDIA_REFERENCE),
      minDurationSeconds: verified(3, IG_MEDIA_REFERENCE),
      maxDurationSeconds: verified(15 * 60, IG_MEDIA_REFERENCE),
    },
  },

  /**
   * docs/research/meta-facebook-pages.md §2 — markedly more permissive.
   *
   * Facebook "strips all location metadata before publishing and resizes
   * images to different dimensions", so it documents no width or aspect-ratio
   * requirement. Those limits are UNVERIFIED here rather than borrowed from
   * Instagram: applying Instagram's 4:5-1.91:1 rule to a Facebook photo would
   * reject a picture Facebook would happily have taken.
   */
  facebook: {
    platform: 'facebook',
    image: {
      // "Files can not exceed 10MB."
      maxBytes: verified(10 * MB, FB_PAGE_PHOTOS),
      minWidth: unverified(),
      maxWidth: unverified(),
      minAspectRatio: unverified(),
      maxAspectRatio: unverified(),
      minShortEdge: unverified(),
    },
    // The video publishing guide states no Page video size or duration spec.
    video: noVideoSpec(),
  },

  /**
   * docs/research/google-business-profile.md §8 — "Minimum photo requirements:
   * 250px on the short edge and 10KB file size".
   *
   * Note this is a SHORT-EDGE rule, not a width rule. Google constrains the
   * smaller dimension whichever way the photo is oriented; Instagram
   * constrains width specifically. Modelling them as the same field would
   * misjudge a portrait photo on one platform or the other.
   */
  google_business: {
    platform: 'google_business',
    image: {
      ...noImageSpec(),
      minShortEdge: verified(250, GBP_MEDIA),
    },
    video: noVideoSpec(),
  },
};

export function mediaSpecFor(platform: Platform): PlatformMediaSpec {
  return MEDIA_SPECS[platform];
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                     */
/* -------------------------------------------------------------------------- */

const OK: CheckResult = { outcome: 'ok', message: '' };

function unverifiedResult(what: string, platform: Platform): CheckResult {
  return {
    outcome: 'unverified',
    message: `Shoogle has not confirmed ${PLATFORM_LABEL[platform]}'s ${what}, so it cannot check this for you.`,
  };
}

function violation(message: string): CheckResult {
  return { outcome: 'violation', message };
}

function megabytes(bytes: number): string {
  return `${(bytes / MB).toFixed(bytes % MB === 0 ? 0 : 1)} MB`;
}

/**
 * Every media check for one asset on one platform, in one list.
 *
 * Returns a result per rule rather than a single verdict, because "too large"
 * and "wrong shape" are different things to fix and an owner shown only the
 * first will fix it and be refused again. `unverified` entries are included:
 * the caller must show them separately from passes.
 */
export function checkMediaAgainstSpec(platform: Platform, asset: MediaAsset): CheckResult[] {
  return asset.kind === 'video'
    ? checkVideo(platform, asset)
    : checkImage(platform, asset);
}

function checkImage(platform: Platform, asset: MediaAsset): CheckResult[] {
  const spec = mediaSpecFor(platform).image;
  const name = PLATFORM_LABEL[platform];
  const results: CheckResult[] = [];

  /* -- Size ------------------------------------------------------------- */
  if (!isEnforceable(spec.maxBytes)) {
    results.push(unverifiedResult('maximum image size', platform));
  } else if (asset.byteSize === null) {
    // Unmeasured is not "fine". A file nobody has sized cannot be said to be
    // under the limit — that is the whole "unknown is not zero" rule applied
    // to bytes.
    results.push({
      outcome: 'unverified',
      message: 'Shoogle has not measured this file yet, so it cannot check its size.',
    });
  } else if (asset.byteSize > spec.maxBytes.value) {
    results.push(
      violation(`${name} takes images up to ${megabytes(spec.maxBytes.value)}. This one is ${megabytes(asset.byteSize)}.`),
    );
  } else {
    results.push(OK);
  }

  /* -- Width ------------------------------------------------------------ */
  if (isEnforceable(spec.minWidth) || isEnforceable(spec.maxWidth)) {
    if (asset.width === null) {
      results.push({
        outcome: 'unverified',
        message: 'Shoogle has not measured this image yet, so it cannot check its size in pixels.',
      });
    } else if (isEnforceable(spec.minWidth) && asset.width < spec.minWidth.value) {
      results.push(
        violation(`${name} needs images at least ${spec.minWidth.value} pixels wide. This one is ${asset.width}.`),
      );
    } else if (isEnforceable(spec.maxWidth) && asset.width > spec.maxWidth.value) {
      results.push(
        violation(`${name} takes images up to ${spec.maxWidth.value} pixels wide. This one is ${asset.width}.`),
      );
    } else {
      results.push(OK);
    }
  }

  /* -- Short edge — Google's rule, and genuinely not the width rule ------ */
  if (isEnforceable(spec.minShortEdge)) {
    if (asset.width === null || asset.height === null) {
      results.push({
        outcome: 'unverified',
        message: 'Shoogle has not measured this image yet, so it cannot check its shortest edge.',
      });
    } else {
      const shortEdge = Math.min(asset.width, asset.height);
      results.push(
        shortEdge < spec.minShortEdge.value
          ? violation(
              `${name} needs at least ${spec.minShortEdge.value} pixels on the shortest edge. This one has ${shortEdge}.`,
            )
          : OK,
      );
    }
  }

  /* -- Aspect ratio ----------------------------------------------------- */
  if (isEnforceable(spec.minAspectRatio) && isEnforceable(spec.maxAspectRatio)) {
    const ratio = aspectRatio(asset);
    if (ratio === null) {
      results.push({
        outcome: 'unverified',
        message: 'Shoogle has not measured this image yet, so it cannot check its shape.',
      });
    } else if (ratio < spec.minAspectRatio.value || ratio > spec.maxAspectRatio.value) {
      results.push(
        violation(
          `${name} needs an image between 4:5 (tall) and 1.91:1 (wide). Crop it to fit.`,
        ),
      );
    } else {
      results.push(OK);
    }
  }

  return results;
}

function checkVideo(platform: Platform, asset: MediaAsset): CheckResult[] {
  const spec = mediaSpecFor(platform).video;
  const name = PLATFORM_LABEL[platform];
  const results: CheckResult[] = [];

  if (!isEnforceable(spec.maxBytes)) {
    results.push(unverifiedResult('maximum video size', platform));
  } else if (asset.byteSize === null) {
    results.push({
      outcome: 'unverified',
      message: 'Shoogle has not measured this video yet, so it cannot check its size.',
    });
  } else if (asset.byteSize > spec.maxBytes.value) {
    results.push(
      violation(`${name} takes videos up to ${megabytes(spec.maxBytes.value)}. This one is ${megabytes(asset.byteSize)}.`),
    );
  } else {
    results.push(OK);
  }

  const min = spec.minDurationSeconds;
  const max = spec.maxDurationSeconds;
  if (!isEnforceable(min) && !isEnforceable(max)) {
    results.push(unverifiedResult('video length limits', platform));
  } else if (asset.durationSeconds === null) {
    results.push({
      outcome: 'unverified',
      message: 'Shoogle has not measured this video yet, so it cannot check its length.',
    });
  } else if (isEnforceable(min) && asset.durationSeconds < min.value) {
    results.push(violation(`${name} needs videos at least ${min.value} seconds long.`));
  } else if (isEnforceable(max) && asset.durationSeconds > max.value) {
    results.push(
      violation(`${name} takes videos up to ${Math.round(max.value / 60)} minutes long.`),
    );
  } else {
    results.push(OK);
  }

  return results;
}

/**
 * Instagram Stories carry their own, tighter video limits: 60 seconds and
 * 100 MB rather than 15 minutes and 300 MB. Kept separate from
 * `MEDIA_SPECS.instagram.video` because a Story is a different surface with
 * different documented rules, and folding it in would silently apply the feed
 * limits to a Story or the Story limits to a Reel.
 */
export const INSTAGRAM_STORY_VIDEO: VideoSpec = {
  maxBytes: verified(100 * MB, IG_MEDIA_REFERENCE),
  minDurationSeconds: verified(3, IG_MEDIA_REFERENCE),
  maxDurationSeconds: verified(60, IG_MEDIA_REFERENCE),
};
