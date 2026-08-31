/**
 * BUSINESS PROFILE. Route: `/seo/profile`. Feature owner: Pranay.
 *
 * This is where "Fix this for me" either becomes real or is admitted not to be.
 *
 * WHAT THIS SCREEN CLAIMS, AND WHAT IT REFUSES TO
 * -----------------------------------------------
 * For every field on the listing it answers three questions, and no more:
 *
 *   what is there            — or the honest reason there is nothing
 *   where it came from       — Google's copy, an owner edit still pending, or a
 *                              change Google made that nobody approved
 *   can Shoogle write it     — one tap, or your hand, with the matrix line that
 *                              decides which
 *
 * The third answer is uncomfortable and it is shown anyway. Per
 * docs/research/google-business-profile.md §9 the Business Information API can
 * patch nearly every field here, but `GbpAdapter` declares exactly ONE
 * profile-field write today — `updateRegularHours`. So one field offers a
 * button and the rest say "needs your hand" and show the steps. Ten buttons
 * that quietly did nothing would demo better and would be a lie.
 *
 * THE PART NO COMPETITOR SHIPS
 * ----------------------------
 * `locations.getGoogleUpdated` returns the fields where GOOGLE's copy of the
 * listing differs from the owner's — edits Google made from user suggestions or
 * its own crawls, which the owner never approved and is rarely told about. That
 * read is the first card on this screen, and it is also what the write plan acts
 * on: the only honest one-tap fix available today is "Google changed your hours,
 * put yours back".
 *
 * THE WRITE PATH
 * --------------
 * Google caps Business Information EDITS at 10 per minute per profile and says
 * that ceiling cannot be raised (§10). Every edit therefore goes through
 * `createGbpWriteQueue`, and the card reports the queue's real state: how many
 * slots are free, which edits are waiting, which are in flight, and exactly what
 * Google said about each. Nothing self-ticks, and nothing reads as "published" —
 * this profile is unverified in the fixture, and Google only propagates edits
 * once a profile holds Voice of Merchant.
 *
 * WHERE THE DATA COMES FROM
 * -------------------------
 * A labelled fixture in development, under the fixture banner. Otherwise the
 * adapter is asked and its answer is rendered verbatim — today `not_connected`,
 * because there is no approved Google quota and no token exchange. There is no
 * third path.
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { DataStateView, Screen, TopBar } from '@/components/shared';
import { Section, Text, useToast } from '@/components/ui';
import {
  classifyVoiceOfMerchant,
  createGbpWriteQueue,
  describeGoogleUpdatedField,
  describeVoiceOfMerchant,
  googleBusinessProfileProvider,
  type GbpGoogleUpdatedDiff,
  type GbpWriteQueue,
  type VoiceOfMerchantExplanation,
} from '@/features/gbp';
import type { GbpLocationWire } from '@/features/gbp/types';
import {
  buildProfileFields,
  CompletenessCard,
  GoogleChangedCard,
  ProfileFieldCard,
  ProfileNavRow,
  readQueueBudget,
  readRegularHours,
  readServiceArea,
  runEditPlan,
  summariseCompleteness,
  summariseWriteCoverage,
  toGoogleUpdatedDiff,
  VerificationNotice,
  WritePlanCard,
  type EditProgress,
  type FieldValue,
  type PlannedEdit,
  type ProfileFieldView,
} from '@/features/gbp/components/profile';
import { getGbpProfileFixtures, gbpFixtureState } from '@/fixtures/gbp-profile';
import { failed, loading, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

/**
 * No location id exists, because nothing is connected. The adapter is still what
 * answers — asking it keeps the owner-facing copy in one place, and the day a
 * connection exists the only change here is passing a real id. Inventing one
 * would be a request Shoogle never made.
 */
const NO_LOCATION_ID = '';

interface ProfileSnapshot {
  locationId: string;
  location: GbpLocationWire;
  /** Raw and unvalidated; `readServiceArea` is the only thing allowed to read it. */
  serviceAreaPayload: unknown;
  /** Null when `getGoogleUpdated` was never read. Never treated as "no changes". */
  diff: GbpGoogleUpdatedDiff | null;
  verification: VoiceOfMerchantExplanation | null;
}

/**
 * The gated fixture read.
 *
 * A lazy `useState` initialiser rather than `useMemo`: `getGbpProfileFixtures()`
 * reads the environment, so the React Compiler cannot prove the call pure and
 * will not preserve a memo. This says what is meant — read once, at mount.
 */
function readFixtureSnapshot(): DataState<ProfileSnapshot> | null {
  const fixtures = getGbpProfileFixtures();
  if (fixtures === null) return null;
  return gbpFixtureState<ProfileSnapshot>({
    locationId: 'fixture-profile-0001',
    location: fixtures.location,
    serviceAreaPayload: fixtures.serviceArea,
    diff: toGoogleUpdatedDiff(fixtures.googleUpdated),
    verification: describeVoiceOfMerchant(classifyVoiceOfMerchant(fixtures.voiceOfMerchant)),
  });
}

