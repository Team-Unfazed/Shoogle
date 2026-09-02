/**
 * The Home aggregation.
 *
 * The rules under test are the ones that a rushed change would break:
 * independent facts stay independent, combined facts refuse to be partial,
 * nothing unknown becomes 0, and `not_connected` never becomes a red banner.
 */

import { failed, loading, ready, unavailable, type DataState } from '@/lib/state/DataState';
import type { Business, ProviderConnection } from '@/types/domain';
import {
  aggregateHome,
  businessIdentity,
  combinedTotal,
  deriveAlert,
  disconnectedSources,
  initialsFor,
  loadingSources,
  moduleRows,
  toMetricTile,
} from '../aggregate';
import type { HomeMetricSource, HomeSources } from '../types';

const AT = '2020-01-01T00:00:00.000Z';

const business: Business = {
  id: 'b1',
  name: 'Vahan Ready',
  category: 'other',
  locality: 'Nerul, Navi Mumbai',
  timezone: 'Asia/Kolkata',
};

function metric(key: string, state: HomeMetricSource['state']): HomeMetricSource {
  return { key, label: key, provider: 'google_business', state };
}

const readyMetric = (value: number, changePct: number | null = null) =>
  ready({ value, changePct }, AT);

/* -------------------------------------------------------------------------- */

describe('business identity', () => {
  it('takes initials from the first two words', () => {
    expect(initialsFor('Vahan Ready')).toBe('VR');
  });

  it('takes two letters from a single-word name', () => {
    expect(initialsFor('Shoogle')).toBe('SH');
  });

  it('ignores punctuation and extra whitespace', () => {
    expect(initialsFor("  Anita's   Salon  ")).toBe('AS');
  });

  it('returns a question mark rather than guessing a letter', () => {
    expect(initialsFor('')).toBe('?');
    expect(initialsFor('   ')).toBe('?');
    expect(initialsFor('!!!')).toBe('?');
  });

  it('is null until the business is actually loaded', () => {
    expect(businessIdentity(loading())).toBeNull();
    expect(businessIdentity(unavailable('not_connected', 'x'))).toBeNull();
    expect(businessIdentity(failed('E', 'x'))).toBeNull();
    expect(businessIdentity(ready(business, AT))).toEqual({
      name: 'Vahan Ready',
      locality: 'Nerul, Navi Mumbai',
      initials: 'VR',
    });
  });
});

/* -------------------------------------------------------------------------- */

describe('metric tiles are independent facts', () => {
  it('never turns a non-ready state into a number', () => {
    const states: DataState<{ value: number; changePct: number | null }>[] = [
      loading(),
      unavailable('not_connected', 'x'),
      unavailable('rate_limited', 'x'),
      failed('E_NET', 'x'),
    ];

    for (const state of states) {
      const tile = toMetricTile(metric('k', state));
      expect(tile.value).toBeNull();
      expect(tile.changePct).toBeNull();
      // The bug this guards: `value ?? 0` somewhere upstream.
      expect(tile.value).not.toBe(0);
    }
  });

  it('separates "still loading" from "cannot know"', () => {
    expect(toMetricTile(metric('k', loading())).isLoading).toBe(true);
    expect(toMetricTile(metric('k', unavailable('not_connected', 'x'))).isLoading).toBe(false);
  });

  it('names the reason a value is missing', () => {
    expect(toMetricTile(metric('k', unavailable('auth_expired', 'x'))).note).toBe(
      'Reconnect needed',
    );
    expect(toMetricTile(metric('k', failed('E', 'x'))).note).toBe('Could not load');
  });

  it('keeps a measured zero, which is not the same as unknown', () => {
    const tile = toMetricTile(metric('calls', readyMetric(0, 0)));
    expect(tile.value).toBe(0);
    expect(tile.changePct).toBe(0);
    expect(tile.note).toBeNull();
  });

  it('does not let one dead source blank the tile beside it', () => {
    const sources: HomeSources = {
      ...disconnectedSources(),
      metrics: [
        metric('google_views', readyMetric(1204, 12)),
        metric('ig_reach', unavailable('auth_expired', 'x')),
      ],
    };

    const [google, instagram] = aggregateHome(sources).metrics;
    expect(google?.value).toBe(1204);
    expect(instagram?.value).toBeNull();
    expect(instagram?.note).toBe('Reconnect needed');
  });
});

/* -------------------------------------------------------------------------- */

describe('combined facts refuse to be partial', () => {
  it('sums when every contributor is ready', () => {
    const total = combinedTotal([
      metric('a', readyMetric(100)),
      metric('b', readyMetric(23)),
    ]);
    expect(total).toMatchObject({ status: 'ready', value: 123 });
  });

  it('is unavailable when any contributor is not ready', () => {
    // The lie this prevents: reporting 100 as the total when b never loaded.
    const total = combinedTotal([
      metric('a', readyMetric(100)),
      metric('b', unavailable('auth_expired', 'x')),
    ]);
    expect(total.status).toBe('unavailable');
    expect(total).not.toMatchObject({ value: 100 });
  });

  it('propagates loading ahead of unavailable, so no half-filled total shows', () => {
    const total = combinedTotal([
      metric('a', loading()),
      metric('b', unavailable('not_connected', 'x')),
    ]);
    expect(total.status).toBe('loading');
  });

  it('treats an empty list as insufficient data, not as zero', () => {
    const total = combinedTotal([]);
    expect(total).toMatchObject({ status: 'unavailable', reason: 'insufficient_data' });
    expect(total).not.toMatchObject({ value: 0 });
  });

  it('marks the total as fixture-derived if any contributor was', () => {
    const total = combinedTotal([
      metric('a', ready({ value: 1, changePct: null }, AT, true)),
      metric('b', readyMetric(1)),
    ]);
    expect(total).toMatchObject({ status: 'ready', isFixture: true });
  });
});

