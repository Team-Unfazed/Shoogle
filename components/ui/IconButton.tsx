import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

/**
 * A square, icon-only control.
 *
 * An icon alone carries no text, so `accessibilityLabel` is REQUIRED - the type
 * signature enforces it. The hit area is always at least 44x44 even when the
 * glyph is smaller, which is the Android touch-target minimum.
 */
export interface IconButtonProps {
  /** Ionicons glyph name. */
  name: React.ComponentProps<typeof Ionicons>['name'];
  /** Required. Describes the ACTION, e.g. "Close", not the icon shape. */
  accessibilityLabel: string;
  onPress?: () => void;
  size?: number;
  variant?: 'plain' | 'soft' | 'solid';
  tone?: 'default' | 'muted' | 'blue' | 'red';
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  name,
  accessibilityLabel,
  onPress,
  size = 22,
  variant = 'plain',
  tone = 'default',
  disabled = false,
  loading = false,
  accessibilityHint,
  testID,
  style,
}: IconButtonProps) {
  const theme = useTheme();
  const isInert = disabled || loading;

  const fg = (() => {
    switch (tone) {
      case 'muted':
        return theme.colors.muted;
      case 'blue':
        return theme.colors.blue;
      case 'red':
        return theme.colors.red;
      default:
        return theme.colors.text;
    }
  })();

  const bg = (() => {
    if (variant === 'solid') return tone === 'red' ? theme.colors.red : theme.colors.blue;
    if (variant === 'soft') return tone === 'red' ? theme.colors.redSoft : theme.colors.blueSoft;
    return 'transparent';
  })();

  const glyphColor = variant === 'solid' ? theme.colors.onAccent : fg;

  return (
    <Pressable
      testID={testID}
      onPress={isInert ? undefined : onPress}
      disabled={isInert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInert, busy: loading }}
      hitSlop={8}
      android_ripple={{ color: theme.colors.border, borderless: variant === 'plain', radius: 24 }}
      style={({ pressed }) => [
        styles.base,
        {
          width: theme.control.iconButtonSize,
          height: theme.control.iconButtonSize,
          borderRadius: variant === 'plain' ? theme.radii.full : theme.radii.sm,
          backgroundColor: bg,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={glyphColor} />
      ) : (
        <Ionicons name={name} size={size} color={glyphColor} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
