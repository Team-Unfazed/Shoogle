import { useCallback, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * In-page segmented tabs (e.g. Social > Posts / Photos / Performance).
 *
 * This is NOT the app's primary navigation - that is the bottom `Navigation`
 * bar. Tabs switch content within a single screen.
 *
 * Implemented as an accessible tablist: the container is `tablist`, each item
 * is `tab` with `accessibilityState.selected`. Tabs scroll horizontally when
 * they overflow, so a long label set never causes horizontal page overflow.
 */
export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Small count shown after the label. Omit when the number is unknown - do
   *  not pass 0 to mean "we do not know". */
  count?: number;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the whole tab set. */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  accessibilityLabel,
  style,
  testID,
}: TabsProps<T>) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const handlePress = useCallback(
    (next: T) => {
      if (next !== value) onChange(next);
    },
    [onChange, value],
  );

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.card2,
          borderColor: theme.colors.border,
          // 13/4/36/10 geometry transcribed from the design's segmented control.
          borderRadius: 13,
        },
        style,
      ]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}>
        {items.map((item) => {
          const selected = item.value === value;
          return (
            <Pressable
              key={item.value}
              onPress={() => handlePress(item.value)}
              accessibilityRole="tab"
              accessibilityLabel={
                item.count === undefined ? item.label : `${item.label}, ${item.count}`
              }
              accessibilityState={{ selected }}
              android_ripple={{ color: theme.colors.border, borderless: false }}
              style={({ pressed }) => [
                styles.tab,
                {
                  minHeight: 36,
                  borderRadius: 10,
                  backgroundColor: selected ? theme.colors.card : 'transparent',
                  paddingHorizontal: theme.spacing.lg,
                  opacity: pressed && !selected ? 0.7 : 1,
                  ...(selected ? theme.elevation.card : theme.elevation.none),
                },
              ]}>
              <Text
                variant="caption"
                tone={selected ? 'default' : 'muted'}
                numberOfLines={1}
                style={{
                  fontSize: 13,
                  fontFamily: selected ? theme.fontFamily.bold : theme.fontFamily.semibold,
                }}>
                {item.count === undefined ? item.label : `${item.label} ${item.count}`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 4, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  scroll: { alignItems: 'center' },
  tab: { alignItems: 'center', justifyContent: 'center', marginRight: 2 },
});
