/**
 * Media preparation — the planning half. Owner: Yash.
 *
 * ================= WHY PLANNING IS SEPARATE FROM DOING ======================
 *
 * The arithmetic is where the bugs live: what to resize to, where to crop, when
 * a file is simply unusable. Keeping it pure means it is testable without a
 * native image library, and it means the composer can tell an owner "this will
 * be cropped to fit Instagram" BEFORE anything is touched.
 *
 * The doing — the actual transcode — lives behind `MediaPreparer`, whose only
 * real implementation needs `expo-image-manipulator`.
 *
 * ======================= PREPARATION IS PER PLATFORM ========================
 *
 * The same photo needs different work for each target. A 2000×2000 PNG must be
 * transcoded AND resized AND cropped for Instagram; Facebook takes it as-is,
 * PNG included, because Facebook resizes server-side and documents no aspect
 * rule. Planning one platform reads only that platform's spec, so an Instagram
 * failure cannot change what Facebook is asked to do.
 *
 * =================== WHAT IS DELIBERATELY NOT FIXABLE =======================
 *
 * An image below the platform's minimum width is a REFUSAL, not a resize.
 * Upscaling invents detail that was never captured, and Shoogle publishing a
 * blurry upscale in a business's name is worse than telling the owner to pick
 * another photo.
 *
 * Unknown dimensions are also a refusal. "We could not measure it" is not
 * "it is fine" — the same rule the capability matrix applies to limits and the
 * insights model applies to numbers.
 */

import type { Result } from '@/lib/providers/types';
import { unavailable } from '@/lib/state/DataState';

import { mediaSpecFor, INSTAGRAM_STORY_VIDEO } from '../mediaSpecs';
import { isEnforceable, PLATFORM_CAPABILITIES, type Limit } from '../platforms';
import { PLATFORM_LABEL, type MediaAsset, type MediaFormat, type Platform } from '../types';

import type {
  MediaProblem,
  PreparationChange,
  PreparationPlan,
  PreparedMedia,
} from './types';

/* -------------------------------------------------------------------------- */
/* The plan                                                                   */
/* -------------------------------------------------------------------------- */

function problem(
  code: MediaProblem['code'],
  platform: Platform,
  message: string,
): MediaProblem {
  return { code, platform, message };
}

function value<T>(limit: Limit<T>): T | null {
  return isEnforceable(limit) ? limit.value : null;
}

/**
 * What must happen to this asset before `platform` will take it.
 *
 * Reads only `platform`'s spec. Returns the changes in the order a preparer
 * should apply them: transcode, then resize, then crop, then recompress.
 */
export function planPreparation(asset: MediaAsset, platform: Platform): PreparationPlan {
  return asset.kind === 'video'
    ? planVideo(asset, platform)
    : planImage(asset, platform);
}

