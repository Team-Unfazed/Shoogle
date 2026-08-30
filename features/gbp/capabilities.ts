/**
 * The honest "no" states. Owner: Pranay.
 *
 * These are not placeholders and not scaffolding. Google deleted a large slice
 * of the Business Profile metric surface in 2023 and shipped no replacement,
 * and it never exposed a search rank position at all. Those tiles will render
 * `—` with a reason for as long as Shoogle exists, so the reasons live here as
 * first-class values rather than as strings scattered through screens.
 *
 * `not_supported` is the correct `UnavailableReason` for every one of them:
 * "The provider does not expose this data at all."
 */

import { unavailable, type UnavailableState } from '@/lib/state/DataState';

import {
  REMOVED_GBP_CAPABILITIES,
  UNSUPPORTED_GBP_CAPABILITIES,
  type RemovedGbpCapability,
  type UnsupportedGbpCapability,
} from './types';

/**
 * A metric Google removed in 2023. Never 0, never an empty chart, never
 * "coming soon" — there is nothing coming.
 */
export function removedCapabilityState(capability: RemovedGbpCapability): UnavailableState {
  return unavailable('not_supported', REMOVED_GBP_CAPABILITIES[capability]);
}

/** Something no Google API has ever offered. */
export function unsupportedCapabilityState(
  capability: UnsupportedGbpCapability,
): UnavailableState {
  return unavailable('not_supported', UNSUPPORTED_GBP_CAPABILITIES[capability]);
}

/**
 * Every permanently-unavailable GBP capability, ready to render.
 *
 * A Business tab built from this map cannot accidentally show a zero for a
 * metric that does not exist, because there is no number in it to show.
 */
export const GBP_PERMANENT_UNAVAILABLE_STATES: Readonly<
  Record<RemovedGbpCapability | UnsupportedGbpCapability, UnavailableState>
> = Object.freeze({
  local_post_views: removedCapabilityState('local_post_views'),
  local_post_cta_clicks: removedCapabilityState('local_post_cta_clicks'),
  photo_views: removedCapabilityState('photo_views'),
  photo_counts: removedCapabilityState('photo_counts'),
  query_breakdown: removedCapabilityState('query_breakdown'),
  driving_direction_geography: removedCapabilityState('driving_direction_geography'),
  media_insights: removedCapabilityState('media_insights'),
  search_rank_position: unsupportedCapabilityState('search_rank_position'),
  competitor_data: unsupportedCapabilityState('competitor_data'),
  question_and_answer: unsupportedCapabilityState('question_and_answer'),
  delete_review: unsupportedCapabilityState('delete_review'),
  create_product_post: unsupportedCapabilityState('create_product_post'),
});
