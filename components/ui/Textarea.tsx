import { forwardRef, useId, useState } from 'react';
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
 * Multi-line text field, used for post captions and review replies.
 *
 * Generated business content may be Hindi, Marathi or Hinglish (product rule
 * 12), so the field must never restrict input to ASCII and the counter counts
 * Unicode code points, not UTF-16 units - otherwise Devanagari text is
 * mis-counted.
 */
export interface TextareaProps extends Omit<TextInputProps, 'style' | 'editable' | 'multiline'> {
  label: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  /** Shows a live "n / max" counter and marks the field invalid past the limit. */
  maxCharacters?: number;
  minHeight?: number;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Counts user-perceived characters, so Devanagari and emoji count as one. */
export function countCharacters(value: string): number {
  return Array.from(value).length;
}

export const Textarea = forwardRef<TextInput, TextareaProps>(function Textarea(
  {
    label,
    hint,
    error,
    disabled = false,
    maxCharacters,
    minHeight = 120,
    containerStyle,
    testID,
    value,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const errorId = useId();

  const count = countCharacters(value ?? '');
  const overLimit = maxCharacters !== undefined && count > maxCharacters;
  const hasError = (typeof error === 'string' && error.length > 0) || overLimit;
  const errorText = overLimit
    ? `${count - (maxCharacters ?? 0)} characters over the limit`
    : (error ?? null);

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
        </Text>
        {maxCharacters !== undefined ? (
          <Text variant="caption" tone={overLimit ? 'red' : 'muted2'}>
            {`${count} / ${maxCharacters}`}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          minHeight,
          borderRadius: theme.radii.lg,
          borderColor,
          borderWidth: focused || hasError ? 1.5 : StyleSheet.hairlineWidth,
          backgroundColor: disabled ? theme.colors.card2 : theme.colors.card,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          opacity: disabled ? 0.6 : 1,
        }}>
        <TextInput
          ref={ref}
          testID={testID}
          multiline
          editable={!disabled}
          value={value}
          accessibilityLabel={label}
          accessibilityHint={errorText ?? hint}
          accessibilityState={{ disabled }}
          aria-invalid={hasError}
          aria-errormessage={hasError ? errorId : undefined}
          placeholderTextColor={theme.colors.muted2}
          cursorColor={theme.colors.blue}
          selectionColor={theme.colors.blue}
          disableFullscreenUI
          underlineColorAndroid="transparent"
          textAlignVertical="top"
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
            { minHeight: minHeight - theme.spacing.md * 2, color: theme.colors.text },
          ]}
          {...rest}
        />
      </View>

      {errorText ? (
        <Text
          nativeID={errorId}
          variant="caption"
          tone="red"
          accessibilityLiveRegion="polite"
          style={styles.helper}>
          {errorText}
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
  input: { flex: 1, padding: 0 },
  helper: { marginTop: 6 },
});
