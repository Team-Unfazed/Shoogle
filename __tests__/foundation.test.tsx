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
import {
  BUSINESS_ROLES,
  isRole,
  ROLE_LABEL,
  sameMembership,
  type Business,
  type BusinessMember,
  type Role,
} from '@/types/domain';
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

  it('knows exactly three providers, and LinkedIn is not one of them', () => {
    // LinkedIn was removed from the product on 2026-09-16, type included. This
    // is the type/registry-level guard; `screens.test.tsx` holds the screen-level
    // one. Both matter: a provider id reaching `provider_connections` that the
    // product does not support would be a value the database enum cannot hold.
    expect([...ALL_PROVIDER_IDS]).toEqual(['google_business', 'instagram', 'facebook']);
    expect(ALL_PROVIDER_IDS).toHaveLength(3);
    expect((ALL_PROVIDER_IDS as readonly string[])).not.toContain('linkedin');
  });

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
    expect(isProviderRegistered('facebook')).toBe(false);
    expect(isProviderRegistered('google_business')).toBe(false);
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

/**
 * `Business` is shared foundation, so the shape a newly created business has is
 * pinned here rather than left to whichever feature happens to read it first.
 *
 * The property under test is that "nobody has told us" is REPRESENTABLE. A type
 * where `name` and `category` were non-null would force `create_business()` to
 * invent an answer, and an invented business name is not inert: it would be
 * added to the facts `features/social/generation` lets a model assert, so the
 * anti-fabrication guard would approve a caption naming a business that has no
 * such name. Same principle as `Metric`/`Score` being `number | null` — unknown
 * is not zero, and it is not a placeholder either.
 */
describe('a newly created business', () => {
  it('can represent "not told us yet" without inventing a name or a category', () => {
    // This is the row create_business() leaves behind. It must typecheck.
    const bare: Business = {
      id: '00000000-0000-0000-0000-000000000000',
      name: null,
      category: null,
      // Neighbourhood and city are separate, and neither is ever inferred from
      // the other — a business placed in the wrong neighbourhood is worse for
      // local search than one with no neighbourhood at all.
      locality: null,
      city: null,
      // Infrastructure, not a claim about the business: scheduling needs a zone
      // from the first moment, so this one is defaulted rather than nullable.
      timezone: 'Asia/Kolkata',
    };

    expect(bare.name).toBeNull();
    expect(bare.category).toBeNull();
    expect(bare.locality).toBeNull();
    expect(bare.city).toBeNull();
    expect(bare.timezone).toBe('Asia/Kolkata');
  });

  it('keeps a named business expressible, so filling the fields in is an ordinary update', () => {
    const named: Business = {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Sunrise Salon',
      category: 'salon',
      locality: 'Nerul',
      city: 'Navi Mumbai',
      timezone: 'Asia/Kolkata',
    };

    expect(named.name).toBe('Sunrise Salon');
    expect(named.category).toBe('salon');
    // Stored apart, so a later Google hydration can fill one without inventing
    // the other from it.
    expect(named.locality).toBe('Nerul');
    expect(named.city).toBe('Navi Mumbai');
  });

  it('lets locality and city be known independently of each other', () => {
    // Neither is derivable from the other, so all four combinations are real
    // states a business can be in. Knowing the city does not license guessing
    // the neighbourhood, and a post that places a salon in the wrong
    // neighbourhood is worse for local search than one that names none.
    const base = {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Sunrise Salon',
      category: 'salon',
      timezone: 'Asia/Kolkata',
    } as const;

    const cityOnly: Business = { ...base, locality: null, city: 'Navi Mumbai' };
    const localityOnly: Business = { ...base, locality: 'Nerul', city: null };

    expect(cityOnly.locality).toBeNull();
    expect(cityOnly.city).toBe('Navi Mumbai');
    expect(localityOnly.locality).toBe('Nerul');
    expect(localityOnly.city).toBeNull();
  });
});

/**
 * Membership is shared foundation, so the shape is pinned here rather than left
 * to whichever feature reads it first.
 *
 * These are type- and helper-level tests only. Nothing about Supabase, RLS or
 * `create_business()` is asserted, because none of them exists — the
 * last-owner guarantee in particular belongs to a database trigger, and a test
 * here claiming to verify it would be testing a promise nobody has made.
 */
describe('business membership', () => {
  const member = (over: Partial<BusinessMember> = {}): BusinessMember => ({
    businessId: '00000000-0000-0000-0000-0000000000b1',
    userId: '00000000-0000-0000-0000-0000000000u1',
    role: 'member',
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
    ...over,
  });

  it('has exactly two roles, owner and member', () => {
    expect([...BUSINESS_ROLES]).toEqual(['owner', 'member']);
  });

  it('gives each role an owner-facing name, not an enum value', () => {
    expect(ROLE_LABEL.owner).toBe('Owner');
    expect(ROLE_LABEL.member).toBe('Member');
  });

  it('represents an owner', () => {
    const owner = member({ role: 'owner' });
    expect(owner.role).toBe('owner');
  });

  it('represents a member', () => {
    expect(member().role).toBe('member');
  });

  it('lets one business have several owners', () => {
    // Single-owner would make succession a support ticket and a lost account
    // unrecoverable, so more than one has to be expressible.
    const owners: BusinessMember[] = [
      member({ userId: 'u-1', role: 'owner' }),
      member({ userId: 'u-2', role: 'owner' }),
    ];
    expect(owners.filter((m) => m.role === 'owner')).toHaveLength(2);
    expect(owners.every((m) => m.businessId === owners[0]?.businessId)).toBe(true);
  });

  it('lets one user belong to several businesses', () => {
    const memberships: BusinessMember[] = [
      member({ businessId: 'b-1', role: 'owner' }),
      member({ businessId: 'b-2', role: 'member' }),
    ];
    expect(new Set(memberships.map((m) => m.userId)).size).toBe(1);
    expect(new Set(memberships.map((m) => m.businessId)).size).toBe(2);
  });

  describe('identity is the (businessId, userId) pair', () => {
    it('treats the same pair as one membership even when the roles differ', () => {
      // A stale copy and a fresh one are the same membership at two times, not
      // two memberships. The role is not part of the identity.
      expect(sameMembership(member({ role: 'member' }), member({ role: 'owner' }))).toBe(true);
    });

    it('separates the same user in two businesses', () => {
      expect(sameMembership(member({ businessId: 'b-1' }), member({ businessId: 'b-2' }))).toBe(false);
    });

    it('separates two users in one business', () => {
      expect(sameMembership(member({ userId: 'u-1' }), member({ userId: 'u-2' }))).toBe(false);
    });
  });

  describe('isRole', () => {
    it('accepts the roles Shoogle recognises', () => {
      expect(isRole('owner')).toBe(true);
      expect(isRole('member')).toBe(true);
    });

    it('refuses a role it cannot interpret rather than letting it pass', () => {
      // A role nobody can interpret must never read as a permission.
      expect(isRole('admin')).toBe(false);
      expect(isRole('superuser')).toBe(false);
      expect(isRole('Owner')).toBe(false);
      expect(isRole('')).toBe(false);
      expect(isRole(undefined)).toBe(false);
      expect(isRole(null)).toBe(false);
      expect(isRole(0)).toBe(false);
    });

    it('narrows to Role so a checked string is usable as one', () => {
      const raw: unknown = 'owner';
      if (!isRole(raw)) throw new Error('expected a role');
      const role: Role = raw;
      expect(ROLE_LABEL[role]).toBe('Owner');
    });
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
