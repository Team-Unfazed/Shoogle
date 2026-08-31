/**
 * HOURS AND HOLIDAYS. Route: `/seo/hours`. Feature owner: Pranay.
 *
 * WHY THIS SCREEN EXISTS SEPARATELY FROM THE PROFILE
 * --------------------------------------------------
 * Hours are the only field on a Google Business Profile that Shoogle can
 * actually write today (`GbpAdapter.updateRegularHours`), and special hours are
 * the single highest-value thing an Indian shop can set — the research doc says
 * so outright. A salon that shuts for Ganpati and never sets a holiday date is
 * still telling Google it is open: the customer arrives, finds a shut shutter,
 * and leaves the review that evening. Nothing else on the listing costs that
 * much that fast.
 *
 * THE THREE THINGS THIS SCREEN KEEPS APART
 * ----------------------------------------
 *   "No hours set"   Google was asked and returned none. Nothing to show, and
 *                    NOT seven "Closed" rows.
 *   "Closed"         Hours are set, and this day has no opening period.
 *   "Unreadable"     Google sent periods Shoogle could not parse, so the table
 *                    is short — and says by how many.
 *
 * THE FESTIVAL CALENDAR, AND ITS HONEST HOLE
 * ------------------------------------------
 * `features/audit/data/india-holidays.ts` is marked `completeness: 'partial'`
 * on purpose: every festival that actually closes a shop — Diwali, Ganpati,
 * Eid, Onam, Pongal, Gudi Padwa — moves against the Gregorian calendar, and
 * Eid depends on a moon sighting. Hard-coding those from memory would be
 * inventing data. So the card lists what Shoogle genuinely knows, and then says
 * in the owner's own words that an empty list is not an all-clear. A competitor
 * would ship the list and stay quiet about the hole.
 *
 * THE WRITE
 * ---------
 * Re-sending hours is a Business Information EDIT, and Google caps those at 10
 * per minute per profile with no way to raise it. So it goes through the write
 * queue like every other edit, and the outcome is reported exactly as the
 * adapter states it: accepted is not live, and on an unverified profile it will
 * never become live until Google says the profile is in good standing.
 */

import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { DataStateView, Screen, TopBar } from '@/components/shared';
import { Section, Text } from '@/components/ui';
import {
  createGbpWriteQueue,
  googleBusinessProfileProvider,
  type GbpWriteQueue,
} from '@/features/gbp';
import type { GbpLocationWire } from '@/features/gbp/types';
import {
  buildFestivalPrompts,
  FestivalPromptsCard,
  GuidedSteps,
  PROFILE_FIELD_SPEC_BY_ID,
  readQueueBudget,
  readRegularHours,
  readSpecialHours,
  RegularHoursCard,
  runEditPlan,
  SpecialHoursCard,
  WritePlanCard,
  type EditProgress,
  type HolidayStateCode,
  type PlannedEdit,
} from '@/features/gbp/components/profile';
import { getGbpProfileFixtures, gbpFixtureState } from '@/fixtures/gbp-profile';
import { failed, loading, type DataState } from '@/lib/state/DataState';
import { useTheme } from '@/theme';

const NO_LOCATION_ID = '';

/** How far ahead the festival check looks. Named, so the card can say it. */
const FESTIVAL_HORIZON_DAYS = 120;

interface HoursSnapshot {
  locationId: string;
  location: GbpLocationWire;
  /** The business's state, for state-specific holidays. Never guessed. */
  stateCode: HolidayStateCode;
}

