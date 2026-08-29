import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * Single-choice control.
 *
 * Native pickers differ too much between Android OEMs to style consistently,
 * so Select opens a BottomSheet of options - which is also easier to reach
 * one-handed and gets the Android back-button handling for free.
 *
 * The trigger is a button announcing "<label>, <selected value>", and each
 * option reports `accessibilityState.selected`.
 */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Optional second line, e.g. why an option is recommended. */
  description?: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string> {
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  /** Sheet title. Defaults to the field label. */
  sheetTitle?: string;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select',
  hint,
  error,
  disabled = false,
  sheetTitle,
  containerStyle,
  testID,
}: SelectProps<T>) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );
  const hasError = typeof error === 'string' && error.length > 0;

  return (
    <View style={containerStyle}>
      <Text variant="label" tone="muted2" style={styles.label}>
        {label}
      </Text>

      <Pressable
        testID={testID}
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${selected?.label ?? placeholder}`}
        accessibilityHint="Opens a list of options"
        accessibilityState={{ disabled, expanded: open }}
        android_ripple={{ color: theme.colors.border }}
        style={({ pressed }) => [
          styles.trigger,
          {
            minHeight: theme.control.inputHeight,
            borderRadius: theme.radii.lg,
            borderWidth: hasError ? 1.5 : StyleSheet.hairlineWidth,
            borderColor: hasError ? theme.colors.red : theme.colors.border,
            backgroundColor: disabled ? theme.colors.card2 : theme.colors.card,
            paddingHorizontal: theme.spacing.lg,
            opacity: disabled ? 0.6 : pressed ? 0.9 : 1,
          },
        ]}>
        <Text
          variant="body"
          tone={selected ? 'default' : 'muted2'}
          numberOfLines={1}
          style={styles.triggerText}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.colors.muted} />
      </Pressable>

      {hasError ? (
        <Text variant="caption" tone="red" accessibilityLiveRegion="polite" style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted" style={styles.helper}>
          {hint}
        </Text>
      ) : null}

      <BottomSheet visible={open} onDismiss={() => setOpen(false)} title={sheetTitle ?? label}>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <Pressable
              key={option.value}
              disabled={option.disabled}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityHint={option.description}
              accessibilityState={{ selected: isSelected, disabled: option.disabled }}
              android_ripple={{ color: theme.colors.border }}
              style={({ pressed }) => [
                styles.option,
                {
                  minHeight: theme.control.minTouchTarget,
                  borderRadius: theme.radii.md,
                  backgroundColor: isSelected ? theme.colors.blueSoft : 'transparent',
                  opacity: option.disabled ? 0.45 : pressed ? 0.85 : 1,
                  paddingHorizontal: theme.spacing.md,
                },
              ]}>
              <View style={styles.optionText}>
                <Text variant="body" tone={isSelected ? 'blue' : 'default'}>
                  {option.label}
                </Text>
                {option.description ? (
                  <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    {option.description}
                  </Text>
                ) : null}
              </View>
              {isSelected ? (
                <Ionicons name="checkmark" size={20} color={theme.colors.blue} />
              ) : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6 },
  trigger: { flexDirection: 'row', alignItems: 'center' },
  triggerText: { flex: 1 },
  helper: { marginTop: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  optionText: { flex: 1, paddingRight: 12 },
});
