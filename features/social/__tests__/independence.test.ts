import { isUnavailable, unwrapOrNull } from '@/lib/state/DataState';

import {
  availabilityFor,
  availabilityForAll,
  availablePlatforms,
  buildPostsView,
  createInMemoryPostStore,
  createSocialPublisher,
  REQUIRED_SCOPES,
  selectableTargets,
  SOCIAL_PLATFORMS,
  targetsNeedingAttention,
  wasSkippedForUnavailability,
  type Platform,
  type PlatformConnection,
  type MediaHost,
  type MediaPreparer,
  type PlatformPublisher,
  type PreparedMedia,
  type PublishOutcome,
  type ShooglePublisher,
  type SocialPost,
} from '../index';
import { mintPublishableMedia } from '../index';
import { ready } from '@/lib/state/DataState';

/**
 * PRODUCT RULE 13 — ONE PLATFORM NEVER BLOCKS ANOTHER.
 *
 * This is a hard acceptance criterion, not a UI preference, so it is a test
 * suite rather than a paragraph. Every row of the product owner's matrix is
 * below, in their words.
 *
 * The rule that generates all of it: an owner with an Instagram professional
 * account and no Facebook Page must be able to use Shoogle's Instagram
 * features normally. Meta may require a Page to publish TO FACEBOOK; that
 * requirement belongs to the Facebook connection and nowhere else.
 */

const IST = 'Asia/Kolkata';
const NOW = new Date('2026-09-11T04:00:00.000Z');

/* -- Connection builders --------------------------------------------------- */

function connected(platform: Platform, over: Partial<PlatformConnection> = {}): PlatformConnection {
  return {
    platform,
    authorization: 'valid',
    grantedScopes: [...REQUIRED_SCOPES[platform]],
    accountLabel: `@${platform}`,
    // Facebook is the only platform that reads this; a Page id here is
    // meaningless anywhere else and is ignored.
    eligiblePageIds: platform === 'facebook' ? ['page-1'] : null,
    providerApproval: platform === 'google_business' ? 'granted' : 'not_required',
    ...over,
  };
}

const withAdapter = (connection: PlatformConnection | null) => ({ connection, hasAdapter: true });

/* -- Publisher builders ---------------------------------------------------- */

function adapterFor(platform: Platform, outcome: PublishOutcome): PlatformPublisher {
  return { platform, publishNow: async () => outcome };
}

const publishes = (remoteId: string): PublishOutcome => ({
  ok: true,
  remoteId,
  permalink: `https://example.invalid/${remoteId}`,
  publishedAt: NOW.toISOString(),
});

/*
 * Instagram cannot publish without media — `InstagramFormat` has no text-only
 * member — so any acceptance case that expects Instagram to publish has to give
 * it a photo, and therefore a working preparer and host. Facebook and Google
 * publish words alone and need neither.
 *
 * These two fakes stand in for the real pipeline, which is unimplemented.
 */
const testPreparer: MediaPreparer = {
  id: 'test',
  isConfigured: () => true,
  prepare: async (source, platform) =>
    ready<PreparedMedia>(
      {
        source,
        uri: `file:///prepared/${source.id}.jpg`,
        kind: 'image',
        format: 'jpeg',
        width: 1080,
        height: 1350,
        byteSize: 400_000,
        preparedFor: platform,
        changes: [],
      },
      NOW.toISOString(),
    ),
};

const testHost: MediaHost = {
  id: 'test',
  displayName: 'Test host',
  isConfigured: () => true,
  publish: async (artifact) => {
    const minted = mintPublishableMedia({
      kind: artifact.kind,
      url: `https://cdn.example.invalid/${artifact.source.id}.jpg`,
      contentType: 'image/jpeg',
      byteSize: artifact.byteSize,
      width: artifact.width,
      height: artifact.height,
      durationSeconds: null,
      preparedFor: artifact.preparedFor,
      handle: `h-${artifact.source.id}`,
      hostedAt: NOW.toISOString(),
    });
    if (minted === null) throw new Error('test host produced an unpublishable URL');
    return ready(minted, NOW.toISOString());
  },
  revoke: async () => ready(undefined, NOW.toISOString()),
};

