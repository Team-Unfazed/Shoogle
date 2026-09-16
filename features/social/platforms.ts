/**
 * Platform capability matrix. Owner: Yash.
 *
 * ===================== READ THIS BEFORE ADDING A NUMBER =====================
 *
 * Every limit here is a claim about someone else's API. Writing "Instagram
 * allows 2,200 characters" from memory would be inventing a limit, which the
 * engineering contract forbids and which fails in the worst possible way:
 * silently, at publish time, on a real customer's post.
 *
 * So a limit may only leave `unverified()` by way of `verified(value, source)`,
 * whose second argument is a first-party documentation URL. There is
 * deliberately no third constructor and no "probably" state.
 *
 * WHAT IS FILLED IN, AND WHAT IS NOT
 * ----------------------------------
 *   instagram        — filled from `docs/research/meta-instagram.md` §4/§5.
 *                      Carousel MINIMUM and provider-side scheduling remain
 *                      unverified: Meta documents neither, and "the docs don't
 *                      mention it" is not a citation.
 *   google_business  — only what `docs/research/google-business-profile.md` §6
 *                      actually states. `scheduledTime` is documented, so
 *                      provider-side scheduling is verified TRUE. The summary
 *                      character limit is NOT documented, so it stays null and
 *                      the API is left to reject an over-long post with its own
 *                      error rather than Shoogle truncating on a guess.
 *
 * HOW TO FILL IN THE REST
 * -----------------------
 *   1. Run the `api-researcher` agent for the platform.
 *   2. Commit its report to `docs/research/<platform>.md`.
 *   3. Replace the `unverified()` entry with `verified(value, '<doc URL>')`.
 *   4. Add a test asserting the new value, so it cannot be edited silently.
 *
 * While a limit is unverified the matching check answers `'unverified'` rather
 * than `'ok'`, and the UI must say "we cannot confirm this will be accepted"
 * rather than showing a green tick. An unverified check is NOT a pass.
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
  verification: 'verified' | 'unverified' | 'conflicted';
  source: string | null;
  /**
   * Present only when `verification` is 'conflicted': every first-party page
   * consulted, so a reader can go and see the disagreement themselves.
   */
  sources?: readonly string[];
  /** Present only when 'conflicted': what the pages disagree about. */
  conflict?: string;
}

export function unverified<T>(): Limit<T> {
  return { value: null, verification: 'unverified', source: null };
}

/** Only callable with a first-party source. That constraint is the point. */
export function verified<T>(value: T, source: string): Limit<T> {
  return { value, verification: 'verified', source };
}

/**
 * A limit whose own first-party documentation contradicts itself.
 *
 * WHY THIS EXISTS — the alternative was to lie in one of two directions.
 *
 * Meta states Facebook's scheduling horizon as 30 days on one page and 75 on
 * another. Both are Meta's. Calling either `verified()` claims a number the
 * provider does not agree with itself about. Calling it `unverified()` is
 * accurate but drops enforcement entirely, letting Shoogle's own 90-day
 * default through — a post the owner believes is scheduled and which Facebook
 * will refuse.
 *
 * So a conflict is its own state, carrying the CONSERVATIVE end as its value.
 * `isVerified()` stays false, so nothing may present this as a settled fact.
 * `isEnforceable()` is true, so a check may still refuse at the tighter bound.
 * The claim being made is exactly: "we do not know the true limit, but we know
 * it is at least this strict" — which is true, and useful.
 *
 * Erring tight costs the owner a scheduling option they can see and report.
 * Erring loose costs them a post they never learn did not go out.
 */
export function conflicted<T>(
  conservative: T,
  sources: readonly string[],
  conflict: string,
): Limit<T> {
  return {
    value: conservative,
    verification: 'conflicted',
    source: sources[0] ?? null,
    sources,
    conflict,
  };
}

/** Settled fact, from one first-party page. A conflict is NOT verified. */
export function isVerified<T>(limit: Limit<T>): limit is Limit<T> & { value: T; source: string } {
  return limit.verification === 'verified' && limit.value !== null;
}

/**
 * Whether a check may refuse on the strength of this limit — true for a
 * verified limit and for the conservative end of a conflicted one.
 *
 * Use this to ENFORCE. Use `isVerified` to CLAIM. They are different questions
 * and conflating them is how a disputed number becomes a stated one.
 */
