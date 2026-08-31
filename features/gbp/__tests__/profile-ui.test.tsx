/**
 * The business-profile editor: `/seo/profile`, `/seo/hours`, `/seo/areas`.
 *
 * WHAT THESE TESTS ARE ACTUALLY GUARDING
 * --------------------------------------
 * This screen group is the one place in Shoogle that both READS a listing and
 * WRITES to it, so it is where the honesty rules are easiest to break and
 * hardest to notice. Four of them are pinned here, each by a test that fails
 * loudly if the distinction ever collapses:
 *
 *  1. EMPTY IS NOT UNKNOWN. `websiteUri` is in the read mask and Google returned
 *     nothing for it, so it is genuinely "Not set". `attributes` is NOT in the
 *     read mask, so it is "Unknown". Rendering the second like the first would
 *     send an owner to fix something that may already be right.
 *
 *  2. "YOU TYPED THIS" IS NEVER CLAIMED. The only provenance evidence Google
 *     offers is `getGoogleUpdated`. With no diff read, every field is
 *     "Source unknown" — never "from you", and never "unchanged".
 *
 *  3. A BUTTON MEANS A WRITE EXISTS. Exactly one profile field has a method on
 *     `GbpAdapter`, so exactly one field may offer one tap. Everything else says
 *     "Needs your hand" and shows the steps.
 *
 *  4. ACCEPTED IS NOT PUBLISHED. An edit the provider has not confirmed is never
 *     reported as success, and an accepted edit on an unverified profile is
 *     never reported as live.
 *
 * The festival tests carry a fifth: an empty holiday list must never read as an
 * all-clear, because the India calendar deliberately omits every festival whose
 * date moves.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import AreasScreen from '@/app/seo/areas';
import HoursScreen from '@/app/seo/hours';
import ProfileScreen from '@/app/seo/profile';
import { ToastProvider } from '@/components/ui';
import { createGbpWriteQueue } from '@/features/gbp';
import type { GbpLocationWire } from '@/features/gbp/types';
import {
  buildFestivalPrompts,
  buildProfileFields,
  completenessSentence,
  describeDay,
  describeEditStatus,
  describeProvenance,
  describeSpecialHourEntry,
  describeWritePath,
  formatGoogleDate,
  formatTimeOfDay,
  GoogleChangedCard,
  planSentence,
  PROFILE_FIELD_SPECS,
  provenanceFor,
  PROFILE_FIELD_SPEC_BY_ID,
  readFieldValue,
  readRegularHours,
  readServiceArea,
  readSpecialHours,
  RegularHoursCard,
  REQUESTED_LOCATION_FIELDS,
  runEditPlan,
  ServiceAreaCard,
  SpecialHoursCard,
  summariseCompleteness,
  summariseWriteCoverage,
  summarisePlan,
  toGoogleUpdatedDiff,
  writePathFor,
  type EditProgress,
  type PlannedEdit,
} from '@/features/gbp/components/profile';
import {
  fixtureProfileGoogleUpdated,
  fixtureProfileLocationNoHoursWire,
  fixtureProfileLocationUnreadableHoursWire,
  fixtureProfileLocationWire,
  fixtureServiceAreaPayload,
  fixtureServiceAreaUnrecognisedPayload,
} from '@/fixtures/gbp-profile';
import { failed, ready, unavailable } from '@/lib/state/DataState';
import { ThemeProvider } from '@/theme';

let mockFixtures = false;
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return {
    ...actual,
    isFixtureModeEnabled: () => mockFixtures,
    isDevPreviewEnabled: () => false,
    isSupabaseConfigured: () => false,
  };
});

afterEach(() => {
  mockFixtures = false;
});

/* -------------------------------------------------------------------------- */
/* Render helpers                                                             */
/* -------------------------------------------------------------------------- */

