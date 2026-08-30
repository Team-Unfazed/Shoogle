import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card, Metric, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import {
  MEDIA_INSIGHTS_UNAVAILABLE,
  PHOTO_COUNTS_UNAVAILABLE,
  PHOTO_INSIGHTS_REMOVED_ON,
  PHOTO_VIEWS_UNAVAILABLE,
} from './model';

/**
 * "How many people saw your photos" — and why nobody can answer it.
 * Owner: Pranay.
 *
 * THIS CARD IS THE FEATURE.
 * -------------------------
 * Every competitor's photos tab implies photo performance. Google removed it:
 * `PHOTOS_VIEWS_MERCHANT`, `PHOTOS_VIEWS_CUSTOMERS`, `PHOTOS_COUNT_MERCHANT`,
 * `PHOTOS_COUNT_CUSTOMERS` and the `MediaInsights` object were all discontinued
 * on 2023-02-20 with no replacement (research §7c). The `insights` field still
 * appears on the v4 media resource and the research doc says outright not to
 * render it.
 *
 * The three ways to get this wrong, and why each is worse than this card:
 *   - omit it silently  → the owner assumes we are hiding a bad number
 *   - show 0            → a measured zero is a different fact, and false here
 *   - "coming soon"     → nothing is coming; there is no replacement API
 *
 * So the values are `null` on the honesty primitive `<Metric>`, which cannot
 * render a zero by construction: `value: number | null`, and null prints the
 * em-dash plus the reason.
 */
export function PhotoViewsNotice() {
  const theme = useTheme();

  return (
    <Card testID="photo-views-notice" accent="neutral">
      <View style={[styles.head, { gap: theme.spacing.md }]}>
        <Ionicons name="eye-off-outline" size={20} color={theme.colors.muted} />
        <Text variant="cardTitle" style={styles.title}>
          Photo views are gone, permanently
        </Text>
      </View>

      <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
        Google stopped reporting photo views and photo counts on {PHOTO_INSIGHTS_REMOVED_ON} and
        shipped nothing to replace them. No app can show you these numbers today — a number you see
        elsewhere is an estimate, not a measurement.
      </Text>

      <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}>
        <Metric
          testID="metric-photo-views"
          label="Views of your photos"
          value={null}
          unavailableReason={PHOTO_VIEWS_UNAVAILABLE.message}
        />
        <Metric
          testID="metric-photo-counts"
          label="Photos you added versus photos customers added"
          value={null}
          unavailableReason={PHOTO_COUNTS_UNAVAILABLE.message}
        />
      </View>

      <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.lg }}>
        {MEDIA_INSIGHTS_UNAVAILABLE.message} A dash is shown rather than a zero, because zero would
        mean nobody looked — and that is a different claim from nobody counting.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1 },
});
