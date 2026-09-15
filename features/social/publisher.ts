/**
 * The social publisher. Owner: Yash.
 *
 * ==================== THERE IS NO FAKE PUBLISHING HERE =====================
 *
 * `createSocialPublisher()` is constructed with a map of `PlatformPublisher`s.
 * That map is EMPTY in the app today, because no Instagram, Facebook, LinkedIn
 * or Google Business publishing integration exists: none of them has been
 * researched (`platforms.ts`), no OAuth flow completes, and no credential is
 * present. With an empty map:
 *
 *   availableTargets()  -> ready([])            no target is reachable
 *   schedule(...)       -> unavailable(...)     and NOTHING is stored
 *   attemptPublish(...) -> unavailable(...)     no request is made
 *
 * It would be easy to accept the schedule, write a row, and show the owner a
 * tidy list of upcoming posts. That is the dishonest version: there is no
 * runner and no publisher, so not one of those posts would ever go out. The
 * refusal is the feature.
 *
 * `succeeded` is set in exactly one place — `applyPublishOutcome` — and only
 * when the provider returned a remote id. There is no optimistic success path,
 * no toast that fires before the promise settles, and no way to reach
 * `published` without passing through `publishing`.
 *
 * WIRING A REAL PLATFORM
 * ----------------------
 *   1. `api-researcher` -> docs/research/<platform>.md, then fill in
 *      `PLATFORM_CAPABILITIES`.
 *   2. Implement `PlatformPublisher` for it in this folder.
 *   3. Pass it in the `publishers` map.
 *   4. Register its `ConnectableProvider` with `registerProvider()` — but only
 *      once `connect()` can complete a real OAuth flow. Registering earlier
 *      would delete the "Integration not built yet" line the Business tab
 *      shows, replacing a true statement with a false one.
 */

import type { PublishRequest, SocialPublisher } from '@/lib/providers/contracts';
import type { Result } from '@/lib/providers/types';
import { failed, ready, unavailable, type ErrorState } from '@/lib/state/DataState';
import type { Post, PostStatus, ProviderId } from '@/types/domain';

import {
  facebookContent,
  gbpContent,
  instagramContent,
  primaryText,
  type InstagramFormat,
  type PostContent,
} from './content';
import { transition, toSharedStatus, type PostState } from './postState';
import { validateSchedule } from './scheduling';
import type { PostStore } from './store';
import {
  newTarget,
  PLATFORM_LABEL,
  SOCIAL_PLATFORMS,
  type Caption,
  type MediaAsset,
  type Platform,
  type PublishFailure,
  type PublishTarget,
  type Schedule,
  type SocialPost,
} from './types';

/* -------------------------------------------------------------------------- */
/* Platform publisher                                                         */
/* -------------------------------------------------------------------------- */

/**
 * What one platform's publishing adapter must do.
 *
 * Note there is no `schedule` method. Every adapter publishes NOW; Shoogle
 * holds the clock (see `scheduling.ts`). If a platform is later proven to
 * schedule reliably, that adapter can implement the delay internally — the
 * contract does not change.
 */
export interface PlatformPublisher {
  readonly platform: Platform;
  /**
   * Publish immediately. Must resolve `succeeded` ONLY with a remote id from
   * the provider's response.
   */
  publishNow(post: SocialPost): Promise<PublishOutcome>;
}

export type PublishOutcome =
  | { ok: true; remoteId: string; permalink: string | null; publishedAt: string }
  | { ok: false; failure: PublishFailure };

/* -------------------------------------------------------------------------- */
/* Dependencies                                                               */
/* -------------------------------------------------------------------------- */

export interface SocialPublisherDeps {
  store: PostStore;
  /** Platform adapters. Empty in the app today — see the file header. */
  publishers?: Partial<Record<Platform, PlatformPublisher>>;
  /** Business the composer is working on. */
  businessId: string;
  /** IANA zone schedules are expressed in. */
  timeZone: string;
  now?: () => Date;
  newId?: () => string;
}