/** Today as `YYYY-MM-DD`, in UTC so the window does not shift with the clock. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function readFixtureSnapshot(): DataState<HoursSnapshot> | null {
  const fixtures = getGbpProfileFixtures();
  if (fixtures === null) return null;
  return gbpFixtureState<HoursSnapshot>({
    locationId: 'fixture-profile-0001',
    location: fixtures.location,
    stateCode: fixtures.stateCode,
  });
}

async function loadFromProvider(): Promise<DataState<HoursSnapshot>> {
  const location = await googleBusinessProfileProvider.getLocation(NO_LOCATION_ID);
  if (location.status !== 'ready') return location;
  return failed(
    'gbp_hours_wire_read_missing',
    'Shoogle can now reach your Google listing, but this screen still needs the full hours read before it can show them. It will not fill the week in from guesses.',
    false,
  );
}

export default function HoursScreen() {
  const theme = useTheme();

  const [fixtureSnapshot] = useState<DataState<HoursSnapshot> | null>(readFixtureSnapshot);
  const [providerSnapshot, setProviderSnapshot] = useState<DataState<HoursSnapshot>>(loading());
  const [queue] = useState<GbpWriteQueue>(() => createGbpWriteQueue());
  const [progress, setProgress] = useState<readonly EditProgress[] | null>(null);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [showHolidaySteps, setShowHolidaySteps] = useState(false);

  useEffect(() => {
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

  const runPlan = useCallback(
    async (snapshot: HoursSnapshot, edits: readonly PlannedEdit[]) => {
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
    <Screen testID="hours-screen" header={<TopBar />} edgeBottom showsFixtureData={showsFixtureData}>
      <Text variant="screenTitle">Hours and holidays</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 6, marginBottom: theme.spacing.lg }}>
        What Google is telling customers about when you are open — including the festival dates it is
        not being told about.
      </Text>

      <DataStateView
        state={state}
        testID="hours-state"
        onRetry={() => {
          setProviderSnapshot(loading());
          setAttempt((value) => value + 1);
        }}>
        {(snapshot) => (
          <HoursBody
            snapshot={snapshot}
            queue={queue}
            progress={progress}
            running={running}
            onRun={runPlan}
            showHolidaySteps={showHolidaySteps}
            onShowHolidaySteps={() => setShowHolidaySteps(true)}
          />
        )}
      </DataStateView>
    </Screen>
  );
}

function HoursBody({
  snapshot,
  queue,
  progress,
  running,
  onRun,
  showHolidaySteps,
  onShowHolidaySteps,
}: {
  snapshot: HoursSnapshot;
  queue: GbpWriteQueue;
  progress: readonly EditProgress[] | null;
  running: boolean;
  onRun: (snapshot: HoursSnapshot, edits: readonly PlannedEdit[]) => Promise<void>;
  showHolidaySteps: boolean;
  onShowHolidaySteps: () => void;
}) {
  const theme = useTheme();

  const regular = readRegularHours(snapshot.location);
  const special = readSpecialHours(snapshot.location);
  const prompts = buildFestivalPrompts({
    today: todayIso(),
    horizonDays: FESTIVAL_HORIZON_DAYS,
    stateCode: snapshot.stateCode,
    specialHours: special,
  });

  const hoursSpec = PROFILE_FIELD_SPEC_BY_ID.regularHours;
  const specialSpec = PROFILE_FIELD_SPEC_BY_ID.specialHours;

  // Only offered when there are hours to send. An empty week would not restore
  // anything — it would clear the listing's hours, which is the opposite fix.
  const edits: readonly PlannedEdit[] =
    regular.kind === 'set'
      ? [
          {
            id: 'regularHours',
            fieldId: 'regularHours',
            label: 'Opening hours',
            updateMask: hoursSpec.wireField,
            submit: () =>
              googleBusinessProfileProvider.updateRegularHours(snapshot.locationId, {
                periods: snapshot.location.regularHours?.periods ?? [],
              }),
          },
        ]
      : [];

  return (
    <View style={{ gap: theme.spacing.md }}>
      <FestivalPromptsCard
        promptSet={prompts}
        onSetHoliday={onShowHolidaySteps}
        testID="festival-prompts"
      />

      {showHolidaySteps ? (
        <GuidedSteps
          title="Setting a holiday date on Google"
          steps={specialSpec.ownerSteps}
          note={specialSpec.matrixNote}
          testID="holiday-steps"
        />
      ) : null}

      <RegularHoursCard reading={regular} testID="regular-hours" />

      <SpecialHoursCard reading={special} testID="special-hours" />

      <Section
        title="Sending hours to Google"
        subtitle="The one change on this listing Shoogle can make for you.">
        <WritePlanCard
          title="Re-send these hours"
          intro={
            edits.length === 0
              ? 'There are no hours on this listing to send.'
              : 'Sends the week above to Google exactly as it is shown. Useful when Google has rewritten your hours and you want your own version back.'
          }
          actionLabel="Send these hours to Google"
          queueable={edits.length}
          emptyReason="Google holds no opening hours for this listing, and Shoogle will not send an empty week — that would clear your hours rather than fix them."
          progress={progress}
          budget={readQueueBudget(queue, snapshot.locationId)}
          running={running}
          onRun={() => {
            void onRun(snapshot, edits);
          }}
          testID="hours-write-plan"
        />
      </Section>
    </View>
  );
}
