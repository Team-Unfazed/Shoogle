/**
 * Shoogle's single vocabulary for "what do we actually know?".
 *
 * PRODUCT RULE: unknown is NOT zero. A metric we have not fetched, cannot
 * fetch, or that the provider does not expose must never render as `0`, `—0`,
 * an empty chart, or a 0% score. Every value that comes from outside the app
 * is wrapped in `DataState<T>` so the type system forces a screen to handle
 * every case before it can read `.value`.
 *
 * Feature engineers: do not add states here without agreeing it with the team.
 * Do not unwrap a DataState with `as` or `!`.
 */

/** Why a value is not available. Rendered verbatim-ish to the owner. */
export type UnavailableReason =
  /** The owner has not linked this provider yet. */
  | 'not_connected'
  /** Linked, but the token expired or was revoked. Needs re-auth. */
  | 'auth_expired'
  /** The provider does not expose this data at all. */
  | 'not_supported'
  /** Provider has the account but has not produced data yet (e.g. brand-new profile). */
  | 'no_data_yet'
  /** There is data, but too little to say anything honest about it. */
  | 'insufficient_data'
  /** The device is offline. */
  | 'offline'
  /** We are rate limited or throttled by the provider. */
  | 'rate_limited'
  /** Requires a paid plan the owner is not on. */
  | 'requires_upgrade';

export interface LoadingState {
  status: 'loading';
}

export interface ReadyState<T> {
  status: 'ready';
  value: T;
  /** When this value was fetched. Screens may show "updated 5m ago". */
  fetchedAt: string;
  /** True when the value came from a labelled development fixture, not a provider. */
  isFixture?: boolean;
}

export interface UnavailableState {
  status: 'unavailable';
  reason: UnavailableReason;
  /** Short, owner-facing explanation. English UI. */
  message: string;
}

export interface ErrorState {
  status: 'error';
  /** Stable code for logging/branching. Never shown raw to the owner. */
  code: string;
  /** Owner-facing message. Must not leak provider internals or tokens. */
  message: string;
  /** Whether a retry is worth offering. */
  retryable: boolean;
}

export type DataState<T> = LoadingState | ReadyState<T> | UnavailableState | ErrorState;

/* -------------------------------------------------------------------------- */
/* Constructors                                                               */
/* -------------------------------------------------------------------------- */

export const loading = (): LoadingState => ({ status: 'loading' });

export const ready = <T>(value: T, fetchedAt: string, isFixture = false): ReadyState<T> => ({
  status: 'ready',
  value,
  fetchedAt,
  ...(isFixture ? { isFixture: true } : {}),
});

export const unavailable = (reason: UnavailableReason, message: string): UnavailableState => ({
  status: 'unavailable',
  reason,
  message,
});

export const failed = (code: string, message: string, retryable = true): ErrorState => ({
  status: 'error',
  code,
  message,
  retryable,
});

/* -------------------------------------------------------------------------- */
/* Guards & helpers                                                           */
/* -------------------------------------------------------------------------- */

export const isLoading = <T>(s: DataState<T>): s is LoadingState => s.status === 'loading';
export const isReady = <T>(s: DataState<T>): s is ReadyState<T> => s.status === 'ready';
export const isUnavailable = <T>(s: DataState<T>): s is UnavailableState => s.status === 'unavailable';
export const isError = <T>(s: DataState<T>): s is ErrorState => s.status === 'error';

/**
 * Transform a ready value, preserving every non-ready state untouched.
 * Use this instead of `if (s.status === 'ready')` ladders.
 */
export function mapData<T, U>(state: DataState<T>, fn: (value: T) => U): DataState<U> {
  return state.status === 'ready' ? { ...state, value: fn(state.value) } : state;
}

/**
 * Combine two states. Non-ready states win, in loading > error > unavailable
 * order, so a screen never shows a half-filled row.
 */
export function combineData<A, B>(a: DataState<A>, b: DataState<B>): DataState<[A, B]> {
  if (a.status === 'loading' || b.status === 'loading') return loading();
  if (a.status === 'error') return a;
  if (b.status === 'error') return b;
  if (a.status === 'unavailable') return a;
  if (b.status === 'unavailable') return b;
  return ready<[A, B]>([a.value, b.value], a.fetchedAt, a.isFixture === true || b.isFixture === true);
}

/**
 * The ONLY sanctioned way to read a value with a fallback, and it deliberately
 * does not let you default to a number. If you find yourself wanting
 * `unwrapOr(state, 0)`, you are about to violate "unknown is not zero" —
 * render an `<EmptyState>` or `<ErrorState>` instead.
 */
export function unwrapOrNull<T>(state: DataState<T>): T | null {
  return state.status === 'ready' ? state.value : null;
}

/** Human-readable copy for each unavailable reason. English UI, per product rule 12. */
export const UNAVAILABLE_COPY: Record<UnavailableReason, { title: string; body: string }> = {
  not_connected: {
    title: 'Not connected',
    body: 'Connect this account to see data here.',
  },
  auth_expired: {
    title: 'Reconnect needed',
    body: 'Access expired. Reconnect the account to continue.',
  },
  not_supported: {
    title: 'Not available',
    body: 'This provider does not share this information.',
  },
  no_data_yet: {
    title: 'Nothing yet',
    body: 'There is no activity to report so far.',
  },
  insufficient_data: {
    title: 'Not enough data',
    body: 'We need more activity before this is meaningful.',
  },
  offline: {
    title: 'Offline',
    body: 'You are offline. This will refresh when you reconnect.',
  },
  rate_limited: {
    title: 'Temporarily limited',
    body: 'The provider is limiting requests. Try again shortly.',
  },
  requires_upgrade: {
    title: 'Not on your plan',
    body: 'This is part of a higher plan.',
  },
};
