import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { EmptyState, ErrorState, SkeletonLines } from '@/components/ui';
import { UNAVAILABLE_COPY, type DataState } from '@/lib/state/DataState';

/**
 * The bridge between `DataState<T>` and the design system.
 *
 * Every screen that shows data from outside the app should render through this
 * component. It makes the four honest outcomes automatic:
 *
 *   loading      -> skeleton
 *   unavailable  -> EmptyState with the real reason ("Not connected", ...)
 *   error        -> ErrorState with a retry only when retrying can help
 *   ready        -> your content, via the render prop
 *
 * Because `children` only ever receives an unwrapped `T`, it is impossible to
 * accidentally render a loading or unavailable state as zero.
 *
 * Feature engineers: do NOT hand-roll `if (status === ...)` ladders. If you
 * need a different empty presentation, pass `emptyOverride`.
 */
export interface DataStateViewProps<T> {
  state: DataState<T>;
  /** Rendered only when the value is genuinely known. */
  children: (value: T, meta: { fetchedAt: string; isFixture: boolean }) => React.ReactNode;
  /** Retry handler. Omit when a retry cannot help. */
  onRetry?: () => void;
  /** Number of skeleton lines while loading. */
  skeletonLines?: number;
  /** Replaces the default skeleton entirely. */
  loadingFallback?: React.ReactNode;
  /** Replaces the default unavailable presentation. */
  emptyOverride?: React.ReactNode;
  /** Treats a ready-but-empty array as "nothing yet" rather than rendering it. */
  emptyWhen?: (value: T) => boolean;
  /** Copy used when `emptyWhen` matches. */
  emptyTitle?: string;
  emptyBody?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function DataStateView<T>({
  state,
  children,
  onRetry,
  skeletonLines = 3,
  loadingFallback,
  emptyOverride,
  emptyWhen,
  emptyTitle = 'Nothing yet',
  emptyBody,
  compact = false,
  style,
  testID,
}: DataStateViewProps<T>) {
  switch (state.status) {
    case 'loading':
      return (
        <>
          {loadingFallback ?? (
            <SkeletonLines count={skeletonLines} label="Loading" testID={testID} />
          )}
        </>
      );

    case 'unavailable': {
      if (emptyOverride) return <>{emptyOverride}</>;
      const copy = UNAVAILABLE_COPY[state.reason];
      return (
        <EmptyState
          testID={testID}
          title={copy.title}
          // The provider-supplied message is more specific when present.
          body={state.message || copy.body}
          icon={state.reason === 'not_connected' ? 'link-outline' : 'ellipse-outline'}
          compact={compact}
          style={style}
        />
      );
    }

    case 'error':
      return (
        <ErrorState
          testID={testID}
          message={state.message}
          code={state.code}
          onRetry={state.retryable ? onRetry : undefined}
          compact={compact}
          style={style}
        />
      );

    case 'ready': {
      if (emptyWhen?.(state.value)) {
        return (
          emptyOverride ?? (
            <EmptyState
              testID={testID}
              title={emptyTitle}
              body={emptyBody}
              compact={compact}
              style={style}
            />
          )
        );
      }
      return (
        <>
          {children(state.value, {
            fetchedAt: state.fetchedAt,
            isFixture: state.isFixture === true,
          })}
        </>
      );
    }
  }
}