/**
 * What the adapter says when there are no fixtures.
 *
 * The `ready` branch is unreachable today — the adapter has no transport, so it
 * cannot return a location — and it deliberately refuses rather than
 * reconstructing wire-level fields from the lossy shared `GbpLocation` shape.
 * Half the fields on this screen (special hours, service areas, the Google diff)
 * do not exist on that shape, and filling them in from nothing is the exact
 * fabrication this screen is built to prevent.
 */
async function loadFromProvider(): Promise<DataState<ProfileSnapshot>> {
  const location = await googleBusinessProfileProvider.getLocation(NO_LOCATION_ID);
  if (location.status !== 'ready') return location;
  return failed(
    'gbp_profile_wire_read_missing',
    'Shoogle can now reach your Google listing, but this screen still needs the full field-level read before it can show it. It will not fill the gaps in from guesses.',
    false,
  );
}

export default function ProfileScreen() {
  const theme = useTheme();
  const toast = useToast();
  const router = useRouter();

  const [fixtureSnapshot] = useState<DataState<ProfileSnapshot> | null>(readFixtureSnapshot);
  const [providerSnapshot, setProviderSnapshot] =
    useState<DataState<ProfileSnapshot>>(loading());
  // One queue per mount, keyed by profile inside. This is the queue whose real
  // state the card reports — there is no second, hidden one.
  const [queue] = useState<GbpWriteQueue>(() => createGbpWriteQueue());

  const [progress, setProgress] = useState<readonly EditProgress[] | null>(null);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Fixtures win in development and there is nothing to fetch.
    if (fixtureSnapshot !== null) return;

    let cancelled = false;
    void loadFromProvider().then((next) => {
      if (!cancelled) setProviderSnapshot(next);
    });

    return () => {
      cancelled = true;
    };
  }, [fixtureSnapshot, attempt]);

  const state = fixtureSnapshot ?? providerSnapshot;
  const showsFixtureData = state.status === 'ready' && state.isFixture === true;

  const notBuilt = useCallback(
    (what: string) => () => {
      toast.show({ message: `${what} is not built yet.`, tone: 'neutral' });
    },
    [toast],
  );

  const runPlan = useCallback(
    async (snapshot: ProfileSnapshot, edits: readonly PlannedEdit[]) => {
      if (edits.length === 0) return;
      setRunning(true);
      await runEditPlan({
        profileKey: snapshot.locationId,
        edits,
        queue,
        onProgress: setProgress,
      });
      setRunning(false);
    },
    [queue],
  );

  return (
    <Screen testID="profile-screen" header={<TopBar />} edgeBottom showsFixtureData={showsFixtureData}>
      <Text variant="screenTitle">Business profile</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 6, marginBottom: theme.spacing.lg }}>
        What Google holds about you, where each detail came from, and which of them Shoogle can
        change for you. Where it cannot, it says so and shows you what to do instead.
      </Text>

      <DataStateView
        state={state}
        testID="profile-state"
        onRetry={() => {
          setProviderSnapshot(loading());
          setAttempt((value) => value + 1);
        }}>
        {(snapshot) => (
          <ProfileBody
            snapshot={snapshot}
            queue={queue}
            progress={progress}
            running={running}
            onRun={runPlan}
            onNotBuilt={notBuilt}
            onOpenHours={() => router.push('/seo/hours')}
            onOpenAreas={() => router.push('/seo/areas')}
          />
        )}
      </DataStateView>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* The body, once a snapshot is genuinely known                               */
/* -------------------------------------------------------------------------- */

function serviceAreaFieldValue(payload: unknown): FieldValue {
  const observation = readServiceArea(payload);
  switch (observation.kind) {
    case 'absent':
      return { kind: 'empty' };
    case 'unrecognised':
      return { kind: 'unknown', why: 'not_modelled' };
    case 'read': {
      const count = observation.places.length;
      if (count === 0 && observation.unreadablePlaces === 0) return { kind: 'empty' };
      if (count === 0) return { kind: 'unknown', why: 'not_modelled' };
      return {
        kind: 'present',
        display: observation.places.map((place) => place.name).join(' · '),
        detail:
          observation.unreadablePlaces === 0
            ? `${count} ${count === 1 ? 'area' : 'areas'}`
            : `${count} readable, ${observation.unreadablePlaces} Shoogle could not name`,
      };
    }
  }
}

/** Keeps one edit per `updateMask` path: `categories` covers two rows on screen. */
function dedupeByWireField(fields: readonly ProfileFieldView[]): readonly ProfileFieldView[] {
  const seen = new Set<string>();
  const unique: ProfileFieldView[] = [];
  for (const field of fields) {
    if (seen.has(field.spec.wireField)) continue;
    seen.add(field.spec.wireField);
    unique.push(field);
  }
  return unique;
}

