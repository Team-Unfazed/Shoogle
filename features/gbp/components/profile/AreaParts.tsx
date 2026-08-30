/**
 * Service-area view pieces. Owner: Pranay.
 *
 * Layout only. Every fact comes in from `serviceArea.ts`, which reads Google's
 * reply defensively because the sub-message shape is UNVERIFIED.
 *
 * WHY THIS SCREEN IS SO CAREFUL ABOUT "NONE"
 * ------------------------------------------
 * Service areas decide how far Google is willing to show a business from. For a
 * mobile repair shop or a home salon that is the difference between two
 * localities and ten. So "Google returned no service areas" and "Google returned
 * service areas Shoogle could not read" must be visibly different: the first is
 * a gap worth fixing this afternoon, and the second is Shoogle's shortcoming,
 * not the owner's.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Divider, Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { describeBusinessType, type ServiceAreaObservation } from './serviceArea';

export function ServiceAreaCard({
  observation,
  testID,
}: {
  observation: ServiceAreaObservation;
  testID?: string;
}) {
  const theme = useTheme();

  if (observation.kind === 'absent') {
    return (
      <Card testID={testID} accent="neutral">
        <Text variant="cardTitle">No service area on this listing</Text>
        <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          Google returned this listing with no service area, which means it is set up as a place
          customers come to rather than one you travel out from.
        </Text>
        <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.md }}>
          If you do travel to customers — home visits, doorstep repairs, on-site setup — adding a
          service area widens the localities Google will show you in. That change is on Google’s
          side; Shoogle cannot make it for you yet.
        </Text>
      </Card>
    );
  }

  if (observation.kind === 'unrecognised') {
    return (
      <Card testID={testID} accent="amber">
        <Text variant="cardTitle">Shoogle could not read your service area</Text>
        <Text variant="body" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          {observation.detail} Rather than show you an empty list, Shoogle is telling you it does not
          know. There may well be areas set on this listing.
        </Text>
        <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.md }} testID="service-area-unverified">
          The exact shape Google sends for this field is not documented in the reference Shoogle
          works from, so it is read defensively and anything unfamiliar is reported rather than
          guessed at.
        </Text>
      </Card>
    );
  }

  const total = observation.places.length;

  return (
    <Card testID={testID} padded={false}>
      <View style={{ padding: theme.spacing.lg }}>
        <Text variant="label" tone="muted2" accessibilityRole="header">
          Areas you serve
        </Text>
        <Text variant="body" style={{ marginTop: theme.spacing.sm }}>
          {describeBusinessType(observation.businessType)}
        </Text>
        {observation.unrecognisedBusinessType !== null ? (
          <Text variant="caption" tone="muted2" style={{ marginTop: theme.spacing.sm }} testID="unrecognised-business-type">
            {`Google described this listing as “${observation.unrecognisedBusinessType}”, which Shoogle does not recognise. It will not guess what it means.`}
          </Text>
        ) : null}
      </View>

      {total === 0 ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg }} testID="service-area-empty">
          <Divider spacing={0} style={{ marginBottom: theme.spacing.lg }} />
          <Text variant="bodyStrong" tone="amber">
            No areas listed
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            Google holds a service area for this listing but no localities inside it, so Google has
            nothing to decide your reach from. This is a measured gap, not a missing reading.
          </Text>
        </View>
      ) : (
        <View testID="service-area-list">
          {observation.places.map((place, index) => (
            <View key={`${place.name}-${place.placeId ?? index}`}>
              {index > 0 ? <Divider spacing={0} inset={theme.spacing.lg} /> : null}
              <View
                accessible
                accessibilityRole="text"
                accessibilityLabel={place.name}
                style={[
                  styles.row,
                  {
                    paddingHorizontal: theme.spacing.lg,
                    paddingVertical: theme.spacing.md,
                    minHeight: theme.control.minTouchTarget,
                  },
                ]}>
                <Ionicons name="location-outline" size={18} color={theme.colors.muted} />
                <View style={{ flex: 1, minWidth: 0, marginLeft: theme.spacing.md }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {place.name}
                  </Text>
                  {place.placeId !== null ? (
                    <Text variant="caption" tone="muted2" numberOfLines={1}>
                      {place.placeId}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {observation.unreadablePlaces > 0 ? (
        <View style={{ padding: theme.spacing.lg }} testID="service-area-unreadable">
          <Badge label="Incomplete list" accent="red" />
          <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
            {`Google sent ${observation.unreadablePlaces} more area${
              observation.unreadablePlaces === 1 ? '' : 's'
            } that Shoogle could not name. They are real — the list above is short by that many, and Shoogle would rather say so than let ${total} look like the whole answer.`}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
