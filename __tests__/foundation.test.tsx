import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DataStateView } from '@/components/shared';
import { Text } from '@/components/ui';
import { isFixtureModeEnabled } from '@/lib/env';
import {
  ALL_PROVIDER_IDS,
  clearProviderRegistry,
  getProvider,
  isProviderRegistered,
  registerProvider,
} from '@/lib/providers';
import { failed, loading, ready, unavailable } from '@/lib/state/DataState';
import { getFixtures } from '@/fixtures';
import { lightColors, darkColors, control, radii, typography } from '@/theme/tokens';
import { ThemeProvider } from '@/theme';

const metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

function wrap(ui: ReactNode) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider forceScheme="light">{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('provider registry', () => {
  afterEach(() => clearProviderRegistry());

  it('reports every provider as not connected before anything is registered', async () => {
    for (const id of ALL_PROVIDER_IDS) {
      expect(isProviderRegistered(id)).toBe(false);
      const state = await getProvider(id).getConnection();
      expect(state.status).toBe('unavailable');
      expect(state.status === 'unavailable' && state.reason).toBe('not_connected');
    }
  });

  it('never fabricates a connected state or a handle', async () => {
    const state = await getProvider('instagram').getConnection();
    expect(state.status).not.toBe('ready');
    // No handle, token or account identifier is invented anywhere in the payload.
    expect(JSON.stringify(state)).not.toMatch(/@/);
    expect(JSON.stringify(state)).not.toMatch(/"handle"/);
  });

  it('lets a feature register a real implementation without editing the registry', async () => {
    registerProvider('instagram', {
      id: 'instagram',
      displayName: 'Instagram',
      getConnection: async () =>
        ready(
          {
            provider: 'instagram' as const,
            status: 'connected' as const,
            handle: '@example',
            grantedScopes: [],
            lastSyncedAt: null,
          },
          'ts',
        ),
      connect: async () => unavailable('not_supported', 'x'),
      disconnect: async () => unavailable('not_supported', 'x'),
    });

    expect(isProviderRegistered('instagram')).toBe(true);
    const state = await getProvider('instagram').getConnection();
    expect(state.status).toBe('ready');
    // Other providers are unaffected — features stay isolated.
    expect(isProviderRegistered('linkedin')).toBe(false);
  });
});

describe('DataStateView', () => {
  it('renders content only when the value is genuinely known', async () => {
    await wrap(
      <DataStateView state={ready(5, 'ts')}>
        {(value) => <Text>{`value ${value}`}</Text>}
      </DataStateView>,
    );
    expect(screen.getByText('value 5')).toBeOnTheScreen();
  });

  it('never invokes the render prop for a loading state', async () => {
    const child = jest.fn(() => <Text>never</Text>);
    await wrap(<DataStateView state={loading()}>{child}</DataStateView>);
    // A skeleton is shown, and the render prop is never reached.
    expect(screen.getByLabelText('Loading')).toBeOnTheScreen();
    expect(child).not.toHaveBeenCalled();
    expect(screen.queryByText('never')).toBeNull();
  });

  it('explains why data is unavailable instead of showing nothing', async () => {
    await wrap(
      <DataStateView state={unavailable('not_connected', 'Connect Instagram to see this.')}>
        {() => <Text>never</Text>}
      </DataStateView>,
    );
    expect(screen.getByText('Not connected')).toBeOnTheScreen();
    expect(screen.getByText('Connect Instagram to see this.')).toBeOnTheScreen();
  });

  it('offers retry for a retryable error', async () => {
    await wrap(
      <DataStateView state={failed('E1', 'Could not load.', true)} onRetry={() => {}}>
        {() => <Text>never</Text>}
      </DataStateView>,
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('withholds retry for a terminal error, even when a handler is passed', async () => {
    await wrap(
      <DataStateView state={failed('E2', 'Could not load.', false)} onRetry={() => {}}>
        {() => <Text>never</Text>}
      </DataStateView>,
    );
    // The error itself must still be visible - we withhold the retry, not the news.
    expect(screen.getByText('Could not load.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('treats a ready-but-empty collection as "nothing yet"', async () => {
    await wrap(
      <DataStateView
        state={ready<number[]>([], 'ts')}
        emptyWhen={(v) => v.length === 0}
        emptyTitle="No posts">
        {() => <Text>never</Text>}
      </DataStateView>,
    );
    expect(screen.getByText('No posts')).toBeOnTheScreen();
    expect(screen.queryByText('never')).toBeNull();
  });
});

describe('fixture safety', () => {
  it('is disabled unless explicitly enabled in development', () => {
    // EXPO_PUBLIC_ENABLE_FIXTURES is unset in the test environment.
    expect(isFixtureModeEnabled()).toBe(false);
    expect(getFixtures()).toBeNull();
  });
});

describe('design tokens', () => {
  it('matches the values transcribed from the Claude Design project', () => {
    expect(lightColors.bg).toBe('#f5f6f8');
    expect(lightColors.blue).toBe('#2f7ad6');
    expect(lightColors.green).toBe('#17a97f');
    expect(lightColors.amber).toBe('#e0900f');
    expect(lightColors.red).toBe('#d9534f');
    expect(darkColors.bg).toBe('#0d0d0d');
    expect(darkColors.blue).toBe('#378add');
  });

  it('defines the same semantic roles in light and dark', () => {
    expect(Object.keys(lightColors).sort()).toEqual(Object.keys(darkColors).sort());
  });

  it('keeps the control geometry from the design system', () => {
    expect(control.buttonPrimaryHeight).toBe(54);
    expect(control.buttonSecondaryHeight).toBe(50);
    expect(control.minTouchTarget).toBe(44);
    expect(radii.md).toBe(15);
    expect(radii.sheet).toBe(26);
  });

  it('uses Sora for display and Manrope for UI text', () => {
    expect(typography.display.fontFamily).toContain('Sora');
    expect(typography.screenTitle.fontFamily).toContain('Sora');
    expect(typography.body.fontFamily).toContain('Manrope');
    expect(typography.label.fontFamily).toContain('Manrope');
  });
});