export function isEnforceable<T>(limit: Limit<T>): limit is Limit<T> & { value: T } {
  return limit.verification !== 'unverified' && limit.value !== null;
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
  /**
   * The platform's OWN minimum notice for a scheduled post, in minutes.
   *
   * Distinct from Shoogle's `MIN_SCHEDULE_LEAD_MINUTES`, which exists because
   * the runner needs time to work. This one is the provider's rule, and where
   * a platform states one it is stricter than ours and wins.
   */
  scheduleMinLeadMinutes: Limit<number>;
  /** The platform's own maximum scheduling horizon, in days. */
  scheduleMaxHorizonDays: Limit<number>;
}

/* -- Sources. Named so a reader can see which page a number came from. ----- */

/** Meta, *Content Publishing*. JPEG-only, carousel max, the 100/24h quota. */
const IG_CONTENT_PUBLISHING =
  'https://developers.facebook.com/docs/instagram-platform/content-publishing';

/**
 * Meta, *IG User Media* reference. Caption 2200/30/20 and the media specs.
 *
 * ⚠️ This page lives in the `instagram-graph-api` (Facebook Login) reference
 * tree. Shoogle uses the Instagram Login path, for which no equivalent
 * specification page exists. The endpoints and ingestion pipeline are the same
 * and there is no reason to think the specs differ — but the citation points at
 * the page the numbers are actually on, not at a more convenient one. Recorded
 * as an open item in `docs/research/meta-instagram.md` §8.
 */
const IG_MEDIA_REFERENCE =
  'https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media';

/** Meta, *Access Levels*. Advanced Access — i.e. real customers — is gated. */
const IG_ACCESS_LEVELS = 'https://developers.facebook.com/docs/graph-api/overview/access-levels';

/** Meta, *Page photos* reference. Accepted image formats and the 10 MB cap. */
const FB_PAGE_PHOTOS = 'https://developers.facebook.com/docs/graph-api/reference/page/photos/';

/** Meta, *Page feed* reference. `scheduled_publish_time` and its bounds. */
const FB_PAGE_FEED = 'https://developers.facebook.com/docs/graph-api/reference/page/feed/';

/** Meta, *Pages API — posts* guide. States a different horizon to the above. */
const FB_PAGES_POSTS = 'https://developers.facebook.com/docs/pages-api/posts';

/** Meta, *Pages API overview*. All Page permissions need App Review. */
const FB_PAGES_OVERVIEW = 'https://developers.facebook.com/docs/pages-api/overview';

/** Google, *accounts.locations.localPosts* v4 reference. `scheduledTime`. */
const GBP_LOCAL_POSTS =
  'https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts';

/** Google, *GBP API prerequisites*. A project sits at 0 QPM until approved. */
const GBP_PREREQS = 'https://developers.google.com/my-business/content/prereqs';

