import React, { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { SkeletonLines, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Suspense boundary with a design-system fallback.
 *
 * Pair one with each `ErrorBoundary` so a feature that suspends shows a
 * skeleton rather than an empty frame.
 *
 * NO PROGRESS THEATRE (product rule 10): the fallback conveys "in flight" only.
 * It must never animate a percentage, count up, or imply steps are completing.
 * If you know real progress, render it explicitly with real numbers instead.
 */
export interface LoadingBoundaryProps {
  children: React.ReactNode;
  /** Replaces the default skeleton. */
  fallback?: React.ReactNode;
  /** Announced to screen readers while loading. */
  label?: string;
  lines?: number;
}

export function LoadingBoundary({
  children,
  fallback,
  label = 'Loading',
  lines = 4,
}: LoadingBoundaryProps) {
  return (
    <Suspense fallback={fallback ?? <SkeletonLines count={lines} label={label} />}>
      {children}
    </Suspense>
  );
}

/**
 * Full-screen loading, for the brief window before the shell knows which route
 * to show. Deliberately plain - it is on screen for a fraction of a second.
 */
export function FullScreenLoader({ label = 'Loading' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <ActivityIndicator size="large" color={theme.colors.blue} />
      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.md }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
