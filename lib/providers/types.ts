import type { DataState } from '@/lib/state/DataState';
import type { ConnectionStatus, ProviderId } from '@/types/domain';

/**
 * Shared shapes for provider contracts.
 *
 * NOTE: none of these types imply an integration exists. They describe what a
 * provider WOULD return once an engineer implements it. Until then every
 * method resolves to `unavailable('not_connected', …)`.
 */

/** Result of asking a provider whether the owner has linked it. */
export interface ConnectionInfo {
  provider: ProviderId;
  status: ConnectionStatus;
  handle: string | null;
  /** Scopes actually granted by the provider. Empty until connected. */
  grantedScopes: string[];
  lastSyncedAt: string | null;
}

/** A metric that may legitimately be unknown. Never collapses to zero. */
export interface Metric {
  /** Machine key, e.g. 'profile_views_28d'. */
  key: string;
  /** Owner-facing label, e.g. 'Profile views'. */
  label: string;
  value: number;
  /** Unit for formatting. 'count' | 'percent' | 'currency_inr' | 'position'. */
  unit: 'count' | 'percent' | 'currency_inr' | 'position';
  /** Window the metric covers, e.g. 'last 28 days'. */
  period: string;
  /**
   * Change vs the previous equivalent period. `null` means we genuinely do not
   * know — it must not be rendered as 0% or a flat arrow.
   */
  changePct: number | null;
}

export type Paginated<T> = { items: T[]; nextCursor: string | null };
export type Result<T> = Promise<DataState<T>>;