function ProfileBody({
  snapshot,
  queue,
  progress,
  running,
  onRun,
  onNotBuilt,
  onOpenHours,
  onOpenAreas,
}: {
  snapshot: ProfileSnapshot;
  queue: GbpWriteQueue;
  progress: readonly EditProgress[] | null;
  running: boolean;
  onRun: (snapshot: ProfileSnapshot, edits: readonly PlannedEdit[]) => Promise<void>;
  onNotBuilt: (what: string) => () => void;
  onOpenHours: () => void;
  onOpenAreas: () => void;
}) {
  const theme = useTheme();

  const fields = buildProfileFields(
    snapshot.location,
    snapshot.diff,
    serviceAreaFieldValue(snapshot.serviceAreaPayload),
  );
  const completeness = summariseCompleteness(fields);
  const coverage = summariseWriteCoverage(fields);

  // Only fields Google itself changed are candidates for a restore. Re-sending
  // a value nobody touched would burn one of ten edits a minute for nothing.
  const changed = dedupeByWireField(
    fields.filter((field) => field.provenance.kind === 'google_changed'),
  );
  const hours = readRegularHours(snapshot.location);

  const edits: readonly PlannedEdit[] = changed.flatMap((field) => {
    if (field.writePath.kind !== 'one_tap') return [];
    // Guarded: with no readable hours the payload would be an empty week, and
    // sending that would wipe the listing's hours rather than restore them.
    if (field.spec.id !== 'regularHours' || hours.kind !== 'set') return [];
    return [
      {
        id: field.spec.id,
        fieldId: field.spec.id,
        label: `Restore ${field.spec.label.toLowerCase()}`,
        updateMask: field.spec.wireField,
        submit: () =>
          googleBusinessProfileProvider.updateRegularHours(snapshot.locationId, {
            periods: snapshot.location.regularHours?.periods ?? [],
          }),
      },
    ];
  });

  const guided = changed.filter((field) => field.writePath.kind !== 'one_tap');
  const verification = snapshot.verification;

  return (
    <View style={{ gap: theme.spacing.md }}>
      {verification !== null ? (
        <VerificationNotice
          title={verification.title}
          body={verification.body}
          ownerAction={verification.ownerAction}
          writesMayNotReachGoogle={verification.writesMayNotReachGoogle}
          onOwnerAction={onNotBuilt('Verifying a business with Google')}
          testID="profile-verification"
        />
      ) : null}

      <GoogleChangedCard
        wasRead={snapshot.diff !== null}
        changedFields={(snapshot.diff?.changedFields ?? []).map(describeGoogleUpdatedField)}
        pendingFields={(snapshot.diff?.pendingFields ?? []).map(describeGoogleUpdatedField)}
        testID="google-changed"
      />

      <WritePlanCard
        title="Put your version back"
        intro={
          edits.length === 0
            ? 'There is nothing here Shoogle can send to Google for you right now.'
            : `Google changed ${changed.length === 1 ? 'one detail' : `${changed.length} details`} on this listing. ` +
              `Shoogle can send ${edits.length} of ${changed.length} back as ${edits.length === 1 ? 'it was' : 'they were'}` +
              `${guided.length > 0 ? `, and shows you how to do the other ${guided.length} yourself` : ''}.`
        }
        actionLabel="Send my version to Google"
        queueable={edits.length}
        emptyReason={
          snapshot.diff === null
            ? 'Shoogle has not read Google’s own copy of this listing, so it has nothing to put back.'
            : changed.length === 0
              ? 'Google has not changed anything on this listing, so there is nothing to restore.'
              : 'Google changed things Shoogle has no write for. The fields below show what to change and where.'
        }
        progress={progress}
        budget={readQueueBudget(queue, snapshot.locationId)}
        running={running}
        onRun={() => {
          void onRun(snapshot, edits);
        }}
        testID="write-plan"
      />

      <CompletenessCard
        completeness={completeness}
        coverage={coverage}
        testID="profile-completeness"
      />

      <Section title="Details" subtitle="Tap a detail to see where it came from and how it changes.">
        <View style={{ gap: theme.spacing.md }}>
          {fields.map((field) => (
            <ProfileFieldCard
              key={field.spec.id}
              field={field}
              onFix={field.spec.id === 'regularHours' ? onOpenHours : undefined}
              testID={`field-${field.spec.id}`}
            />
          ))}
        </View>
      </Section>

      <Section title="More" subtitle="The two parts of the listing with screens of their own.">
        <View style={{ gap: theme.spacing.md }}>
          <ProfileNavRow
            title="Opening and holiday hours"
            subtitle="Regular hours, festival closures, and what Google is showing today"
            icon="time-outline"
            onPress={onOpenHours}
            testID="nav-hours"
          />
          <ProfileNavRow
            title="Service areas"
            subtitle="How far Google is willing to show you from"
            icon="map-outline"
            onPress={onOpenAreas}
            testID="nav-areas"
          />
        </View>
      </Section>
    </View>
  );
}
