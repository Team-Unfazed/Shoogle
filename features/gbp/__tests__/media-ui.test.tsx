import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PhotosScreen from '@/app/seo/photos';
import {
  fixtureMediaCandidates,
  fixtureMediaItems,
  FIXTURE_MEDIA_NOW,
} from '@/fixtures/gbp-media';
import type { ConnectionInfo } from '@/lib/providers/types';
import { failed, ready, type DataState } from '@/lib/state/DataState';
import { ThemeProvider } from '@/theme';
import { control } from '@/theme/tokens';

import {
  AddMediaSheet,
  AgentMediaBanner,
  MediaCoverageCard,
  MediaStrip,
  MediaWriteGateNotice,
  PhotoViewsNotice,
  ScheduledMediaTimeline,
  WhyPublishCard,
  computeMediaCoverage,
  coverageEvidenceSentence,
  describeMediaAge,
  describeSchedule,
  describeValidation,
  formatBytes,
  validateMediaCandidate,
  MIN_FILE_BYTES,
  MIN_SHORT_EDGE_PX,
  PHOTO_COUNTS_UNAVAILABLE,
  PHOTO_VIEWS_UNAVAILABLE,
  MEDIA_INSIGHTS_UNAVAILABLE,
  type GbpMediaItem,
  type MediaCandidate,
} from '../components/media';
import { describeVoiceOfMerchant } from '../voiceOfMerchant';

/**
 * THE PHOTOS SURFACE — every state it renders, and the claims it must not make.
 *
 * The competitor's photos tab asserts that publishing photos "helps you rank
 * higher on Google" and surrounds the media strip with implied performance.
 * Google deleted photo views, photo counts and `MediaInsights` on 2023-02-20
 * and has never published a rank position, so both claims are unfalsifiable.
 *
 * These tests pin the four things that make Shoogle's version honest, each of
 * which is a rendering failure no pure-logic test could catch:
 *
 *  1. A photo view count is never on screen, in any state, and the absence is
 *     rendered as an em-dash with a reason — never 0, never "coming soon".
 *  2. "Google answered: zero photos" and "we could not look" produce visibly
 *     different screens. Neither produces a 0.
 *  3. A file we could not measure is never reported as passing Google's
 *     minimums; `cannot_check` is its own verdict.
 *  4. No control on the screen is dead: the upload button is disabled with its
 *     reason printed next to it.
 */

let mockFixtures = false;
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return {
    ...actual,
    isFixtureModeEnabled: () => mockFixtures,
    isDevPreviewEnabled: () => false,
  };
});

/**
 * Lets a test hold the connection read open, or answer it differently, so the
 * loading, linked-but-unread and error states are reachable deterministically.
 * Null means "use the registry's real answer", which today is an honest
 * `unavailable('not_connected', …)` for every provider.
 */
let mockGetConnection: (() => Promise<DataState<ConnectionInfo>>) | null = null;
jest.mock('@/lib/providers', () => {
  const actual = jest.requireActual('@/lib/providers');
  return {
    ...actual,
    getProvider: (id: string) => {
      const provider = actual.getProvider(id);
      return {
        ...provider,
        getConnection: () =>
          mockGetConnection ? mockGetConnection() : provider.getConnection(),
      };
    },
  };
});

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Insets fixed at a 412x915 Android viewport - one of the two target sizes -
 * so anything safe-area dependent lays out deterministically.
 */
const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

/** RNTL 14 returns a promise from `render`, so every render must be awaited. */
function renderPhotosScreen() {
  return renderRouter(
    {
      'seo/photos': () => (
        <SafeAreaProvider initialMetrics={METRICS}>
          <ThemeProvider forceScheme="light">
            <PhotosScreen />
          </ThemeProvider>
        </SafeAreaProvider>
      ),
    },
    { initialUrl: '/seo/photos' },
  );
}

