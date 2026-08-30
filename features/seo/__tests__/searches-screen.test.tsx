/**
 * `app/seo/searches.tsx` — "What people searched".
 *
 * THE RULE UNDER TEST
 * -------------------
 * A below-threshold reading is a BOUND, not a count. It must reach the screen
 * as `<15` — never `15`, never `0`, never a bar whose height claims to be 15 —
 * and a measured zero must stay visibly a different fact from both a bound and
 * from "we could not ask".
 *
 * The second half of the file pins the honest empty states. `not_connected` is
 * what a real build reports today, `no_data_yet` is the quiet-profile case and
 * `rate_limited` is the one that most often gets mistaken for "you have no
 * search terms" — so each of them has to say something specific rather than
 * fall through to a generic blank.
 */

import { render, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import SearchesScreen from '@/app/seo/searches';
import { ToastProvider } from '@/components/ui';
import { SearchKeywordsView } from '@/features/seo/components';
import { fixtureSearchKeywordsReport } from '@/fixtures/seo';
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

function renderScreen() {
  return renderRouter(
    {
      'seo/searches': () => (
        <ThemeProvider forceScheme="light">
          <ToastProvider>
            <SearchesScreen />
          </ToastProvider>
        </ThemeProvider>
      ),
    },
    { initialUrl: '/seo/searches' },
  );
}

/**
 * RNTL 14 returns a promise from `render`, so every render is awaited before
 * `screen` is queried. See `__tests__/primitives.test.tsx`.
 */
async function renderView(element: React.JSX.Element) {
  return render(
    <ThemeProvider forceScheme="light">
      <ToastProvider>{element}</ToastProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  mockFixtures = false;
});

describe('the threshold union on screen', () => {
  beforeEach(() => {
    mockFixtures = true;
  });

  it('renders a below-threshold reading as a bound, never as the threshold itself', async () => {
    await renderScreen();

    // The fixture carries two `below_threshold: 15` rows and one at 5.
    expect(screen.getAllByText('<15').length).toBeGreaterThan(0);
    expect(screen.getByText('<5')).toBeOnTheScreen();

    // The bound must never be rendered as the number it bounds, and must never
    // collapse into the measured-zero row.
    expect(screen.queryByText('15')).toBeNull();
    expect(screen.queryByText('5')).toBeNull();
  });

  it('labels a bounded row as a range in words as well as in symbols', async () => {
    await renderScreen();

    expect(screen.getAllByText('Fewer than 15').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Range').length).toBeGreaterThan(0);
  });

  it('reads a bound aloud as a sentence, because "<15" alone is a broken number', async () => {
    await renderScreen();

    expect(
      screen.getByLabelText(
        '[fixture] bridal makeup seawoods. Fewer than 15 people — Google does not report exact counts this low',
      ),
    ).toBeOnTheScreen();
  });

  it('keeps a measured zero visibly different from a bound and from unknown', async () => {
    await renderScreen();

    expect(screen.getByText('0')).toBeOnTheScreen();
    expect(screen.getByText('Google counted this term and found nobody.')).toBeOnTheScreen();
    expect(screen.getByText('Measured zero')).toBeOnTheScreen();
    // The em-dash placeholder means "unknown". A measured zero must not use it.
    expect(screen.queryByText('—')).toBeNull();
  });

  it('leads with an exact count, groups it, and explains the bound exactly once', async () => {
    await renderScreen();

    expect(
      screen.getByText('1,240 people found you searching “[fixture] hair salon nerul”.'),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('threshold-explainer')).toBeOnTheScreen();
    expect(screen.getAllByTestId('threshold-explainer')).toHaveLength(1);
    // The explainer talks about the bound in the same notation the rows use.
    expect(
      screen.getByText(/“<15” means fewer than fifteen people searched it that month/),
    ).toBeOnTheScreen();
    expect(screen.getByText(/It is not zero/)).toBeOnTheScreen();
  });

  it('never renders a rank position, and says why', async () => {
    await renderScreen();

    expect(screen.getByTestId('no-rank-note')).toBeOnTheScreen();
    expect(screen.queryByText(/#\d/)).toBeNull();
    expect(screen.queryByText(/position/i)).toBeNull();
  });

  it('marks fixture data as fixture data', async () => {
    await renderScreen();
    expect(screen.getByTestId('fixture-banner')).toBeOnTheScreen();
  });
});

describe('honest states when there is nothing to show', () => {
  it('reports the provider’s own not-connected answer, with no fixture leakage', async () => {
    mockFixtures = false;
    await renderScreen();

    expect(
      await screen.findByText(
        'Connect your Google Business Profile to see the search terms people used to find you.',
      ),
    ).toBeOnTheScreen();

    expect(screen.queryByTestId('fixture-banner')).toBeNull();
    expect(screen.queryByText('[fixture] hair salon nerul')).toBeNull();
    // Nothing unknown is rendered as a number of any kind.
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('<15')).toBeNull();
  });

  it('says a rate limit is a Google limit, not an empty month', async () => {
    await renderView(
      <SearchKeywordsView
        state={unavailable('rate_limited', 'Google is throttling Shoogle right now.')}
      />,
    );

    expect(screen.getByText('Google is limiting requests')).toBeOnTheScreen();
    expect(screen.getByText('Google is throttling Shoogle right now.')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Nothing is lost and nothing is wrong with your profile. The terms are still there — this will load once the limit clears.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('separates "no terms yet" from "we could not ask"', async () => {
    await renderView(
      <SearchKeywordsView
        state={unavailable('no_data_yet', 'Google has no report for this month yet.')}
      />,
    );

    expect(screen.getByText('No search terms yet')).toBeOnTheScreen();
    expect(screen.getByText('Google has no report for this month yet.')).toBeOnTheScreen();
  });

  it('treats a ready-but-empty report as an empty month rather than a blank screen', async () => {
    await renderView(
      <SearchKeywordsView
        state={ready(
          { locationId: 'l', monthStart: '2020-01-01', rows: [], partial: false },
          '2020-01-01T00:00:00.000Z',
        )}
      />,
    );

    expect(screen.getByTestId('searches-unavailable')).toBeOnTheScreen();
    expect(
      screen.getByText('Google returned this month’s report and there were no search terms in it.'),
    ).toBeOnTheScreen();
  });

  it('says out loud when Google returned only part of the list', async () => {
    await renderView(
      <SearchKeywordsView
        state={ready(
          { ...fixtureSearchKeywordsReport, partial: true },
          '2020-01-01T00:00:00.000Z',
          true,
        )}
      />,
    );

    expect(screen.getByTestId('partial-notice')).toBeOnTheScreen();
    expect(screen.getByText('Incomplete list')).toBeOnTheScreen();
  });
});