function planImage(asset: MediaAsset, platform: Platform): PreparationPlan {
  const spec = mediaSpecFor(platform).image;
  const name = PLATFORM_LABEL[platform];
  const problems: MediaProblem[] = [];
  const changes: PreparationChange[] = [];

  /* -- Format ------------------------------------------------------------ */
  const accepted = acceptedImageFormats(platform);
  let targetFormat: MediaFormat = asset.format;

  if (asset.format === 'unknown') {
    // An unprobed file is not a usable one. Guessing from the extension is
    // exactly the assumption this codebase keeps refusing to make.
    problems.push(
      problem(
        'format_unknown',
        platform,
        'Shoogle could not read this file’s format. Pick it again, or convert it first.',
      ),
    );
  } else if (accepted !== null && !accepted.includes(asset.format)) {
    const convertTo = accepted.find((format) => format === 'jpeg') ?? accepted[0];
    if (convertTo === undefined) {
      problems.push(
        problem('format_unsupported', platform, `${name} does not accept ${asset.format.toUpperCase()} files.`),
      );
    } else {
      // Instagram is JPEG-only, so a PNG becomes a transcode rather than a
      // refusal. Facebook accepts PNG and never reaches this branch.
      targetFormat = convertTo;
      changes.push({ kind: 'transcode', to: convertTo });
    }
  }

  /* -- Dimensions -------------------------------------------------------- */
  if (asset.width === null || asset.height === null) {
    problems.push(
      problem(
        'dimensions_unknown',
        platform,
        `Shoogle has not measured this image, so it cannot tell whether ${name} will accept it.`,
      ),
    );
    // Nothing further can be planned without pixels.
    return { ok: false, platform, problems };
  }

  let width = asset.width;
  let height = asset.height;

  const minWidth = value(spec.minWidth);
  const maxWidth = value(spec.maxWidth);
  const minShortEdge = value(spec.minShortEdge);

  if (minWidth !== null && width < minWidth) {
    problems.push(
      problem(
        'too_small',
        platform,
        `${name} needs images at least ${minWidth} pixels wide. This one is ${width}, and enlarging it would invent detail that is not in the photo.`,
      ),
    );
  }

  if (minShortEdge !== null && Math.min(width, height) < minShortEdge) {
    problems.push(
      problem(
        'too_small',
        platform,
        `${name} needs at least ${minShortEdge} pixels on the shortest edge. This one has ${Math.min(width, height)}.`,
      ),
    );
  }

  if (maxWidth !== null && width > maxWidth) {
    const scaled = scaleToWidth(width, height, maxWidth);
    width = scaled.width;
    height = scaled.height;
    changes.push({ kind: 'resize', toWidth: width, toHeight: height });
  }

  /* -- Aspect ratio ------------------------------------------------------ */
  const minRatio = value(spec.minAspectRatio);
  const maxRatio = value(spec.maxAspectRatio);
  if (minRatio !== null && maxRatio !== null) {
    const cropped = cropToRatioRange(width, height, minRatio, maxRatio);
    if (cropped.width !== width || cropped.height !== height) {
      width = cropped.width;
      height = cropped.height;
      changes.push({ kind: 'crop', toWidth: width, toHeight: height });
    }
  }

  /* -- Bytes -------------------------------------------------------------- */
  const maxBytes = value(spec.maxBytes);
  if (maxBytes !== null) {
    if (asset.byteSize === null) {
      problems.push(
        problem(
          'size_unknown',
          platform,
          `Shoogle has not measured this file, so it cannot tell whether it is under ${name}’s size limit.`,
        ),
      );
    } else if (asset.byteSize > maxBytes) {
      /*
       * Recompression, not refusal. A resize to 1440px usually takes an
       * oversized photo well under the ceiling on its own, and a JPEG quality
       * pass covers the rest. It becomes a refusal only if the preparer comes
       * back still over — which is the preparer's answer to give, not this
       * planner's guess.
       */
      changes.push({ kind: 'recompress', targetBytes: maxBytes });
    }
  }

  if (problems.length > 0) return { ok: false, platform, problems };
  return { ok: true, platform, changes, targetFormat, targetWidth: width, targetHeight: height };
}

function planVideo(asset: MediaAsset, platform: Platform): PreparationPlan {
  const spec = mediaSpecFor(platform).video;
  const name = PLATFORM_LABEL[platform];
  const problems: MediaProblem[] = [];

  const accepted = acceptedVideoFormats(platform);
  if (asset.format === 'unknown') {
    problems.push(
      problem('format_unknown', platform, 'Shoogle could not read this video’s format.'),
    );
  } else if (accepted !== null && !accepted.includes(asset.format)) {
    // Shoogle does not transcode video. A video in the wrong container is a
    // refusal rather than a promise the preparer cannot keep.
    problems.push(
      problem('format_unsupported', platform, `${name} does not accept ${asset.format.toUpperCase()} video.`),
    );
  }

  const maxBytes = value(spec.maxBytes);
  if (maxBytes !== null && asset.byteSize !== null && asset.byteSize > maxBytes) {
    problems.push(
      problem('too_large', platform, `${name} takes videos up to ${Math.round(maxBytes / (1024 * 1024))} MB.`),
    );
  }

  const min = value(spec.minDurationSeconds);
  const max = value(spec.maxDurationSeconds);
  if ((min !== null || max !== null) && asset.durationSeconds === null) {
    problems.push(
      problem('dimensions_unknown', platform, 'Shoogle has not measured this video’s length.'),
    );
  } else if (asset.durationSeconds !== null) {
    if (min !== null && asset.durationSeconds < min) {
      problems.push(problem('duration_out_of_range', platform, `${name} needs at least ${min} seconds of video.`));
    }
    if (max !== null && asset.durationSeconds > max) {
      problems.push(
        problem(
          'duration_out_of_range',
          platform,
          `${name} takes up to ${Math.round(max / 60)} minutes of video.`,
        ),
      );
    }
  }

  if (problems.length > 0) return { ok: false, platform, problems };
  return {
    ok: true,
    platform,
    changes: [],
    targetFormat: asset.format,
    targetWidth: asset.width ?? 0,
    targetHeight: asset.height ?? 0,
  };
}

/**
 * An Instagram Story's video bounds, which are tighter than the feed's.
 *
 * Separate because a Story is a different surface with different documented
 * limits — 60 seconds and 100 MB against 15 minutes and 300 MB. Folding them
 * together would silently apply one surface's rules to the other.
 */
