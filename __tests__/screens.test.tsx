import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import BusinessScreen from '@/app/(tabs)/business';
import HomeScreen from '@/app/(tabs)/index';
import PostsScreen from '@/app/(tabs)/posts';
import SettingsScreen from '@/app/(tabs)/settings';
import SignInScreen from '@/app/(auth)/sign-in';
import { ToastProvider } from '@/components/ui';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { clearSignInHandler, registerSignInHandler } from '@/features/auth/handlers';
import { failed, ready } from '@/lib/state/DataState';
import { ThemeProvider } from '@/theme';

/**
 * Supabase configuration is read from inlined EXPO_PUBLIC_* values, which are
 * absent in tests. Two sign-in tests need the "configured" path, so the flag is
 * made controllable here. It defaults to false, matching a fresh clone.
 */
let mockSupabaseConfigured = false;
let mockFixtures = false;
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return {
    ...actual,
    isSupabaseConfigured: () => mockSupabaseConfigured,
    isFixtureModeEnabled: () => mockFixtures,
    isDevPreviewEnabled: () => false,
  };
});

jest.mock('@/lib/supabase/client', () => ({
  getSupabase: () => null,
  resetSupabaseClient: () => {},
  isSupabaseConfigured: () => false,
}));

/**
 * Screen smoke tests.
 *
 * These render the real route components through Expo Router, so a crash, a
 * bad import or a broken hook order fails here rather than on a phone.
 *
 * They also assert the honesty rules at the screen level: the foundation
 * screens must show explicit empty / not-connected states and must not render
 * a zero, a fabricated metric, or a claim that an integration exists.
 */
function renderScreen(name: string, Component: () => React.JSX.Element) {
  return renderRouter(
    {
      [name]: () => (
        <ThemeProvider forceScheme="light">
          <SessionProvider>
            <ToastProvider>
              <Component />
            </ToastProvider>
          </SessionProvider>
        </ThemeProvider>
      ),
    },
    { initialUrl: `/${name}` },
  );
}

