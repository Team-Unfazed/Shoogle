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
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return { ...actual, isSupabaseConfigured: () => mockSupabaseConfigured };
});

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
          <Component />
        </ThemeProvider>
      ),
    },
    { initialUrl: `/${name}` },
  );
}

describe('Home', () => {
  it('renders without crashing and shows no invented data', async () => {
    await renderScreen('home', HomeScreen);
    expect(screen.getByTestId('screen-home')).toBeOnTheScreen();
    expect(screen.getByText('Nothing to act on yet')).toBeOnTheScreen();
    expect(screen.getByText('No data source connected')).toBeOnTheScreen();
    // No metric, score or percentage is fabricated on an unconfigured build.
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('0%')).toBeNull();
  });
});

describe('Posts', () => {
  it('renders and defaults to the Scheduled view', async () => {
    await renderScreen('posts', PostsScreen);
    expect(screen.getByTestId('screen-posts')).toBeOnTheScreen();
    // Product rule 4: scheduling is the default posture.
    expect(screen.getByRole('tab', { name: 'Scheduled' })).toBeSelected();
    expect(screen.getByText('Nothing scheduled')).toBeOnTheScreen();
  });

  it('does not claim anything has been published', async () => {
    await renderScreen('posts', PostsScreen);
    expect(screen.getByText('Posts')).toBeOnTheScreen();
    expect(screen.queryByText('Published 1')).toBeNull();
  });
});

describe('Business', () => {
  it('reports every provider as not connected', async () => {
    await renderScreen('business', BusinessScreen);
    expect(screen.getByTestId('screen-business')).toBeOnTheScreen();

    // All four providers are listed by name...
    expect(screen.getByText('Google Business Profile')).toBeOnTheScreen();
    expect(screen.getByText('Instagram')).toBeOnTheScreen();
    expect(screen.getByText('Facebook')).toBeOnTheScreen();
    expect(screen.getByText('LinkedIn')).toBeOnTheScreen();

    // ...and none is claimed to be connected.
    expect(screen.queryByText('Connected')).toBeNull();
  });

  it('shows an unmeasured score rather than a zero', async () => {
    await renderScreen('business', BusinessScreen);
    expect(screen.getByText('Not measured yet')).toBeOnTheScreen();
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('Settings', () => {
  it('renders and names the missing environment variables', async () => {
    await renderRouter(
      {
        settings: () => (
          <ThemeProvider forceScheme="light">
            <SessionProvider>
              <ToastProvider>
                <SettingsScreen />
              </ToastProvider>
            </SessionProvider>
          </ThemeProvider>
        ),
      },
      { initialUrl: '/settings' },
    );

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
