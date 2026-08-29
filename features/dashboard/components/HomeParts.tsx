import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';
import type { AccentName } from '@/theme/tokens';

/**
 * Home composition pieces. Feature owner: Aryan.
 *
 * Every measurement here is transcribed from the Claude Design project
 * ("Shoogle Home.dc.html"): the 42px business tile at radius 13, the 2px
 * gradient ring on the suggestion card, 186px insight chips, 46px module
 * tiles at radius 15, and 18px page gutters.
 *
 * These are LAYOUT ONLY. They render whatever data they are handed and never
 * fetch, invent or default anything. A screen decides whether the values are
 * real, fixtures, or absent.
 */

/* -------------------------------------------------------------------------- */
/* Business header                                                            */
/* -------------------------------------------------------------------------- */

export function BusinessHeader({
  name,
  locality,
  initials,
  hasUnread,
  onPressBusiness,
  onPressNotifications,
}: {
  name: string;
  locality: string;
  initials: string;
  hasUnread: boolean;
  onPressBusiness: () => void;
  onPressNotifications: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.headerRow}>
      <Pressable
        onPress={onPressBusiness}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${locality}. Switch business`}
        style={({ pressed }) => [styles.headerLeft, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={[styles.bizTile, { backgroundColor: theme.colors.blue }]}>
          <Text
            style={{
              fontFamily: theme.fontFamily.display,
              fontSize: 15,
              color: theme.colors.onAccent,
            }}>
            {initials}
          </Text>
        </View>

        <View style={styles.headerText}>
          <View style={styles.headerNameRow}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: theme.fontFamily.display,
                fontSize: 16.5,
                letterSpacing: -0.17,
                color: theme.colors.text,
              }}>
              {name}
            </Text>
            <Ionicons name="chevron-down" size={12} color={theme.colors.muted2} />
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
            {locality}
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={onPressNotifications}
        accessibilityRole="button"
        accessibilityLabel={hasUnread ? 'Notifications, unread' : 'Notifications'}
        style={({ pressed }) => [
          styles.bellButton,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.8 : 1,
          },
        ]}>
        <Ionicons name="notifications-outline" size={20} color={theme.colors.text} />
        {hasUnread ? (
          <View
            style={[
              styles.bellDot,
              { backgroundColor: theme.colors.red, borderColor: theme.colors.card },
            ]}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Shoogle suggests — the page's signature element                            */
/* -------------------------------------------------------------------------- */

/**
 * The one card carrying a gradient. Shoogle is an operator, so the surface that
 * proposes work is the thing the owner should notice first; everything else on
 * Home stays flat and quiet so this reads as the primary action.
 */
export function SuggestCard({
  title,
  body,
  primaryLabel,
  moreCount,
  onPrimary,
  onSkip,
  onMore,
}: {
  title: string;
  body: string;
  primaryLabel: string;
  moreCount: number;
  onPrimary: () => void;
  onSkip: () => void;
  onMore: () => void;
}) {
  const theme = useTheme();

  return (
    <LinearGradient
      colors={[theme.colors.blue, theme.colors.green]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.suggestRing}>
      <View style={[styles.suggestInner, { backgroundColor: theme.colors.card }]}>
        <View style={styles.suggestLabelRow}>
          <Ionicons name="sparkles" size={13} color={theme.colors.blue} />
          <Text
            variant="label"
            tone="blue"
            style={{ fontSize: 12, letterSpacing: 0.72, marginLeft: 8 }}>
            Shoogle suggests
          </Text>
          {moreCount > 0 ? (
            <Pressable
              onPress={onMore}
              accessibilityRole="button"
              accessibilityLabel={`${moreCount} more suggestions`}
              hitSlop={10}
              style={styles.suggestMore}>
              <Text
                variant="caption"
                tone="muted"
                style={{ fontFamily: theme.fontFamily.bold, fontSize: 12 }}>
                {`${moreCount} more`}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text variant="cardTitle" style={{ lineHeight: 21.6, marginBottom: 6 }}>
          {title}
        </Text>
        <Text variant="body" tone="muted" style={{ fontSize: 13.5, lineHeight: 20, marginBottom: 14 }}>
          {body}
        </Text>

        <View style={styles.suggestActions}>
          <Pressable
            onPress={onPrimary}
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            style={({ pressed }) => [
              styles.suggestPrimary,
              { backgroundColor: theme.colors.blue, opacity: pressed ? 0.92 : 1 },
            ]}>
            <Text
              style={{
                fontFamily: theme.fontFamily.bold,
                fontSize: 14,
                color: theme.colors.onAccent,
              }}>
              {primaryLabel}
            </Text>
          </Pressable>

          {/* Product rule 5: skipping is always one tap, never buried. */}
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip this suggestion"
            style={({ pressed }) => [
              styles.suggestSkip,
              { borderColor: theme.colors.border, opacity: pressed ? 0.7 : 1 },
            ]}>
            <Text
              variant="body"
              tone="muted"
              style={{ fontFamily: theme.fontFamily.semibold, fontSize: 14 }}>
              Skip
            </Text>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

/* -------------------------------------------------------------------------- */
/* Insight chips                                                              */
/* -------------------------------------------------------------------------- */

export function InsightStrip({
  items,
}: {
  items: { id: string; label: string; accent: AccentName; text: string }[];
}) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.insightScroll}>
      {items.map((item) => (
        <View
          key={item.id}
          accessible
          accessibilityLabel={`${item.label}. ${item.text}`}
          style={[
            styles.insightChip,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}>
          <Text
            variant="label"
            style={{ color: theme.accent(item.accent).fg, fontSize: 11.5, letterSpacing: 0 }}>
            {item.label}
          </Text>
          <Text variant="body" style={{ fontSize: 13, lineHeight: 18.2, marginTop: 6 }}>
            {item.text}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/* -------------------------------------------------------------------------- */
/* Compact metric tile                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The small 3-up metric used only on Home.
 *
 * `value` is `number | null` for the same reason the shared `Metric` primitive
 * is: an unmeasured number renders as a dash with a reason, never as 0.
 */
export function MetricTile({
  label,
  value,
  changePct,
  unavailableReason,
  onPress,
}: {
  label: string;
  value: number | null;
  changePct: number | null;
  unavailableReason?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const known = value !== null;
  const display = known ? value.toLocaleString('en-IN') : '—';

  const trend = (() => {
    if (!known || changePct === null) return null;
    if (changePct === 0) return { text: '— 0%', color: theme.colors.muted2 };
    const up = changePct > 0;
    return {
      text: `${up ? '↑' : '↓'} ${Math.abs(changePct)}%`,
      color: up ? theme.colors.green : theme.colors.red,
    };
  })();

  const body = (
    <>
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
          fontSize: 20,
          letterSpacing: -0.4,
          color: known ? theme.colors.text : theme.colors.muted2,
          marginTop: 4,
        }}>
        {display}
      </Text>
      {trend ? (
        <Text variant="label" style={{ color: trend.color, fontSize: 11.5, letterSpacing: 0, marginTop: 4 }}>
          {trend.text}
        </Text>
      ) : (
        <Text variant="caption" tone="muted2" style={{ fontSize: 11.5, marginTop: 4 }}>
          {known ? '' : (unavailableReason ?? 'Not available')}
        </Text>
      )}
    </>
  );

  const tile: object[] = [
    styles.metricTile,
    { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
  ];

  const label11y = known
    ? `${label}, ${display}${trend ? `, ${trend.text}` : ''}`
    : `${label}, not available`;

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label11y} style={tile}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label11y}
      style={({ pressed }) => [...tile, { opacity: pressed ? 0.9 : 1 }]}>
      {body}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Connection alert                                                           */
/* -------------------------------------------------------------------------- */

export function AlertRow({
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
        styles.alertRow,
        { backgroundColor: theme.colors.redSoft, opacity: pressed ? 0.9 : 1 },
      ]}>
      <View style={[styles.alertBadge, { backgroundColor: theme.colors.red }]}>
        <Text style={{ fontFamily: theme.fontFamily.bold, fontSize: 17, color: theme.colors.onAccent }}>
          !
        </Text>
      </View>
      <View style={styles.alertText}>
        <Text variant="bodyStrong" style={{ fontSize: 13.5 }} numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" style={{ fontSize: 12, marginTop: 2 }} numberOfLines={2}>
          {body}
        </Text>
      </View>
      <Text variant="bodyStrong" tone="red" style={{ fontSize: 13 }}>
        {actionLabel}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Module row                                                                 */
/* -------------------------------------------------------------------------- */

const MODULE_ICON = {
  social: 'chatbubble-ellipses-outline',
  seo: 'location-outline',
  website: 'globe-outline',
} as const;

export function ModuleRow({
  title,
  subtitle,
  accent,
  icon,
  emphasis,
  onPress,
}: {
  title: string;
  subtitle: string;
  accent: AccentName;
  icon: keyof typeof MODULE_ICON;
  emphasis?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { fg, bg } = theme.accent(accent);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      android_ripple={{ color: theme.colors.border }}
      style={({ pressed }) => [
        styles.moduleRow,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.95 : 1,
        },
      ]}>
      <View style={[styles.moduleTile, { backgroundColor: bg }]}>
        <Ionicons name={MODULE_ICON[icon]} size={20} color={fg} />
      </View>

      <View style={styles.moduleText}>
        <Text style={{ fontFamily: theme.fontFamily.display, fontSize: 16, color: theme.colors.text }}>
          {title}
        </Text>
        <Text
          variant="caption"
          tone={emphasis ? 'amber' : 'muted'}
          numberOfLines={2}
          style={{
            fontSize: 12.5,
            marginTop: 3,
            fontFamily: emphasis ? theme.fontFamily.semibold : theme.fontFamily.regular,
          }}>
          {subtitle}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.muted2} />
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */

const GUTTER = 18;

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: GUTTER,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 },
  bizTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0, gap: 1 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
  },

  suggestRing: { marginHorizontal: GUTTER, marginBottom: 18, borderRadius: 20, padding: 2 },
  suggestInner: { borderRadius: 18, padding: 16 },
  suggestLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  suggestMore: { marginLeft: 'auto' },
  suggestActions: { flexDirection: 'row', gap: 9 },
  suggestPrimary: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  suggestSkip: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  insightScroll: { paddingHorizontal: GUTTER, paddingBottom: 18, gap: 10 },
  insightChip: {
    width: 186,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 13,
  },

  metricTile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 13,
    paddingHorizontal: 12,
    minWidth: 0,
  },

  alertRow: {
    marginHorizontal: GUTTER,
    marginBottom: 20,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertText: { flex: 1, minWidth: 0 },

  moduleRow: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
  },
  moduleTile: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleText: { flex: 1, minWidth: 0 },
});
