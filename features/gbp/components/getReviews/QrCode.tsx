import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { lightColors, radii } from '@/theme/tokens';

import { darkRects, QR_QUIET_ZONE_MODULES, type QrMatrix } from './qr';

/**
 * A QR code drawn from plain Views.
 *
 * WHY THE COLOURS ARE PINNED TO THE LIGHT PALETTE
 * -----------------------------------------------
 * Everywhere else in this app, hard-coding a colour is a bug, and a component
 * that ignores dark mode is a bug. Here it is the opposite. ISO/IEC 18004
 * requires dark modules on a light background, and a large share of scanners —
 * including several Android camera apps — refuse an inverted code. Rendering
 * the QR in `theme.colors.text` on `theme.colors.card` would produce a white
 * code on near-black in dark mode: it would look beautiful and it would not
 * scan, which is the only thing a QR is for.
 *
 * So the two colours come from `lightColors` explicitly — still tokens, still
 * the design system, just deliberately not theme-following. The surrounding
 * card is themed as normal, so the code reads as a printable object sitting on
 * the page rather than a styling mistake.
 *
 * WHY RECTANGLES AND NOT MODULES
 * ------------------------------
 * One View per module is 1,681 Views for a version-6 code. `darkRects` merges
 * runs horizontally and then vertically, which typically lands under 200 Views
 * for the same pixels.
 */
export interface QrCodeProps {
  matrix: QrMatrix;
  /** Target width in points, including the quiet zone. */
  size?: number;
  /** What the code encodes, for TalkBack. A QR is meaningless to a screen reader. */
  accessibilityLabel: string;
  testID?: string;
}

export function QrCode({ matrix, size = 232, accessibilityLabel, testID }: QrCodeProps) {
  const rects = useMemo(() => darkRects(matrix), [matrix]);

  const totalModules = matrix.size + QR_QUIET_ZONE_MODULES * 2;
  // Whole points per module, so no module is a sub-pixel wider than its
  // neighbour — uneven modules are the classic cause of a code that scans on
  // one phone and not another.
  const moduleSize = Math.max(1, Math.floor(size / totalModules));
  const side = moduleSize * totalModules;
  const offset = moduleSize * QR_QUIET_ZONE_MODULES;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.frame,
        {
          width: side,
          height: side,
          backgroundColor: lightColors.card,
          borderRadius: radii.xs,
        },
      ]}>
      {rects.map((rect) => (
        <View
          key={`${rect.row}:${rect.col}:${rect.width}:${rect.height}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: offset + rect.row * moduleSize,
            left: offset + rect.col * moduleSize,
            width: rect.width * moduleSize,
            height: rect.height * moduleSize,
            backgroundColor: lightColors.text,
          }}
        />
      ))}
    </View>
  );
}

/**
 * What is rendered when there is no code to draw.
 *
 * Never a grey square, never a spinner: a QR that cannot be built is a fact
 * with a reason, and the reason is what the owner needs.
 */
export function QrUnavailable({ message, testID }: { message: string; testID?: string }) {
  return (
    <View testID={testID} accessible accessibilityRole="summary" style={styles.unavailable}>
      <Text variant="caption" tone="muted" align="center">
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  unavailable: { paddingVertical: 20, paddingHorizontal: 16 },
});
