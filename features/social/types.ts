/**
 * Social domain vocabulary. Owner: Yash.
 *
 * These are the types every other file in `features/social` and
 * `features/carousel` is written against. Three rules shaped them:
 *
 * 1. **Unknown is not zero.** Anything a provider has not told us is `null`,
 *    never `0` and never an empty array standing in for "we didn't ask".
 *    Reach, saves, pixel dimensions and byte sizes are all nullable.
 *
 * 2. **Post lifecycle and publish state are separate axes.** A post is
 *    `scheduled` while its Instagram target is still `not_attempted`; a post is
 *    `failed` because one target failed, not because the post stopped existing.
 *    Conflating them is how apps end up claiming something published when only
 *    one of three targets did. See `postState.ts` for the lifecycle and
 *    `PublishStatus` below for the per-target axis.
 *
 * 3. **Provider connection state is a third axis entirely** and lives in
 *    `@/types/domain` (`ConnectionStatus`) and the provider registry. A post
 *    does not know whether Instagram is linked; the publisher asks.
 */

import type { BusinessCategory, ProviderId } from '@/types/domain';

import type { PostContent } from './content';
import type { PostState } from './postState';

/* -------------------------------------------------------------------------- */
/* Platform                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Where a post can go. This is a subset of `ProviderId` by construction — the
 * assertion below fails to compile if the two ever drift apart.
 *
 * `google_business` is here because a Google local post is authored in the same
 * composer as an Instagram post. `features/gbp` deliberately does not build a
 * second composer for it (see that feature's README); the publisher below is
 * the single authoring path.
 *
 * WHY THIS LIST NOW COINCIDES WITH `ProviderId`
 * ---------------------------------------------
 * It did not always. `ProviderId` once carried a fourth member, `linkedin`,
 * which was never a publishing target and survived only so the Business tab
 * could list it as an unconnected account. It was removed from the product
 * entirely on 2026-09-16, so the two lists happen to hold the same three
 * platforms today. They are still separate vocabularies: the assertion below
 * checks that every Platform is a ProviderId, NOT that the reverse holds, so a
 * future non-publishing provider can be added without touching this array.
 *
 * A platform Shoogle can never publish to does not belong in this array,
 * because every capability check, target picker and publisher loop iterates it.
 *
 * FACEBOOK — RESTORED 2026-09-09, AND WHY THE HISTORY MATTERS
 * ----------------------------------------------------------
 * Facebook was briefly removed here on the reading that Meta was only ever an
 * Instagram authentication detail. That was wrong: **Facebook is a first-class
 * publishing target with its own content shape**, and the owner picks any
 * combination of the three.
 *
 * The three are not variations of one thing. Per `docs/research/`, they
 * disagree on nearly every rule that matters — Facebook takes a binary upload
 * and accepts PNG, Instagram demands a public URL and JPEG only; Facebook and
 * Google schedule natively, Instagram does not. That is why content is
 * per-platform and why `platforms.ts` carries a source per limit rather than
 * one shared constant.
 */
export const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'google_business'] as const;

export type Platform = (typeof SOCIAL_PLATFORMS)[number];

/** Compile-time guarantee that every Platform is a real ProviderId. */
const _platformsAreProviders: readonly ProviderId[] = SOCIAL_PLATFORMS;
void _platformsAreProviders;

/** Owner-facing platform names. Used in row badges and target pickers. */
export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  google_business: 'Google Business',
};

/** Short forms for the cramped "where" badge on a list row. */
export const PLATFORM_SHORT_LABEL: Record<Platform, string> = {
  instagram: 'IG',
  facebook: 'FB',
  google_business: 'GBP',
};

/**
 * "Instagram", or "IG + FB" once there is more than one. Kept here so the list
 * row, the composer and the next-up card all read identically.
 */
export function describeTargets(platforms: readonly Platform[]): string | null {
  if (platforms.length === 0) return null;
  const [only] = platforms;
  if (platforms.length === 1 && only !== undefined) return PLATFORM_LABEL[only];
  return platforms.map((p) => PLATFORM_SHORT_LABEL[p]).join(' + ');
}

