/**
 * `app/seo/visibility.tsx` — "How you look to AI".
 *
 * THE RULES UNDER TEST
 * --------------------
 * 1. NO CLAIM WITHOUT ITS EVIDENCE. Every finding on this screen must render
 *    the observation behind it and the date it was observed. The test walks the
 *    real report and asserts both for every single finding, so adding a finding
 *    that skips its evidence fails here.
 * 2. NOTHING IS SCORED. Coverage is a count of checks; there is no percentage,
 *    no "N/100", and a check that did not run is named rather than counted as a
 *    pass.
 * 3. THE MODEL GUARD IS HONEST. When the development AI client refuses, the
 *    screen says why and the control is disabled with that reason — it never
 *    shows a spinner waiting on a request that was never allowed to start.
 * 4. NOTHING IS INVENTED WHEN THERE IS NOTHING TO READ. With no website known,
 *    every card reports unavailable with a reason.
 */

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import VisibilityScreen from '@/app/seo/visibility';
import { ToastProvider } from '@/components/ui';
import { AI_READY, checkAiVisibility, observeReadability, type AiProvider } from '@/features/seo';
import {
  AiDraftCard,
  AiVisibilityView,
  DirectoryChecklistCard,
  type AiVisibilityInspection,
} from '@/features/seo/components';
import { REFUSAL_FIXTURE_MODE_OFF, REFUSAL_NO_KEY } from '@/features/seo/ai/gemini';
import { fixturePageSnapshot } from '@/fixtures/seo';
import { ready, unavailable } from '@/lib/state/DataState';
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

/**
 * The development Gemini client reads a NON-public key from `process.env`.
 * Clearing both names makes its readiness deterministic here rather than
 * dependent on whichever engineer's machine runs the suite.
 */
const savedKeys = {
  key: process.env['GEMINI_API_KEY'],
  publicKey: process.env['EXPO_PUBLIC_GEMINI_API_KEY'],
};

beforeAll(() => {
  delete process.env['GEMINI_API_KEY'];
  delete process.env['EXPO_PUBLIC_GEMINI_API_KEY'];
});

afterAll(() => {
  if (savedKeys.key !== undefined) process.env['GEMINI_API_KEY'] = savedKeys.key;
  if (savedKeys.publicKey !== undefined) {
    process.env['EXPO_PUBLIC_GEMINI_API_KEY'] = savedKeys.publicKey;
  }
});

afterEach(() => {
  mockFixtures = false;
});

function renderScreen() {
  return renderRouter(
    {
      'seo/visibility': () => (
        <ThemeProvider forceScheme="light">
          <ToastProvider>
            <VisibilityScreen />
          </ToastProvider>
        </ThemeProvider>
      ),
    },
    { initialUrl: '/seo/visibility' },
  );
}

/** RNTL 14 returns a promise from `render`; every render is awaited. */
async function renderView(element: React.JSX.Element) {
  return render(
    <ThemeProvider forceScheme="light">
      <ToastProvider>{element}</ToastProvider>
    </ThemeProvider>,
  );
}

/** The exact report the screen renders, computed the same way the screen does. */
const fixtureReport = checkAiVisibility(fixturePageSnapshot);

