/**
 * One search term and what Google said about it. Owner: Pranay.
 *
 * THE ONE RULE THIS FILE EXISTS FOR
 * ---------------------------------
 * `impressions` is a union: an exact count OR a below-threshold bound. Those
 * are different facts and they are rendered differently, twice over — in the
 * value itself (`<15`, never `15`) and in the row's own labelling, so a bound
 * cannot be skim-read as a small number.
 *
 * Three readings, three appearances:
 *
 *   exact, non-zero   1,240   PEOPLE            Google counted this.
 *   exact, zero       0       MEASURED ZERO     Google counted, and found none.
 *   below threshold   <15     RANGE  + badge    Google will not say how many.
 *
 * A fourth fact — "we could not ask" — never reaches this component. It is a
 * `DataState` and renders as an empty state, one level up.
 *
 * Formatting goes through `formatKeywordImpressions` and the accessibility
 * label through `describeKeywordImpressions`, both from `../keywords`, because
 * `<15` read aloud on its own is a broken number.
 */

import { View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import {
  describeKeywordImpressions,
  formatKeywordImpressions,
  type KeywordImpressionRow,
} from '../keywords';

export interface KeywordRowProps {
  row: KeywordImpressionRow;
  testID?: string;
}

interface RowPresentation {
  /** Small uppercase unit under the value. Names the KIND of reading. */
  readonly unitLabel: string;
  /** Pill beside the term. Only bounded and zero readings need one. */
  readonly badge: string | null;
  /** Caption under the term. Used where the reading needs a sentence. */
  readonly caption: string | null;
  readonly muted: boolean;
}

function present(row: KeywordImpressionRow): RowPresentation {
  if (row.impressions.kind === 'below_threshold') {
    return {
      unitLabel: 'Range',
      badge: `Fewer than ${row.impressions.threshold}`,
      caption: null,
      muted: true,
    };
  }
  if (row.impressions.value === 0) {
    return {
      unitLabel: 'Measured zero',
      badge: null,
      // Spelled out because a bare 0 is exactly what "unknown" must never
      // look like. This one is a measurement.
      caption: 'Google counted this term and found nobody.',
      muted: true,
    };
  }
  return { unitLabel: 'People', badge: null, caption: null, muted: false };
}

export function KeywordRow({ row, testID }: KeywordRowProps) {
  const theme = useTheme();
  const view = present(row);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${row.keyword}. ${describeKeywordImpressions(row.impressions)}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: theme.control.minTouchTarget,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
      }}>
      <View style={{ flex: 1, minWidth: 0, paddingRight: theme.spacing.md }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {row.keyword}
        </Text>

        {view.badge === null ? null : (
          <View style={{ marginTop: 6 }}>
            <Badge label={view.badge} accent="neutral" />
          </View>
        )}

        {view.caption === null ? null : (
          <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
            {view.caption}
          </Text>
        )}
      </View>

      <View style={{ alignItems: 'flex-end', maxWidth: 120 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: theme.fontFamily.display,
            fontSize: 20,
            letterSpacing: -0.4,
            color: view.muted ? theme.colors.muted : theme.colors.text,
          }}>
          {formatKeywordImpressions(row.impressions)}
        </Text>
        <Text variant="label" tone="muted2" numberOfLines={2} style={{ marginTop: 2 }}>
          {view.unitLabel}
        </Text>
      </View>
    </View>
  );
}
