import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

/**
 * A hairline rule. Purely decorative, so it is hidden from screen readers -
 * a divider announced as a list item is noise.
 */
export interface DividerProps {
  /** Insets the rule from the left, to align under a leading icon or avatar. */
  inset?: number;
  spacing?: number;
  orientation?: 'horizontal' | 'vertical';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Divider({
  inset = 0,
  spacing,
  orientation = 'horizontal',
  style,
  testID,
}: DividerProps) {
  const theme = useTheme();
  const gap = spacing ?? theme.spacing.md;

  if (orientation === 'vertical') {
    return (
      <View
        testID={testID}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: theme.colors.border, marginHorizontal: gap },
          style,
        ]}
      />
    );
  }

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          height: StyleSheet.hairlineWidth,
          backgroundColor: theme.colors.border,
          marginVertical: gap,
          marginLeft: inset,
        },
        style,
      ]}
    />
  );
}