function publisherWith(publishers: Partial<Record<Platform, PlatformPublisher>>) {
  const store = createInMemoryPostStore([]);
  const publisher: ShooglePublisher = createSocialPublisher({
    store,
    publishers,
    preparer: testPreparer,
    mediaHost: testHost,
    businessId: 'b1',
    timeZone: IST,
    now: () => NOW,
    newId: (() => {
      let n = 0;
      return () => `id-${(n += 1)}`;
    })(),
  });
  return { store, publisher };
}

/** Schedule a post at the three platforms given, then run the runner on it. */
async function scheduleThenPublish(
  publisher: ShooglePublisher,
  store: ReturnType<typeof createInMemoryPostStore>,
  targets: Platform[],
) {
  const scheduled = await publisher.schedule({
    body: 'A real caption.',
    // A photo, because Instagram cannot publish without one. Facebook and
    // Google take it too, so one schedule serves every acceptance case.
    mediaUris: ['file:///storage/photo.jpg'],
    targets,
    scheduledFor: null, // post now
  });
  const post = unwrapOrNull(scheduled);
  if (post === null) return { scheduled, post: null, final: null };
  await publisher.attemptPublish(post.id);
  return { scheduled, post, final: await store.get(post.id) };
}

function targetOn(post: SocialPost, platform: Platform) {
  const target = post.targets.find((t) => t.platform === platform);
  if (target === undefined) throw new Error(`no ${platform} target`);
  return target;
}

/* ========================================================================== */
/* availabilityFor is structurally incapable of cross-platform reads          */
/* ========================================================================== */

describe('availabilityFor is scoped to a single platform', () => {
  it('judges Instagram without being given any other platform', () => {
    // The signature is the enforcement: there is no second connection, no
    // registry and no lookup in scope, so "check Facebook first" cannot be
    // written here at all.
    const result = availabilityFor('instagram', withAdapter(connected('instagram')));
    expect(result.available).toBe(true);
  });

  it('refuses to judge one platform on another’s connection', () => {
    expect(() => availabilityFor('instagram', withAdapter(connected('facebook')))).toThrow(
      /judged only on its own/,
    );
  });

  it('gives every unavailable platform its own reason and its own action', () => {
    const all = availabilityForAll({
      instagram: withAdapter(connected('instagram')),
      facebook: withAdapter(connected('facebook', { eligiblePageIds: [] })),
      google_business: withAdapter(connected('google_business', { providerApproval: 'pending' })),
    });

    expect(all.instagram.available).toBe(true);
    expect(all.facebook).toMatchObject({ available: false, reason: 'no_eligible_page' });
    expect(all.google_business).toMatchObject({
      available: false,
      reason: 'awaiting_provider_approval',
    });
  });

  it('never mentions another platform in a platform’s own message', () => {
    const facebook = availabilityFor(
      'facebook',
      withAdapter(connected('facebook', { authorization: 'expired' })),
    );
    expect(facebook.available).toBe(false);
    if (!facebook.available) {
      expect(facebook.message).toMatch(/Facebook/);
      expect(facebook.message).not.toMatch(/Instagram|Google/);
    }
  });
});

/* ========================================================================== */
/* THE ACCEPTANCE MATRIX                                                      */
/* ========================================================================== */

describe('acceptance: Instagram only → publishes normally', () => {
  it('offers Instagram with no Facebook or Google connection anywhere', () => {
    const all = availabilityForAll({ instagram: withAdapter(connected('instagram')) });
    expect(all.instagram.available).toBe(true);
    expect(availablePlatforms(all)).toEqual(['instagram']);
  });

  it('schedules and publishes to Instagram alone', async () => {
    const { store, publisher } = publisherWith({
      instagram: adapterFor('instagram', publishes('ig-1')),
    });
    const { final } = await scheduleThenPublish(publisher, store, ['instagram']);

    expect(final?.state).toBe('published');
    expect(targetOn(final!, 'instagram')).toMatchObject({
      status: 'succeeded',
      remoteId: 'ig-1',
    });
  });
});

describe('acceptance: Facebook only, with an eligible Page → publishes normally', () => {
  it('offers Facebook with no Instagram connection at all', () => {
    const all = availabilityForAll({ facebook: withAdapter(connected('facebook')) });
    expect(all.facebook.available).toBe(true);
    // Instagram being absent must not make Facebook unavailable.
    expect(availablePlatforms(all)).toEqual(['facebook']);
  });

  it('publishes to Facebook alone', async () => {
    const { store, publisher } = publisherWith({
      facebook: adapterFor('facebook', publishes('fb-1')),
    });
    const { final } = await scheduleThenPublish(publisher, store, ['facebook']);

    expect(final?.state).toBe('published');
    expect(targetOn(final!, 'facebook')).toMatchObject({ status: 'succeeded', remoteId: 'fb-1' });
  });
});

