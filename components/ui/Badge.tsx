import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from './Text';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';
import type { PostStatus } from '@/types/domain';

/**
 * Small status pill. 11px/700 uppercase on a soft fill, radius 8 - transcribed
 * from the design system's "Status badges" card.
 *
 * Badges are announced as text, so they must read as a complete statement
 * ("Scheduled", "Not connected") rather than an abbreviation.
 */
export interface BadgeProps {
  label: string;
  accent?: AccentName;
  /** Outline badges are used for neutral, non-status metadata. */
  variant?: 'soft' | 'outline';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, accent = 'neutral', variant = 'soft', testID, style }: BadgeProps) {
  const theme = useTheme();
  const { fg, bg } = theme.accent(accent);

  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.base,
        {
          borderRadius: theme.radii.xs,
          backgroundColor: variant === 'soft' ? bg : 'transparent',
          borderWidth: variant === 'outline' ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.colors.border,
        },
        style,
      ]}>
      <Text variant="label" style={{ color: variant === 'outline' ? theme.colors.muted : fg }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Canonical mapping from post status to badge appearance. Keeping it here means
 * Social, Home and SEO all render the same status identically.
 */
const POST_STATUS_BADGE: Record<PostStatus, { label: string; accent: AccentName }> = {
  draft: { label: 'Draft', accent: 'amber' },
  scheduled: { label: 'Scheduled', accent: 'blue' },
  publishing: { label: 'Publishing', accent: 'blue' },
  published: { label: 'Published', accent: 'green' },
  failed: { label: 'Failed', accent: 'red' },
  skipped: { label: 'Skipped', accent: 'neutral' },
};

export function PostStatusBadge({ status, testID }: { status: PostStatus; testID?: string }) {
  const config = POST_STATUS_BADGE[status];
  return <Badge label={config.label} accent={config.accent} testID={testID} />;
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
});