/* -------------------------------------------------------------------------- */
/* Caption                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Product rule 12: the UI is English, but generated *business content* may be
 * Hindi, Marathi or Hinglish. The language travels with the caption so the
 * composer can show it and the generator can be asked for it again.
 */
export type CaptionLanguage = 'en' | 'hi' | 'mr' | 'hinglish';

export const CAPTION_LANGUAGE_LABEL: Record<CaptionLanguage, string> = {
  en: 'English',
  hi: 'Hindi',
  mr: 'Marathi',
  hinglish: 'Hinglish',
};

/**
 * How a caption came to exist. This is not decoration: an owner is entitled to
 * know which words are theirs and which a model wrote, and `generated` copy
 * must never be presented as the owner's own.
 */
export type CaptionOrigin = 'owner' | 'generated' | 'generated_edited';

export interface Caption {
  /** The caption body as it will be sent. May be Hindi/Marathi/Hinglish. */
  body: string;
  /** Hashtags WITHOUT the leading '#', in the order the owner wants them. */
  hashtags: string[];
  language: CaptionLanguage;
  origin: CaptionOrigin;
  /**
   * Model identifier when `origin` is generated. Null for owner-written copy.
   * Recorded so a bad batch can be traced to the model that produced it.
   */
  generatedBy: string | null;
}

/* -------------------------------------------------------------------------- */
/* Media                                                                      */
/* -------------------------------------------------------------------------- */

export type MediaKind = 'image' | 'video';

/**
 * Container formats Shoogle can encounter on an Android device.
 *
 * `unknown` is a real member on purpose: a content:// URI from the Android
 * picker does not always disclose its type, and guessing "it's probably JPEG"
 * is exactly the assumption the brief forbids. An unknown format must be
 * probed or transcoded before publishing, never assumed acceptable.
 */
export type MediaFormat = 'jpeg' | 'png' | 'webp' | 'heic' | 'mp4' | 'mov' | 'unknown';

export const IMAGE_FORMATS: readonly MediaFormat[] = ['jpeg', 'png', 'webp', 'heic'];
export const VIDEO_FORMATS: readonly MediaFormat[] = ['mp4', 'mov'];

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  format: MediaFormat;
  /**
   * Local `file://` / `content://` URI, or an https URL once uploaded.
   * Never a `data:` URI — every provider needs a fetchable source.
   */
  uri: string;
  /** Pixel dimensions, or null when the asset has not been measured yet. */
  width: number | null;
  height: number | null;
  /** Bytes, or null when not measured. Not 0 — 0 would mean an empty file. */
  byteSize: number | null;
  /** Duration for video, in seconds. Null for stills and unmeasured video. */
  durationSeconds: number | null;
  /** Owner-written alt text. Null until someone writes it. */
  altText: string | null;
}

/** Aspect ratio, or null when the asset has not been measured. */
export function aspectRatio(asset: MediaAsset): number | null {
  if (asset.width === null || asset.height === null) return null;
  if (asset.width <= 0 || asset.height <= 0) return null;
  return asset.width / asset.height;
}

/**
 * One word for the media placeholder tile ("photo", "video"). Returns null when
 * there is no media, so the caller renders nothing rather than "0 photos".
 */
export function describeMedia(media: readonly MediaAsset[]): string | null {
  if (media.length === 0) return null;
  if (media.length > 1) return `${media.length} slides`;
  const [first] = media;
  return first?.kind === 'video' ? 'video' : 'photo';
}

/* -------------------------------------------------------------------------- */
/* Schedule                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * When a post goes out.
 *
 * `owner: 'shoogle'` is a literal, not a variable, and that is the point: no
 * external platform is assumed to offer a scheduling API, so Shoogle holds the
 * clock and calls publish at due time. See `scheduling.ts` for what that
 * implies and what is still missing.
 */
export interface Schedule {
  /** The instant the post is due, as an ISO 8601 UTC timestamp. */
  dueAt: string;
  /**
   * The IANA timezone the owner chose it in, e.g. 'Asia/Kolkata'. Display must
   * use this, never the device's — a shop owner travelling does not want their
   * 9am post to move.
   */
  timeZone: string;
  readonly owner: 'shoogle';
}

/* -------------------------------------------------------------------------- */
/* Publish status (per target)                                                */
/* -------------------------------------------------------------------------- */