describe('Home', () => {
  afterEach(() => {
    mockFixtures = false;
  });

  it('shows an honest empty state when no data source exists', async () => {
    mockFixtures = false;
    await renderScreen('home', HomeScreen);

    expect(screen.getByText('Nothing to act on yet')).toBeOnTheScreen();
    // Nothing from the demo business leaks into a build without fixtures.
    expect(screen.queryByText('Vahan Ready')).toBeNull();
    expect(screen.queryByText('1,204')).toBeNull();
    expect(screen.queryByTestId('fixture-banner')).toBeNull();
    // No metric is fabricated, and nothing renders as a placeholder zero.
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('renders the designed layout when fixtures are on, clearly labelled', async () => {
    mockFixtures = true;
    await renderScreen('home', HomeScreen);

    // The wireframe's structure, in order.
    expect(screen.getByText('Vahan Ready')).toBeOnTheScreen();
    expect(screen.getByText('Shoogle suggests')).toBeOnTheScreen();
    expect(screen.getByText('Monday morning post ready')).toBeOnTheScreen();
    expect(screen.getByText('Google views')).toBeOnTheScreen();
    expect(screen.getByText('1,204')).toBeOnTheScreen();
    expect(screen.getByText('Social')).toBeOnTheScreen();
    expect(screen.getByText('SEO / Local')).toBeOnTheScreen();
    expect(screen.getByText('Website')).toBeOnTheScreen();

    // ...and it can never be mistaken for the owner's real data.
    expect(screen.getByTestId('fixture-banner')).toBeOnTheScreen();
  });

  it('distinguishes a real zero change from an unknown one', async () => {
    mockFixtures = true;
    await renderScreen('home', HomeScreen);
    // The Calls metric genuinely did not move, which the design renders as "— 0%".
    expect(screen.getByText('— 0%')).toBeOnTheScreen();
  });

  it('keeps skip one tap away, per product rule 5', async () => {
    mockFixtures = true;
    await renderScreen('home', HomeScreen);
    expect(screen.getByRole('button', { name: 'Skip this suggestion' })).toBeOnTheScreen();
  });
});

describe('Posts', () => {
  afterEach(() => {
    mockFixtures = false;
  });

  it('shows an honest empty state when nothing is scheduled', async () => {
    mockFixtures = false;
    await renderScreen('posts', PostsScreen);

    expect(screen.getByText('Nothing scheduled')).toBeOnTheScreen();
    // Nothing from the demo business leaks in.
    expect(screen.queryByText('Step-by-step licence renewal guide')).toBeNull();
    // Product rule 5: the copy promises skip/pause, so it must say so.
    expect(screen.getByText(/skip or pause/i)).toBeOnTheScreen();
  });

  it('renders the designed layout when fixtures are on', async () => {
    mockFixtures = true;
    await renderScreen('posts', PostsScreen);

    expect(screen.getByText('NEXT UP · TOMORROW 9:00 AM')).toBeOnTheScreen();
    // "Scheduled" is both a stat-tile label and a section heading.
    expect(screen.getAllByText('Scheduled').length).toBeGreaterThanOrEqual(2);
    // The same post is both the next-up card and the first scheduled row.
    expect(screen.getAllByText('Step-by-step licence renewal guide').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Needs attention')).toBeOnTheScreen();
    expect(screen.getByTestId('fixture-banner')).toBeOnTheScreen();
  });

  it('keeps Create post reachable, per product rule 4', async () => {
    mockFixtures = true;
    await renderScreen('posts', PostsScreen);
    expect(screen.getByTestId('create-post')).toBeOnTheScreen();
  });

  it('only reports a result for a post that actually went out', async () => {
    mockFixtures = true;
    await renderScreen('posts', PostsScreen);
    // The published row carries a real result; the failed one says why it failed.
    expect(screen.getByText('2,412 reached · 84 saves')).toBeOnTheScreen();
    expect(screen.getByText('Failed to publish')).toBeOnTheScreen();
  });
});

describe('Business', () => {
  afterEach(() => {
    mockFixtures = false;
  });

  it('reports every provider as not connected', async () => {
    mockFixtures = false;
    await renderScreen('business', BusinessScreen);

    // All four providers are listed by name...
    expect(screen.getByText('Google Business Profile')).toBeOnTheScreen();
    expect(screen.getByText('Instagram')).toBeOnTheScreen();
    expect(screen.getByText('Facebook')).toBeOnTheScreen();
    expect(screen.getByText('LinkedIn')).toBeOnTheScreen();

    // ...and none is claimed to be connected.
    expect(screen.queryByText('Connected')).toBeNull();
  });

  it('shows unmeasured visibility rather than a zero', async () => {
    mockFixtures = false;
    await renderScreen('business', BusinessScreen);
    // Appears as the visibility headline and as the rankings subtitle.
    expect(screen.getAllByText('Not measured yet').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('1,204')).toBeNull();
    // The rating shows a dash, not a zero.
    expect(screen.getByText('—')).toBeOnTheScreen();
  });

  it('renders the designed SEO layout when fixtures are on', async () => {
    mockFixtures = true;
    await renderScreen('business', BusinessScreen);

    expect(screen.getByText('Looking good')).toBeOnTheScreen();
    expect(screen.getByText('1,204')).toBeOnTheScreen();
    expect(screen.getByText('4.8')).toBeOnTheScreen();
    expect(screen.getByText('Search rankings')).toBeOnTheScreen();
    expect(screen.getByTestId('fixture-banner')).toBeOnTheScreen();
  });

  /**
   * REGRESSION GUARD — this shipped once and had to be caught by review.
   *
   * The fixture carried { key: 'rank', label: 'Avg. rank', value: '#6.4' } and
   * a rankings: { tracked, improved } block, rendered as a headline number with
   * a green up-arrow. Google publishes NO rank position through any API — not
   * rate-limited, not approval-gated, it does not exist. Showing one teaches a
   * capability that will never arrive.
   */
  it('never renders a search rank position', async () => {
    mockFixtures = true;
    await renderScreen('business', BusinessScreen);

    expect(screen.queryByText('Avg. rank')).toBeNull();
    expect(screen.queryByText('#6.4')).toBeNull();
    // No rank-shaped value anywhere on the screen.
    expect(screen.queryByText(/^#d/)).toBeNull();
    // And no "N keywords tracked" count implying ranks are being measured.
    expect(screen.queryByText(/keywords tracked/i)).toBeNull();
  });

  it('states plainly that rank is not measurable, rather than "not yet"', async () => {
    mockFixtures = true;
    await renderScreen('business', BusinessScreen);

    expect(screen.getByText('Search rankings')).toBeOnTheScreen();
    expect(screen.getByText('Google does not publish rank positions')).toBeOnTheScreen();
    // "coming soon" would imply there is something to wait for. There is not.
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it('shows only metrics Google still exposes', async () => {
    mockFixtures = true;
    await renderScreen('business', BusinessScreen);

    // Survived Google's 2023 removals.
    expect(screen.getByText('Google views')).toBeOnTheScreen();
    expect(screen.getByText('Calls')).toBeOnTheScreen();
    expect(screen.getByText('Website taps')).toBeOnTheScreen();

    // Deleted by Google in 2023 with no replacement — must never appear.
    for (const gone of [/post views/i, /photo views/i, /direct searches/i, /discovery searches/i]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  /**
   * The important one. Fixture SEO content must never bleed into the real
   * connection state: the registry is the only source for those rows.
   */
  it('still reports connections honestly while showing fixture content', async () => {
    mockFixtures = true;
    await renderScreen('business', BusinessScreen);

    expect(screen.getByText('Looking good')).toBeOnTheScreen();
    expect(screen.queryByText('Connected')).toBeNull();
    expect(screen.getAllByText('Integration not built yet').length).toBeGreaterThan(0);
  });
});

describe('Settings', () => {
  it('renders and names the missing environment variables', async () => {
    await renderScreen('settings', SettingsScreen);

    expect(screen.getByTestId('screen-settings')).toBeOnTheScreen();
    expect(screen.getByText('Not configured')).toBeOnTheScreen();
    // Variable NAMES are shown so a broken setup is obvious. Never values.
    expect(screen.getByText('EXPO_PUBLIC_SUPABASE_URL')).toBeOnTheScreen();
    expect(screen.getByText('EXPO_PUBLIC_SUPABASE_ANON_KEY')).toBeOnTheScreen();
  });
});

describe('Sign in', () => {
  afterEach(() => {
    clearSignInHandler();
    mockSupabaseConfigured = false;
  });

  it('renders and says plainly that the backend is not configured', async () => {
    await renderScreen('sign-in', SignInScreen);
    expect(screen.getByTestId('screen-sign-in')).toBeOnTheScreen();
    // No EXPO_PUBLIC_SUPABASE_* is set in the test environment.
    expect(screen.getByTestId('backend-not-configured')).toBeOnTheScreen();
  });

  it('disables sign-in rather than pretending it works', async () => {
    await renderScreen('sign-in', SignInScreen);
    expect(screen.getByTestId('button-sign-in')).toBeDisabled();
    expect(
      screen.getByText('Authentication is not implemented in the foundation build.'),
    ).toBeOnTheScreen();
  });

  /**
   * Regression guard.
   *
   * The button used to enable as soon as Supabase was configured, even though
   * no sign-in existed - so adding env vars produced a live-looking button that
   * silently did nothing. "Configured" and "implemented" are separate facts and
   * the button must require BOTH.
   */
  it('stays disabled while no sign-in handler is registered, even with fields filled', async () => {
    await renderScreen('sign-in', SignInScreen);
    await fireEvent.changeText(screen.getByTestId('input-email'), 'owner@example.com');
    await fireEvent.changeText(screen.getByTestId('input-password'), 'hunter2');

    expect(screen.getByTestId('button-sign-in')).toBeDisabled();
    // And it never claims to be a working control.
    expect(screen.getByText('Sign in unavailable')).toBeOnTheScreen();
    expect(screen.queryByText('Sign in')).toBeNull();
  });

  it('surfaces a handler failure instead of silently doing nothing', async () => {
    mockSupabaseConfigured = true;
    registerSignInHandler({
      signInWithEmail: async () =>
        failed('AUTH_BAD_CREDENTIALS', 'That email and password do not match.', true),
    });

    await renderScreen('sign-in', SignInScreen);
    await fireEvent.changeText(screen.getByTestId('input-email'), 'owner@example.com');
    await fireEvent.changeText(screen.getByTestId('input-password'), 'wrong');
    await fireEvent.press(screen.getByTestId('button-sign-in'));

    expect(await screen.findByTestId('sign-in-error')).toBeOnTheScreen();
    expect(screen.getByText('That email and password do not match.')).toBeOnTheScreen();
  });

  it('does not announce success itself - the session decides', async () => {
    mockSupabaseConfigured = true;
    registerSignInHandler({
      signInWithEmail: async () =>
        ready({ id: 'u1', email: 'owner@example.com', phone: null, displayName: null }, 'ts'),
    });

    await renderScreen('sign-in', SignInScreen);
    await fireEvent.changeText(screen.getByTestId('input-email'), 'owner@example.com');
    await fireEvent.changeText(screen.getByTestId('input-password'), 'correct');
    await fireEvent.press(screen.getByTestId('button-sign-in'));

    // No "Signed in" claim is rendered here. Redirecting is SessionProvider's
    // job, driven by a real session rather than an optimistic assumption.
    await waitFor(() => expect(screen.queryByTestId('sign-in-error')).toBeNull());
    expect(screen.queryByText(/signed in/i)).toBeNull();
  });
});