function wrap(element: React.JSX.Element) {
  return (
    <ThemeProvider forceScheme="light">
      <ToastProvider>{element}</ToastProvider>
    </ThemeProvider>
  );
}

/** RNTL 14 returns a promise from `render`, so every render is awaited. */
async function renderView(element: React.JSX.Element) {
  return render(wrap(element));
}

function renderProfile() {
  return renderRouter(
    {
      'seo/profile': () => wrap(<ProfileScreen />),
      'seo/hours': () => wrap(<HoursScreen />),
      'seo/areas': () => wrap(<AreasScreen />),
    },
    { initialUrl: '/seo/profile' },
  );
}

function renderHours() {
  return renderRouter(
    { 'seo/hours': () => wrap(<HoursScreen />) },
    { initialUrl: '/seo/hours' },
  );
}

function renderAreas() {
  return renderRouter(
    { 'seo/areas': () => wrap(<AreasScreen />) },
    { initialUrl: '/seo/areas' },
  );
}

const DIFF = toGoogleUpdatedDiff(fixtureProfileGoogleUpdated);

/* -------------------------------------------------------------------------- */
/* 1. Empty is not unknown                                                    */
/* -------------------------------------------------------------------------- */

describe('a field Google was asked about vs one it was never asked about', () => {
  it('derives the "did we ask" set from the read mask rather than restating it', () => {
    expect(REQUESTED_LOCATION_FIELDS.has('websiteUri')).toBe(true);
    expect(REQUESTED_LOCATION_FIELDS.has('serviceArea')).toBe(true);
    // Both are writable per the matrix, and neither is requested today.
    expect(REQUESTED_LOCATION_FIELDS.has('attributes')).toBe(false);
    expect(REQUESTED_LOCATION_FIELDS.has('serviceItems')).toBe(false);
  });

  it('reports a requested-but-absent field as a measured empty', () => {
    expect(readFieldValue('websiteUri', fixtureProfileLocationWire)).toEqual({ kind: 'empty' });
  });

  it('reports a never-requested field as unknown, never as empty', () => {
    expect(readFieldValue('attributes', fixtureProfileLocationWire)).toEqual({
      kind: 'unknown',
      why: 'not_requested',
    });
    expect(readFieldValue('serviceItems', fixtureProfileLocationWire)).toEqual({
      kind: 'unknown',
      why: 'not_requested',
    });
  });

  it('counts unknown separately from empty and says so in one sentence', () => {
    const fields = buildProfileFields(fixtureProfileLocationWire, DIFF, {
      kind: 'present',
      display: 'x',
    });
    const summary = summariseCompleteness(fields);

    expect(summary.total).toBe(PROFILE_FIELD_SPECS.length);
    expect(summary.checked).toBe(summary.filled + summary.missing);
    expect(summary.unknown).toBe(2); // attributes + serviceItems
    expect(summary.missing).toBe(1); // websiteUri
    expect(completenessSentence(summary)).toContain('unknown — not empty, unknown');
  });

  it('renders the two states with different words on the screen', async () => {
    mockFixtures = true;
    await renderProfile();

    // Measured empty.
    expect(await screen.findByTestId('field-empty-websiteUri')).toBeOnTheScreen();
    expect(
      screen.getAllByText(
        'Shoogle asked Google for this and Google returned nothing, so it is genuinely empty.',
      ).length,
    ).toBeGreaterThan(0);

    // Never asked.
    expect(screen.getByTestId('field-unknown-attributes')).toBeOnTheScreen();
    expect(
      screen.getAllByText(
        'Shoogle does not ask Google for this field yet, so it does not know what is there. This is not the same as it being empty.',
      ).length,
    ).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Provenance is never invented                                            */
/* -------------------------------------------------------------------------- */

describe('where a value came from', () => {
  it('marks a field in the diff mask as changed by Google', () => {
    expect(provenanceFor(PROFILE_FIELD_SPEC_BY_ID.regularHours, DIFF)).toEqual({
      kind: 'google_changed',
    });
    expect(provenanceFor(PROFILE_FIELD_SPEC_BY_ID.primaryPhone, DIFF)).toEqual({
      kind: 'google_changed',
    });
  });

  it('marks a field in the pending mask as an owner edit Google has not applied', () => {
    expect(provenanceFor(PROFILE_FIELD_SPEC_BY_ID.description, DIFF)).toEqual({
      kind: 'owner_edit_pending',
    });
  });

  it('says "from Google", not "from you", for everything else', () => {
    expect(provenanceFor(PROFILE_FIELD_SPEC_BY_ID.title, DIFF)).toEqual({ kind: 'google_copy' });
    expect(describeProvenance({ kind: 'google_copy' }).body).toContain(
      'will not claim you typed it',
    );
  });

  it('falls back to unknown — not "unchanged" — when the diff was never read', () => {
    for (const spec of PROFILE_FIELD_SPECS) {
      expect(provenanceFor(spec, null)).toEqual({ kind: 'unknown' });
    }
    expect(describeProvenance({ kind: 'unknown' }).chip).toBe('Source unknown');
  });

  it('has no provenance member that claims the owner typed a value', () => {
    const chips = (
      [
        { kind: 'google_changed' },
        { kind: 'owner_edit_pending' },
        { kind: 'google_copy' },
        { kind: 'unknown' },
      ] as const
    ).map((provenance) => describeProvenance(provenance).chip);

    expect(chips).toEqual([
      'Changed by Google',
      'Your edit, not applied',
      'From Google',
      'Source unknown',
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. A button only where a write exists                                      */
/* -------------------------------------------------------------------------- */

describe('what Shoogle will claim it can change', () => {
  it('offers one tap only for the field GbpAdapter actually implements', () => {
    const oneTap = PROFILE_FIELD_SPECS.filter(
      (spec) => writePathFor(spec).kind === 'one_tap',
    ).map((spec) => spec.id);

    expect(oneTap).toEqual(['regularHours']);
  });

  it('reads every other patchable field as guided, not as unavailable', () => {
    const guided = PROFILE_FIELD_SPECS.filter((spec) => writePathFor(spec).kind === 'guided');

    expect(guided.length).toBe(PROFILE_FIELD_SPECS.length - 1);
    for (const spec of guided) {
      expect(spec.apiSupportsWrite).toBe(true);
      expect(spec.providerMethod).toBeNull();
      expect(spec.ownerSteps.length).toBeGreaterThan(0);
    }
    expect(describeWritePath({ kind: 'guided', googleMethod: 'locations.patch' }).chip).toBe(
      'Needs your hand',
    );
  });

  it('counts the coverage honestly rather than rounding it up', () => {
    const fields = buildProfileFields(fixtureProfileLocationWire, DIFF);
    const coverage = summariseWriteCoverage(fields);

    expect(coverage.oneTap).toBe(1);
    expect(coverage.guided).toBe(PROFILE_FIELD_SPECS.length - 1);
    expect(coverage.readOnly).toBe(0);
  });

  it('shows the matrix line and the owner steps when it cannot write a field', async () => {
    mockFixtures = true;
    await renderProfile();

    await fireEvent.press(await screen.findByTestId('title-toggle'));

    expect(screen.getByTestId('title-detail')).toBeOnTheScreen();
    expect(screen.getByText('What to do instead')).toBeOnTheScreen();
    expect(screen.getByTestId('title-mask')).toHaveTextContent(
      'Google method: locations.patch · updateMask: title',
    );
    // No fix button on a guided field.
    expect(screen.queryByTestId('title-fix')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Google-initiated edits                                                     */
/* -------------------------------------------------------------------------- */

describe('what Google changed behind the owner’s back', () => {
  it('names each changed field in plain English', async () => {
    mockFixtures = true;
    await renderProfile();

    expect(await screen.findByTestId('google-changed-list')).toBeOnTheScreen();
    expect(screen.getByText('Google changed your opening hours.')).toBeOnTheScreen();
    expect(screen.getByText('Google changed your phone number.')).toBeOnTheScreen();
  });

  it('separates an owner edit Google has not applied from one Google made', async () => {
    mockFixtures = true;
    await renderProfile();

    expect(await screen.findByTestId('google-pending-list')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Your change to your business description has not been applied yet, so customers still see the old value.',
      ),
    ).toBeOnTheScreen();
  });

  it('never renders "nothing changed" for a diff it did not read', async () => {
    await renderView(<GoogleChangedCard wasRead={false} changedFields={[]} pendingFields={[]} />);

    expect(screen.getByText(/cannot tell you whether Google has changed anything/)).toBeOnTheScreen();
    expect(screen.queryByText(/matches yours/)).toBeNull();
  });

  it('reports an empty diff that WAS read as the real reassurance it is', async () => {
    await renderView(<GoogleChangedCard wasRead changedFields={[]} pendingFields={[]} />);

    expect(screen.getByText(/matches yours/)).toBeOnTheScreen();
  });
});

/* -------------------------------------------------------------------------- */
/* 4. The write path                                                          */
/* -------------------------------------------------------------------------- */

describe('the edit queue', () => {
  const clock = { now: 0 };
  const queueForTest = () =>
    createGbpWriteQueue({
      maxPerWindow: 1,
      windowMs: 1_000,
      now: () => clock.now,
      sleep: async (ms: number) => {
        clock.now += ms;
      },
    });

  beforeEach(() => {
    clock.now = 0;
  });

  const edit = (
    id: string,
    submit: PlannedEdit['submit'],
  ): PlannedEdit => ({
    id,
    fieldId: 'regularHours',
    label: `Edit ${id}`,
    updateMask: 'regularHours',
    submit,
  });

  it('paces edits against Google’s per-profile ceiling instead of firing them together', async () => {
    const snapshots: EditProgress[][] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    const submit = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return unavailable('not_connected', 'nothing is connected');
    };

    await runEditPlan({
      profileKey: 'profile-1',
      edits: [edit('a', submit), edit('b', submit), edit('c', submit)],
      queue: queueForTest(),
      onProgress: (progress) => snapshots.push([...progress]),
    });

    expect(maxInFlight).toBe(1);
    // The window is one edit wide, so the queue had to wait — the clock moved.
    expect(clock.now).toBeGreaterThan(0);

    const everyQueued = snapshots[0];
    expect(everyQueued?.every((entry) => entry.status.kind === 'queued')).toBe(true);
  });

  it('reports an unavailable provider as blocked, never as a success', async () => {
    const progress = await runEditPlan({
      profileKey: 'profile-1',
      edits: [
        edit('a', async () => unavailable('not_connected', 'Shoogle cannot reach Google yet.')),
      ],
      queue: queueForTest(),
      onProgress: () => undefined,
    });

    expect(progress[0]?.status).toEqual({
      kind: 'blocked',
      reason: 'not_connected',
      message: 'Shoogle cannot reach Google yet.',
    });
    const summary = summarisePlan(progress);
    expect(summary.accepted).toBe(0);
    expect(summary.blocked).toBe(1);
    expect(planSentence(summary)).toBe('1 of 1 attempted — 1 could not be sent.');
  });

  it('never says an accepted edit is live on a profile Google will not publish for', async () => {
    const progress = await runEditPlan({
      profileKey: 'profile-1',
      edits: [
        edit('a', async () =>
          ready({ willReachGoogle: false }, '2020-01-01T00:00:00.000Z'),
        ),
      ],
      queue: queueForTest(),
      onProgress: () => undefined,
    });

    const status = progress[0]?.status;
    expect(status?.kind).toBe('accepted');
    expect(summarisePlan(progress).acceptedNotLive).toBe(1);
    expect(status === undefined ? '' : describeEditStatus(status).text).toBe(
      'Accepted — not live yet',
    );
  });

  it('says "Google accepted it" and nothing stronger when the edit will propagate', () => {
    expect(
      describeEditStatus({
        kind: 'accepted',
        willReachGoogle: true,
        acceptedAt: '2020-01-01T00:00:00.000Z',
      }).text,
    ).toBe('Google accepted it');
  });

  it('reports a provider error as a failure with its own message', async () => {
    const progress = await runEditPlan({
      profileKey: 'profile-1',
      edits: [edit('a', async () => failed('gbp_boom', 'Google refused this edit.', true))],
      queue: queueForTest(),
      onProgress: () => undefined,
    });

    expect(progress[0]?.status).toEqual({
      kind: 'failed',
      code: 'gbp_boom',
      message: 'Google refused this edit.',
      retryable: true,
    });
  });

  it('turns a thrown provider into a reported failure rather than losing the plan', async () => {
    const progress = await runEditPlan({
      profileKey: 'profile-1',
      edits: [
        edit('a', async () => {
          throw new Error('network down');
        }),
      ],
      queue: queueForTest(),
      onProgress: () => undefined,
    });

    expect(progress[0]?.status.kind).toBe('failed');
    expect(summarisePlan(progress).failed).toBe(1);
  });
});

describe('the write plan on screen', () => {
  it('queues the one restorable field and reports exactly what the provider said', async () => {
    mockFixtures = true;
    await renderProfile();

    const run = await screen.findByTestId('run-plan');
    expect(run).not.toBeDisabled();

    await fireEvent.press(run);

    await waitFor(() => {
      expect(screen.getByTestId('plan-blocked-regularHours')).toBeOnTheScreen();
    });
    // The run also flips `running` back off after the provider answers. Waiting
    // for the button to settle keeps that update inside this test's act scope.
    await waitFor(() => {
      expect(screen.getByTestId('run-plan')).not.toBeBusy();
    });

    expect(screen.getByTestId('plan-sentence')).toHaveTextContent(
      '1 of 1 attempted — 1 could not be sent.',
    );
    expect(screen.getByTestId('plan-blocked-regularHours')).toHaveTextContent(
      /Shoogle cannot reach Google Business Profile yet/,
    );
    // Nothing anywhere claims the change went live.
    expect(screen.queryByText(/^Published$/)).toBeNull();
    expect(screen.queryByText(/is live on Google/)).toBeNull();
  });

  it('states Google’s ceiling and the queue’s real budget', async () => {
    mockFixtures = true;
    await renderProfile();

    expect(await screen.findByTestId('queue-explainer')).toHaveTextContent(
      /Google accepts 10 changes a minute for one profile and says that limit cannot be raised/,
    );
    expect(screen.getByTestId('queue-budget')).toHaveTextContent('10 of 10 slots free right now.');
  });

  it('warns that an edit on an unverified profile can be accepted and still never show', async () => {
    mockFixtures = true;
    await renderProfile();

    expect(await screen.findByTestId('writes-may-not-reach')).toHaveTextContent(
      /Shoogle will say “accepted”, not “live”/,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Hours                                                                      */
/* -------------------------------------------------------------------------- */

describe('opening hours', () => {
  it('keeps "no hours set" apart from "closed every day"', () => {
    expect(readRegularHours(fixtureProfileLocationNoHoursWire)).toEqual({ kind: 'not_set' });

    const set = readRegularHours(fixtureProfileLocationWire);
    expect(set.kind).toBe('set');
    if (set.kind !== 'set') throw new Error('unreachable');
    const sunday = set.days.find((day) => day.day === 'SUNDAY');
    if (sunday === undefined) throw new Error('the week must always carry all seven days');
    expect(describeDay(sunday)).toBe('Closed');
  });

  it('counts periods it could not read instead of dropping them silently', () => {
    const reading = readRegularHours(fixtureProfileLocationUnreadableHoursWire);
    expect(reading.kind).toBe('set');
    if (reading.kind !== 'set') throw new Error('unreachable');
    expect(reading.unreadablePeriods).toBe(2);
  });

  it('renders "no hours" as a statement about Google, not as a closed week', async () => {
    await renderView(<RegularHoursCard reading={readRegularHours(fixtureProfileLocationNoHoursWire)} />);

    expect(screen.getByText('No opening hours on Google')).toBeOnTheScreen();
    expect(screen.queryByText('Closed')).toBeNull();
    expect(
      screen.getByText(/This is not the same as being closed every day/),
    ).toBeOnTheScreen();
  });

  it('says out loud when the hours table is short', async () => {
    await renderView(
      <RegularHoursCard reading={readRegularHours(fixtureProfileLocationUnreadableHoursWire)} />,
    );

    expect(screen.getByTestId('hours-unreadable')).toHaveTextContent(
      /Google sent 2 opening periods that Shoogle could not read/,
    );
  });

  it('formats a time only when Google gave a usable one', () => {
    expect(formatTimeOfDay({ hours: 9, minutes: 30 })).toBe('9:30 am');
    expect(formatTimeOfDay({ hours: 20 })).toBe('8:00 pm');
    // TimeOfDay omits zero fields, so an empty object is genuinely midnight.
    expect(formatTimeOfDay({})).toBe('12:00 am');
    expect(formatTimeOfDay({ hours: 99 })).toBeNull();
    expect(formatTimeOfDay(undefined)).toBeNull();
  });

  it('refuses a partial date rather than completing it', () => {
    expect(formatGoogleDate({ year: 2026, month: 10, day: 2 })).toBe('2026-10-02');
    expect(formatGoogleDate({ year: 2026, month: 10 })).toBeNull();
    expect(formatGoogleDate(undefined)).toBeNull();
  });

  it('renders the week and the holiday date from the fixture', async () => {
    mockFixtures = true;
    await renderHours();

    expect(await screen.findByTestId('regular-hours')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sunday, Closed')).toBeOnTheScreen();
    expect(screen.getByLabelText('Saturday, 9:30 am – 6:00 pm')).toBeOnTheScreen();
    expect(screen.getByTestId('special-hours')).toBeOnTheScreen();
    expect(screen.getByText('2026-10-02')).toBeOnTheScreen();
  });
});

describe('special hours', () => {
  it('reports "none set" as a measurement about Google', () => {
    expect(readSpecialHours(fixtureProfileLocationNoHoursWire)).toEqual({ kind: 'none_set' });
  });

  it('renders "none set" as a warning, since Google then shows normal hours on a festival', async () => {
    await renderView(
      <SpecialHoursCard reading={readSpecialHours(fixtureProfileLocationNoHoursWire)} />,
    );

    expect(screen.getByText('No holiday hours set')).toBeOnTheScreen();
    expect(
      screen.getByText(/Google keeps showing your normal hours on every festival/),
    ).toBeOnTheScreen();
  });

  it('never invents times for a special day Google described without them', () => {
    expect(
      describeSpecialHourEntry({
        startDate: '2026-10-02',
        endDate: '2026-10-02',
        closed: false,
        open: null,
        close: null,
      }),
    ).toBe('Google set special hours here but did not report the times.');
  });
});

/* -------------------------------------------------------------------------- */
/* Festivals                                                                  */
/* -------------------------------------------------------------------------- */

describe('festival closures', () => {
  const special = readSpecialHours(fixtureProfileLocationWire);

  it('marks a festival with a special-hours entry as covered and one without as not', () => {
    const set = buildFestivalPrompts({
      today: '2026-08-30',
      horizonDays: 120,
      stateCode: 'MH',
      specialHours: special,
    });

    const byName = new Map(set.prompts.map((prompt) => [prompt.holiday.name, prompt.coverage.kind]));
    expect(byName.get('Gandhi Jayanti')).toBe('covered');
    expect(byName.get('Christmas')).toBe('not_covered');
  });

  it('does not offer another state’s holiday to a Maharashtra business', () => {
    const set = buildFestivalPrompts({
      today: '2026-08-30',
      horizonDays: 120,
      stateCode: 'MH',
      specialHours: special,
    });

    expect(set.prompts.map((prompt) => prompt.holiday.name)).not.toContain('Kannada Rajyotsava');
  });

  it('cannot establish coverage when some holiday dates were unreadable', () => {
    const set = buildFestivalPrompts({
      today: '2026-08-30',
      horizonDays: 120,
      stateCode: 'MH',
      specialHours: { kind: 'set', entries: [], unreadableEntries: 1 },
    });

    expect(set.prompts.every((prompt) => prompt.coverage.kind === 'unknown')).toBe(true);
  });

  it('never claims the window is fully covered, because the calendar is partial', () => {
    const set = buildFestivalPrompts({
      today: '2026-08-30',
      stateCode: 'MH',
      specialHours: special,
    });

    expect(set.windowFullyCovered).toBe(false);
  });

  it('tells the owner on screen that an empty list is not an all-clear', async () => {
    mockFixtures = true;
    await renderHours();

    expect(await screen.findByTestId('calendar-caveat')).toHaveTextContent(
      /Diwali, Ganpati, Eid, Onam, Pongal and Gudi Padwa move every year/,
    );
    expect(screen.getByTestId('calendar-caveat')).toHaveTextContent(
      /an empty list here does not mean you are clear/,
    );
  });

  it('shows the steps for a holiday date rather than a button that does nothing', async () => {
    mockFixtures = true;
    await renderHours();

    await fireEvent.press(await screen.findByTestId('set-holiday'));

    expect(screen.getByTestId('holiday-steps')).toBeOnTheScreen();
    expect(screen.getByText('Setting a holiday date on Google')).toBeOnTheScreen();
  });
});

/* -------------------------------------------------------------------------- */
/* Service areas                                                              */
/* -------------------------------------------------------------------------- */

describe('service areas', () => {
  it('counts an area it could not name instead of shortening the list quietly', () => {
    const observation = readServiceArea(fixtureServiceAreaPayload);
    expect(observation.kind).toBe('read');
    if (observation.kind !== 'read') throw new Error('unreachable');
    expect(observation.places.map((place) => place.name)).toEqual([
      '[FIXTURE] Nerul',
      '[FIXTURE] Seawoods',
    ]);
    expect(observation.unreadablePlaces).toBe(1);
    expect(observation.businessType).toBe('CUSTOMER_AND_BUSINESS_LOCATION');
  });

  it('keeps "no service area" apart from "a service area we could not read"', () => {
    expect(readServiceArea(undefined)).toEqual({ kind: 'absent' });
    expect(readServiceArea(fixtureServiceAreaUnrecognisedPayload).kind).toBe('unrecognised');
  });

  it('does not guess at a business type Google sent that it does not recognise', () => {
    const observation = readServiceArea({ businessType: 'FIXTURE_NEW_TYPE' });
    expect(observation.kind).toBe('read');
    if (observation.kind !== 'read') throw new Error('unreachable');
    expect(observation.businessType).toBeNull();
    expect(observation.unrecognisedBusinessType).toBe('FIXTURE_NEW_TYPE');
  });

  it('renders an unreadable service area as unknown, not as "you serve nowhere"', async () => {
    await renderView(
      <ServiceAreaCard observation={readServiceArea(fixtureServiceAreaUnrecognisedPayload)} />,
    );

    expect(screen.getByText('Shoogle could not read your service area')).toBeOnTheScreen();
    expect(screen.getByTestId('service-area-unverified')).toBeOnTheScreen();
    expect(screen.queryByText('No areas listed')).toBeNull();
  });

  it('renders a genuinely empty service area as a measured gap', async () => {
    await renderView(
      <ServiceAreaCard
        observation={{
          kind: 'read',
          businessType: 'CUSTOMER_LOCATION_ONLY',
          unrecognisedBusinessType: null,
          places: [],
          unreadablePlaces: 0,
        }}
      />,
    );

    expect(screen.getByTestId('service-area-empty')).toBeOnTheScreen();
    expect(screen.getByText('No areas listed')).toBeOnTheScreen();
  });

  it('lists the areas it can name and flags the list as incomplete', async () => {
    mockFixtures = true;
    await renderAreas();

    expect(await screen.findByTestId('service-area-list')).toBeOnTheScreen();
    expect(screen.getByText('[FIXTURE] Nerul')).toBeOnTheScreen();
    expect(screen.getByTestId('service-area-unreadable')).toHaveTextContent(
      /Google sent 1 more area that Shoogle could not name/,
    );
  });

  it('offers steps rather than a write Shoogle does not have', async () => {
    mockFixtures = true;
    await renderAreas();

    expect(await screen.findByTestId('area-steps')).toBeOnTheScreen();
    expect(screen.queryByTestId('run-plan')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The default state: nothing is connected                                    */
/* -------------------------------------------------------------------------- */

describe('with no Google Business Profile connected — the default today', () => {
  it('reports the adapter’s own answer on the profile screen, with no fixture leakage', async () => {
    await renderProfile();

    expect(
      await screen.findByText(/Shoogle cannot reach Google Business Profile yet/),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('fixture-banner')).toBeNull();
    expect(screen.queryByText('[FIXTURE] Example Driving School, Nerul')).toBeNull();
    expect(screen.queryByTestId('run-plan')).toBeNull();
    // Nothing unknown is rendered as a number of any kind.
    expect(screen.queryByText('0')).toBeNull();
  });

  it('does the same on hours', async () => {
    await renderHours();

    expect(
      await screen.findByText(/Shoogle cannot reach Google Business Profile yet/),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('regular-hours')).toBeNull();
    expect(screen.queryByText('Closed')).toBeNull();
  });

  it('does the same on areas', async () => {
    await renderAreas();

    expect(
      await screen.findByText(/Shoogle cannot reach Google Business Profile yet/),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('service-area-list')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Fixture honesty and the standing rules                                     */
/* -------------------------------------------------------------------------- */

describe('the rules that hold on every screen here', () => {
  it('labels fixture data as fixture data', async () => {
    mockFixtures = true;
    await renderProfile();
    expect(await screen.findByTestId('fixture-banner')).toBeOnTheScreen();
  });

  it('never renders a search rank position anywhere in this group', async () => {
    mockFixtures = true;
    await renderProfile();

    expect(screen.queryByText(/#\d/)).toBeNull();
    expect(screen.queryByText(/\brank\b/i)).toBeNull();
  });

  it('navigates to the hours screen from the profile rather than dead-ending', async () => {
    mockFixtures = true;
    await renderProfile();

    await fireEvent.press(await screen.findByTestId('nav-hours'));

    expect(await screen.findByTestId('hours-screen')).toBeOnTheScreen();
  });

  it('every field spec carries a matrix citation and a reason it matters', () => {
    for (const spec of PROFILE_FIELD_SPECS) {
      expect(spec.matrixNote.length).toBeGreaterThan(0);
      expect(spec.whyItMatters.length).toBeGreaterThan(0);
      expect(spec.label.length).toBeGreaterThan(0);
    }
  });

  it('renders the location wire the fixture describes and nothing it does not', () => {
    const wire: GbpLocationWire = fixtureProfileLocationWire;
    expect(wire.websiteUri).toBeUndefined();
    expect(wire.title).toContain('[FIXTURE]');
  });
});
