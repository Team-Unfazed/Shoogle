/**
 * The Posts list view model. Owner: Yash.
 *
 * Turns `SocialPost[]` into exactly what the row components render. It exists
 * so the screen contains no derivation logic at all — which is how the honesty
 * rules end up testable as pure functions rather than as things a reviewer has
 * to spot inside JSX.
 *
 * Three rules are enforced here and asserted by tests:
 *
 *   - `lastReach` is `number | null`. A post published an hour ago that no
 *     provider has reported on yet contributes `null`, not `0`.
 *   - A published row's result line is either real reported numbers, or the
 *     time it went out. It is never invented and never zeroed.
 *   - A post only reaches `published` rows when a target carries a remote id,
 *     so "Published" always means a provider confirmed it.
 */

import { DRAFT_LIKE_STATES } from './postState';
import { bySoonestDue, nextDuePost } from './scheduling';
import { formatNextUpLabel, formatScheduleLabel } from './time';
import {
  describeInsights,
  describeMedia,
  describeTargets,
  isConfirmedPublished,
  targetPlatforms,
  targetsNeedingAttention,
  type SocialPost,
} from './types';

export interface NextUpView {
  id: string;
  /** "NEXT UP · TOMORROW 9:00 AM" — computed against the real clock. */
  label: string;
  title: string;
  /** "Instagram · Video", or just "Instagram" when there is no media. */
  channel: string;
  mediaLabel: string;
}

export interface ScheduledRowView {
  id: string;
  title: string;
  /** "Wed · 9:00 AM", in the business's timezone. */
  when: string;
  /** "Instagram", or "IG + FB". */
  where: string;
  mediaLabel: string;
}

export interface AttentionView {
  id: string;
  title: string;
  /** Why it needs the owner, e.g. "Caption missing". */
  body: string;
  actionLabel: string;
}

export interface PublishedRowView {
  id: string;
  title: string;
  /** Reported numbers, or when it went out. Never a fabricated metric. */
  result: string;
  mediaLabel: string;
}

export interface FailedRowView {
  id: string;
  /** A statement of what happened, not the post's own title. */
  title: string;
  /** The provider's owner-facing reason. */
  reason: string;
}

export interface PostsView {
  nextUp: NextUpView | null;
  counts: {
    scheduled: number;
    drafts: number;
    /** Null when no provider has reported reach for the last published post. */
    lastReach: number | null;
  };
  scheduled: ScheduledRowView[];
  needsAttention: AttentionView | null;
  published: PublishedRowView[];
  failed: FailedRowView | null;
}

/** Why a draft is not finished. Ordered by what the owner should fix first. */
/**
 * "Facebook skipped — reconnect Facebook", from the provider's own reason.
 *
 * Uses each target's recorded message rather than composing a new sentence, so
 * what the owner reads is what actually happened. Never says or implies that a
 * skipped target published.
 */
function describeBrokenTargets(post: SocialPost): string {
  const messages = targetsNeedingAttention(post)
    .map((target) => target.failure?.message)
    .filter((message): message is string => typeof message === 'string' && message.trim() !== '');
  return messages.length > 0 ? messages.join(' · ') : 'Some accounts did not publish';
}

function describeUnfinished(post: SocialPost): string {
  if (post.caption === null || post.caption.body.trim() === '') return 'Caption missing';
  if (post.media.length === 0 && post.carouselId === null) return 'No image yet';
  if (post.targets.length === 0) return 'No account chosen';
  return 'Not finished';
}

function channelLabel(post: SocialPost): string {
  const where = describeTargets(targetPlatforms(post));
  const media = describeMedia(post.media);
  if (where === null) return media === null ? 'No account chosen' : media;
  return media === null ? where : `${where} · ${media}`;
}

/** Most recent confirmed publication instant on a post, or null. */
function publishedAtOf(post: SocialPost): string | null {
  const instants = post.targets
    .filter(isConfirmedPublished)
    .map((target) => target.publishedAt)
    .filter((at): at is string => at !== null);
  if (instants.length === 0) return null;
  return instants.sort().at(-1) ?? null;
}