/** Shoogle's publisher: the shared contract, plus the runner's entry point. */
export interface ShooglePublisher extends SocialPublisher {
  /**
   * Attempt every target of a due post. Called by the scheduled runner, never
   * by a screen — a screen calling this would be publishing on a timer that
   * only runs while the app is open.
   */
  attemptPublish(postId: string): Result<Post>;
}

const NO_PUBLISHER_MESSAGE =
  'No social account is connected yet, so Shoogle cannot schedule or publish this post.';

function missingPlatformMessage(platforms: readonly Platform[]): string {
  // Owner-facing names, not enum values: "Google Business", not
  // "google_business". This sentence is read by a salon owner, not a log.
  const names = platforms.map((platform) => PLATFORM_LABEL[platform]).join(', ');
  return `Shoogle cannot publish to ${names} yet — that integration is not built.`;
}

/* -------------------------------------------------------------------------- */
/* Mapping to the shared domain type                                          */
/* -------------------------------------------------------------------------- */

/**
 * Project onto `@/types/domain`'s `Post`, which is what Home and other
 * features consume. Lossy on purpose: nothing outside this feature needs
 * carousels, media measurements or caption provenance.
 */
export function toDomainPost(post: SocialPost): Post {
  return {
    id: post.id,
    status: toSharedStatus(post.state),
    // The first targeted platform's own words, not a synthesised summary —
    // see `primaryText`. Three platforms say different things and inventing a
    // fourth wording would put words in the owner's mouth.
    body: primaryText(post.content),
    scheduledFor: post.schedule?.dueAt ?? null,
    targets: post.targets.map((target) => ({
      provider: target.platform,
      status: publishStatusToPostStatus(target.status, post.state),
      url: target.permalink,
    })),
    ...(post.isFixture === true ? { isFixture: true as const } : {}),
  };
}

function publishStatusToPostStatus(status: PublishTarget['status'], postState: PostState): PostStatus {
  switch (status) {
    case 'succeeded':
      return 'published';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
    case 'in_flight':
      return 'publishing';
    case 'queued':
      return 'scheduled';
    case 'not_attempted':
      // An unattempted target inherits the post's own state — a post that is
      // still a draft has draft targets, not "scheduled" ones.
      return toSharedStatus(postState);
  }
}

/* -------------------------------------------------------------------------- */
/* Outcome application                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The ONLY place a target becomes `succeeded`, and it requires a remote id.
 * Exported so a test can prove that property directly.
 */
export function applyPublishOutcome(target: PublishTarget, outcome: PublishOutcome): PublishTarget {
  if (!outcome.ok) {
    return { ...target, status: 'failed', failure: outcome.failure };
  }
  return {
    ...target,
    status: 'succeeded',
    remoteId: outcome.remoteId,
    permalink: outcome.permalink,
    publishedAt: outcome.publishedAt,
    failure: null,
  };
}

/* -------------------------------------------------------------------------- */
/* The publisher                                                              */
/* -------------------------------------------------------------------------- */

function isPlatform(id: ProviderId): id is Platform {
  return (SOCIAL_PLATFORMS as readonly ProviderId[]).includes(id);
}

/**
 * Build per-platform content from the shared contract's single `body`.
 *
 * ⚠️ THIS IS THE LOSSY PATH, AND IT IS LOSSY BECAUSE THE CONTRACT IS.
 *
 * `PublishRequest` in `lib/providers/contracts.ts` is shared foundation code
 * carrying one `body` and one `mediaUris` for every target. Fanning that one
 * body out is the best that can be done from this entry point — and it is
 * exactly the "one caption copied everywhere" the composer must NOT do. The
 * composer will construct `PostContent` directly, per platform, with its own
 * generated copy for each; this function exists so the cross-feature contract
 * still works in the meantime.
 *
 * Instagram is OMITTED when there is no media, rather than fabricated. Its
 * format union has no text-only member because Instagram cannot publish one,
 * so there is nothing truthful to construct — and `reviewPostContent` then
 * reports the Instagram target as having nothing to say, which is accurate.
 */