describe('no AI claim renders without its evidence', () => {
  beforeEach(() => {
    mockFixtures = true;
  });

  it('shows what was observed, and when, for every finding', async () => {
    await renderScreen();

    // The fixture site blocks an AI search crawler and carries no LocalBusiness
    // markup, so there is something real to assert against.
    expect(fixtureReport.findings.length).toBeGreaterThan(0);

    for (const finding of fixtureReport.findings) {
      expect(screen.getByText(finding.title)).toBeOnTheScreen();
      expect(screen.getByText(finding.observation)).toBeOnTheScreen();
    }

    // One evidence block per finding — a claim cannot outnumber its evidence.
    expect(screen.getAllByText(/^Observed 1 January 2020$/).length).toBeGreaterThanOrEqual(
      fixtureReport.findings.length,
    );
  });

  it('pairs every readability observation with its reason and its date', async () => {
    // The fixture page is well-formed, so it produces no observations — which
    // is itself the honest branch and must not read as "we did not look".
    // The observations themselves are exercised through the view.
    const measured = observeReadability({
      html: '<html><body><h2>Services</h2><p>Short.</p></body></html>',
      pageLabel: 'home',
    });
    expect(measured.observations.length).toBeGreaterThan(0);

    await renderView(
      <AiVisibilityView
        state={ready<AiVisibilityInspection>(
          {
            report: {
              url: 'https://fixture.example/',
              fetchedAt: '2020-01-01T00:00:00.000Z',
              pageTitle: null,
              checksRun: 1,
              checksPassed: 1,
              uncheckedAreas: ['Whether Google has indexed your site'],
              findings: [],
            },
            readability: measured,
            pageLabel: 'home',
          },
          '2020-01-01T00:00:00.000Z',
        )}
      />,
    );

    for (const observation of measured.observations) {
      expect(screen.getByText(observation.observation)).toBeOnTheScreen();
      expect(screen.getByText(observation.reason)).toBeOnTheScreen();
    }
    // Every observation carries a dated stamp; none of them is undated.
    expect(screen.getAllByText('Observed 1 January 2020')).toHaveLength(
      measured.observations.length,
    );
  });

  it('says nothing stood out, rather than implying nothing was looked at', async () => {
    await renderScreen();

    expect(screen.getByTestId('readability-none')).toBeOnTheScreen();
    expect(screen.getByTestId('readability-passage')).toBeOnTheScreen();
  });

  it('labels a study as a study rather than as something Google said', async () => {
    await renderView(
      <AiVisibilityView
        state={ready<AiVisibilityInspection>(
          {
            report: {
              url: 'https://fixture.example/',
              fetchedAt: '2020-01-01T00:00:00.000Z',
              pageTitle: null,
              checksRun: 1,
              checksPassed: 0,
              uncheckedAreas: ['Whether Google has indexed your site'],
              findings: [
                {
                  id: 'test-finding',
                  checkId: 'ai.page.no_js_content',
                  title: 'A claim that needs a source',
                  detail: 'Interpretation of the observation below.',
                  severity: 'important',
                  fixHref: null,
                  observation: 'Raw HTML text 42 chars vs script 9000 chars.',
                  evidenceBasis: 'study',
                },
              ],
            },
            readability: { observations: [], notObserved: [], longestPassageWords: null },
            pageLabel: 'home',
          },
          '2020-01-01T00:00:00.000Z',
        )}
      />,
    );

    expect(screen.getByText('A claim that needs a source')).toBeOnTheScreen();
    expect(screen.getByText('Raw HTML text 42 chars vs script 9000 chars.')).toBeOnTheScreen();
    expect(screen.getByText('Observed 1 January 2020')).toBeOnTheScreen();
    expect(screen.getByText('Study, not Google')).toBeOnTheScreen();
  });

  it('offers no "fix this for me" affordance for a change on the owner’s own site', async () => {
    await renderScreen();

    expect(screen.queryByText(/fix this/i)).toBeNull();
    expect(
      screen.getAllByText('This is a change on your website. Shoogle cannot make it for you.')
        .length,
    ).toBe(fixtureReport.findings.length);
  });
});