export const PLATFORM_CAPABILITIES: Record<Platform, PlatformCapabilities> = {
  /**
   * Instagram — via Meta's *Instagram API with Instagram Login*.
   * See `docs/research/meta-instagram.md`.
   */
  instagram: {
    platform: 'instagram',
    // "Maximum 2200 characters, 30 hashtags, and 20 @ tags."
    captionMaxCharacters: verified(2200, IG_MEDIA_REFERENCE),
    hashtagMaxCount: verified(30, IG_MEDIA_REFERENCE),
    /**
     * "JPEG is the only image format supported. Extended JPEG formats such as
     * MPO and JPS are not supported."
     *
     * This one line is why `checkMediaFormat('instagram', 'png')` is a real
     * violation rather than a shrug, and why a server-side JPEG transcode is a
     * build requirement rather than a nicety.
     */
    acceptedImageFormats: verified(['jpeg'], IG_CONTENT_PUBLISHING),
    // "MOV or MP4 (MPEG-4 Part 14), no edit lists, moov atom at the front"
    acceptedVideoFormats: verified(['mp4', 'mov'], IG_MEDIA_REFERENCE),
    /**
     * UNVERIFIED on purpose. Meta documents a maximum of 10 and states no
     * minimum anywhere. Two is near-certain and `features/carousel` enforces
     * Shoogle's own `SHOOGLE_MIN_SLIDES = 2` — but that is a Shoogle rule and
     * must not be presented as Instagram's.
     */
    carouselMinSlides: unverified(),
    // "Carousels are limited to 10 images, videos, or a mix of the two."
    carouselMaxSlides: verified(10, IG_CONTENT_PUBLISHING),
    /**
     * UNVERIFIED on purpose. The documented flow is container → publish with no
     * scheduled-time parameter — but the absence of a parameter in the docs is
     * not a citation that scheduling is unsupported, and this codebase does not
     * record absence as fact. Practically it changes nothing: `scheduling.ts`
     * already assumes Shoogle owns the clock.
     */
    providerSideScheduling: unverified(),
    /**
     * True. Standard Access publishes only for accounts holding a role on our
     * app; "Business Verification is required to get Advanced Access", and
     * Advanced Access is what real customers need.
     */
    requiresAppReview: verified(true, IG_ACCESS_LEVELS),
    /**
     * Instagram documents no provider-side scheduling at all, so it imposes no
     * window — Shoogle's runner publishes now, at due time. Both stay null:
     * the bounds that apply to an Instagram-only post are Shoogle's own.
     */
    scheduleMinLeadMinutes: unverified(),
    scheduleMaxHorizonDays: unverified(),
  },

  /**
   * Facebook Page posts. See `docs/research/meta-facebook-pages.md`.
   *
   * Read the differences from Instagram rather than assuming they are similar
   * because both are Meta: Facebook takes a binary upload, accepts PNG, and
   * schedules natively. Instagram does none of the three.
   */
  facebook: {
    platform: 'facebook',
    /**
     * UNVERIFIED. The `/{page-id}/feed` reference documents no maximum length
     * for `message`. Do not hard-code one and do not truncate — let Facebook
     * reject and surface its own error. Same posture as GBP's `summary`.
     */
    captionMaxCharacters: unverified(),
    hashtagMaxCount: unverified(),
    /**
     * Facebook documents ".jpeg, .bmp, .png, .gif, .tiff" — note that **PNG is
     * accepted**, the exact opposite of Instagram.
     *
     * This list is Facebook's documented set INTERSECTED with the formats
     * `MediaFormat` can represent. BMP, GIF and TIFF are genuinely accepted by
     * Facebook and are simply not things Shoogle can hold, so their absence
     * here is a Shoogle limitation, not a Facebook rule. WEBP and HEIC are a
     * different case: they are absent from Facebook's list, so they are real
     * violations.
     *
     * The 1 MB PNG figure on the same page is a RECOMMENDATION ("or the image
     * may appear pixelated"), not a limit, and must never be enforced as one.
     */
    acceptedImageFormats: verified(['jpeg', 'png'], FB_PAGE_PHOTOS),
    /**
     * UNVERIFIED. The video publishing guide states no Page video format,
     * size or duration spec. The upload-session docs name pdf/jpeg/jpg/png/mp4,
     * but that is a list of what the RESUMABLE UPLOADER accepts, not a Page
     * video specification, and recording it as one would be a fabrication.
     */
    acceptedVideoFormats: unverified(),
    /** Multi-photo posts exist; no documented count in either direction. */
    carouselMinSlides: unverified(),
    carouselMaxSlides: unverified(),
    /** `published=false` + `scheduled_publish_time`. Real native scheduling. */
    providerSideScheduling: verified(true, FB_PAGE_FEED),
    /**
     * "All Page-related Permissions and Features require approval through the
     * App Review process before your app can use them when your app goes live."
     */
    requiresAppReview: verified(true, FB_PAGES_OVERVIEW),
    /** Both Meta pages agree on the floor: 10 minutes. */
    scheduleMinLeadMinutes: verified(10, FB_PAGE_FEED),
    /**
     * THE CONFLICT. Two Meta pages, two different maxima:
     *   - the Pages API posts guide says 30 days
     *   - the /{page-id}/feed reference says 75 days
     * Shoogle enforces 30 and says why. See `conflicted()` for the reasoning.
     */
    scheduleMaxHorizonDays: conflicted(
      30,
      [FB_PAGES_POSTS, FB_PAGE_FEED],
      'Meta documents the maximum as 30 days on the Pages API posts guide and 75 days on the /{page-id}/feed reference. Shoogle enforces the conservative 30.',
    ),
  },

  /**
   * Google Business Profile local posts.
   * See `docs/research/google-business-profile.md` §6.
   */
  google_business: {
    platform: 'google_business',
    /**
     * UNVERIFIED on purpose. The `LocalPost` reference states no character
     * limit for `summary`. Do not hard-code one and do not silently truncate —
     * let the API reject an over-long post and surface Google's own error.
     */
    captionMaxCharacters: unverified(),
    /** Not a GBP concept in the reference, and undocumented. Not guessed. */
    hashtagMaxCount: unverified(),
    /**
     * UNVERIFIED. §8 of the GBP research documents a minimum photo size
     * (250 px short edge, 10 KB) but no accepted-format list. A size floor is
     * not a format list, so this stays null.
     */
    acceptedImageFormats: unverified(),
    acceptedVideoFormats: unverified(),
    /** A local post is not a carousel. Neither bound is documented. */
    carouselMinSlides: unverified(),
    carouselMaxSlides: unverified(),
    /**
     * TRUE, and genuinely different from Instagram: `LocalPost.scheduledTime`
     * is a documented field. GBP scheduling is real API scheduling, not Shoogle
     * simulating it, so the GBP publisher can hand the clock over.
     */
    providerSideScheduling: verified(true, GBP_LOCAL_POSTS),
    /**
     * TRUE by a different mechanism than Meta's. Google does not review an
     * "app" in the app-store sense; it reviews an **API access request**, and
     * an unapproved Cloud project sits at 0 QPM — it cannot publish at all.
     * The owner-facing consequence is identical, which is what this flag is
     * for, so it is recorded as true and the mechanism noted here.
     */
    requiresAppReview: verified(true, GBP_PREREQS),
    /**
     * `scheduledTime` is documented but no window around it is. Unlike
     * Instagram — where no window applies because there is no provider
     * scheduling at all — here scheduling IS supported and the bounds are
     * simply unpublished. Both are null; the reasons are not the same.
     */
    scheduleMinLeadMinutes: unverified(),
    scheduleMaxHorizonDays: unverified(),
  },
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
 * Every limit currently claimed as verified WITHOUT a first-party source,
 * described as `"<platform>.<field>"`. A test asserts this list is empty.
 *
 * WHY THIS REPLACED `assumesFormatAccepted()`
 * -------------------------------------------
 * On Day 1 the guard was "no format list is verified at all", which was easy to
 * assert because nothing in this file was researched. That guard has now done
 * its job and expired: Instagram's accepted formats ARE known, cited to Meta's
 * own documentation, and asserting they are still unknown would mean deleting
 * a true fact to keep a test green.
 *
 * The claim actually worth guarding forever is the one underneath it — that
 * nobody writes a limit down without saying where it came from. "PNG is
 * probably fine" and "I think it's 2200" both fail this check; a line quoting
 * Meta does not. `verified()` already requires a source at the call site, so
 * this catches the object literal that skips the constructor.
 */
export function unsourcedLimits(): string[] {
  const offenders: string[] = [];
  for (const caps of Object.values(PLATFORM_CAPABILITIES)) {
    for (const [field, limit] of Object.entries(caps)) {
      if (field === 'platform') continue;
      const claim = limit as Limit<unknown>;
      if (claim.verification === 'unverified') continue;

      if (claim.source === null || claim.source === '') {
        offenders.push(`${caps.platform}.${field}`);
        continue;
      }
      // A conflict must show its work: every page consulted, and what they
      // disagree about. One URL cannot evidence a disagreement.
      if (claim.verification === 'conflicted') {
        const enough = (claim.sources?.length ?? 0) >= 2 && (claim.conflict ?? '').trim() !== '';
        if (!enough) offenders.push(`${caps.platform}.${field}`);
      }
    }
  }
  return offenders;
}

/** Formats Shoogle can even identify. Used by the picker, not by validation. */
export const KNOWN_FORMATS: readonly MediaFormat[] = [...IMAGE_FORMATS, ...VIDEO_FORMATS];
