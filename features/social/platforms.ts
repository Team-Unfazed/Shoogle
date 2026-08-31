/**
 * Platform capability matrix. Owner: Yash.
 *
 * ===================== READ THIS BEFORE ADDING A NUMBER =====================
 *
 * EVERY LIMIT IN THIS FILE IS CURRENTLY `null` / UNVERIFIED, ON PURPOSE.
 *
 * Caption lengths, hashtag counts, accepted image formats, carousel slide
 * counts, whether a platform will schedule for you, whether app review is
 * required — all of it is a claim about someone else's API. `docs/research/`
 * contains no Meta or LinkedIn report yet, so this feature knows none of it.
 *
 * Writing "Instagram allows 2,200 characters" here from memory would be
 * inventing a limit, which the engineering contract forbids and which fails in
 * the worst possible way: silently, at publish time, on a real customer's post.
 *
 * HOW TO FILL THIS IN
 * -------------------
 *   1. Run the `api-researcher` agent for the platform.
 *   2. Commit its report to `docs/research/<platform>.md`.
 *   3. Replace the `unverified()` entry with `verified(value, '<doc URL>')`.
 *   4. Add a test asserting the new value, so it cannot be edited silently.
 *
 * Until then `checkAgainstPlatform()` answers `'unverified'` rather than 'ok',
 * and the UI must say "we cannot confirm this will be accepted" rather than
 * showing a green tick. An unverified check is NOT a pass.
 */

import { IMAGE_FORMATS, VIDEO_FORMATS, type MediaFormat, type Platform } from './types';

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One constraint, plus how we know it. `source` is a first-party documentation
 * URL and is required for anything marked verified.
 */
export interface Limit<T> {
  value: T | null;
  verification: 'verified' | 'unverified';
  source: string | null;
}

export function unverified<T>(): Limit<T> {
  return { value: null, verification: 'unverified', source: null };
}

/** Only callable with a first-party source. That constraint is the point. */
export function verified<T>(value: T, source: string): Limit<T> {
  return { value, verification: 'verified', source };
}

export function isVerified<T>(limit: Limit<T>): limit is Limit<T> & { value: T; source: string } {
  return limit.verification === 'verified' && limit.value !== null;
}

/* -------------------------------------------------------------------------- */
/* The matrix                                                                 */
/* -------------------------------------------------------------------------- */

export interface PlatformCapabilities {
  platform: Platform;
  /** Maximum caption characters the platform will accept. */
  captionMaxCharacters: Limit<number>;
  /** Maximum hashtags per post. */
  hashtagMaxCount: Limit<number>;
  /**
   * Image container formats the platform accepts. The brief calls this out
   * explicitly: do NOT assume PNG is acceptable where JPEG is required.
   * While this is unverified, `checkMediaFormat` refuses to say a file is fine.
   */
  acceptedImageFormats: Limit<readonly MediaFormat[]>;
  acceptedVideoFormats: Limit<readonly MediaFormat[]>;
  carouselMinSlides: Limit<number>;
  carouselMaxSlides: Limit<number>;
  /**
   * Whether the PLATFORM will hold a post and publish it later.
   * Shoogle does not depend on this being true anywhere — `scheduling.ts`
   * owns the clock regardless. This exists so that if a platform does offer
   * it, we can hand scheduling over rather than duplicating it.
   */
  providerSideScheduling: Limit<boolean>;
  /** Whether publishing requires the app to pass the platform's review. */
  requiresAppReview: Limit<boolean>;
}

function allUnverified(platform: Platform): PlatformCapabilities {
  return {
    platform,
    captionMaxCharacters: unverified(),
    hashtagMaxCount: unverified(),
    acceptedImageFormats: unverified(),
    acceptedVideoFormats: unverified(),
    carouselMinSlides: unverified(),
    carouselMaxSlides: unverified(),
    providerSideScheduling: unverified(),
    requiresAppReview: unverified(),
  };
}

export const PLATFORM_CAPABILITIES: Record<Platform, PlatformCapabilities> = {
  instagram: allUnverified('instagram'),
  facebook: allUnverified('facebook'),
  linkedin: allUnverified('linkedin'),
  google_business: allUnverified('google_business'),
};

export function capabilitiesFor(platform: Platform): PlatformCapabilities {
  return PLATFORM_CAPABILITIES[platform];
}

/**
 * True only when at least one limit for this platform has been researched.
 * The composer uses this to decide whether to show a "not yet verified"
 * notice next to the publish targets.
 */