describe('coverage is counted, never scored', () => {
  beforeEach(() => {
    mockFixtures = true;
  });

  it('reports how many checks ran and passed, and says that is not a score', async () => {
    await renderScreen();

    expect(
      screen.getByText(
        `${fixtureReport.checksPassed} of ${fixtureReport.checksRun} checks passed`,
      ),
    ).toBeOnTheScreen();
    // No fabricated precision anywhere: no percentage, no N/100.
    expect(screen.queryByText(/\d+\s*\/\s*100/)).toBeNull();
    expect(screen.queryByText(/^\d+%$/)).toBeNull();
  });

  it('names what it could not check instead of letting silence read as a pass', async () => {
    await renderScreen();

    expect(fixtureReport.uncheckedAreas.length).toBeGreaterThan(0);
    for (const area of fixtureReport.uncheckedAreas) {
      expect(screen.getByText(area)).toBeOnTheScreen();
    }
    expect(
      screen.getAllByText(/Not checked is not a pass/).length,
    ).toBeGreaterThan(0);
  });

  it('never renders a rank', async () => {
    await renderScreen();
    expect(screen.queryByText(/#\d/)).toBeNull();
  });

  it('marks fixture data as fixture data', async () => {
    await renderScreen();
    expect(screen.getByTestId('fixture-banner')).toBeOnTheScreen();
  });
});

describe('the model guard is visible, not silent', () => {
  it('disables generation and prints the refusal when there is no key', async () => {
    mockFixtures = true;
    await renderScreen();

    expect(screen.getByTestId('ai-draft-button')).toBeDisabled();
    expect(screen.getByTestId('ai-draft-refusal')).toHaveTextContent(REFUSAL_NO_KEY);
    // A refusal is an answer, not a wait. Nothing is left spinning.
    expect(screen.queryByTestId('ai-draft-state')).toBeNull();
  });

  it('refuses outright when fixture mode is off, rather than sending real data', async () => {
    mockFixtures = false;
    await renderScreen();

    expect(screen.getByTestId('ai-draft-button')).toBeDisabled();
    expect(screen.getByTestId('ai-draft-refusal')).toHaveTextContent(REFUSAL_FIXTURE_MODE_OFF);
  });
});

describe('when a model does answer', () => {
  /**
   * A stand-in for a provider that is allowed to run. It is not the real client
   * — the point is the CARD's behaviour once a result arrives: the text is
   * shown, and it is labelled as one model's output rather than as a
   * measurement.
   */
  const readyProvider: AiProvider = {
    id: 'gemini_free_dev',
    displayName: 'Gemini (development only)',
    readiness: () => AI_READY,
    generateText: async (request) => {
      // The guard the real client enforces, mirrored so this stub cannot be
      // used to test a path production would refuse.
      if (request.input.classification !== 'fixture') {
        return unavailable('not_supported', 'refused');
      }
      return ready(
        {
          task: request.task,
          text: '[FIXTURE] A drafted sentence.',
          model: 'gemini-test',
          provider: 'gemini_free_dev' as const,
          derivedFromFixtureData: true,
        },
        '2020-01-01T00:00:00.000Z',
        true,
      );
    },
  };

  it('shows the drafted text, attributed to the model that wrote it', async () => {
    await renderView(<AiDraftCard provider={readyProvider} payload="[FIXTURE] material" />);

    // The request is awaited inside `act` so the state update it causes lands
    // before the assertions — and so nothing is left in flight when this test
    // ends. A refusal or a result always arrives; there is no third outcome.
    await act(async () => {
      await fireEvent.press(screen.getByTestId('ai-draft-button'));
    });

    expect(screen.getByTestId('ai-draft-text')).toHaveTextContent(
      '[FIXTURE] A drafted sentence.',
    );
    expect(screen.getByText(/Written by gemini-test/)).toBeOnTheScreen();
    expect(screen.getByText(/not a measurement/)).toBeOnTheScreen();
  });

  it('stays disabled when there is no fixture material, even with a ready provider', async () => {
    await renderView(<AiDraftCard provider={readyProvider} payload={null} />);

    expect(screen.getByTestId('ai-draft-button')).toBeDisabled();
    expect(screen.getByTestId('ai-draft-refusal')).toHaveTextContent(
      /will not send a real business’s details to a free-tier model/,
    );
  });
});

describe('the directory checklist is the owner’s answer, not ours', () => {
  it('starts unanswered, counts instead of scoring, and shows each row’s evidence', async () => {
    await renderView(<DirectoryChecklistCard state={ready('salon', '2020-01-01T00:00:00.000Z')} />);

    // "Not answered" is its own state. It is never folded into "not listed".
    expect(screen.getAllByText('Not answered.').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        /directories to check\. We cannot read them, so this is your answer, not ours\./,
      ),
    ).toBeOnTheScreen();

    // Counts, never a percentage.
    expect(screen.queryByText(/%/)).toBeNull();

    // Every row states what was observed about it and when.
    expect(screen.getAllByText(/^Checked 30 August 2026$/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unverified').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Observed').length).toBeGreaterThan(0);
  });

  it('records an answer the owner gives, and lets them take it back', async () => {
    await renderView(<DirectoryChecklistCard state={ready('salon', '2020-01-01T00:00:00.000Z')} />);

    // RNTL 14's fireEvent is async; every press is awaited.
    await fireEvent.press(screen.getByLabelText('Justdial: I am listed here'));
    expect(screen.getByText(/^1 listed/)).toBeOnTheScreen();

    // Tapping the same answer again clears it, so a mis-tap is recoverable and
    // "not answered" stays reachable.
    await fireEvent.press(screen.getByLabelText('Justdial: I am listed here'));
    expect(screen.queryByText(/^1 listed/)).toBeNull();
  });
});

describe('nothing to read', () => {
  it('reports every card as unavailable with a reason, and invents nothing', async () => {
    mockFixtures = false;
    await renderScreen();

    expect(screen.getByTestId('visibility-unavailable')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Shoogle does not know your website address yet. It comes from your Google Business Profile, which is not connected, so there is nothing to read.',
      ),
    ).toBeOnTheScreen();

    // The directory checklist depends on a category we do not have.
    expect(
      screen.getByText(
        'Shoogle does not know what kind of business this is yet, and the right directories depend on that. Guessing would send you to the wrong ones.',
      ),
    ).toBeOnTheScreen();

    expect(screen.queryByTestId('fixture-banner')).toBeNull();
    expect(screen.queryByText('0 of 0 checks passed')).toBeNull();
  });

  it('names the blocked work rather than leaving a gap', async () => {
    mockFixtures = false;
    await renderScreen();

    expect(screen.getByTestId('visibility-blocked')).toBeOnTheScreen();
    expect(
      screen.getByText('Asking an AI assistant about your business and showing what it said'),
    ).toBeOnTheScreen();
  });
});
