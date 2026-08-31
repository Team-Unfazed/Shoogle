/**
 * The SEO provider implementation. Owner: Pranay.
 *
 * `SeoProvider` (lib/providers/contracts.ts) is NOT a `ConnectableProvider` and
 * is NOT keyed by `ProviderId`, so it is never handed to `registerProvider()` —
 * the runtime registry only holds connectable integrations. Importing this
 * object therefore claims nothing about a Google connection existing.
 *
 * ## Why every method here returns `unavailable('not_supported', …)`
 *
 * There is no Google API that returns a search-rank position. Not the Business
 * Profile APIs, not the Performance API, not Places. The only sources that do
 * are paid SERP scrapers, which we have not licensed and will not scrape.
 *
 * So `KeywordRanking.position` stays `null` forever until a licensed source
 * exists, and rather than return a list of rows whose every position is `null`
 * — which a screen would inevitably render as a table of dashes that looks like
 * a loading failure — the provider says the true thing once: this is not
 * something anyone can measure for you here.
 *
 * See docs/research/google-business-profile.md §0 and
 * docs/research/local-seo-methodology.md §4.3.
 */

import { unavailable } from '@/lib/state/DataState';
import type { KeywordRanking, SeoProvider } from '@/lib/providers/contracts';
import type { Result } from '@/lib/providers/types';
import type { SearchKeywordsReport } from './types';
import { RANK_NOT_MEASURABLE_MESSAGE } from './types';

/**
 * Feature-local extension of the shared contract.
 *
 * Search-keyword impressions are a real, threshold-aware measurement Google DOES
 * return, and they have no home in `SeoProvider` because that interface lives in
 * Sunny's file. Rather than ask for an edit to `lib/`, the extra capability is
 * declared here and composed on top.
 */
export interface KeywordImpressionsProvider {
  /**
   * Monthly search terms for a location.
   *
   * `monthStart` is `YYYY-MM-01`. Rows come back as a threshold-aware union —
   * see `./types`.
   */
  getSearchKeywords(locationId: string, monthStart: string): Result<SearchKeywordsReport>;
}

export interface ShoogleSeoProvider extends SeoProvider, KeywordImpressionsProvider {
  readonly id: 'shoogle_seo';
  readonly displayName: string;
}

const NO_GBP_CONNECTION_MESSAGE =
  'Connect your Google Business Profile to see the search terms people used to find you.';

/**
 * The live implementation.
 *
 * Rankings are permanently `not_supported`. Search keywords are
 * `not_connected`, which is a different and honest statement: Google does
 * report them, we just have no approved credentials yet. Swapping that to a
 * real fetch is the only change needed the day the quota request is approved.
 */
export const seoProvider: ShoogleSeoProvider = {
  id: 'shoogle_seo',
  displayName: 'Search visibility',

  async getRankings(_businessId: string): Result<KeywordRanking[]> {
    return unavailable('not_supported', RANK_NOT_MEASURABLE_MESSAGE);
  },

  async getKeyword(_businessId: string, _keyword: string): Result<KeywordRanking> {
    return unavailable('not_supported', RANK_NOT_MEASURABLE_MESSAGE);
  },

  async getSearchKeywords(_locationId: string, _monthStart: string): Result<SearchKeywordsReport> {
    return unavailable('not_connected', NO_GBP_CONNECTION_MESSAGE);
  },
};
