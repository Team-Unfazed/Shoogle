/**
 * Persistence for the owner's Google review link. Owner: Pranay.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until Google Business Profile is connected, Shoogle cannot look up a place id
 * and therefore cannot derive the review link itself. The owner pastes it once.
 *
 * Without persistence that paste survived exactly as long as the screen did:
 * navigate to the audit and back, and the link was gone, the QR code with it,
 * and the owner pastes it again. For the ONE feature in this vertical that does
 * useful work with no API access, that is the difference between a tool and a
 * demo.
 *
 * SAME SHAPE AS `requestLog.ts`, deliberately: an `AsyncStorageLike` seam so the
 * pure functions stay testable, a namespaced key, and a parse that treats a
 * corrupt payload as an error rather than silently returning nothing.
 *
 * The key is namespaced to this feature (`shoogle.gbp.reviewLink.v1`) and NOT to
 * a global business record. Business identity storage is Sunny's, and claiming a
 * global key here would pre-empt his schema.
 */

import type { ReviewLink } from './reviewLink';
import { parsePastedReviewLink } from './reviewLink';
import type { AsyncStorageLike } from './requestLog';

/** Feature-scoped. Never the app-wide business key — that is Sunny's to design. */
export const REVIEW_LINK_STORAGE_KEY = 'shoogle.gbp.reviewLink.v1';

export type StoredLinkRead =
  | { readonly kind: 'none' }
  | { readonly kind: 'link'; readonly link: ReviewLink }
  /**
   * Something is stored but cannot be read back. Distinct from `none`: the
   * owner DID save a link, so telling them there is none would be wrong, and
   * silently overwriting would discard something they entered.
   */
  | { readonly kind: 'corrupt' };

/**
 * Re-parse the stored URL rather than trusting a serialised object.
 *
 * The stored shape could be from an older build with different fields. Running
 * it back through `parsePastedReviewLink` means a stored link is validated by
 * exactly the same rules as a freshly pasted one — including
 * `opensReviewFormForSure`, which drives whether the UI tells the owner to test
 * it themselves.
 */
export function parseStoredLink(raw: string | null): StoredLinkRead {
  if (raw === null || raw.trim().length === 0) return { kind: 'none' };

  let url: unknown;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { kind: 'corrupt' };
    url = (parsed as Record<string, unknown>).url;
  } catch {
    return { kind: 'corrupt' };
  }

  if (typeof url !== 'string' || url.length === 0) return { kind: 'corrupt' };

  const reparsed = parsePastedReviewLink(url);
  return reparsed.ok ? { kind: 'link', link: reparsed.link } : { kind: 'corrupt' };
}

export function serialiseLink(link: ReviewLink): string {
  // Only the URL is stored. Everything else is derived on read, so a change to
  // the parsing rules applies to already-saved links instead of being frozen
  // at the moment the owner pasted.
  return JSON.stringify({ url: link.url });
}

export async function readStoredLink(storage: AsyncStorageLike): Promise<StoredLinkRead> {
  try {
    return parseStoredLink(await storage.getItem(REVIEW_LINK_STORAGE_KEY));
  } catch {
    // A storage failure is not an absent link.
    return { kind: 'corrupt' };
  }
}

/** Returns false when the link could not be saved. The caller must say so. */
export async function writeStoredLink(
  storage: AsyncStorageLike,
  link: ReviewLink,
): Promise<boolean> {
  try {
    await storage.setItem(REVIEW_LINK_STORAGE_KEY, serialiseLink(link));
    return true;
  } catch {
    return false;
  }
}
