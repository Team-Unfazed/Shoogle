import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * Primary action control.
 *
 * Geometry comes from the design system's "Buttons - 54px primary, 44px min
 * touch" card: primary 54px / radius 15, secondary 50px, small 44px (the
 * Android accessibility floor).
 *
 * States: default, pressed, disabled, loading. `loading` disables interaction
 * and swaps the label for a spinner while preserving the button's width, so
 * the layout does not jump.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'ai';
export type ButtonSize = 'large' | 'medium' | 'small';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Element rendered before the label, e.g. an icon. */
  leading?: React.ReactNode;
  fullWidth?: boolean;
  /** Overrides the label for screen readers when the label alone is ambiguous. */
  accessibilityLabel?: string;
  /** Extra context announced after the label, e.g. "opens a dialog". */
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  disabled = false,
  loading = false,
  leading,
  fullWidth = true,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const isInert = disabled || loading;

  const height =
    size === 'large'
      ? theme.control.buttonPrimaryHeight
      : size === 'medium'
        ? theme.control.buttonSecondaryHeight
        : theme.control.buttonSmallHeight;

  const palette = (() => {
    switch (variant) {
      case 'primary':
        return { bg: theme.colors.blue, fg: theme.colors.onAccent, border: 'transparent' };
      case 'destructive':
        return { bg: theme.colors.red, fg: theme.colors.onAccent, border: 'transparent' };
      case 'ai':
        return { bg: theme.colors.blueSoft, fg: theme.colors.blue, border: 'transparent' };
      case 'ghost':
        return { bg: 'transparent', fg: theme.colors.blue, border: 'transparent' };
      case 'secondary':
      default:
        return { bg: theme.colors.card, fg: theme.colors.text, border: theme.colors.border };
    }
  })();

  const handlePress = useCallback(() => {
    if (isInert || !onPress) return;
    // Android users expect tactile confirmation on primary actions.
    if (Platform.OS === 'android' && (variant === 'primary' || variant === 'destructive')) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  }, [isInert, onPress, variant]);

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={isInert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInert, busy: loading }}
      android_ripple={
        variant === 'ghost' || variant === 'secondary'
          ? { color: theme.colors.border, borderless: false }
          : { color: 'rgba(255,255,255,0.18)', borderless: false }
      }
      style={({ pressed }) => [
        styles.base,
        {
          height,
          minHeight: theme.control.minTouchTarget,
          borderRadius: variant === 'ai' ? theme.radii.sm : theme.radii.md,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth * 2 : 0,
          paddingHorizontal: size === 'small' ? theme.spacing.lg : theme.spacing.xl,
          opacity: disabled ? 0.45 : pressed ? 0.9 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator
          color={palette.fg}
          size="small"
          accessibilityLabel={`${label}, in progress`}
        />
      ) : (
        <View style={styles.content}>
          {leading ? <View style={{ marginRight: theme.spacing.sm }}>{leading}</View> : null}
          <Text
            variant={size === 'small' ? 'caption' : 'bodyStrong'}
            numberOfLines={1}
            style={{
              color: palette.fg,
              fontFamily: theme.fontFamily.bold,
              fontSize: size === 'large' ? 15.5 : size === 'medium' ? 14.5 : 12.5,
            }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
