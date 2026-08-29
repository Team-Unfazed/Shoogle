import React from 'react';
import { Text as RNText, StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { useTheme } from '@/theme';
import type { TypographyKey } from '@/theme/tokens';

/**
 * The single typography primitive. React Native has no semantic HTML, so
 * meaning is carried by `variant` (visual) plus `accessibilityRole` (semantic).
 * A `variant` of `display` or `screenTitle` defaults to the `header` role so
 * TalkBack announces it as a heading.
 *
 * Never use bare `<Text>` from react-native in app code - it bypasses the type
 * scale and will render in the platform default font.
 */
export interface TextProps extends React.ComponentProps<typeof RNText> {
  variant?: TypographyKey;
  /** Semantic colour role. Defaults to primary text. */
  tone?: 'default' | 'muted' | 'muted2' | 'blue' | 'green' | 'amber' | 'red' | 'onAccent';
  align?: 'auto' | 'left' | 'right' | 'center';
  style?: StyleProp<TextStyle>;
}

const HEADING_VARIANTS: TypographyKey[] = ['display', 'screenTitle'];

export function Text({
  variant = 'body',
  tone = 'default',
  align,
  style,
  accessibilityRole,
  children,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const color = (() => {
    switch (tone) {
      case 'muted':
        return theme.colors.muted;
      case 'muted2':
        return theme.colors.muted2;
      case 'blue':
        return theme.colors.blue;
      case 'green':
        return theme.colors.green;
      case 'amber':
        return theme.colors.amber;
      case 'red':
        return theme.colors.red;
      case 'onAccent':
        return theme.colors.onAccent;
      default:
        return theme.colors.text;
    }
  })();

  const role =
    accessibilityRole ?? (HEADING_VARIANTS.includes(variant) ? 'header' : undefined);

  return (
    <RNText
      accessibilityRole={role}
      style={StyleSheet.flatten([
        theme.typography[variant] as TextStyle,
        { color },
        align ? { textAlign: align } : null,
        style,
      ])}
      {...rest}>
      {children}
    </RNText>
  );
}
