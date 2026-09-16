/**
 * Identifiers for anything that will be persisted. Owner: Yash.
 *
 * ===================== WHY THERE IS ONLY ONE OF THESE =======================
 *
 * Three places in this feature mint ids — the publisher (posts and the media
 * it derives from a request), the composer (draft posts) and the gallery
 * picker (media assets). Each had its own fallback, and each produced a
 * different non-UUID shape: `post-<ts>-<n>`, `draft-<ts>-<rand>`, `media-<n>`.
 *
 * Those were fine while the only store was in memory. They are not fine now
 * that `posts.id`, `posts.business_id` and every media id inside `posts.content`
 * are headed for Postgres `uuid` columns: Postgres would reject the row, and it
 * would reject it at the end of a publish rather than at the start. So there is
 * one generator, and duplicating it is the "one implementation per shared
 * concept" trap this codebase has already been bitten by twice.
 *
 * ========================= WHY IT REFUSES RATHER THAN GUESSES ===============
 *
 * `expo-crypto` is a native module. When its native side is absent —
 * a misconfigured build, or a test environment with no mock — `randomUUID()`
 * does not throw. **It returns `undefined`**, which JavaScript will happily
 * carry all the way into a stored record as the string "undefined" or a null id.
 *
 * A post whose id is `undefined` is worse than a post that was never saved: the
 * owner is told their draft is safe, and it is not. So the value is checked
 * before it is returned, and an unusable one throws — the same reasoning as
 * `transition()` in `postState.ts`, which throws on an illegal move so the bug
 * surfaces as a caught error rather than a corrupt row.
 *
 * The test is "would Postgres accept this as a `uuid`?", not "is this exactly
 * RFC 4122 v4?". The destination column is what matters.
 */

import { randomUUID } from 'expo-crypto';

/** Canonical 8-4-4-4-12 hex form — what a Postgres `uuid` column accepts. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when Postgres would accept this string as a `uuid`. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * A new identifier for a record that will be persisted.
 *
 * Throws rather than returning anything a `uuid` column would reject. Callers
 * that need deterministic ids inject their own generator through the `newId`
 * seam their module already exposes; this is only the default.
 */
export function newUuid(): string {
  const value: unknown = randomUUID();
  if (!isUuid(value)) {
    throw new Error(
      'Could not generate an identifier: expo-crypto returned no usable UUID. ' +
        'Nothing was saved, because a record with an invalid id cannot be stored.',
    );
  }
  return value;
}
