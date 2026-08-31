/**
 * SERVICE AREAS. Route: `/seo/areas`. Feature owner: Pranay.
 *
 * WHY A WHOLE SCREEN FOR ONE FIELD
 * --------------------------------
 * `serviceArea` decides how far Google is willing to show a business from. For a
 * mobile repair shop, a home salon or a driving school that travels to the
 * learner, it is the difference between two localities and ten — and unlike a
 * rank, it is a lever the owner actually controls. It is also the field most
 * often left empty by owners who set their listing up as a shopfront years ago
 * and started travelling since.
 *
 * WHY THIS SCREEN IS UNUSUALLY CAUTIOUS
 * -------------------------------------
 * `serviceArea` is in `LOCATION_READ_MASK`, so Google IS asked for it — but
 * `GbpLocationWire` declares no member for it, because
 * docs/research/google-business-profile.md §9 confirms the field exists and is
 * writable without ever quoting its sub-message. This feature's rule is that
 * unverified means unknown, so rather than invent a wire type, `readServiceArea`
 * validates whatever arrives and reports what it could not understand.
 *
 * That produces three states the screen keeps visibly apart:
 *
 *   absent        Google returned no service area. This listing is a place
 *                 customers come to. A MEASUREMENT.
 *   read, empty   Google holds a service area with no localities in it. A gap
 *                 worth fixing today. Also a measurement.
 *   unrecognised  Google sent something Shoogle cannot read. Unknown — and
 *                 shown as unknown, because a mobile business told it serves
 *                 nowhere would go and "fix" a listing that was already right.
 *
 * WHAT SHOOGLE WILL NOT PRETEND
 * -----------------------------
 * Google allows this field to be written through `locations.patch`, but
 * `GbpAdapter` declares no method for it, so there is no button here. There are
 * steps instead. CONTRIBUTING rule 7: a control with no implementation says so.
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { DataStateView, Screen, TopBar } from '@/components/shared';
import { Section, Text } from '@/components/ui';
import { googleBusinessProfileProvider } from '@/features/gbp';
import {
  GuidedSteps,
  PROFILE_FIELD_SPEC_BY_ID,
  readServiceArea,
  ServiceAreaCard,
  type ServiceAreaObservation,
} from '@/features/gbp/components/profile';
import { getGbpProfileFixtures, gbpFixtureState } from '@/fixtures/gbp-profile';
import { failed, loading, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

const NO_LOCATION_ID = '';

function readFixtureAreas(): DataState<ServiceAreaObservation> | null {
  const fixtures = getGbpProfileFixtures();
  if (fixtures === null) return null;
  // The raw payload goes through the defensive reader here, in the screen, so
  // nothing downstream ever holds an unvalidated shape.
  return gbpFixtureState<ServiceAreaObservation>(readServiceArea(fixtures.serviceArea));
}

async function loadFromProvider(): Promise<DataState<ServiceAreaObservation>> {
  const location = await googleBusinessProfileProvider.getLocation(NO_LOCATION_ID);
  if (location.status !== 'ready') return location;
  return failed(
    'gbp_service_area_read_missing',
    'Shoogle can now reach your Google listing, but it does not yet read the service-area field off the reply. It will not show you a list it has not read.',
    false,
  );
}

export default function AreasScreen() {
  const theme = useTheme();

  const [fixtureState] = useState<DataState<ServiceAreaObservation> | null>(readFixtureAreas);
  const [providerState, setProviderState] =
    useState<DataState<ServiceAreaObservation>>(loading());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (fixtureState !== null) return;

    let cancelled = false;
    void loadFromProvider().then((next) => {
      if (!cancelled) setProviderState(next);
    });

    return () => {
      cancelled = true;
    };
  }, [fixtureState, attempt]);

  const state = fixtureState ?? providerState;
  const showsFixtureData = state.status === 'ready' && state.isFixture === true;
  const spec = PROFILE_FIELD_SPEC_BY_ID.serviceArea;

  return (
    <Screen testID="areas-screen" header={<TopBar />} edgeBottom showsFixtureData={showsFixtureData}>
      <Text variant="screenTitle">Service areas</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 6, marginBottom: theme.spacing.lg }}>
        The localities Google is willing to show you in when someone searches nearby. This is reach,
        not rank — Google publishes no rank, and Shoogle will not invent one.
      </Text>

      <DataStateView
        state={state}
        testID="areas-state"
        onRetry={() => {
          setProviderState(loading());
          setAttempt((value) => value + 1);
        }}>
        {(observation) => (
          <View style={{ gap: theme.spacing.md }}>
            <ServiceAreaCard observation={observation} testID="service-area" />

            <Section
              title="Changing your areas"
              subtitle="Google allows this write. Shoogle has not built it, so here is how to do it yourself.">
              <GuidedSteps
                title="On Google"
                steps={spec.ownerSteps}
                note={spec.matrixNote}
                testID="area-steps"
              />
            </Section>

            <Text variant="caption" tone="muted2" testID="areas-why">
              {spec.whyItMatters}
            </Text>
          </View>
        )}
      </DataStateView>
    </Screen>
  );
}
