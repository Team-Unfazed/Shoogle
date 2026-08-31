import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { COVERAGE_GATE } from '../scoring';
import type { AreaCoverage } from '../types';

/**
 * "What we could measure", area by area. Owner: Pranay.
 *
 * THREE STATES PER AREA, AND THEY ARE THREE DIFFERENT SENTENCES:
 *
 *   coverage === null   nothing here applies to this business (a service-area
 *                       business has no storefront address to get wrong). The
 *                       bar is empty and the row says so. It is NOT 0%.
 *   coverage === 0      things apply here and we measured none of them. Also an
 *                       empty bar — but a completely different statement, so it
 *                       gets a completely different line of text.
 *   coverage > 0        we measured this share of what applies.
 *
 * Collapsing the first two into "0%" is the exact mistake this whole module
 * exists to prevent, so the bar is never the only signal: the text carries the
 * meaning and the bar only illustrates it.
 */

export interface CoverageByAreaProps {
  areas: readonly AreaCoverage[];
  testID?: string;
}

export function CoverageByArea({ areas, testID }: CoverageByAreaProps) {
  const theme = useTheme();

  return (
    <View testID={testID ?? 'coverage-by-area'} style={{ gap: theme.spacing.md }}>
      {areas.map((area) => (
        <CoverageRow key={area.area} area={area} />
      ))}
    </View>
  );
}

function CoverageRow({ area }: { area: AreaCoverage }) {
  const theme = useTheme();

  const applies = area.coverage !== null;
  const coverage = area.coverage ?? 0;
  const accent = !applies ? 'neutral' : coverage >= COVERAGE_GATE ? 'green' : 'amber';
  const { fg, bg } = theme.accent(accent);

  const detail = !applies
    ? "Doesn't apply to you"
    : `${area.checkedCount} of ${area.applicableCount} checked`;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${area.label}, ${detail}`}
      style={{ minHeight: theme.spacing['2xl'] }}>
      <View style={styles.labels}>
        <Text
          variant="bodyStrong"
          numberOfLines={1}
          style={[styles.name, { marginRight: theme.spacing.md }]}>
          {area.label}
        </Text>
        <Text variant="caption" tone={applies ? 'muted' : 'muted2'}>
          {detail}
        </Text>
      </View>

      <View
        style={[
          styles.track,
          {
            backgroundColor: theme.colors.card2,
            borderRadius: theme.radii.full,
            marginTop: theme.spacing.sm,
          },
        ]}>
        {applies && coverage > 0 ? (
          <View
            style={[
              styles.fill,
              {
                backgroundColor: fg,
                borderRadius: theme.radii.full,
                width: `${Math.round(coverage * 100)}%`,
              },
            ]}
          />
        ) : null}
        {!applies ? (
          // A hairline of the neutral fill, so an inapplicable area reads as
          // "no bar to draw" rather than as an area we scored zero on.
          <View
            style={[
              styles.inapplicable,
              { backgroundColor: bg, borderRadius: theme.radii.full },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, minWidth: 0 },
  track: { height: 6, overflow: 'hidden' },
  fill: { height: 6 },
  inapplicable: { height: 6, width: '100%', opacity: 0.6 },
});
