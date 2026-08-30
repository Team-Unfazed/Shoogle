import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Badge, EmptyState, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import {
  MEDIA_CATEGORY_LABEL,
  describeSchedule,
  type ScheduledMediaItem,
} from './model';

/**
 * The vertical timeline of photos Shoogle plans to publish. Owner: Pranay.
 *
 * WHAT "SCHEDULED" HONESTLY MEANS HERE
 * ------------------------------------
 * Google's media API has no scheduling — `media.create` publishes immediately.
 * A row on this timeline is therefore Shoogle's own intention, not a booking
 * Google has accepted, and every row is badged "Not sent yet" for exactly that
 * reason. Nothing on this timeline may ever be badged "Published": that word
 * belongs to a response from Google, and no credential exists to get one.
 *
 * Rows carry no per-item controls. Cancelling would need a queue that can be
 * written to, and a button that silently does nothing is a dead control
 * (CONTRIBUTING rule 7). The section footer says plainly what will happen.
 */
export function ScheduledMediaTimeline({
  items,
  now,
}: {
  items: readonly ScheduledMediaItem[];
  /** RFC 3339 "now", passed in so the "in N days" rail is deterministic. */
  now: string;
}) {
  const theme = useTheme();

  if (items.length === 0) {
    return (
      <EmptyState
        testID="scheduled-media-empty"
        icon="calendar-outline"
        compact
        title="Nothing is scheduled"
        body="Shoogle has no photo or video queued for this profile. Publishing to Google is not connected yet, so nothing would be sent even if it were."
      />
    );
  }

  return (
    <View testID="scheduled-media-timeline">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <View
            key={item.id}
            testID={`scheduled-media-${item.id}`}
            accessible
            accessibilityLabel={`${item.caption}. ${MEDIA_CATEGORY_LABEL[item.category]}. ${describeSchedule(
              item.scheduledFor,
              now,
            )}. Not sent to Google yet.`}
            style={[styles.row, { gap: theme.spacing.md }]}>
            {/* The rail: a dot per item, joined by a line except after the last. */}
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: theme.colors.muted2, borderRadius: theme.radii.full },
                ]}
              />
              {last ? null : (
                <View style={[styles.line, { backgroundColor: theme.colors.border }]} />
              )}
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.lg,
                  padding: theme.spacing.md,
                  marginBottom: last ? 0 : theme.spacing.md,
                },
              ]}>
              <View style={[styles.cardHead, { gap: theme.spacing.sm }]}>
                <Ionicons name="image-outline" size={16} color={theme.colors.muted2} />
                <Text variant="bodyStrong" style={styles.cardTitle} numberOfLines={2}>
                  {item.caption}
                </Text>
              </View>

              <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.xs }}>
                {MEDIA_CATEGORY_LABEL[item.category]} · {describeSchedule(item.scheduledFor, now)}
              </Text>

              <View style={{ marginTop: theme.spacing.sm, alignSelf: 'flex-start' }}>
                <Badge label="Not sent yet" accent="neutral" />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rail: { width: 10, alignItems: 'center', paddingTop: 6 },
  dot: { width: 8, height: 8 },
  line: { width: StyleSheet.hairlineWidth, flex: 1, marginTop: 4 },
  card: { flex: 1, borderWidth: StyleSheet.hairlineWidth },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { flex: 1 },
});