/**
 * The state of ONE target of ONE post. Distinct from the post's lifecycle
 * state, and distinct again from whether the provider is connected.
 *
 * `succeeded` is set only from a provider response that carried a remote id.
 * There is no optimistic success anywhere in this feature.
 */
export type PublishStatus =
  | 'not_attempted'
  | 'queued'
  | 'in_flight'
  | 'succeeded'
  | 'failed'
  | 'skipped';

/**
 * What KIND of problem this was, which decides what the owner is asked to do.
 *
 * Required rather than optional, so every construction site has to decide.
 * The two need different actions and conflating them wastes the owner's time:
 *
 *   `authorization`  Shoogle's permission to post is missing, expired or was
 *                    revoked, or the platform cannot be reached at all. Retrying
 *                    changes nothing — the owner must RECONNECT the account.
 *   `publish`        The platform was reached and refused this particular post:
 *                    a rejected image, a rate limit, a transient 5xx. The
 *                    connection is fine; RETRY is the useful action.
 *
 * Telling someone to reconnect a working account, or to retry a post that will
 * be refused identically until they reconnect, is the failure this prevents.
 */
export type PublishFailureKind = 'authorization' | 'publish';

export interface PublishFailure {
  /** Stable code for logging and branching. Never shown raw to the owner. */
  code: string;
  /** Which of the two problems this is, and therefore which action to offer. */
  kind: PublishFailureKind;
  /** Owner-facing sentence. Must never contain a token, URL or stack. */
  message: string;
  retryable: boolean;
}

export interface PublishTarget {
  platform: Platform;
  status: PublishStatus;
  /** Permalink, present only once the provider confirmed publication. */
  permalink: string | null;
  /** The provider's own id for the published object. Proof it went out. */
  remoteId: string | null;
  /** Instant the provider confirmed it. Null until then. */
  publishedAt: string | null;
  /**
   * Why this target did not publish. Present when `status` is 'failed', and
   * when `status` is 'skipped' *because Shoogle could not reach the platform*.
   *
   * A skip with `failure === null` is one the OWNER chose (product rule 5).
   * A skip with a `failure` is one Shoogle made on their behalf. Both are
   * skips; only one of them is something the owner may want to fix, and
   * collapsing them would either nag about a deliberate choice or bury a
   * broken connection.
   */
  failure: PublishFailure | null;
}

/**
 * True when Shoogle skipped this target because the platform was unreachable —
 * as opposed to the owner skipping it deliberately.
 *
 * Product rule 13: one platform's problem must not block another, so an
 * unreachable target is skipped rather than failing the whole post. That is
 * only honest if the skip stays visible, which is what this predicate is for.
 */
export function wasSkippedForUnavailability(target: PublishTarget): boolean {
  return target.status === 'skipped' && target.failure !== null;
}

/**
 * Targets the owner should be told about: something went wrong, or Shoogle
 * skipped it for them. Empty for a post that published cleanly.
 */
export function targetsNeedingAttention(post: SocialPost): PublishTarget[] {
  return post.targets.filter(
    (target) => target.status === 'failed' || wasSkippedForUnavailability(target),
  );
}

/** A fresh, unattempted target. The only sanctioned way to make one. */
export function newTarget(platform: Platform): PublishTarget {
  return {
    platform,
    status: 'not_attempted',
    permalink: null,
    remoteId: null,
    publishedAt: null,
    failure: null,
  };
}

/** True only for a target the provider confirmed with a remote id. */
export function isConfirmedPublished(target: PublishTarget): boolean {
  return target.status === 'succeeded' && target.remoteId !== null;
}