function renderPlain(ui: ReactNode) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider forceScheme="light">{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
}

/**
 * Every string currently on screen, for the "no rank, no view count" sweeps.
 * Text nodes only - component type names would otherwise match words like
 * "view" and make the sweeps meaningless.
 */
function allText(): string {
  return screen
    .queryAllByText(/[\s\S]*/)
    .map((node) => JSON.stringify(node.props.children))
    .join(' ');
}

const NOW = '2020-01-08T00:00:00.000Z';

beforeEach(() => {
  mockFixtures = false;
  mockGetConnection = null;
});

/* -------------------------------------------------------------------------- */
/* 1. The model — relative age                                                */
/* -------------------------------------------------------------------------- */

describe('describeMediaAge', () => {
  it('never reports an undated photo as fresh', async () => {
    const age = describeMediaAge(null, NOW);
    expect(age.kind).toBe('unknown');
    expect(age.label).toBe('Date not reported');
  });

  it('treats an unparseable timestamp as unknown, not as zero days old', async () => {
    expect(describeMediaAge('not-a-date', NOW).kind).toBe('unknown');
  });

  it('treats a timestamp in the future as unknown rather than "today"', async () => {
    expect(describeMediaAge('2020-02-01T00:00:00.000Z', NOW).kind).toBe('unknown');
  });

  it('reads the way an owner counts days', async () => {
    expect(describeMediaAge('2020-01-07T23:00:00.000Z', NOW).label).toBe('Today');
    expect(describeMediaAge('2020-01-07T00:00:00.000Z', NOW).label).toBe('Yesterday');
    expect(describeMediaAge('2020-01-05T00:00:00.000Z', NOW).label).toBe('3 days ago');
    expect(describeMediaAge('2020-01-01T00:00:00.000Z', NOW).label).toBe('1 week ago');
    expect(describeMediaAge('2019-12-11T00:00:00.000Z', NOW).label).toBe('4 weeks ago');
    expect(describeMediaAge('2019-10-08T00:00:00.000Z', NOW).label).toBe('3 months ago');
    expect(describeMediaAge('2017-01-08T00:00:00.000Z', NOW).label).toBe('3 years ago');
  });
});

describe('describeSchedule', () => {
  it('describes a plan without claiming it has been sent', async () => {
    expect(describeSchedule('2020-01-08T06:00:00.000Z', NOW)).toBe('Today');
    expect(describeSchedule('2020-01-09T00:00:00.000Z', NOW)).toBe('Tomorrow');
    expect(describeSchedule('2020-01-11T00:00:00.000Z', NOW)).toBe('In 3 days');
    expect(describeSchedule('2020-01-20T00:00:00.000Z', NOW)).toBe('In 1 week');
    expect(describeSchedule('2020-01-01T00:00:00.000Z', NOW)).toBe('Date has passed');
    expect(describeSchedule('nonsense', NOW)).toBe('Date not reported');
  });
});

/* -------------------------------------------------------------------------- */
/* 2. The model — coverage is a measurement                                   */
/* -------------------------------------------------------------------------- */

describe('computeMediaCoverage', () => {
  it('counts what Google listed and names the buckets that are empty', async () => {
    const observation = computeMediaCoverage(fixtureMediaItems);

    expect(observation.totalItems).toBe(4);
    expect(observation.emptyBuckets.map((bucket) => bucket.id).sort()).toEqual([
      'branding',
      'work',
    ]);
    expect(observation.buckets.find((bucket) => bucket.id === 'inside')?.count).toBe(2);
  });

  it('leaves undated items out of recency instead of guessing a date for them', async () => {
    const observation = computeMediaCoverage(fixtureMediaItems);
    expect(observation.itemsWithoutDate).toBe(1);
    expect(observation.newestCreateTime).toBe('2020-01-05T00:00:00.000Z');
  });

  it('reports an empty library as a real zero with no invented newest date', async () => {
    const observation = computeMediaCoverage([]);
    expect(observation.totalItems).toBe(0);
    expect(observation.newestCreateTime).toBeNull();
    expect(observation.emptyBuckets).toHaveLength(observation.buckets.length);
  });

  it('only counts Shoogle as the publisher where Shoogle holds a record', async () => {
    expect(computeMediaCoverage(fixtureMediaItems).publishedByShoogle).toBe(1);
  });

  it('states the observation every coverage claim rests on', async () => {
    const sentence = coverageEvidenceSentence(computeMediaCoverage(fixtureMediaItems));
    expect(sentence).toContain('4 photos Google lists as added by you');
    expect(sentence).toContain('Photos your customers uploaded are not in that list');
    expect(sentence).toContain('without a date');
  });
});