export function buildPostsView(
  posts: readonly SocialPost[],
  timeZone: string,
  now: Date = new Date(),
): PostsView {
  const scheduled = posts.filter((post) => post.state === 'scheduled').sort(bySoonestDue);
  const drafts = posts.filter((post) => DRAFT_LIKE_STATES.includes(post.state));

  const next = nextDuePost(posts);

  const publishedPosts = posts
    .filter((post) => post.state === 'published' && post.targets.some(isConfirmedPublished))
    .sort((a, b) => (publishedAtOf(a) ?? '').localeCompare(publishedAtOf(b) ?? ''))
    .reverse();

  const firstFailed = posts.find((post) => post.state === 'failed') ?? null;
  const failedTarget = firstFailed?.targets.find((target) => target.failure !== null) ?? null;

  /*
   * PRODUCT RULE 13 — a skipped target must stay visible.
   *
   * Publishing to Instagram while Facebook was unreachable is the RIGHT
   * outcome, but it is only honest if the owner is told. A post that went out
   * to two of three platforms must not sit quietly in the published list
   * looking complete, so a broken connection outranks an unfinished draft
   * here: the draft is work the owner already knows about, the skip is not.
   */
  const brokenTargetPost = posts.find((post) => targetsNeedingAttention(post).length > 0) ?? null;
  const attentionPost = brokenTargetPost ?? posts.find((post) => post.state === 'draft') ?? null;

  /*
   * Reach comes from the most recently published post, and only when a
   * provider actually reported it. `find` rather than a sum: adding up reach
   * across posts double-counts the same followers, which would be a
   * fabricated number even though every input was real.
   */
  const lastReach =
    publishedPosts
      .map((post) => post.insights)
      .find((insights) => insights !== null && insights.reportedAt !== null)?.reach ?? null;

  return {
    nextUp:
      next === null || next.schedule === null
        ? null
        : {
            id: next.id,
            label: formatNextUpLabel(next.schedule.dueAt, next.schedule.timeZone, now),
            title: next.title,
            channel: channelLabel(next),
            mediaLabel: describeMedia(next.media) ?? '',
          },

    counts: {
      scheduled: scheduled.length,
      drafts: drafts.length,
      lastReach,
    },

    scheduled: scheduled.map((post) => ({
      id: post.id,
      title: post.title,
      when: post.schedule === null ? 'Not scheduled' : formatScheduleLabel(post.schedule.dueAt, post.schedule.timeZone),
      where: describeTargets(targetPlatforms(post)) ?? 'No account chosen',
      mediaLabel: describeMedia(post.media) ?? '',
    })),

    needsAttention:
      attentionPost === null
        ? null
        : {
            id: attentionPost.id,
            title: attentionPost.title,
            body:
              attentionPost === brokenTargetPost
                ? describeBrokenTargets(attentionPost)
                : describeUnfinished(attentionPost),
            actionLabel: attentionPost === brokenTargetPost ? 'Reconnect' : 'Finish',
          },

    published: publishedPosts.map((post) => {
      const reported = describeInsights(post.insights);
      const at = publishedAtOf(post);
      return {
        id: post.id,
        title: post.title,
        result:
          reported ??
          (at === null ? 'Published' : `Published ${formatScheduleLabel(at, timeZone)}`),
        mediaLabel: describeMedia(post.media) ?? '',
      };
    }),

    failed:
      firstFailed === null
        ? null
        : {
            id: firstFailed.id,
            title: 'Failed to publish',
            reason:
              failedTarget?.failure?.message ??
              'Shoogle could not publish this post. Open it to see why.',
          },
  };
}

/** True when there is genuinely nothing for the owner to look at. */
export function isPostsViewEmpty(view: PostsView): boolean {
  return (
    view.nextUp === null &&
    view.scheduled.length === 0 &&
    view.published.length === 0 &&
    view.needsAttention === null &&
    view.failed === null
  );
}