/* -------------------------------------------------------------------------- */
/* Insights                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What a provider reported about a published post.
 *
 * Every field is nullable and `reportedAt` is null until a provider actually
 * answered. A post published five minutes ago has `reach: null`, not `reach: 0`
 * — nobody has counted yet.
 *
 * ============ RUNTIME ONLY. DURABLE STORAGE IS DEFERRED (2026-09-16) =========
 *
 * Decision 6 kept post-level metrics OUT of the Phase 1 `metric_snapshots`
 * design, and deliberately did not reserve a `post_target_id` column. Nothing
 * writes this type today — `publisher.ts` sets `insights: null` after every
 * publish, because publishing tells us a post went out, not how it did.
 *
 * The reason is capability, not effort: **no supported platform has a verified
 * post-level metric source.**
 *
 *   Google Business Profile  Post performance was REMOVED from the API on
 *                            2023-02-20 and not replaced. See
 *                            `LOCAL_POST_VIEWS_SEARCH` and
 *                            `LOCAL_POST_ACTIONS_CALL_TO_ACTION` in
 *                            `features/seo/metrics.ts` → `REMOVED_METRICS`.
 *                            This is permanent, not pending.
 *   Instagram                UNVERIFIED. `docs/research/meta-instagram.md` §1
 *                            selects Instagram Login, lists its four scopes,
 *                            and records that the accepted trade-off gives up
 *                            insights. No insights scope appears on that path.
 *   Facebook                 No provider contract exists yet, so there is no
 *                            seam to collect through.
 *
 * Run `api-researcher` against the Instagram and Facebook insight surfaces
 * before designing storage for this. Guessing the shape is the expensive
 * mistake (`CLAUDE.md`, rule 11).
 *
 * ⚠️ WHEN IT IS PERSISTED, IT MUST NOT BE PERSISTED IN THIS SHAPE.
 * `SocialPost.insights` is ONE field for a post that may have three targets, so
 * it cannot say whose reach a number is. Reach is per-platform, and `remoteId`
 * — the only proof a post published at all — lives on the target. A durable row
 * must therefore key on the TARGET, never on the post. Storing this shape as-is
 * would reproduce, one layer up, the exact "one platform's result presented as
 * the post's result" failure that `PublishTarget` exists to prevent.
 */
export interface PostInsights {
  reach: number | null;
  saves: number | null;
  /** Instant the provider reported these numbers. Null when never reported. */
  reportedAt: string | null;
}

/**
 * "2,412 reached · 84 saves", or null when the provider has reported nothing.
 * Never returns "0 reached" for an unmeasured post.
 */
export function describeInsights(insights: PostInsights | null): string | null {
  if (insights === null || insights.reportedAt === null) return null;
  const parts: string[] = [];
  if (insights.reach !== null) parts.push(`${insights.reach.toLocaleString('en-IN')} reached`);
  if (insights.saves !== null) parts.push(`${insights.saves.toLocaleString('en-IN')} saves`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/* -------------------------------------------------------------------------- */
/* The post                                                                   */
/* -------------------------------------------------------------------------- */

export interface SocialPost {
  id: string;
  businessId: string;
  /**
   * Short internal title, shown in lists. This is the owner's or the
   * generator's working name for the post — it is NOT sent to any platform.
   */
  title: string;
  state: PostState;
  /**
   * What this post says on each platform it targets.
   *
   * NOT one caption reused everywhere. Instagram, Facebook and Google take
   * genuinely different objects — Instagram cannot publish without media,
   * Facebook can publish words alone, Google requires a topic type that
   * decides which other fields exist — so each targeted platform carries its
   * own content, and a platform absent from this map is one this post does not
   * speak to. `{}` is a post nobody has written yet.
   *
   * See `features/social/content/`.
   */
  content: PostContent;
  media: MediaAsset[];
  /** Set when this post renders a carousel. See `features/carousel`. */
  carouselId: string | null;
  /** Null for a post nobody has scheduled yet. */
  schedule: Schedule | null;
  targets: PublishTarget[];
  /** Null until a provider reports something. Never a zeroed placeholder. */
  insights: PostInsights | null;
  createdAt: string;
  updatedAt: string;
  /** True when this record came from a labelled development fixture. */
  isFixture?: boolean;
}

/** The platforms this post is aimed at, in target order. */
export function targetPlatforms(post: SocialPost): Platform[] {
  return post.targets.map((t) => t.platform);
}

/* -------------------------------------------------------------------------- */
/* Generation briefs                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Everything the generator is allowed to know about a business.
 *
 * Deliberately narrow: no customer names, no review text, no phone numbers.
 * Widening this type is the moment to re-read the data-use terms of whichever
 * model tier is configured.
 */
export interface BusinessBrief {
  businessId: string;
  name: string;
  category: BusinessCategory;
  locality: string | null;
}
