/**
 * Post storage seam. Owner: Yash.
 *
 * `PostStore` is what the publisher, the composer and the eventual scheduled
 * runner all read and write through. It has exactly one implementation today —
 * `createInMemoryPostStore`, below — and that implementation is honest about
 * being volatile: it is used by tests and by nothing else.
 *
 * THE REAL STORE IS SUPABASE, AND IT IS NOT MINE
 * ----------------------------------------------
 * Posts belong in Postgres behind RLS, which is Sunny's area. This interface
 * is the contract that adapter will satisfy; nothing in this feature reaches
 * for `@supabase/supabase-js` directly. Until that table exists, the publisher
 * refuses to accept a schedule at all (see `publisher.ts`) — an in-memory
 * queue would drop every scheduled post the moment the process died, which is
 * a promise to the owner that Shoogle could not keep.
 */

import type { PostState } from './postState';
import type { SocialPost } from './types';

export interface PostQuery {
  businessId?: string;
  states?: readonly PostState[];
}

export interface PostStore {
  list(query?: PostQuery): Promise<SocialPost[]>;
  get(postId: string): Promise<SocialPost | null>;
  /** Insert or replace. Returns the stored record. */
  put(post: SocialPost): Promise<SocialPost>;
  remove(postId: string): Promise<void>;
}

/**
 * Volatile store, for tests and for driving the composer in development.
 *
 * NOT a stand-in for persistence: anything written here is gone when the JS
 * context reloads. It fabricates nothing — it only holds what was handed to it.
 */
export function createInMemoryPostStore(seed: readonly SocialPost[] = []): PostStore {
  const posts = new Map<string, SocialPost>(seed.map((post) => [post.id, post]));

  return {
    async list(query) {
      let all = [...posts.values()];
      if (query?.businessId !== undefined) {
        all = all.filter((post) => post.businessId === query.businessId);
      }
      if (query?.states !== undefined) {
        const wanted = new Set<PostState>(query.states);
        all = all.filter((post) => wanted.has(post.state));
      }
      return all;
    },
    async get(postId) {
      return posts.get(postId) ?? null;
    },
    async put(post) {
      posts.set(post.id, post);
      return post;
    },
    async remove(postId) {
      posts.delete(postId);
    },
  };
}