describe('acceptance: Instagram + Facebook → both publish when both are available', () => {
  it('confirms each target with its own remote id', async () => {
    const { store, publisher } = publisherWith({
      instagram: adapterFor('instagram', publishes('ig-2')),
      facebook: adapterFor('facebook', publishes('fb-2')),
    });
    const { final } = await scheduleThenPublish(publisher, store, ['instagram', 'facebook']);

    expect(final?.state).toBe('published');
    expect(targetOn(final!, 'instagram')).toMatchObject({ status: 'succeeded', remoteId: 'ig-2' });
    expect(targetOn(final!, 'facebook')).toMatchObject({ status: 'succeeded', remoteId: 'fb-2' });
    expect(targetsNeedingAttention(final!)).toEqual([]);
  });
});

/**
 * THE ROW THAT MATTERS MOST — and the one the old code got wrong.
 *
 * Before product rule 13, `attemptPublish` refused the entire publish when any
 * target lacked an adapter, so an unreachable Facebook cost the owner their
 * Instagram post entirely.
 */
describe('acceptance: Instagram + Facebook, Facebook unavailable', () => {
  async function run() {
    const { store, publisher } = publisherWith({
      instagram: adapterFor('instagram', publishes('ig-3')),
      // No Facebook adapter: Facebook is unreachable at publish time.
    });
    return scheduleThenPublish(publisher, store, ['instagram', 'facebook']);
  }

  it('does NOT fail as one atomic operation', async () => {
    const { scheduled, final } = await run();
    expect(isUnavailable(scheduled)).toBe(false);
    expect(final).not.toBeNull();
  });

  it('publishes Instagram and keeps its remote id and published status', async () => {
    const { final } = await run();
    expect(final?.state).toBe('published');
    expect(targetOn(final!, 'instagram')).toMatchObject({
      status: 'succeeded',
      remoteId: 'ig-3',
      permalink: 'https://example.invalid/ig-3',
    });
  });

  it('marks Facebook skipped, with its own reason', async () => {
    const { final } = await run();
    const facebook = targetOn(final!, 'facebook');

    expect(facebook.status).toBe('skipped');
    expect(facebook.failure?.message).toMatch(/Facebook skipped — reconnect Facebook/);
    expect(facebook.failure?.retryable).toBe(true);
    expect(wasSkippedForUnavailability(facebook)).toBe(true);
  });

  it('never claims Facebook was published', async () => {
    const { final } = await run();
    const facebook = targetOn(final!, 'facebook');
    expect(facebook.remoteId).toBeNull();
    expect(facebook.permalink).toBeNull();
    expect(facebook.publishedAt).toBeNull();
  });

  it('puts the post in the attention state, telling the owner to reconnect', async () => {
    const { final } = await run();
    const view = buildPostsView([final!], IST, NOW);

    expect(view.needsAttention).not.toBeNull();
    expect(view.needsAttention?.id).toBe(final!.id);
    expect(view.needsAttention?.body).toMatch(/Facebook skipped/);
    expect(view.needsAttention?.actionLabel).toBe('Reconnect');
  });

  it('distinguishes Shoogle’s skip from one the owner chose', async () => {
    const { store, publisher } = publisherWith({
      instagram: adapterFor('instagram', publishes('ig-4')),
    });
    const scheduled = await publisher.schedule({
      body: 'Owner will skip this.',
      mediaUris: [],
      targets: ['instagram'],
      scheduledFor: new Date(NOW.getTime() + 3 * 86_400_000).toISOString(),
    });
    const post = unwrapOrNull(scheduled)!;
    await publisher.skipOccurrence(post.id);
    const skippedByOwner = await store.get(post.id);

    // Same status, different meaning: the owner's deliberate skip carries no
    // reason and must never nag them to reconnect anything.
    expect(targetOn(skippedByOwner!, 'instagram').status).toBe('skipped');
    expect(wasSkippedForUnavailability(targetOn(skippedByOwner!, 'instagram'))).toBe(false);
    expect(targetsNeedingAttention(skippedByOwner!)).toEqual([]);
  });
});

