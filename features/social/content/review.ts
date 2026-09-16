/**
 * The shape a content review answers in. Owner: Yash.
 *
 * Shared by all three platforms because the SHAPE of the answer is the same
 * even though the rules are not — and keeping one shape is what lets the
 * composer render three platforms without three renderers.
 *
 * `ok` means Shoogle found no fault. It does NOT mean the platform will accept
 * the post, which is why `unchecked` is a separate field the caller must show:
 * a green tick beside four rules nobody could check is the exact false claim
 * this codebase exists to avoid.
 */

import type { Platform } from '../types';

export interface ContentIssue {
  /** The platform this issue belongs to. Never another platform's problem. */
  platform: Platform;
  /** Stable code for branching and tests. Never rendered raw. */
  code: string;
  /** Owner-facing sentence. Names the platform where that helps. */
  message: string;
  /**
   * Whether this stops publication. A missing caption does; a missing alt text
   * does not, and blocking on it would be Shoogle inventing a platform rule.
   */
  blocking: boolean;
}

export interface ContentReview {
  /** True when nothing BLOCKING was found. See `unchecked` before trusting it. */
  ok: boolean;
  issues: ContentIssue[];
  /**
   * Rules that could not be checked because the platform does not document
   * them. Not passes. The composer must show these alongside a valid post.
   */
  unchecked: string[];
}

export function reviewFrom(issues: ContentIssue[], unchecked: string[]): ContentReview {
  return {
    ok: !issues.some((issue) => issue.blocking),
    issues,
    // De-duplicated: the same unverified rule fires once per asset, and telling
    // an owner the same thing six times about a six-slide carousel is noise.
    unchecked: [...new Set(unchecked)],
  };
}