function contentFromSharedRequest(
  body: string,
  media: readonly MediaAsset[],
  platforms: readonly Platform[],
): PostContent {
  const text: Caption = {
    body,
    hashtags: [],
    language: 'en',
    origin: 'owner',
    generatedBy: null,
  };

  const content: PostContent = {};

  if (platforms.includes('instagram')) {
    const format = instagramFormatFor(media);
    if (format !== null) content.instagram = instagramContent(text, format);
  }

  if (platforms.includes('facebook')) {
    // Facebook takes words alone, so there is always something to build.
    const [first] = media;
    content.facebook = facebookContent(
      text,
      media.length === 0
        ? { kind: 'text' }
        : media.length === 1 && first !== undefined
          ? first.kind === 'video'
            ? { kind: 'video', video: first }
            : { kind: 'photo', photo: first }
          : { kind: 'multi_photo', photos: [...media] },
    );
  }

  if (platforms.includes('google_business')) {
    content.google_business = gbpContent(text, { kind: 'STANDARD' }, { media: [...media] });
  }

  return content;
}

/** The natural Instagram format for this media, or null when there is none. */
function instagramFormatFor(media: readonly MediaAsset[]): InstagramFormat | null {
  if (media.length === 0) return null;
  if (media.length > 1) {
    return {
      kind: 'carousel',
      items: media.map((asset) =>
        asset.kind === 'video'
          ? ({ kind: 'video', video: asset } as const)
          : ({ kind: 'image', image: asset, altText: null } as const),
      ),
    };
  }
  const [only] = media;
  if (only === undefined) return null;
  return only.kind === 'video'
    ? { kind: 'video', video: only }
    : { kind: 'single_image', image: only, altText: null };
}

/** Media URIs arrive as strings from the composer; formats are probed later. */
function mediaFromUris(uris: readonly string[], newId: () => string): MediaAsset[] {
  return uris.map((uri) => ({
    id: newId(),
    kind: 'image',
    // Not guessed from the extension: an unprobed file is 'unknown', and
    // `checkMediaFormat` treats 'unknown' as a blocking problem rather than
    // assuming it is a JPEG.
    format: 'unknown',
    uri,
    width: null,
    height: null,
    byteSize: null,
    durationSeconds: null,
    altText: null,
  }));
}

