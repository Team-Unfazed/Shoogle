import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';

/**
 * Business tab composition pieces. Feature owner: Pranay.
 *
 * Measurements transcribed from "Shoogle SEO.dc.html": the visibility hero at
 * radius 20 with five 6px strength segments, a 2x2 metric grid at radius 16,
 * the rating summary with its divider, and 44px navigation tiles at radius 14.
 *
 * Layout only. Nothing here fetches or invents a value.
 */

/* -------------------------------------------------------------------------- */
/* Visibility hero                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The headline verdict on local visibility.
 *
 * `filledSegments` is `number | null`. Null means we have not measured
 * visibility yet, and the bar renders empty with an honest headline rather than
 * showing zero-out-of-five as if that were a finding.
 */
export function VisibilityHero({
  label,
  headline,
  body,
  filledSegments,
  accent = 'green',
}: {
  label: string;
  headline: string;
  body: string;
  filledSegments: number | null;
  accent?: AccentName;
}) {
  const theme = useTheme();
  const { fg, bg } = theme.accent(accent);
  const total = 5;

  return (
    <View
      accessible
      accessibilityLabel={
        filledSegments === null
          ? `${label}. ${headline}. ${body}`
          : `${label}. ${headline}, ${filledSegments} out of ${total}. ${body}`
      }
      style={[styles.hero, { backgroundColor: bg }]}>
      <Text variant="label" style={{ color: fg, fontSize: 11.5, letterSpacing: 0.69 }}>
        {label}
      </Text>

      <Text
        accessibilityRole="header"
        style={{
          fontFamily: theme.fontFamily.display,
          fontSize: 26,
          letterSpacing: -0.52,
          color: theme.colors.text,
          marginTop: 9,
        }}>
        {headline}
      </Text>

      <Text variant="body" style={{ fontSize: 13.5, lineHeight: 20, marginTop: 9, opacity: 0.75 }}>
        {body}
      </Text>

      <View style={styles.heroBars}>
        {Array.from({ length: total }).map((_, index) => {
          const filled = filledSegments ?? 0;
          const opacity = index < filled ? 1 : index === filled ? 0.4 : 0.18;
          return (
            <View
              key={index}
              style={[
                styles.heroBar,
                {
                  backgroundColor: filledSegments === null ? theme.colors.border : fg,
                  opacity: filledSegments === null ? 0.5 : opacity,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Metric grid tile                                                           */
/* -------------------------------------------------------------------------- */

/** `value` of null renders a dash plus a reason — never 0. */
export function GridMetric({
  label,
  value,
  delta,
  deltaDirection,
  unavailableReason,
}: {
  label: string;
  /** Pre-formatted, e.g. "1,204" or "#6.4". Null when unmeasured. */
  value: string | null;
  /** Pre-formatted, e.g. "12%" or "2.1". Null when unknown. */
  delta: string | null;
  deltaDirection: 'up' | 'down' | 'flat' | null;
  unavailableReason?: string;
}) {
  const theme = useTheme();
  const known = value !== null;

  const deltaColor =
    deltaDirection === 'up'
      ? theme.colors.green
      : deltaDirection === 'down'
        ? theme.colors.red
        : theme.colors.muted2;
  const arrow = deltaDirection === 'up' ? '↑' : deltaDirection === 'down' ? '↓' : '—';

  return (
    <View
      accessible
      accessibilityLabel={
        known ? `${label}, ${value}${delta ? `, ${arrow} ${delta}` : ''}` : `${label}, not available`
      }
      style={[
        styles.gridMetric,
        { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
      ]}>
      <Text
        variant="caption"
        tone="muted"
        numberOfLines={1}
        style={{ fontSize: 11.5, fontFamily: theme.fontFamily.semibold }}>
        {label}
      </Text>
      <Text
        style={{
          fontFamily: theme.fontFamily.display,
          fontSize: 21,
          color: known ? theme.colors.text : theme.colors.muted2,
          marginTop: 4,
        }}>
        {known ? value : '—'}
      </Text>
      {known && delta ? (
        <Text variant="label" style={{ color: deltaColor, fontSize: 11.5, letterSpacing: 0, marginTop: 4 }}>
          {`${arrow} ${delta}`}
        </Text>
      ) : (
        <Text variant="caption" tone="muted2" style={{ fontSize: 11.5, marginTop: 4 }}>
          {known ? '' : (unavailableReason ?? 'Not available')}
        </Text>
      )}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Rating summary                                                             */
/* -------------------------------------------------------------------------- */

export function RatingRow({
  rating,
  total,
  unanswered,
  onPress,
}: {
  /** Null when no rating has been retrieved. */
  rating: number | null;
  total: number | null;
  unanswered: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const known = rating !== null;

  const subtitle = !known
    ? 'Not connected'
    : `${unanswered > 0 ? `${unanswered} unanswered · ` : ''}${total ?? 0} total`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={known ? `Reviews, rated ${rating} out of 5, ${subtitle}` : 'Reviews, not connected'}
      android_ripple={{ color: theme.colors.border }}
      style={({ pressed }) => [
        styles.navRow,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.95 : 1,
        },
      ]}>
      <View style={[styles.ratingBlock, { borderRightColor: theme.colors.border }]}>
        <Text
          style={{
            fontFamily: theme.fontFamily.display,
            fontSize: 22,
            color: known ? theme.colors.text : theme.colors.muted2,
          }}>
          {known ? rating.toFixed(1) : '—'}
        </Text>
        <Text style={{ fontSize: 11, color: theme.colors.amber, marginTop: 2 }}>
          {known ? '★★★★★' : '☆☆☆☆☆'}
        </Text>
      </View>

      <View style={styles.navText}>
        <Text variant="bodyStrong" style={{ fontSize: 14.5 }}>
          Reviews
        </Text>
        <Text
          variant="caption"
          tone={unanswered > 0 && known ? 'amber' : 'muted'}
          style={{
            fontSize: 12.5,
            marginTop: 3,
            fontFamily: unanswered > 0 && known ? theme.fontFamily.semibold : theme.fontFamily.regular,
          }}>
          {subtitle}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted2} />
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Navigation row                                                             */
/* -------------------------------------------------------------------------- */

export function BusinessNavRow({
  title,
  subtitle,
  subtitleTone = 'muted',
  glyph,
  icon,
  accent,
  onPress,
}: {
  title: string;
  subtitle: string;
  subtitleTone?: 'muted' | 'red' | 'amber' | 'green';
  /** A letter tile, e.g. "G" for Google. Takes precedence over `icon`. */
  glyph?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  accent?: AccentName;
  onPress: () => void;
}) {
  const theme = useTheme();
  const palette = accent ? theme.accent(accent) : { fg: theme.colors.muted, bg: theme.colors.card2 };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      android_ripple={{ color: theme.colors.border }}
      style={({ pressed }) => [
        styles.navRow,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.95 : 1,
        },
      ]}>
      <View
        style={[
          styles.navTile,
          {
            backgroundColor: palette.bg,
            borderColor: accent ? 'transparent' : theme.colors.border,
            borderWidth: accent ? 0 : StyleSheet.hairlineWidth,
          },
        ]}>
        {glyph ? (
          <Text style={{ fontFamily: theme.fontFamily.bold, fontSize: 16, color: palette.fg }}>
            {glyph}
          </Text>
        ) : (
          <Ionicons name={icon ?? 'ellipse-outline'} size={19} color={palette.fg} />
        )}
      </View>

      <View style={styles.navText}>
        <Text variant="bodyStrong" style={{ fontSize: 14.5 }}>
          {title}
        </Text>
        <Text
          variant="caption"
          tone={subtitleTone}
          numberOfLines={2}
          style={{
            fontSize: 12.5,
            marginTop: 3,
            fontFamily:
              subtitleTone === 'muted' ? theme.fontFamily.regular : theme.fontFamily.semibold,
          }}>
          {subtitle}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted2} />
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Advice callout                                                             */
/* -------------------------------------------------------------------------- */

export function AdviceCard({
  text,
  actionLabel,
  accent = 'blue',
  onPress,
}: {
  text: string;
  actionLabel?: string;
  accent?: AccentName;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const { fg, bg } = theme.accent(accent);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={actionLabel ? `${text} ${actionLabel}` : text}
      style={({ pressed }) => [
        styles.advice,
        { backgroundColor: bg, opacity: pressed && onPress ? 0.9 : 1 },
      ]}>
      <Ionicons name="sparkles" size={14} color={fg} />
      <Text variant="body" style={{ flex: 1, fontSize: 13, lineHeight: 20, marginLeft: 11, opacity: 0.9 }}>
        {text}
        {actionLabel ? (
          <Text style={{ color: fg, fontFamily: theme.fontFamily.bold }}>{` ${actionLabel}`}</Text>
        ) : null}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  hero: { borderRadius: 20, padding: 18 },
  heroBars: { flexDirection: 'row', gap: 5, marginTop: 13 },
  heroBar: { flex: 1, height: 6, borderRadius: 9 },

  gridMetric: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    minWidth: 0,
  },

  navRow: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
  },
  navTile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  navText: { flex: 1, minWidth: 0 },
  ratingBlock: {
    alignItems: 'center',
    paddingRight: 14,
    borderRightWidth: StyleSheet.hairlineWidth,
  },

  advice: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 16, padding: 14 },
});
