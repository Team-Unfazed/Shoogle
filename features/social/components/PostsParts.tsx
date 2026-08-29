import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';

/**
 * Posts composition pieces. Feature owner: Yash.
 *
 * Measurements transcribed from "Shoogle Social.dc.html": the 64px next-up
 * thumbnail at radius 12, 52px list thumbnails at radius 11, stat tiles at
 * radius 15, list rows at radius 16, and the 54px floating create button.
 *
 * Layout only — these render what they are given and never fetch or invent.
 */

/* -------------------------------------------------------------------------- */
/* Media placeholder                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Stands in for post artwork. The wireframe hatches these tiles to mean "image
 * goes here"; with no real media yet, a labelled neutral tile says the same
 * thing honestly rather than implying a picture exists.
 */
export function MediaPlaceholder({
  size,
  radius,
  label,
}: {
  size: number;
  radius: number;
  label?: string;
}) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label ? `No image yet, ${label}` : 'No image yet'}
      style={[
        styles.media,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: theme.colors.card2,
          borderColor: theme.colors.border,
        },
      ]}>
      <Ionicons name="image-outline" size={Math.round(size * 0.3)} color={theme.colors.muted2} />
      {label && size >= 60 ? (
        <Text variant="label" tone="muted2" style={{ fontSize: 8, marginTop: 3 }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Next up                                                                    */
/* -------------------------------------------------------------------------- */

export function NextUpCard({
  label,
  title,
  channel,
  mediaLabel,
  onPreview,
  onEdit,
}: {
  label: string;
  title: string;
  channel: string;
  mediaLabel: string;
  onPreview: () => void;
  onEdit: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.nextUp, { backgroundColor: theme.colors.blueSoft }]}>
      <Text variant="label" tone="blue" style={{ fontSize: 11, letterSpacing: 0.66 }}>
        {label}
      </Text>

      <View style={styles.nextUpRow}>
        <MediaPlaceholder size={64} radius={12} label={mediaLabel} />
        <View style={styles.nextUpText}>
          <Text variant="bodyStrong" style={{ fontSize: 14, lineHeight: 19 }} numberOfLines={2}>
            {title}
          </Text>
          <Text variant="caption" tone="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {channel}
          </Text>
        </View>
      </View>

      <View style={styles.nextUpActions}>
        <Pressable
          onPress={onPreview}
          accessibilityRole="button"
          accessibilityLabel="Preview this post"
          android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          style={({ pressed }) => [
            styles.nextUpPrimary,
            { backgroundColor: theme.colors.blue, opacity: pressed ? 0.92 : 1 },
          ]}>
          <Text
            style={{ fontFamily: theme.fontFamily.bold, fontSize: 13.5, color: theme.colors.onAccent }}>
            Preview
          </Text>
        </Pressable>

        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel="Edit this post"
          style={({ pressed }) => [
            styles.nextUpSecondary,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <Text variant="body" style={{ fontFamily: theme.fontFamily.semibold, fontSize: 13.5 }}>
            Edit
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat tile                                                                  */
/* -------------------------------------------------------------------------- */

/** `value` of null renders a dash — an uncounted total is not a total of zero. */
export function StatTile({
  value,
  label,
  accent,
}: {
  value: number | null;
  label: string;
  accent?: AccentName;
}) {
  const theme = useTheme();
  const color = accent ? theme.accent(accent).fg : theme.colors.text;

  return (
    <View
      accessible
      accessibilityLabel={value === null ? `${label}, not available` : `${value} ${label}`}
      style={[
        styles.statTile,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
      ]}>
      <Text
        style={{
          fontFamily: theme.fontFamily.display,
          fontSize: 19,
          color: value === null ? theme.colors.muted2 : color,
        }}>
        {value === null ? '—' : value.toLocaleString('en-IN')}
      </Text>
      <Text variant="caption" tone="muted" style={{ fontSize: 11.5, marginTop: 3 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Section label                                                              */
/* -------------------------------------------------------------------------- */

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      variant="label"
      tone="muted2"
      accessibilityRole="header"
      style={{ fontSize: 12, letterSpacing: 0.72, marginTop: 6 }}>
      {children}
    </Text>
  );
}

/* -------------------------------------------------------------------------- */
/* Post rows                                                                  */
/* -------------------------------------------------------------------------- */

export function ScheduledRow({
  title,
  when,
  where,
  mediaLabel,
  onPress,
}: {
  title: string;
  when: string;
  where: string;
  mediaLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${when}. ${where}`}
      android_ripple={{ color: theme.colors.border }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.95 : 1,
        },
      ]}>
      <MediaPlaceholder size={52} radius={11} label={mediaLabel} />

      <View style={styles.rowText}>
        <Text variant="bodyStrong" style={{ fontSize: 13.5, lineHeight: 18 }} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.rowMeta}>
          <Text variant="caption" tone="muted" style={{ fontSize: 11.5 }}>
            {when}
          </Text>
          <View style={[styles.whereBadge, { backgroundColor: theme.colors.blueSoft }]}>
            <Text variant="label" tone="blue" style={{ fontSize: 10.5, letterSpacing: 0 }}>
              {where}
            </Text>
          </View>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={17} color={theme.colors.muted2} />
    </Pressable>
  );
}

/** A row demanding action — amber border, per the design's "Needs attention". */
export function AttentionRow({
  title,
  body,
  actionLabel,
  onPress,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}. ${actionLabel}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.amber,
          opacity: pressed ? 0.95 : 1,
        },
      ]}>
      <View style={[styles.iconTile, { backgroundColor: theme.colors.amberSoft }]}>
        <Ionicons name="create-outline" size={20} color={theme.colors.amber} />
      </View>

      <View style={styles.rowText}>
        <Text variant="bodyStrong" style={{ fontSize: 13.5 }} numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
          {body}
        </Text>
      </View>

      <Text variant="bodyStrong" tone="amber" style={{ fontSize: 12.5 }}>
        {actionLabel}
      </Text>
    </Pressable>
  );
}

export function PublishedRow({
  title,
  result,
  mediaLabel,
}: {
  title: string;
  result: string;
  mediaLabel: string;
}) {
  const theme = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${result}`}
      style={[styles.row, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <MediaPlaceholder size={52} radius={11} label={mediaLabel} />
      <View style={styles.rowText}>
        <Text variant="bodyStrong" style={{ fontSize: 13.5 }} numberOfLines={2}>
          {title}
        </Text>
        {/* Only ever rendered for a post a provider confirmed went out. */}
        <Text
          variant="caption"
          tone="green"
          style={{ fontSize: 11.5, marginTop: 4, fontFamily: theme.fontFamily.semibold }}>
          {result}
        </Text>
      </View>
    </View>
  );
}

export function FailedRow({
  title,
  reason,
  onRetry,
}: {
  title: string;
  reason: string;
  onRetry: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${reason}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.9 : 1,
        },
      ]}>
      <View style={[styles.iconTile, { backgroundColor: theme.colors.redSoft }]}>
        <Text style={{ fontFamily: theme.fontFamily.bold, fontSize: 20, color: theme.colors.red }}>
          !
        </Text>
      </View>
      <View style={styles.rowText}>
        <Text variant="bodyStrong" style={{ fontSize: 13.5 }}>
          {title}
        </Text>
        <Text variant="caption" tone="red" style={{ fontSize: 11.5, marginTop: 3 }}>
          {reason}
        </Text>
      </View>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Floating create button                                                     */
/* -------------------------------------------------------------------------- */

export function CreatePostButton({ onPress, bottom }: { onPress: () => void; bottom: number }) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Create post"
      testID="create-post"
      android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
      style={({ pressed }) => [
        styles.fab,
        {
          bottom,
          backgroundColor: theme.colors.blue,
          shadowColor: theme.colors.blue,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}>
      <Ionicons name="add" size={20} color={theme.colors.onAccent} />
      <Text
        style={{
          fontFamily: theme.fontFamily.bold,
          fontSize: 15.5,
          color: theme.colors.onAccent,
          marginLeft: 8,
        }}>
        Create post
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  media: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },

  nextUp: { borderRadius: 18, padding: 15 },
  nextUpRow: { flexDirection: 'row', gap: 12, marginTop: 11 },
  nextUpText: { flex: 1, minWidth: 0 },
  nextUpActions: { flexDirection: 'row', gap: 9, marginTop: 11 },
  nextUpPrimary: {
    flex: 1,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nextUpSecondary: {
    height: 40,
    paddingHorizontal: 15,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  statTile: {
    flex: 1,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    minWidth: 0,
  },

  row: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  rowText: { flex: 1, minWidth: 0 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  whereBadge: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6 },
  iconTile: { width: 52, height: 52, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  fab: {
    position: 'absolute',
    left: 18,
    right: 18,
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 8,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
});
