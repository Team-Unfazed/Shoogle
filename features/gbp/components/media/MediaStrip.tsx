import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import {
  MEDIA_CATEGORY_LABEL,
  describeMediaAge,
  type GbpMediaItem,
} from './model';

/**
 * The horizontal strip of photos and videos, with a relative-age badge on each
 * tile. Owner: Pranay.
 *
 * WHAT A TILE SHOWS, AND WHAT IT CANNOT
 * -------------------------------------
 * Category, caption and age. That is the whole set of facts Google still
 * returns per media item. There is no view count on a tile and there is no
 * "top performing photo", because `MediaInsights` was removed in 2023 and
 * `MediaItem.insights` is documented as untrustworthy.
 *
 * A tile whose `createTime` Google omitted shows "Date not reported" in a
 * neutral badge, NOT "Today" — an undated photo has an unknown age.
 *
 * Tiles are not pressable. There is no media detail screen and no delete call
 * wired, and a tap target that does nothing is a dead control (CONTRIBUTING
 * rule 7).
 *
 * NOTE ON THUMBNAILS: `MediaItem.googleUrl` is documented as read-only and
 * "may change", and Shoogle holds no bytes of its own, so a tile renders a
 * category glyph rather than an image it would have to invent or re-fetch.
 */
export function MediaStrip({
  items,
  now,
  testID = 'media-strip',
}: {
  items: readonly GbpMediaItem[];
  /** RFC 3339 "now", passed in so ages are deterministic and testable. */
  now: string;
  testID?: string;
}) {
  const theme = useTheme();

  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      // The strip is the one place content may run past the 18px gutter, so it
      // sets its own padding and the screen renders it edge-to-edge.
      contentContainerStyle={{ gap: theme.spacing.md, paddingRight: theme.spacing.xs }}>
      {items.map((item) => {
        const age = describeMediaAge(item.createTime, now);
        const label = MEDIA_CATEGORY_LABEL[item.category];
        const caption = item.description ?? label;

        return (
          <View
            key={item.id}
            testID={`media-tile-${item.id}`}
            accessible
            accessibilityLabel={`${caption}. ${label}. ${
              age.kind === 'known' ? `Added ${age.label.toLowerCase()}` : 'Date not reported'
            }.${item.publishedByShoogle ? ' Published by Shoogle.' : ''}`}
            style={{ width: TILE_WIDTH }}>
            <View
              style={[
                styles.thumb,
                {
                  height: TILE_WIDTH,
                  backgroundColor: theme.colors.card2,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.lg,
                },
              ]}>
              <Ionicons
                name={item.format === 'VIDEO' ? 'videocam-outline' : 'image-outline'}
                size={26}
                color={theme.colors.muted2}
              />
              <View style={[styles.ageBadge, { bottom: theme.spacing.sm }]}>
                <Badge
                  label={age.label}
                  accent={age.kind === 'known' ? 'green' : 'neutral'}
                  testID={`media-age-${item.id}`}
                />
              </View>
            </View>

            <Text
              variant="caption"
              numberOfLines={2}
              style={{ marginTop: theme.spacing.sm }}
              accessible={false}>
              {caption}
            </Text>
            <Text variant="caption" tone="muted2" numberOfLines={1} accessible={false}>
              {label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** Two and a bit tiles visible at 390px, which is the design's carousel rhythm. */
const TILE_WIDTH = 132;

const styles = StyleSheet.create({
  thumb: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  ageBadge: { position: 'absolute', alignSelf: 'center' },
});