describe('acceptance: Instagram with no Facebook Page → Instagram remains fully usable', () => {
  const noPage = availabilityForAll({
    instagram: withAdapter(connected('instagram')),
    facebook: withAdapter(connected('facebook', { eligiblePageIds: [] })),
  });

  it('leaves Instagram available', () => {
    expect(noPage.instagram.available).toBe(true);
    expect(availablePlatforms(noPage)).toEqual(['instagram']);
  });

  it('scopes the Page problem to Facebook, and offers no action the owner cannot take', () => {
    const facebook = noPage.facebook;
    expect(facebook).toMatchObject({ available: false, reason: 'no_eligible_page' });
    // There is nothing Shoogle can offer here: creating a Page is not a step
    // this product asks anyone to take.
    if (!facebook.available) expect(facebook.action).toBeNull();
  });

  it('never tells the owner to create a Facebook Page', () => {
    for (const platform of SOCIAL_PLATFORMS) {
      const entry = noPage[platform];
      if (!entry.available) {
        expect(entry.message).not.toMatch(/create a (Facebook )?Page/i);
        expect(entry.action?.label ?? '').not.toMatch(/create/i);
      }
    }
  });

  it('still lists Facebook in the selector rather than hiding it', () => {
    // Hidden is not the same as unavailable. An owner who cannot see Facebook
    // cannot understand why it is not posting.
    expect(selectableTargets(noPage).map((entry) => entry.platform)).toEqual([
      'instagram',
      'facebook',
      'google_business',
    ]);
  });

  it('publishes an Instagram-only post with no Facebook connection in existence', async () => {
    const { store, publisher } = publisherWith({
      instagram: adapterFor('instagram', publishes('ig-5')),
    });
    const { final } = await scheduleThenPublish(publisher, store, ['instagram']);
    expect(final?.state).toBe('published');
    expect(targetOn(final!, 'instagram').remoteId).toBe('ig-5');
  });
});

describe('acceptance: Facebook unavailable → does not affect GBP', () => {
  it('leaves Google Business available while Facebook is broken every way at once', () => {
    const all = availabilityForAll({
      facebook: withAdapter(connected('facebook', { authorization: 'expired', eligiblePageIds: [] })),
      google_business: withAdapter(connected('google_business')),
    });

    expect(all.google_business.available).toBe(true);
    expect(all.facebook.available).toBe(false);
  });

  it('publishes a GBP post while Facebook is unreachable', async () => {
    const { store, publisher } = publisherWith({
      google_business: adapterFor('google_business', publishes('gbp-1')),
    });
    const { final } = await scheduleThenPublish(publisher, store, ['google_business', 'facebook']);

    expect(final?.state).toBe('published');
    expect(targetOn(final!, 'google_business')).toMatchObject({
      status: 'succeeded',
      remoteId: 'gbp-1',
    });
    expect(targetOn(final!, 'facebook').status).toBe('skipped');
  });

  it('works in the other direction too — GBP’s pending approval does not touch Facebook', () => {
    const all = availabilityForAll({
      facebook: withAdapter(connected('facebook')),
      google_business: withAdapter(connected('google_business', { providerApproval: 'pending' })),
    });
    expect(all.facebook.available).toBe(true);
    expect(all.google_business.available).toBe(false);
  });
});

/* ========================================================================== */
/* The refusal that survives                                                  */
/* ========================================================================== */

describe('refusing is still right when there is genuinely nothing to reach', () => {
  it('refuses a post whose only target is unreachable, and stores nothing', async () => {
    const { store, publisher } = publisherWith({});
    const result = await publisher.schedule({
      body: 'x',
      mediaUris: [],
      targets: ['facebook'],
      scheduledFor: null,
    });

    expect(isUnavailable(result)).toBe(true);
    expect(await store.list()).toHaveLength(0);
  });

  it('schedules when at least one target is reachable, rather than refusing all', async () => {
    const { store, publisher } = publisherWith({
      instagram: adapterFor('instagram', publishes('ig-6')),
    });
    const result = await publisher.schedule({
      body: 'x',
      mediaUris: [],
      targets: ['instagram', 'facebook', 'google_business'],
      scheduledFor: null,
    });

    expect(isUnavailable(result)).toBe(false);
    expect(await store.list()).toHaveLength(1);
  });
});
