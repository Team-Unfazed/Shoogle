import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from '@/theme';

/**
 * Something went wrong and we know it.
 *
 * Rules:
 *  - the message is written for a business owner, not an engineer;
 *  - never print a raw provider payload, stack trace, token or URL;
 *  - only offer Retry when retrying could plausibly succeed;
 *  - `code` is shown small and muted so support can identify the failure
 *    without the message itself becoming technical.
 */
export interface ErrorStateProps {
  title?: string;
  message: string;
  /** Stable, non-sensitive code, e.g. "GBP_TIMEOUT". */
  code?: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  code,
  onRetry,
  retrying = false,
  compact = false,
  style,
  testID,
}: ErrorStateProps) {
  const theme = useTheme();

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${message}`}
      style={[
        styles.root,
        { paddingVertical: compact ? theme.spacing.xl : theme.spacing['3xl'] },
        style,
      ]}>
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: theme.colors.redSoft,
            borderRadius: theme.radii.full,
            width: compact ? 40 : 56,
            height: compact ? 40 : 56,
          },
        ]}>
        <Ionicons
          name="alert-circle-outline"
          size={compact ? 20 : 26}
          color={theme.colors.red}
        />
      </View>

      <Text
        variant={compact ? 'bodyStrong' : 'cardTitle'}
        align="center"
        style={{ marginTop: theme.spacing.md }}>
        {title}
      </Text>

      <Text variant="caption" tone="muted" align="center" style={{ marginTop: 6, maxWidth: 320 }}>
        {message}
      </Text>

      {onRetry ? (
        <Button
          label="Try again"
          variant="secondary"
          size="small"
          fullWidth={false}
          loading={retrying}
          onPress={onRetry}
          style={{ marginTop: theme.spacing.lg }}
        />
      ) : null}

      {code ? (
        <Text variant="label" tone="muted2" align="center" style={{ marginTop: theme.spacing.md }}>
          {code}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
});
