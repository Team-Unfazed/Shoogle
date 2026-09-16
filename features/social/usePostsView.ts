/**
 * The Posts tab's data hook. Owner: Yash.
 *
 * Wraps `buildPostsView` in a `DataState`, so the screen renders the same four
 * honest outcomes as every other surface in the app and cannot read a value
 * that is not there.
 *
 * The posts themselves are passed IN rather than fetched here. Two reasons:
 * the real source is a Supabase table that does not exist yet (Sunny's area,
 * see `store.ts`), and the fixture source lives in `fixtures/`, which already
 * imports this feature — fetching either from inside the feature would make
 * that a cycle.
 */

import { useMemo } from 'react';

import { ready, unavailable, type DataState } from '@/lib/state/DataState';

import { buildPostsView, type PostsView } from './view';
import type { SocialPost } from './types';

/**
 * Shown when there is no connected account and no fixture data.
 *
 * The title is "Nothing scheduled" rather than "Not connected" because that is
 * the owner's actual situation and the design's wording; the body then says
 * plainly what would change it. Product rule 5 is promised here in words, so
 * the list must keep delivering it in buttons.
 */
export const NO_POSTS_TITLE = 'Nothing scheduled';
export const NO_POSTS_BODY =
  'Connect an account and Shoogle will schedule posts for you. You can skip or pause any of them before they go out.';

/**
 * `posts === null` means "no source at all" — no connected account, no store.
 * An empty array means the source answered and had nothing, which is a
 * different, equally honest state.
 */
export function postsViewState(
  posts: readonly SocialPost[] | null,
  timeZone: string,
  now: Date = new Date(),
): DataState<PostsView> {
  if (posts === null) {
    return unavailable('not_connected', NO_POSTS_BODY);
  }
  return ready(
    buildPostsView(posts, timeZone, now),
    now.toISOString(),
    posts.some((post) => post.isFixture === true),
  );
}

export function usePostsView(
  posts: readonly SocialPost[] | null,
  timeZone: string,
): DataState<PostsView> {
  // `now` is captured per render rather than per tick: a self-updating "next
  // up" label would be motion for its own sake, and the labels are day-grained.
  return useMemo(() => postsViewState(posts, timeZone, new Date()), [posts, timeZone]);
}