export function createSocialPublisher(deps: SocialPublisherDeps): ShooglePublisher {
  const { store, businessId, timeZone } = deps;
  const publishers = deps.publishers ?? {};
  const now = deps.now ?? (() => new Date());

  let counter = 0;
  const newId =
    deps.newId ??
    (() => {
      counter += 1;
      return `post-${now().getTime()}-${counter}`;
    });

  const reachable = (): Platform[] =>
    SOCIAL_PLATFORMS.filter((platform) => publishers[platform] !== undefined);

  async function loadPost(postId: string): Promise<SocialPost | null> {
    return store.get(postId);
  }

  function notFound(postId: string): ErrorState {
    return failed('post_not_found', `Shoogle has no post with id ${postId}.`, false);
  }

  return {
    /* -- Targets --------------------------------------------------------- */

    async availableTargets(): Result<ProviderId[]> {
      // A genuine, known zero: we can enumerate the adapters, and there are
      // none. This is not "unknown" — it is "nothing is wired up".
      return ready<ProviderId[]>(reachable(), now().toISOString());
    },

    /* -- Scheduling ------------------------------------------------------ */

    async schedule(request: PublishRequest): Result<Post> {
      const platforms = request.targets.filter(isPlatform);
      if (platforms.length !== request.targets.length) {
        const unknown = request.targets.filter((t) => !isPlatform(t));
        return failed('unknown_target', `Shoogle does not publish to ${unknown.join(', ')}.`, false);
      }
      if (platforms.length === 0) {
        return failed('no_target', 'Choose at least one account to post to.', false);
      }

      /*
       * PRODUCT RULE 13 — one platform never blocks another.
       *
       * This used to refuse the whole post when ANY target was unreachable, so
       * an unconnected Facebook cost the owner their Instagram post. That is
       * the coupling the rule forbids, and it is fixed here.
       *
       * The refusal survives for the case it was actually written for: when
       * NOTHING can be reached, there is genuinely nothing to schedule, and
       * storing a due date with no publisher behind it would show the owner an
       * upcoming post that can never go out.
       *
       * Unreachable targets are NOT marked skipped here. Availability at
       * scheduling time is not availability at due time — a token reconnected
       * this afternoon should publish tonight — so each target is judged when
       * it is actually attempted. See `attemptPublish`.
       */
      const reachableTargets = platforms.filter((platform) => publishers[platform] !== undefined);
      if (reachableTargets.length === 0) {
        // Name what could not be reached. Rule 13 applies to messages too: an
        // owner told "no account is connected" while their Instagram works
        // fine learns nothing they can act on.
        return unavailable(
          'not_connected',
          reachable().length === 0 ? NO_PUBLISHER_MESSAGE : missingPlatformMessage(platforms),
        );
      }

      const timestamp = now().toISOString();

      /*
       * A `scheduled` post ALWAYS has a schedule — that invariant is what lets
       * the runner find due work with one query. "Post now" is not the absence
       * of a schedule; it is a schedule due immediately, which is why it skips
       * the lead-time rule (that rule protects future posts from racing their
       * own media upload, and an owner watching the screen is not racing it).
       */
      let schedule: Schedule;
      if (request.scheduledFor === null) {
        schedule = { dueAt: timestamp, timeZone, owner: 'shoogle' };
      } else {
        const validation = validateSchedule(request.scheduledFor, timeZone, now());
        if (!validation.ok) {
          return failed(`schedule_${validation.reason}`, validation.message, false);
        }
        schedule = validation.schedule;
      }

      // The post's id is allocated BEFORE its media's, so a post keeps the
      // same id whether or not it carries photos. Callers and tests address
      // posts by that id.
      const postId = newId();
      const media = mediaFromUris(request.mediaUris, newId);

      const post: SocialPost = {
        id: postId,
        businessId,
        title: request.body.split('\n')[0]?.slice(0, 80) ?? 'Untitled post',
        // Product rule 4: scheduling is the default. "Post now" is the explicit
        // choice the owner makes by passing `scheduledFor: null`, and it still
        // goes through `scheduled` so there is one path to `publishing`.
        state: 'scheduled',
        content: contentFromSharedRequest(request.body, media, platforms),
        media,
        carouselId: null,
        schedule,
        targets: platforms.map(newTarget),
        insights: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const stored = await store.put(post);
      return ready(toDomainPost(stored), timestamp);
    },

    /* -- Owner control: always one tap away, per product rule 5 ----------- */

    async cancelScheduled(postId: string): Result<void> {
      const post = await loadPost(postId);
      if (post === null) return notFound(postId);
      if (post.state !== 'scheduled') {
        return failed('not_scheduled', 'That post is not scheduled.', false);
      }
      await store.put({
        ...post,
        state: transition(post.state, 'unscheduled'),
        schedule: null,
        updatedAt: now().toISOString(),
      });
      return ready(undefined, now().toISOString());
    },

    async skipOccurrence(postId: string): Result<Post> {
      const post = await loadPost(postId);
      if (post === null) return notFound(postId);
      const next = transitionOrNull(post.state, 'skipped');
      if (next === null) {
        return failed('cannot_skip', `A ${post.state} post cannot be skipped.`, false);
      }
      const timestamp = now().toISOString();
      const updated = await store.put({
        ...post,
        state: next,
        targets: post.targets.map((target) =>
          target.status === 'not_attempted' || target.status === 'queued'
            ? { ...target, status: 'skipped' as const }
            : target,
        ),
        updatedAt: timestamp,
      });
      return ready(toDomainPost(updated), timestamp);
    },

    async getStatus(postId: string): Result<{ postId: string; status: PostStatus }> {
      const post = await loadPost(postId);
      if (post === null) return notFound(postId);
      return ready({ postId, status: toSharedStatus(post.state) }, now().toISOString());
    },

    /* -- The runner's entry point ---------------------------------------- */

    async attemptPublish(postId: string): Result<Post> {
      const post = await loadPost(postId);
      if (post === null) return notFound(postId);
      if (post.state !== 'scheduled') {
        return failed('not_publishable', `A ${post.state} post cannot be published.`, false);
      }

      /*
       * PRODUCT RULE 13 — one platform never blocks another.
       *
       * There is deliberately NO all-targets guard here any more. It used to
       * refuse the entire publish when any target lacked an adapter, which was
       * the worst instance of the coupling: at due time, an expired Facebook
       * token would have stopped a perfectly reachable Instagram post from
       * going out at all.
       *
       * Each target is now attempted, or skipped, on its own — see the loop
       * below. A post with nothing reachable still reaches `failed` honestly,
       * because every one of its targets will have been skipped.
       */

      // Enter `publishing` before any request leaves, so a crash mid-flight
      // leaves a post that is visibly in progress rather than one that looks
      // scheduled and may already have gone out.
      const inFlight: SocialPost = {
        ...post,
        state: transition(post.state, 'publish_started'),
        targets: post.targets.map((target) => ({ ...target, status: 'in_flight' as const })),
        updatedAt: now().toISOString(),
      };
      await store.put(inFlight);

      const settled: PublishTarget[] = [];
      for (const target of inFlight.targets) {
        const adapter = publishers[target.platform];
        if (adapter === undefined) {
          /*
           * SKIPPED, not FAILED. Nothing was attempted and nothing went wrong
           * with this post — Shoogle simply could not reach the platform. The
           * distinction is what the owner needs: a failure invites "try again",
           * a skip invites "reconnect Facebook".
           *
           * `failure` carries the reason, which is what separates a skip
           * Shoogle made from one the owner made with `skipOccurrence()` —
           * that one leaves `failure` null. Retryable, because reconnecting
           * genuinely fixes it.
           */
          settled.push({
            ...target,
            status: 'skipped',
            failure: {
              code: 'platform_unavailable',
              // Reconnect, not retry: Shoogle cannot reach the platform at all,
              // so another attempt fails identically.
              kind: 'authorization',
              message: `${PLATFORM_LABEL[target.platform]} skipped — reconnect ${PLATFORM_LABEL[target.platform]}.`,
              retryable: true,
            },
          });
          continue;
        }
        settled.push(applyPublishOutcome(target, await adapter.publishNow(inFlight)));
      }

      const anyConfirmed = settled.some(
        (target) => target.status === 'succeeded' && target.remoteId !== null,
      );
      const timestamp = now().toISOString();
      const finished = await store.put({
        ...inFlight,
        state: transition(inFlight.state, anyConfirmed ? 'publish_succeeded' : 'publish_failed'),
        targets: settled,
        // Insights stay null: publishing tells us it went out, not how it did.
        insights: null,
        updatedAt: timestamp,
      });

      return ready(toDomainPost(finished), timestamp);
    },
  };
}

/** `transition` without the throw, for owner-driven paths. */
function transitionOrNull(state: PostState, event: Parameters<typeof transition>[1]): PostState | null {
  try {
    return transition(state, event);
  } catch {
    return null;
  }
}