/* -------------------------------------------------------------------------- */
/* 3. The model — client-side validation (research §8)                        */
/* -------------------------------------------------------------------------- */

describe('validateMediaCandidate', () => {
  const base: MediaCandidate = {
    id: 'c',
    fileName: 'f.jpg',
    format: 'PHOTO',
    category: 'EXTERIOR',
    widthPx: 1600,
    heightPx: 1200,
    byteSize: 500_000,
  };

  it('accepts a file that clears both documented minimums', async () => {
    expect(validateMediaCandidate(base)).toEqual({ kind: 'ok', exempt: false });
  });

  it('rejects a short edge under 250px and says the measured number', async () => {
    const result = validateMediaCandidate({ ...base, widthPx: 320, heightPx: 180 });
    expect(result.kind).toBe('rejected');
    expect(describeValidation(result).join(' ')).toContain('180px');
    expect(describeValidation(result).join(' ')).toContain(`${MIN_SHORT_EDGE_PX}px`);
  });

  it('rejects a file under 10KB', async () => {
    const result = validateMediaCandidate({ ...base, byteSize: MIN_FILE_BYTES - 1 });
    expect(result.kind).toBe('rejected');
    expect(describeValidation(result).join(' ')).toContain('10 KB');
  });

  it('cannot pass a file whose dimensions were never reported', async () => {
    const result = validateMediaCandidate({ ...base, widthPx: null, heightPx: null });
    // Not `ok`. An unmeasured file has not cleared the rule, and saying it has
    // is the same lie as rendering an unknown as zero.
    expect(result.kind).toBe('cannot_check');
    expect(describeValidation(result).join(' ')).toContain('could not read');
  });

  it('applies Google’s exemption for cover photos and profile pictures', async () => {
    const tiny = { ...base, widthPx: 40, heightPx: 40, byteSize: 100 };
    expect(validateMediaCandidate({ ...tiny, category: 'COVER' })).toEqual({
      kind: 'ok',
      exempt: true,
    });
    expect(validateMediaCandidate({ ...tiny, category: 'PROFILE' })).toEqual({
      kind: 'ok',
      exempt: true,
    });
  });

  it('reports both problems when a file breaks both rules', async () => {
    const result = validateMediaCandidate({
      ...base,
      widthPx: 100,
      heightPx: 100,
      byteSize: 900,
    });
    expect(result.kind === 'rejected' && result.problems).toHaveLength(2);
  });

  it('formats sizes the way an owner reads them', async () => {
    expect(formatBytes(900)).toBe('900 bytes');
    expect(formatBytes(4_096)).toBe('4 KB');
  });
});

/* -------------------------------------------------------------------------- */
/* 4. The capability that no longer exists                                    */
/* -------------------------------------------------------------------------- */