export function planStoryVideo(asset: MediaAsset): PreparationPlan {
  const problems: MediaProblem[] = [];
  const max = value(INSTAGRAM_STORY_VIDEO.maxDurationSeconds);
  const maxBytes = value(INSTAGRAM_STORY_VIDEO.maxBytes);

  if (asset.durationSeconds === null) {
    problems.push(
      problem('dimensions_unknown', 'instagram', 'Shoogle has not measured this video’s length.'),
    );
  } else if (max !== null && asset.durationSeconds > max) {
    problems.push(
      problem('duration_out_of_range', 'instagram', `An Instagram Story takes up to ${max} seconds of video.`),
    );
  }
  if (maxBytes !== null && asset.byteSize !== null && asset.byteSize > maxBytes) {
    problems.push(
      problem('too_large', 'instagram', `An Instagram Story takes videos up to ${Math.round(maxBytes / (1024 * 1024))} MB.`),
    );
  }

  return problems.length > 0
    ? { ok: false, platform: 'instagram', problems }
    : {
        ok: true,
        platform: 'instagram',
        changes: [],
        targetFormat: asset.format,
        targetWidth: asset.width ?? 0,
        targetHeight: asset.height ?? 0,
      };
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

/** Scale proportionally to a target width, rounding height to a whole pixel. */
export function scaleToWidth(
  width: number,
  height: number,
  targetWidth: number,
): { width: number; height: number } {
  const scaled = Math.max(1, Math.round((height * targetWidth) / width));
  return { width: targetWidth, height: scaled };
}

/**
 * The largest centred crop whose ratio falls inside [min, max].
 *
 * Crops rather than pads: letterboxing a photo to fit Instagram puts bars in a
 * business's feed, which looks like a mistake the owner made. Trimming the long
 * edge is what a person would do.
 */
export function cropToRatioRange(
  width: number,
  height: number,
  minRatio: number,
  maxRatio: number,
): { width: number; height: number } {
  const ratio = width / height;
  if (ratio >= minRatio && ratio <= maxRatio) return { width, height };

  if (ratio > maxRatio) {
    // Too wide: trim the sides.
    return { width: Math.max(1, Math.round(height * maxRatio)), height };
  }
  // Too tall: trim top and bottom.
  return { width, height: Math.max(1, Math.round(width / minRatio)) };
}

/*
 * Accepted formats come from the capability matrix, so the list lives in
 * exactly one place with its documentation URL attached. `null` means the
 * platform does not document one — Google publishes no image format list — and
 * a null list is NOT permission to send anything: it means the planner makes no
 * format claim and the platform's own error is what the owner will see.
 */
function acceptedImageFormats(platform: Platform): readonly MediaFormat[] | null {
  const limit = PLATFORM_CAPABILITIES[platform].acceptedImageFormats;
  return isEnforceable(limit) ? limit.value : null;
}

function acceptedVideoFormats(platform: Platform): readonly MediaFormat[] | null {
  const limit = PLATFORM_CAPABILITIES[platform].acceptedVideoFormats;
  return isEnforceable(limit) ? limit.value : null;
}

/* -------------------------------------------------------------------------- */
/* The preparer seam                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Does the work a plan describes.
 *
 * The real implementation needs `expo-image-manipulator`. Until one is
 * installed, `unconfiguredPreparer` reports that honestly rather than returning
 * the original file and letting a caller believe it was converted — which would
 * send a PNG to Instagram and fail at publish time.
 */
export interface MediaPreparer {
  readonly id: string;
  isConfigured(): boolean;
  /** Prepare one asset for ONE platform. Never batches across platforms. */
  prepare(asset: MediaAsset, platform: Platform): Result<PreparedMedia>;
}

export const PREPARER_NOT_CONFIGURED =
  'Shoogle cannot convert photos yet, so it cannot get this one ready for the platform.';

export const unconfiguredPreparer: MediaPreparer = {
  id: 'unconfigured',
  isConfigured: () => false,
  prepare: () => Promise.resolve(unavailable('not_connected', PREPARER_NOT_CONFIGURED)),
};

let activePreparer: MediaPreparer | null = null;

export function setMediaPreparer(preparer: MediaPreparer | null): void {
  activePreparer = preparer;
}

export function getMediaPreparer(): MediaPreparer {
  return activePreparer ?? unconfiguredPreparer;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Problems that stop this asset being used on this platform, or an empty list.
 *
 * The same planner the preparer uses, read for its refusals rather than its
 * instructions — so the composer cannot tell an owner something is fine that
 * preparation would then reject. One source of truth, two readings.
 */
export function validateForPlatform(asset: MediaAsset, platform: Platform): readonly MediaProblem[] {
  const plan = planPreparation(asset, platform);
  return plan.ok ? [] : plan.problems;
}
