import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Skeleton } from './Skeleton';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';

/**
 * The surface every module block sits on. Radius 20 + the design system's
 * `0 2px 10px rgba(0,0,0,.07)` elevation.
 *
 * When `onPress` is supplied the card becomes a single button for screen
 * readers rather than a pile of separately-focusable children - which is what
 * the module cards on Home need.
 *
 * `loading` renders a skeleton of the same size so the page does not reflow.
 */
export interface CardProps {
  children?: React.ReactNode;
  onPress?: () => void;
  /** Left accent stripe, matching the module colour coding. */
  accent?: AccentName;
  padded?: boolean;
  /** Flat cards sit inside another card and drop the shadow. */
  flat?: boolean;
  loading?: boolean;
  /** Approximate height used by the loading skeleton. */
  loadingHeight?: number;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  onPress,
  accent,
  padded = true,
  flat = false,
  loading = false,
  loadingHeight = 96,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: CardProps) {
  const theme = useTheme();

  const base: ViewStyle = {
    backgroundColor: flat ? theme.colors.card2 : theme.colors.card,
    borderRadius: theme.radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: padded ? theme.spacing.lg : 0,
    overflow: 'hidden',
    ...(flat ? theme.elevation.none : theme.elevation.card),
  };

  if (loading) {
    return (
      <View testID={testID} style={[base, style]} accessibilityRole="progressbar">
        <Skeleton height={loadingHeight} radius={theme.radii.lg} label="Loading content" />
      </View>
    );
  }

  const accentStripe = accent ? (
    <View
      pointerEvents="none"
      style={[styles.stripe, { backgroundColor: theme.accent(accent).fg }]}
    />
  ) : null;

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        android_ripple={{ color: theme.colors.border }}
        style={({ pressed }) => [base, { opacity: pressed ? 0.94 : 1 }, style]}>
        {accentStripe}
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={[base, style]}>
      {accentStripe}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
});
