import { isReady, isUnavailable, unwrapOrNull } from '@/lib/state/DataState';

import {
  applyPublishOutcome,
  createInMemoryPostStore,
  createSocialPublisher,
  newTarget,
  toDomainPost,
  type PlatformPublisher,
  type PublishOutcome,
  type ShooglePublisher,
  type SocialPost,
} from '../index';

const IST = 'Asia/Kolkata';
const NOW = new Date('2026-08-31T04:00:00.000Z');
const LATER = '2026-09-02T03:30:00.000Z';

function build(publishers: Partial<Record<'instagram' | 'google_business', PlatformPublisher>> = {}, seed: SocialPost[] = []) {
  const store = createInMemoryPostStore(seed);
  const publisher: ShooglePublisher = createSocialPublisher({
    store,
    publishers,
    businessId: 'b1',
    timeZone: IST,
    now: () => NOW,
    newId: (() => {
      let n = 0;
      return () => {
        n += 1;
        return `id-${n}`;
      };
    })(),
  });
  return { store, publisher };
}

function fakeAdapter(platform: 'instagram' | 'google_business', outcome: PublishOutcome): PlatformPublisher {
  return { platform, publishNow: async () => outcome };
}

/**
 * THE CENTRAL GUARANTEE OF THIS FEATURE: with no platform adapter wired up —
 * which is the app's actual state today — nothing is stored, nothing is sent,
 * and nothing is claimed.
 */
describe('with no integration built', () => {
  it('reports no reachable targets, as a known zero rather than unknown', async () => {
    const { publisher } = build();
    const state = await publisher.availableTargets();
    expect(isReady(state)).toBe(true);
    expect(unwrapOrNull(state)).toEqual([]);
  });

  it('refuses to accept a schedule instead of queueing a post nobody will send', async () => {
    const { publisher, store } = build();
    const state = await publisher.schedule({
      body: 'Monsoon offer',
      mediaUris: [],
      targets: ['instagram'],
      scheduledFor: LATER,
    });

    expect(isUnavailable(state)).toBe(true);
    if (isUnavailable(state)) {
      expect(state.reason).toBe('not_connected');
      expect(state.message).toMatch(/no social account is connected/i);
    }
    // Nothing was written. This is the assertion that matters.
    expect(await store.list()).toHaveLength(0);
  });

  /**
   * REVERSED BY PRODUCT RULE 13 on 2026-09-11.
   *
   * This test used to assert that a partly-reachable post was refused
   * ENTIRELY — that targeting Instagram and Google Business with only
   * Instagram connected stored nothing at all.
   *
   * That was the coupling the rule forbids: an unconnected Google Business
   * cost the owner their Instagram post. The refusal was written to stop
   * Shoogle queueing work nobody would send, which is right about a target
   * nobody can reach and wrong about the reachable one sitting next to it.
   *
   * The guarantee it was protecting survives intact — see the test above,
   * where nothing is reachable and nothing is stored — and the per-target
   * behaviour is covered in full by `independence.test.ts`.
   */
  it('schedules the reachable targets instead of refusing the whole post', async () => {
    const { publisher, store } = build({
      instagram: fakeAdapter('instagram', { ok: true, remoteId: 'r', permalink: null, publishedAt: NOW.toISOString() }),
    });
    const state = await publisher.schedule({
      body: 'x',
      mediaUris: [],
      targets: ['instagram', 'google_business'],
      scheduledFor: LATER,
    });

    expect(isUnavailable(state)).toBe(false);
    expect(await store.list()).toHaveLength(1);

    // Google Business is NOT pre-marked skipped. Availability now is not
    // availability at due time, so each target is judged when attempted.
    const [stored] = await store.list();
    expect(stored?.targets.map((t) => t.status)).toEqual(['not_attempted', 'not_attempted']);
  });

  it('names the platform it cannot reach, in words an owner recognises', async () => {
    const { publisher } = build({
      instagram: fakeAdapter('instagram', { ok: true, remoteId: 'r', permalink: null, publishedAt: NOW.toISOString() }),
    });
    const state = await publisher.schedule({
      body: 'x',
      mediaUris: [],
      targets: ['google_business'],
      scheduledFor: LATER,
    });

    expect(isUnavailable(state)).toBe(true);
    // "Google Business", not "google_business" — a salon owner reads this.
    if (isUnavailable(state)) expect(state.message).toMatch(/Google Business/);
  });
});

