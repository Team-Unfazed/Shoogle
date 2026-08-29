import React, { forwardRef, useId, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * Single-line text field.
 *
 * PRODUCT RULE 3: never ask the owner for data we can retrieve automatically.
 * Before adding an Input, check whether a connected provider already has the
 * value. `prefilledFrom` exists to state, in the UI, where a value came from -
 * so the owner sees we did not make them type it.
 *
 * Accessibility: the visible label is bound via `accessibilityLabel`, errors are
 * announced through `accessibilityState.invalid` plus live error text.
 */
export interface InputProps extends Omit<TextInputProps, 'style' | 'editable'> {
  label: string;
  /** Helper text under the field. Hidden while an error is shown. */
  hint?: string;
  /** Error message. Presence switches the field to its invalid state. */
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  /** e.g. "Google Business Profile" - shows the value was retrieved, not typed. */
  prefilledFrom?: string;
  /** Rendered inside the field on the right, e.g. a visibility toggle. */
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    hint,
    error,
    required = false,
    disabled = false,
    prefilledFrom,
    trailing,
    containerStyle,
    testID,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const errorId = useId();
  const hasError = typeof error === 'string' && error.length > 0;

  const borderColor = hasError
    ? theme.colors.red
    : focused
      ? theme.colors.blue
      : theme.colors.border;

  return (
    <View style={containerStyle}>
      <View style={styles.labelRow}>
        <Text variant="label" tone="muted2">
          {label}
          {required ? ' *' : ''}
        </Text>
        {prefilledFrom ? (
          <Text variant="label" tone="green" style={styles.prefilled}>
            {`From ${prefilledFrom}`}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.field,
          {
            minHeight: theme.control.inputHeight,
            borderRadius: theme.radii.lg,
            borderColor,
            borderWidth: focused || hasError ? 1.5 : StyleSheet.hairlineWidth,
            backgroundColor: disabled ? theme.colors.card2 : theme.colors.card,
            paddingHorizontal: theme.spacing.lg,
            opacity: disabled ? 0.6 : 1,
          },
        ]}>
        <TextInput
          ref={ref}
          testID={testID}
          editable={!disabled}
          accessibilityLabel={label}
          accessibilityHint={hasError ? error : hint}
          accessibilityState={{ disabled }}
          aria-invalid={hasError}
          aria-errormessage={hasError ? errorId : undefined}
          placeholderTextColor={theme.colors.muted2}
          cursorColor={theme.colors.blue}
          selectionColor={theme.colors.blue}
          // Android: avoid the full-screen landscape keyboard takeover.
          disableFullscreenUI
          underlineColorAndroid="transparent"
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            theme.typography.body,
            { color: disabled ? theme.colors.muted : theme.colors.text },
          ]}
          {...rest}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>

      {hasError ? (
        <Text
          nativeID={errorId}
          variant="caption"
          tone="red"
          accessibilityLiveRegion="polite"
          style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted" style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  prefilled: { marginLeft: 8 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    // Android adds its own vertical padding to TextInput; zero it so the field
    // height is driven purely by the token.
    textAlignVertical: 'center',
  },
  trailing: { marginLeft: 8 },
  helper: { marginTop: 6 },
});