export function hasResearchedCapabilities(platform: Platform): boolean {
  const caps = capabilitiesFor(platform);
  const limits: Limit<unknown>[] = [
    caps.captionMaxCharacters,
    caps.hashtagMaxCount,
    caps.acceptedImageFormats,
    caps.acceptedVideoFormats,
    caps.carouselMinSlides,
    caps.carouselMaxSlides,
    caps.providerSideScheduling,
    caps.requiresAppReview,
  ];
  return limits.some((limit) => isVerified(limit));
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The outcome of one check.
 *
 * `unverified` is the honest third answer and callers MUST handle it
 * separately from `ok`. Treating it as a pass is how "we validated this"
 * becomes a false claim; treating it as a violation would block the owner from
 * posting for no reason.
 */
export type CheckOutcome = 'ok' | 'violation' | 'unverified';

export interface CheckResult {
  outcome: CheckOutcome;
  /** Owner-facing sentence. Empty string when `ok`. */
  message: string;
}

const OK: CheckResult = { outcome: 'ok', message: '' };

function unverifiedResult(what: string, platform: Platform): CheckResult {
  return {
    outcome: 'unverified',
    message: `Shoogle has not confirmed ${PLATFORM_RESEARCH_NAME[platform]}'s ${what} yet, so it cannot check this for you.`,
  };
}

const PLATFORM_RESEARCH_NAME: Record<Platform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  google_business: 'Google Business Profile',
};

/** Caption length against a platform's documented maximum. */
export function checkCaptionLength(platform: Platform, characters: number): CheckResult {
  const limit = capabilitiesFor(platform).captionMaxCharacters;
  if (!isVerified(limit)) return unverifiedResult('caption limit', platform);
  if (characters <= limit.value) return OK;
  return {
    outcome: 'violation',
    message: `${characters - limit.value} characters too long for ${PLATFORM_RESEARCH_NAME[platform]}.`,
  };
}

export function checkHashtagCount(platform: Platform, count: number): CheckResult {
  const limit = capabilitiesFor(platform).hashtagMaxCount;
  if (!isVerified(limit)) return unverifiedResult('hashtag limit', platform);
  if (count <= limit.value) return OK;
  return {
    outcome: 'violation',
    message: `${PLATFORM_RESEARCH_NAME[platform]} takes at most ${limit.value} hashtags.`,
  };
}

/**
 * Whether a file format is accepted.
 *
 * While the accepted-format list is unverified this returns `'unverified'` for
 * EVERY format including JPEG — we do not know what the platform wants, and
 * "probably fine" is not a state this codebase has.
 */
export function checkMediaFormat(platform: Platform, format: MediaFormat): CheckResult {
  const caps = capabilitiesFor(platform);
  const isVideoFormat = VIDEO_FORMATS.includes(format);
  const limit = isVideoFormat ? caps.acceptedVideoFormats : caps.acceptedImageFormats;

  if (format === 'unknown') {
    return {
      outcome: 'violation',
      message: 'Shoogle could not read this file’s format. Pick the file again or convert it first.',
    };
  }
  if (!isVerified(limit)) {
    return unverifiedResult(isVideoFormat ? 'accepted video formats' : 'accepted image formats', platform);
  }
  if (limit.value.includes(format)) return OK;
  return {
    outcome: 'violation',
    message: `${PLATFORM_RESEARCH_NAME[platform]} does not accept ${format.toUpperCase()} files.`,
  };
}

export function checkSlideCount(platform: Platform, slides: number): CheckResult {
  const caps = capabilitiesFor(platform);
  const min = caps.carouselMinSlides;
  const max = caps.carouselMaxSlides;
  if (!isVerified(min) || !isVerified(max)) return unverifiedResult('carousel size limits', platform);
  if (slides < min.value) {
    return { outcome: 'violation', message: `A carousel needs at least ${min.value} slides.` };
  }
  if (slides > max.value) {
    return { outcome: 'violation', message: `A carousel takes at most ${max.value} slides.` };
  }
  return OK;
}

/**
 * Does Shoogle currently assume ANY platform will accept a given format?
 * Hard-wired to false, and asserted by a test, so that "we assumed PNG was
 * fine" can never quietly become true again.
 */
export function assumesFormatAccepted(): boolean {
  return Object.values(PLATFORM_CAPABILITIES).some(
    (caps) => isVerified(caps.acceptedImageFormats) || isVerified(caps.acceptedVideoFormats),
  );
}

/** Formats Shoogle can even identify. Used by the picker, not by validation. */
export const KNOWN_FORMATS: readonly MediaFormat[] = [...IMAGE_FORMATS, ...VIDEO_FORMATS];