describe('scheduling', () => {
  const adapter = fakeAdapter('instagram', {
    ok: true,
    remoteId: 'remote-1',
    permalink: 'https://example.invalid/p/1',
    publishedAt: '2026-09-02T03:30:05.000Z',
  });

  it('stores a scheduled post once an adapter exists', async () => {
    const { publisher, store } = build({ instagram: adapter });
    const state = await publisher.schedule({
      body: 'Monsoon offer\nsecond line',
      mediaUris: ['file:///a.jpg'],
      targets: ['instagram'],
      scheduledFor: LATER,
    });

    expect(isReady(state)).toBe(true);
    const stored = await store.get('id-1');
    expect(stored?.state).toBe('scheduled');
    expect(stored?.schedule?.dueAt).toBe(LATER);
    expect(stored?.title).toBe('Monsoon offer');
    expect(stored?.targets[0]?.status).toBe('not_attempted');
  });

  it('never guesses a picked file’s format', async () => {
    const { publisher, store } = build({ instagram: adapter });
    await publisher.schedule({
      body: 'x',
      mediaUris: ['file:///photo.jpg'],
      targets: ['instagram'],
      scheduledFor: LATER,
    });
    // The extension says jpg. Shoogle has not probed it, so it says 'unknown'.
    expect((await store.get('id-1'))?.media[0]?.format).toBe('unknown');
  });

  it('gives "post now" a schedule due immediately rather than no schedule', async () => {
    const { publisher, store } = build({ instagram: adapter });
    await publisher.schedule({ body: 'x', mediaUris: [], targets: ['instagram'], scheduledFor: null });
    const stored = await store.get('id-1');
    expect(stored?.state).toBe('scheduled');
    expect(stored?.schedule?.dueAt).toBe(NOW.toISOString());
  });

  it('rejects an invalid schedule with the owner-facing reason', async () => {
    const { publisher } = build({ instagram: adapter });
    const state = await publisher.schedule({
      body: 'x',
      mediaUris: [],
      targets: ['instagram'],
      scheduledFor: '2020-01-01T00:00:00.000Z',
    });
    expect(state.status).toBe('error');
    if (state.status === 'error') expect(state.code).toBe('schedule_in_the_past');
  });

  it('rejects a post with no target', async () => {
    const { publisher } = build({ instagram: adapter });
    const state = await publisher.schedule({ body: 'x', mediaUris: [], targets: [], scheduledFor: LATER });
    expect(state.status).toBe('error');
  });
});