/* -------------------------------------------------------------------------- */

describe('the connection alert', () => {
  const connections = (rows: ProviderConnection[]) => ready(rows, AT);

  const row = (
    provider: ProviderConnection['provider'],
    status: ProviderConnection['status'],
  ): ProviderConnection => ({ provider, status, handle: null, lastSyncedAt: null });

  it('does not nag about an account that was never connected', () => {
    expect(
      deriveAlert(connections([row('instagram', 'not_connected'), row('linkedin', 'not_connected')])),
    ).toBeNull();
  });

  it('raises expired access, which blocks scheduled work', () => {
    const alert = deriveAlert(connections([row('instagram', 'expired')]));
    expect(alert?.title).toBe('Instagram needs permission again');
    expect(alert?.actionLabel).toBe('Fix');
  });

  it('prefers expired over a plain error when both are present', () => {
    const alert = deriveAlert(
      connections([row('facebook', 'error'), row('instagram', 'expired')]),
    );
    expect(alert?.id).toBe('alert-instagram-expired');
  });

  it('says nothing at all until the connection list is known', () => {
    expect(deriveAlert(loading())).toBeNull();
    expect(deriveAlert(failed('E', 'x'))).toBeNull();
    expect(deriveAlert(unavailable('offline', 'x'))).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe('module subtitles', () => {
  const withSocial = (state: HomeSources['social']): HomeSources => ({
    ...disconnectedSources(),
    social: state,
  });

  it('never prints a zero it was not told', () => {
    for (const state of [
      loading(),
      unavailable('not_connected', 'x'),
      failed('E', 'x'),
    ] as HomeSources['social'][]) {
      const [social] = moduleRows(withSocial(state));
      expect(social?.subtitle).not.toMatch(/\b0\b/);
    }
  });

  it('distinguishes "we do not know" from "there is nothing"', () => {
    const [unknown] = moduleRows(withSocial(unavailable('not_connected', 'x')));
    expect(unknown?.subtitle).toBe('Not connected');

    const [measured] = moduleRows(
      withSocial(ready({ scheduledCount: 0, draftCount: 0, failedCount: 0 }, AT)),
    );
    expect(measured?.subtitle).toBe('Nothing scheduled yet');
  });

  it('omits an unknown keyword count instead of writing zero', () => {
    const rows = moduleRows({
      ...disconnectedSources(),
      seo: ready({ unansweredReviewCount: 2, improvedKeywordCount: null }, AT),
    });
    expect(rows[1]?.subtitle).toBe('2 reviews unanswered');
  });

  it('only emphasises a row from a state it actually has', () => {
    const [dark] = moduleRows(withSocial(unavailable('offline', 'x')));
    expect(dark?.emphasis).toBe(false);

    const [known] = moduleRows(
      withSocial(ready({ scheduledCount: 0, draftCount: 0, failedCount: 2 }, AT)),
    );
    expect(known?.emphasis).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe('the assembled view model', () => {
  it('is empty, not zeroed, when nothing is connected', () => {
    const home = aggregateHome(disconnectedSources());

    expect(home.isEmpty).toBe(true);
    expect(home.business).toBeNull();
    expect(home.headline).toBeNull();
    expect(home.alert).toBeNull();
    expect(home.metrics).toEqual([]);
    expect(home.isFixture).toBe(false);
    expect(home.hasUnreadNotifications).toBe(false);
  });

  it('reports loading without claiming to be empty of meaning', () => {
    const home = aggregateHome(loadingSources());
    expect(home.isLoading).toBe(true);
    expect(home.metrics).toEqual([]);
  });

  it('stops being empty as soon as one true thing is known', () => {
    const home = aggregateHome({
      ...disconnectedSources(),
      metrics: [metric('google_views', readyMetric(1204, 12))],
    });
    expect(home.isEmpty).toBe(false);
  });

  it('does not show a bell dot for an unread count it does not have', () => {
    expect(
      aggregateHome({ ...disconnectedSources(), unreadNotifications: loading() })
        .hasUnreadNotifications,
    ).toBe(false);

    expect(
      aggregateHome({ ...disconnectedSources(), unreadNotifications: ready(0, AT) })
        .hasUnreadNotifications,
    ).toBe(false);

    expect(
      aggregateHome({ ...disconnectedSources(), unreadNotifications: ready(3, AT) })
        .hasUnreadNotifications,
    ).toBe(true);
  });

  it('carries the fixture flag up from any contributing source', () => {
    const home = aggregateHome({
      ...disconnectedSources(),
      business: ready(business, AT, true),
    });
    expect(home.isFixture).toBe(true);
  });

  it('always offers the three module rows, even knowing nothing', () => {
    expect(aggregateHome(disconnectedSources()).modules.map((m) => m.id)).toEqual([
      'social',
      'seo',
      'website',
    ]);
  });
});