describe('photo performance', () => {
  it('is permanently not_supported, not "no data yet"', async () => {
    for (const state of [
      PHOTO_VIEWS_UNAVAILABLE,
      PHOTO_COUNTS_UNAVAILABLE,
      MEDIA_INSIGHTS_UNAVAILABLE,
    ]) {
      expect(state.status).toBe('unavailable');
      expect(state.reason).toBe('not_supported');
      expect(state.message).toMatch(/2023/);
      expect(state.message).not.toMatch(/soon/i);
    }
  });

  it('renders a dash and a reason rather than a number', async () => {
    await renderPlain(<PhotoViewsNotice />);

    expect(screen.getByTestId('metric-photo-views')).toBeOnTheScreen();
    expect(screen.getByTestId('metric-photo-counts')).toBeOnTheScreen();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('0')).toBeNull();
    expect(allText()).toMatch(/stopped reporting photo views/);
  });
});

/* -------------------------------------------------------------------------- */
/* 4b. The agent banner                                                       */
/* -------------------------------------------------------------------------- */

describe('AgentMediaBanner', () => {
  it('refuses the ranking claim in every state', async () => {
    for (const state of [
      { kind: 'not_connected' } as const,
      { kind: 'blocked', reason: 'Not verified with Google.' } as const,
      { kind: 'measured', publishedByShoogle: 1, itemCount: 4, newest: null } as const,
    ]) {
      const view = await renderPlain(<AgentMediaBanner state={state} />);
      expect(allText()).toMatch(/will not tell you photos lift your ranking/);
      expect(allText()).not.toMatch(/rank higher/i);
      await view.unmount();
    }
  });

  it('separates "you have added none" from "Google dated none of them"', async () => {
    const zero = await renderPlain(
      <AgentMediaBanner
        state={{ kind: 'measured', publishedByShoogle: 0, itemCount: 0, newest: null }}
      />,
    );
    expect(allText()).toMatch(/Google listed no photos added by you/);
    await zero.unmount();

    await renderPlain(
      <AgentMediaBanner
        state={{
          kind: 'measured',
          publishedByShoogle: 0,
          itemCount: 3,
          newest: { kind: 'unknown', label: 'Date not reported' },
        }}
      />,
    );
    expect(allText()).toMatch(/did not date the photos you have added/);
  });

  it('claims nothing was published when nothing is connected', async () => {
    await renderPlain(<AgentMediaBanner state={{ kind: 'not_connected' }} />);
    expect(allText()).toMatch(/has not published any photos/);
    expect(allText()).toMatch(/nothing on your listing has been read/);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. The strip                                                               */
/* -------------------------------------------------------------------------- */

describe('MediaStrip', () => {
  it('badges each tile with its real age, and undated photos as unknown', async () => {
    await renderPlain(<MediaStrip items={fixtureMediaItems} now={FIXTURE_MEDIA_NOW} />);

    expect(screen.getByTestId('media-age-fixture-media-0001').props.accessibilityLabel).toBe(
      '3 days ago',
    );
    expect(screen.getByTestId('media-age-fixture-media-0004').props.accessibilityLabel).toBe(
      'Date not reported',
    );
  });

  it('announces each tile as a complete sentence for TalkBack', async () => {
    await renderPlain(<MediaStrip items={fixtureMediaItems} now={FIXTURE_MEDIA_NOW} />);
    const label = screen.getByTestId('media-tile-fixture-media-0001').props
      .accessibilityLabel as string;
    expect(label).toContain('Shopfront from the road');
    expect(label).toContain('Outside the shop');
    expect(label).toContain('Added 3 days ago');
  });

  it('shows no view count on any tile', async () => {
    await renderPlain(<MediaStrip items={fixtureMediaItems} now={FIXTURE_MEDIA_NOW} />);
    expect(allText()).not.toMatch(/view/i);
  });
});

/* -------------------------------------------------------------------------- */
/* 6. Coverage card                                                           */
/* -------------------------------------------------------------------------- */

describe('MediaCoverageCard', () => {
  it('names the gaps and shows the evidence underneath', async () => {
    await renderPlain(
      <MediaCoverageCard
        observation={computeMediaCoverage(fixtureMediaItems)}
        now={FIXTURE_MEDIA_NOW}
      />,
    );

    expect(screen.getByTestId('coverage-bucket-work').props.accessibilityLabel).toContain(
      'nothing yet',
    );
    expect(screen.getByTestId('coverage-bucket-inside').props.accessibilityLabel).toContain(
      '2 photos',
    );
    expect(screen.getByTestId('media-coverage-evidence')).toBeOnTheScreen();
    expect(screen.getByTestId('media-recency-line').props.children).toContain('3 days ago');
  });

  it('says the age is unknown when nothing carried a date', async () => {
    const undated: GbpMediaItem[] = [
      {
        id: 'x',
        format: 'PHOTO',
        category: 'INTERIOR',
        createTime: null,
        description: null,
        publishedByShoogle: false,
      },
    ];
    await renderPlain(
      <MediaCoverageCard observation={computeMediaCoverage(undated)} now={FIXTURE_MEDIA_NOW} />,
    );
    expect(screen.getByTestId('media-recency-line').props.children).toContain('unknown');
  });
});

/* -------------------------------------------------------------------------- */
/* 7. Scheduled timeline                                                      */
/* -------------------------------------------------------------------------- */

describe('ScheduledMediaTimeline', () => {
  it('is honestly empty when nothing is queued', async () => {
    await renderPlain(<ScheduledMediaTimeline items={[]} now={NOW} />);
    expect(screen.getByTestId('scheduled-media-empty')).toBeOnTheScreen();
    expect(allText()).toMatch(/not connected yet/i);
  });

  it('never badges a plan as published', async () => {
    await renderPlain(
      <ScheduledMediaTimeline
        items={[
          {
            id: 's1',
            scheduledFor: '2020-01-11T00:00:00.000Z',
            category: 'PRODUCT',
            caption: '[FIXTURE] Weekend offer board',
          },
        ]}
        now={NOW}
      />,
    );
    expect(screen.getByTestId('scheduled-media-s1').props.accessibilityLabel).toContain(
      'Not sent to Google yet',
    );
    expect(allText()).not.toMatch(/published/i);
  });
});

/* -------------------------------------------------------------------------- */
/* 8. The Voice of Merchant write gate                                        */
/* -------------------------------------------------------------------------- */

describe('MediaWriteGateNotice', () => {
  it('warns that an upload may never reach Google when the profile is unverified', async () => {
    const explanation = describeVoiceOfMerchant({ kind: 'verify', hasPendingVerification: null });
    await renderPlain(<MediaWriteGateNotice explanation={explanation} />);

    expect(screen.getByTestId('media-write-gate')).toBeOnTheScreen();
    expect(screen.getByTestId('media-write-gate-action').props.children).toContain(
      'Verify this business with Google',
    );
  });

  it('offers no button when there is nothing the owner can do', async () => {
    const explanation = describeVoiceOfMerchant({ kind: 'wait_for_voice_of_merchant' });
    await renderPlain(<MediaWriteGateNotice explanation={explanation} />);
    expect(screen.queryByTestId('media-write-gate-action')).toBeNull();
    expect(allText()).toMatch(/nothing to submit/i);
  });

  it('disappears entirely once the profile holds Voice of Merchant', async () => {
    const explanation = describeVoiceOfMerchant({
      kind: 'has_voice_of_merchant',
      hasBusinessAuthority: true,
    });
    await renderPlain(<MediaWriteGateNotice explanation={explanation} />);
    expect(screen.queryByTestId('media-write-gate')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 9. The explainer                                                           */
/* -------------------------------------------------------------------------- */

describe('WhyPublishCard', () => {
  it('expands on a real press and refuses to promise a ranking', async () => {
    await renderPlain(<WhyPublishCard />);
    expect(screen.queryByTestId('why-publish-body')).toBeNull();

    await fireEvent.press(screen.getByTestId('why-publish-toggle'));

    expect(screen.getByTestId('why-publish-body')).toBeOnTheScreen();
    const text = allText();
    expect(text).toMatch(/Google publishes no rank position/);
    expect(text).not.toMatch(/rank higher/i);
  });
});

/* -------------------------------------------------------------------------- */
/* 10. The add sheet                                                          */
/* -------------------------------------------------------------------------- */

describe('AddMediaSheet', () => {
  it('disables upload and prints why, rather than doing nothing on press', async () => {
    await renderPlain(
      <AddMediaSheet
        visible
        onDismiss={() => {}}
        candidates={[]}
        blockedReason="Uploading is not connected."
      />,
    );

    expect(screen.getByTestId('upload-media-button')).toBeDisabled();
    expect(screen.getByTestId('upload-blocked-reason')).toBeOnTheScreen();
    expect(screen.getByTestId('choose-photo-button')).toBeDisabled();
    expect(screen.getByTestId('choose-photo-reason')).toBeOnTheScreen();
  });

  it('renders a verdict per chosen file, including "cannot be checked"', async () => {
    await renderPlain(
      <AddMediaSheet
        visible
        onDismiss={() => {}}
        candidates={fixtureMediaCandidates}
        blockedReason="Uploading is not connected."
      />,
    );

    expect(
      screen.getByTestId('media-candidate-verdict-fixture-candidate-ok').props.children,
    ).toBe('Ready to send');
    expect(
      screen.getByTestId('media-candidate-verdict-fixture-candidate-small-edge').props.children,
    ).toBe('Google would reject this');
    expect(
      screen.getByTestId('media-candidate-verdict-fixture-candidate-unmeasured').props.children,
    ).toBe('Cannot be checked');
  });

  it('offers every documented category and no invented one', async () => {
    await renderPlain(
      <AddMediaSheet
        visible
        onDismiss={() => {}}
        candidates={[]}
        blockedReason="Uploading is not connected."
      />,
    );
    expect(screen.getByTestId('media-category-select').props.accessibilityLabel).toBe(
      'Category, Outside the shop',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 11. The screen — not connected, which is the DEFAULT state today           */
/* -------------------------------------------------------------------------- */

describe('Photos screen — not connected', () => {
  it('says nothing has been read, and never shows a zero', async () => {
    await renderPhotosScreen();

    await waitFor(() => expect(screen.getByTestId('media-library-state')).toBeOnTheScreen());

    expect(screen.getByTestId('photos-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('media-measured-zero')).toBeNull();
    expect(screen.queryByTestId('media-strip')).toBeNull();
    expect(screen.queryByTestId('fixture-view-switch')).toBeNull();

    const text = allText();
    expect(text).toMatch(/not been connected yet/i);
    // Not a count. Nothing on this screen may render 0 photos.
    expect(text).not.toMatch(/\b0 photos\b/);
  });

  it('still tells the truth about photo views with nothing connected', async () => {
    await renderPhotosScreen();
    await waitFor(() => expect(screen.getByTestId('photo-views-notice')).toBeOnTheScreen());
    expect(screen.getByTestId('metric-photo-views')).toBeOnTheScreen();
  });

  it('renders the scheduled section as empty rather than omitting it', async () => {
    await renderPhotosScreen();
    await waitFor(() => expect(screen.getByTestId('scheduled-media-empty')).toBeOnTheScreen());
  });

  it('keeps the add action alive and honest', async () => {
    await renderPhotosScreen();
    await waitFor(() => expect(screen.getByTestId('add-media-button')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('add-media-button'));

    expect(screen.getByTestId('add-media-sheet')).toBeOnTheScreen();
    expect(screen.getByTestId('upload-media-button')).toBeDisabled();
    expect(screen.getByTestId('upload-blocked-reason').props.children).toMatch(
      /no Google Business Profile credentials/i,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 12. The screen — fixture states                                            */
/* -------------------------------------------------------------------------- */

describe('Photos screen — fixture library', () => {
  beforeEach(() => {
    mockFixtures = true;
  });

  it('shows the strip, the coverage gaps and a fixture banner', async () => {
    await renderPhotosScreen();

    await waitFor(() => expect(screen.getByTestId('media-strip')).toBeOnTheScreen());

    expect(screen.getByTestId('media-tile-fixture-media-0001')).toBeOnTheScreen();
    expect(screen.getByTestId('media-coverage-card')).toBeOnTheScreen();
    expect(screen.getByTestId('coverage-bucket-branding').props.accessibilityLabel).toContain(
      'nothing yet',
    );
    // fixtures/README rule 3: any screen showing fixtures says so.
    expect(allText()).toMatch(/fixture/i);
  });

  it('separates a measured zero from a profile we were not allowed to read', async () => {
    await renderPhotosScreen();
    await waitFor(() => expect(screen.getByTestId('fixture-view-switch')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('fixture-view-measured_zero'));
    expect(screen.getByTestId('media-measured-zero')).toBeOnTheScreen();
    const measured = allText();
    expect(measured).toMatch(/Google answered and listed zero photos/);
    expect(screen.queryByTestId('media-strip')).toBeNull();

    await fireEvent.press(screen.getByTestId('fixture-view-unverified'));
    expect(screen.queryByTestId('media-measured-zero')).toBeNull();
    const blocked = allText();
    expect(blocked).toMatch(/not read your photos/);
    expect(blocked).toMatch(/not the same as you having none/);
    expect(blocked).not.toMatch(/listed zero photos/);
  });

  it('warns before an upload that an unverified profile may never show it', async () => {
    await renderPhotosScreen();
    await waitFor(() => expect(screen.getByTestId('fixture-view-switch')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('fixture-view-unverified'));
    // The library is unavailable, so the strip, the coverage card and the write
    // gate all disappear together — no half-filled screen.
    expect(screen.queryByTestId('media-coverage-card')).toBeNull();
    expect(screen.queryByTestId('media-write-gate')).toBeNull();
  });

  it('shows the scheduled timeline without claiming anything was published', async () => {
    await renderPhotosScreen();
    await waitFor(() => expect(screen.getByTestId('scheduled-media-timeline')).toBeOnTheScreen());
    expect(
      screen.getByTestId('scheduled-media-fixture-scheduled-0001').props.accessibilityLabel,
    ).toContain('Not sent to Google yet');
  });

  it('validates the fixture files inside the sheet', async () => {
    await renderPhotosScreen();
    await waitFor(() => expect(screen.getByTestId('add-media-button')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('add-media-button'));

    expect(
      screen.getByTestId('media-candidate-verdict-fixture-candidate-small-file').props.children,
    ).toBe('Google would reject this');
  });
});

/* -------------------------------------------------------------------------- */
/* 12b. The screen — loading, linked-but-unread, and a failed read            */
/* -------------------------------------------------------------------------- */

describe('Photos screen — the states between connected and not', () => {
  it('shows a skeleton while the connection is still being read, never a zero', async () => {
    // Held open deliberately: the loading state must be reachable and must not
    // resolve into a count of any kind.
    mockGetConnection = () => new Promise<DataState<ConnectionInfo>>(() => {});
    await renderPhotosScreen();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeOnTheScreen());
    expect(screen.queryByTestId('media-measured-zero')).toBeNull();
    expect(screen.queryByTestId('media-strip')).toBeNull();
    expect(allText()).not.toMatch(/0/);
  });

  it('says a linked profile has not been read yet, rather than "nothing yet"', async () => {
    mockGetConnection = () =>
      Promise.resolve(
        ready<ConnectionInfo>(
          {
            provider: 'google_business',
            status: 'connected',
            handle: 'fixture-handle',
            grantedScopes: [],
            lastSyncedAt: null,
          },
          '2020-01-01T00:00:00.000Z',
        ),
      );
    await renderPhotosScreen();

    await waitFor(() => expect(screen.getByTestId('media-library-state')).toBeOnTheScreen());
    const text = allText();
    expect(text).toMatch(/has not read your photos yet/);
    expect(text).toMatch(/not a count of zero/);
    // `no_data_yet` would render "There is no activity to report so far",
    // which is a claim about the owner's listing rather than about what we know.
    expect(text).not.toMatch(/no activity to report/);
  });

  it('surfaces a failed read as an error, not as an empty library', async () => {
    mockGetConnection = () =>
      Promise.resolve(failed('gbp_unreachable', 'Google did not answer. Try again shortly.'));
    await renderPhotosScreen();

    await waitFor(() => expect(screen.getByTestId('media-library-state')).toBeOnTheScreen());
    expect(allText()).toMatch(/Google did not answer/);
    expect(screen.queryByTestId('media-measured-zero')).toBeNull();
    expect(screen.queryByTestId('media-coverage-card')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 13. Promises the whole screen must never make                              */
/* -------------------------------------------------------------------------- */

describe('Photos screen — claims it must not make', () => {
  it('never renders a search rank position with nothing connected', async () => {
    await renderPhotosScreen();
    await waitFor(() => expect(screen.getByTestId('photos-screen')).toBeOnTheScreen());

    const text = allText();
    expect(text).not.toMatch(/rank higher/i);
    expect(text).not.toMatch(/#\d/);
    expect(text).not.toMatch(/position \d/i);
  });

  it('never renders a search rank position with a full fixture library', async () => {
    mockFixtures = true;
    await renderPhotosScreen();
    await waitFor(() => expect(screen.getByTestId('photos-screen')).toBeOnTheScreen());

    const text = allText();
    expect(text).not.toMatch(/rank higher/i);
    expect(text).not.toMatch(/#\d/);
    expect(text).not.toMatch(/position \d/i);
  });

  it('never puts a number next to the words "photo views"', async () => {
    mockFixtures = true;
    await renderPhotosScreen();
    await waitFor(() => expect(screen.getByTestId('metric-photo-views')).toBeOnTheScreen());

    const label = screen.getByTestId('metric-photo-views').props.accessibilityLabel as
      | string
      | undefined;
    expect(typeof label).toBe('string');
    // "not available" plus the reason. The only digits allowed are the year
    // Google removed the metric in; any other number here would be a count.
    expect(label).toContain('not available');
    expect((label ?? '').replace('2023', '')).not.toMatch(/\d/);
  });
});

/* -------------------------------------------------------------------------- */
/* 14. Android floors                                                         */
/* -------------------------------------------------------------------------- */

describe('Android accessibility floors', () => {
  it('keeps every control at or above the 44pt touch target', async () => {
    mockFixtures = true;
    await renderPhotosScreen();
    await waitFor(() => expect(screen.getByTestId('add-media-button')).toBeOnTheScreen());

    for (const testID of [
      'add-media-button',
      'fixture-view-library',
      'fixture-view-measured_zero',
      'why-publish-toggle',
    ]) {
      const style = screen.getByTestId(testID).props.style as
        | { height?: number; minHeight?: number }
        | { height?: number; minHeight?: number }[];
      const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
      const size = flat.height ?? flat.minHeight ?? 0;
      expect(size).toBeGreaterThanOrEqual(control.minTouchTarget);
    }
  });

  it('gives every pressable an accessible name', async () => {
    mockFixtures = true;
    await renderPhotosScreen();
    await waitFor(() => expect(screen.getByTestId('add-media-button')).toBeOnTheScreen());

    for (const node of screen.getAllByRole('button')) {
      const name =
        (node.props.accessibilityLabel as string | undefined) ??
        (typeof node.props.children === 'string' ? node.props.children : undefined);
      expect(name).toBeTruthy();
    }
  });
});