describe('publishing', () => {
  it('marks a target published only with a remote id from the provider', async () => {
    const target = newTarget('instagram');
    const success = applyPublishOutcome(target, {
      ok: true,
      remoteId: 'remote-1',
      permalink: null,
      publishedAt: NOW.toISOString(),
    });
    expect(success.status).toBe('succeeded');
    expect(success.remoteId).toBe('remote-1');

    const failure = applyPublishOutcome(target, {
      ok: false,
      failure: { code: 'auth_expired', kind: 'authorization', message: 'Reconnect Instagram.', retryable: true },
    });
    expect(failure.status).toBe('failed');
    expect(failure.remoteId).toBeNull();
    expect(failure.permalink).toBeNull();
  });

  it('passes through publishing on the way to published', async () => {
    const seen: string[] = [];
    const adapter: PlatformPublisher = {
      platform: 'instagram',
      publishNow: async (post) => {
        seen.push(post.state);
        return { ok: true, remoteId: 'r1', permalink: null, publishedAt: NOW.toISOString() };
      },
    };
    const { publisher, store } = build({ instagram: adapter });
    await publisher.schedule({ body: 'x', mediaUris: [], targets: ['instagram'], scheduledFor: LATER });

    await publisher.attemptPublish('id-1');

    // The adapter saw the post already in `publishing`, so a crash mid-flight
    // cannot leave it looking merely scheduled.
    expect(seen).toEqual(['publishing']);
    expect((await store.get('id-1'))?.state).toBe('published');
  });

  it('lands on failed, with the provider reason, when the provider refuses', async () => {
    const { publisher, store } = build({
      instagram: fakeAdapter('instagram', {
        ok: false,
        failure: { code: 'auth_expired', kind: 'authorization', message: 'Instagram permission expired.', retryable: true },
      }),
    });
    await publisher.schedule({ body: 'x', mediaUris: [], targets: ['instagram'], scheduledFor: LATER });

    const state = await publisher.attemptPublish('id-1');
    expect(isReady(state)).toBe(true);

    const stored = await store.get('id-1');
    expect(stored?.state).toBe('failed');
    expect(stored?.targets[0]?.failure?.message).toBe('Instagram permission expired.');
    expect(stored?.targets[0]?.remoteId).toBeNull();
  });

  it('reports no insights just because a post went out', async () => {
    const { publisher, store } = build({
      instagram: fakeAdapter('instagram', {
        ok: true,
        remoteId: 'r1',
        permalink: null,
        publishedAt: NOW.toISOString(),
      }),
    });
    await publisher.schedule({ body: 'x', mediaUris: [], targets: ['instagram'], scheduledFor: LATER });
    await publisher.attemptPublish('id-1');
    // Publishing tells us it went out, not how it did. Nobody has counted yet.
    expect((await store.get('id-1'))?.insights).toBeNull();
  });

  it('refuses to publish a post that is not scheduled', async () => {
    const { publisher } = build({
      instagram: fakeAdapter('instagram', {
        ok: true,
        remoteId: 'r',
        permalink: null,
        publishedAt: NOW.toISOString(),
      }),
    });
    const state = await publisher.attemptPublish('nope');
    expect(state.status).toBe('error');
  });
});

describe('owner control — product rule 5', () => {
  const adapter = fakeAdapter('instagram', {
    ok: true,
    remoteId: 'r',
    permalink: null,
    publishedAt: NOW.toISOString(),
  });

  it('cancels a scheduled post back to ready and clears its slot', async () => {
    const { publisher, store } = build({ instagram: adapter });
    await publisher.schedule({ body: 'x', mediaUris: [], targets: ['instagram'], scheduledFor: LATER });

    await publisher.cancelScheduled('id-1');
    const stored = await store.get('id-1');
    expect(stored?.state).toBe('ready');
    expect(stored?.schedule).toBeNull();
  });

  it('skips an occurrence and marks its unattempted targets skipped', async () => {
    const { publisher, store } = build({ instagram: adapter });
    await publisher.schedule({ body: 'x', mediaUris: [], targets: ['instagram'], scheduledFor: LATER });

    const state = await publisher.skipOccurrence('id-1');
    expect(isReady(state)).toBe(true);
    const stored = await store.get('id-1');
    expect(stored?.state).toBe('skipped');
    expect(stored?.targets[0]?.status).toBe('skipped');
  });

  it('refuses to skip a published post rather than rewriting history', async () => {
    const { publisher } = build({ instagram: adapter });
    await publisher.schedule({ body: 'x', mediaUris: [], targets: ['instagram'], scheduledFor: LATER });
    await publisher.attemptPublish('id-1');

    const state = await publisher.skipOccurrence('id-1');
    expect(state.status).toBe('error');
    if (state.status === 'error') expect(state.code).toBe('cannot_skip');
  });
});

describe('projection onto the shared Post type', () => {
  it('carries a permalink only for a confirmed target', () => {
    const base: SocialPost = {
      id: 'p1',
      businessId: 'b1',
      title: 'x',
      state: 'scheduled',
      content: {},
      media: [],
      carouselId: null,
      schedule: { dueAt: LATER, timeZone: IST, owner: 'shoogle' },
      targets: [newTarget('instagram')],
      insights: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };

    const domain = toDomainPost(base);
    expect(domain.status).toBe('scheduled');
    expect(domain.targets[0]).toEqual({ provider: 'instagram', status: 'scheduled', url: null });
  });
});
