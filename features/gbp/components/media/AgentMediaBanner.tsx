import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { PHOTO_INSIGHTS_REMOVED_ON, type MediaAge } from './model';

/**
 * The banner at the top of Photos. Owner: Pranay.
 *
 * WHAT THIS IS ANSWERING
 * ----------------------
 * Grexa's photos tab opens with "Grexa keeps your profile active — GBP AI Agent
 * smartly publishes photos to help you rank higher on Google." Two claims, both
 * unfalsifiable: Google publishes no rank position through any API, and it
 * deleted photo views in 2023, so nobody — not Grexa, not Shoogle — can show
 * that publishing a photo changed anything.
 *
 * This banner therefore states only what Shoogle can point at: how many photos
 * it has published from its own records, how old the newest photo on the
 * listing is, and the fact that the outcome is not measurable by anyone.
 */
export type MediaAgentState =
  /** No Google listing linked. Nothing has been published and nothing observed. */
  | { kind: 'not_connected' }
  /** Linked, but the profile is not in Voice of Merchant, so we cannot read media. */
  | { kind: 'blocked'; reason: string }
  /**
   * We read the media list. Every number here is a measurement: `itemCount` is
   * what Google returned, `publishedByShoogle` is what Shoogle's own records
   * say it sent. Neither is an estimate and neither stands in for the other.
   */
  | {
      kind: 'measured';
      publishedByShoogle: number;
      itemCount: number;
      newest: MediaAge | null;
    };

export function AgentMediaBanner({ state }: { state: MediaAgentState }) {
  const theme = useTheme();
  const { fg, bg } = theme.accent(state.kind === 'measured' ? 'green' : 'neutral');

  const headline = (() => {
    switch (state.kind) {
      case 'not_connected':
        return 'Shoogle has not published any photos';
      case 'blocked':
        return 'Shoogle cannot see your photos yet';
      case 'measured':
        return state.publishedByShoogle === 1
          ? 'Shoogle published 1 photo to this profile'
          : `Shoogle published ${state.publishedByShoogle} photos to this profile`;
    }
  })();

  const body = (() => {
    switch (state.kind) {
      case 'not_connected':
        return 'No Google Business Profile is connected, so nothing has been sent and nothing on your listing has been read.';
      case 'blocked':
        return state.reason;
      case 'measured':
        // Three different facts, three different sentences: you have added
        // none, you have added some but Google dated none of them, or here is
        // how old the newest one is.
        if (state.itemCount === 0) {
          return 'Google listed no photos added by you, so there is nothing of yours on the listing to keep fresh.';
        }
        if (state.newest === null || state.newest.kind === 'unknown') {
          return 'Google did not date the photos you have added, so how fresh your listing looks is unknown.';
        }
        return `The newest photo you have added went up ${state.newest.label.toLowerCase()}.`;
    }
  })();

  return (
    <View
      testID="agent-media-banner"
      accessible
      accessibilityLabel={`${headline}. ${body}`}
      style={[
        styles.root,
        { backgroundColor: bg, borderRadius: theme.radii.xl, padding: theme.spacing.lg },
      ]}>
      <View style={[styles.headRow, { gap: theme.spacing.md }]}>
        <View
          style={[
            styles.glyph,
            {
              backgroundColor: theme.colors.card,
              borderRadius: theme.radii.full,
              width: theme.spacing['3xl'],
              height: theme.spacing['3xl'],
            },
          ]}>
          <Ionicons name="images-outline" size={18} color={fg} />
        </View>
        <Text variant="cardTitle" style={styles.headline}>
          {headline}
        </Text>
      </View>

      <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
        {body}
      </Text>

      {/*
        The line Grexa cannot write. It is in the banner rather than buried in a
        footnote because it is the most useful true thing on the screen.
      */}
      <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.md }}>
        Shoogle will not tell you photos lift your ranking. Google removed photo views on{' '}
        {PHOTO_INSIGHTS_REMOVED_ON} and publishes no ranking position, so that claim cannot be
        checked by anyone.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  glyph: { alignItems: 'center', justifyContent: 'center' },
  headline: { flex: 1 },
});
