import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

/**
 * Loading placeholder.
 *
 * IMPORTANT: a skeleton means "we are fetching", never "the value is zero".
 * If a value turns out to be unknown or unavailable, replace the skeleton with
 * `<EmptyState>` or `<ErrorState>` - do not leave a skeleton spinning, and do
 * not fall back to 0.
 *
 * The shimmer matches the design's `sgshimmer` keyframe (opacity 1 -> .45).
 * It is a genuine loading indicator, not progress theatre: it conveys only
 * "in flight", never a percentage.
 */
export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  /** Announced by TalkBack while content loads. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius,
  label = 'Loading',
  style,
  testID,
}: SkeletonProps) {
  const theme = useTheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.45, { duration: 700 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessible
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.radii.sm,
          backgroundColor: theme.colors.card2,
        },
        animated,
        style,
      ]}
    />
  );
}

/** Convenience: a few stacked lines, for text-heavy loading blocks. */
export function SkeletonLines({
  count = 3,
  label = 'Loading',
  testID,
}: {
  count?: number;
  label?: string;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View testID={testID} accessibilityRole="progressbar" accessibilityLabel={label} accessible>
      {/*
        The wrapper above is the single accessible element. Each line is hidden
        from assistive tech so TalkBack announces "Loading" once, not once per
        line.
      */}
      {Array.from({ length: count }).map((_, index) => (
        <View
          key={index}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <Skeleton
            height={12}
            width={index === count - 1 ? '60%' : '100%'}
            style={index === 0 ? undefined : { marginTop: theme.spacing.sm }}
          />
        </View>
      ))}
    </View>
  );
}

export const skeletonStyles = StyleSheet.create({});
