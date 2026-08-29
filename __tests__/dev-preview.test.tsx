import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import SignInScreen from '@/app/(auth)/sign-in';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { ThemeProvider } from '@/theme';

/**
 * Development preview mode.
 *
 * The bypass exists so the shell can be walked before authentication is built.
 * These tests exist to make sure it can NEVER be reachable in a release build,
 * and that it never claims anyone is signed in.
 */
let mockDevPreview = false;
jest.mock('@/lib/env', () => {
  const actual = jest.requireActual('@/lib/env');
  return { ...actual, isDevPreviewEnabled: () => mockDevPreview };
});

function renderSignIn() {
  return renderRouter(
    {
      'sign-in': () => (
        <ThemeProvider forceScheme="light">
          <SessionProvider>
            <SignInScreen />
          </SessionProvider>
        </ThemeProvider>
      ),
    },
    { initialUrl: '/sign-in' },
  );
}

afterEach(() => {
  mockDevPreview = false;
});

it('hides the preview entry point when the flag is off', async () => {
  mockDevPreview = false;
  await renderSignIn();
  expect(screen.getByTestId('screen-sign-in')).toBeOnTheScreen();
  expect(screen.queryByTestId('button-dev-preview')).toBeNull();
});

it('offers the preview entry point only when the flag is on', async () => {
  mockDevPreview = true;
  await renderSignIn();
  expect(screen.getByTestId('button-dev-preview')).toBeOnTheScreen();
});

it('never describes preview as being signed in', async () => {
  mockDevPreview = true;
  await renderSignIn();
  const label = screen.getByTestId('button-dev-preview').props.accessibilityLabel as string;
  expect(label.toLowerCase()).toContain('without signing in');
  expect(label.toLowerCase()).not.toMatch(/\bsign in\b(?! )/);
});

it('pressing preview does not fabricate a session or claim success', async () => {
  mockDevPreview = true;
  await renderSignIn();
  await fireEvent.press(screen.getByTestId('button-dev-preview'));

  // No success message, and no invented account details anywhere on screen.
  expect(screen.queryByText(/signed in/i)).toBeNull();
  expect(screen.queryByText(/welcome back/i)).toBeNull();
});

describe('the real gate', () => {
  /**
   * This is the important one. The bypass must be impossible in a release
   * build regardless of what any env file says, because __DEV__ is false there.
   */
  it('isDevPreviewEnabled is false whenever __DEV__ is false', () => {
    const actual = jest.requireActual('@/lib/env');
    const original = (globalThis as { __DEV__?: boolean }).__DEV__;
    try {
      (globalThis as { __DEV__?: boolean }).__DEV__ = false;
      expect(actual.isDevPreviewEnabled()).toBe(false);
      // Fixture mode is gated the same way.
      expect(actual.isFixtureModeEnabled()).toBe(false);
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = original;
    }
  });
});
