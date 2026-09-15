import { isReady, ready, unavailable, unwrapOrNull } from '@/lib/state/DataState';

import {
  createInMemoryPostStore,
  createSocialPublisher,
  cropToRatioRange,
  facebookContent,
  gbpContent,
  hostForPlatform,
  instagramContent,
  isLocalUri,
  isMeasured,
  MEDIA_HOST_NOT_CONFIGURED,
  mintPublishableMedia,
  planPreparation,
  planStoryVideo,
  scaleToWidth,
  unconfiguredMediaHost,
  unconfiguredPreparer,
  validateForPlatform,
  type Caption,
  type MediaAsset,
  type MediaHost,
  type MediaPreparer,
  type PlatformPublisher,
  type PreparedMedia,
  type PublishableMedia,
} from '../index';

/**
 * THE MEDIA PIPELINE.
 *
 *   MediaAsset (file://) → probe → validate → prepare → PreparedMedia
 *                                                            │
 *                                                    MediaHost.publish()
 *                                                            ▼
 *                                                     PublishableMedia (https)
 *
 * The single most important property under test: a device file cannot reach a
 * `PlatformPublisher`. Meta cURLs media from a public URL, so an adapter
 * holding a `file://` path is an adapter that can send something no server can
 * fetch — and the failure shows up as a confusing 400 at publish time, or a
 * post that looks scheduled and never goes out.
 */

/* -------------------------------------------------------------------------- */
/* Builders                                                                   */
/* -------------------------------------------------------------------------- */

function asset(over: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'm1',
    kind: 'image',
    format: 'jpeg',
    uri: 'file:///storage/emulated/0/DCIM/photo.jpg',
    width: 1080,
    height: 1350, // 0.8 — exactly Instagram's 4:5 floor
    byteSize: 400_000,
    durationSeconds: null,
    altText: null,
    ...over,
  };
}

const words: Caption = {
  body: 'Weekday mornings are quiet.',
  hashtags: [],
  language: 'en',
  origin: 'owner',
  generatedBy: null,
};

const MB = 1024 * 1024;

/* ========================================================================== */
/* 1. A local file is recognisably local                                      */
/* ========================================================================== */

describe('local URIs are recognised as unpublishable', () => {
  it('knows the shapes a phone hands over', () => {
    expect(isLocalUri('file:///storage/photo.jpg')).toBe(true);
    expect(isLocalUri('content://media/external/images/media/42')).toBe(true);
    expect(isLocalUri('data:image/jpeg;base64,abc')).toBe(true);
    expect(isLocalUri('ph://ABC-123')).toBe(true);
  });

  it('does not mistake a hosted URL for a local one', () => {
    expect(isLocalUri('https://cdn.example.invalid/a.jpg')).toBe(false);
  });
});

/* ========================================================================== */
/* 2. Validation                                                              */
/* ========================================================================== */

describe('validating an asset for one platform', () => {
  it('accepts a JPEG already inside Instagram’s spec', () => {
    expect(validateForPlatform(asset(), 'instagram')).toEqual([]);
  });

  /** Unknown is not zero, and unmeasured is not fine. */
  it('refuses an image whose dimensions were never measured', () => {
    const problems = validateForPlatform(asset({ width: null, height: null }), 'instagram');
    expect(problems.map((p) => p.code)).toContain('dimensions_unknown');
  });

  it('refuses a file whose format could not be read', () => {
    const problems = validateForPlatform(asset({ format: 'unknown' }), 'instagram');
    expect(problems.map((p) => p.code)).toContain('format_unknown');
  });

  it('refuses an image too small to use, rather than upscaling it', () => {
    const problems = validateForPlatform(asset({ width: 200, height: 250 }), 'instagram');
    expect(problems.map((p) => p.code)).toContain('too_small');
    // Enlarging invents detail that was never captured.
    expect(problems.find((p) => p.code === 'too_small')?.message).toMatch(/invent detail/i);
  });

  it('refuses a video in a container Instagram does not take', () => {
    const problems = validateForPlatform(
      asset({ kind: 'video', format: 'webp', durationSeconds: 10, byteSize: 1_000_000 }),
      'instagram',
    );
    expect(problems.map((p) => p.code)).toContain('format_unsupported');
  });

  it('scopes every problem to the platform it belongs to', () => {
    for (const problem of validateForPlatform(asset({ width: 100, height: 100 }), 'instagram')) {
      expect(problem.platform).toBe('instagram');
    }
  });
});

/* ========================================================================== */
/* 3. Preparation planning                                                    */
/* ========================================================================== */

describe('planning what must change', () => {
  it('plans nothing for an asset that already fits', () => {
    const plan = planPreparation(asset(), 'instagram');
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.changes).toEqual([]);
  });

  /** The JPEG rule, as a transcode rather than a refusal. */
  it('transcodes a PNG to JPEG for Instagram', () => {
    const plan = planPreparation(asset({ format: 'png' }), 'instagram');
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.changes).toContainEqual({ kind: 'transcode', to: 'jpeg' });
      expect(plan.targetFormat).toBe('jpeg');
    }
  });

  it('leaves the same PNG alone for Facebook, which accepts it', () => {
    const plan = planPreparation(asset({ format: 'png' }), 'facebook');
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.changes.some((c) => c.kind === 'transcode')).toBe(false);
  });

  it('resizes down to Instagram’s 1440px ceiling, keeping the proportions', () => {
    const plan = planPreparation(asset({ width: 2880, height: 3600 }), 'instagram');
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.changes).toContainEqual({ kind: 'resize', toWidth: 1440, toHeight: 1800 });
      expect(plan.targetWidth).toBe(1440);
    }
  });

  it('crops a too-wide image into Instagram’s 1.91:1 bound', () => {
    // 1440x400 is 3.6:1 — far wider than Instagram takes.
    const plan = planPreparation(asset({ width: 1440, height: 400 }), 'instagram');
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      const crop = plan.changes.find((c) => c.kind === 'crop');
      expect(crop).toBeDefined();
      if (crop?.kind === 'crop') {
        expect(crop.toHeight).toBe(400);
        expect(crop.toWidth / crop.toHeight).toBeCloseTo(1.91, 2);
      }
    }
  });

  it('crops a too-tall image into the 4:5 bound', () => {
    const plan = planPreparation(asset({ width: 1000, height: 2000 }), 'instagram');
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      const crop = plan.changes.find((c) => c.kind === 'crop');
      if (crop?.kind === 'crop') expect(crop.toWidth / crop.toHeight).toBeCloseTo(0.8, 2);
    }
  });

  it('asks for recompression above Instagram’s 8MB, rather than refusing', () => {
    const plan = planPreparation(asset({ byteSize: 9 * MB }), 'instagram');
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.changes).toContainEqual({ kind: 'recompress', targetBytes: 8 * MB });
  });

  it('applies Facebook’s looser rules rather than Instagram’s', () => {
    // 1000x2000 and PNG: rejected by Instagram's aspect rule, fine on Facebook,
    // which resizes server-side and documents no aspect requirement.
    const facebook = planPreparation(asset({ width: 1000, height: 2000, format: 'png' }), 'facebook');
    expect(facebook.ok).toBe(true);
    if (facebook.ok) expect(facebook.changes).toEqual([]);
  });

  it('applies Google’s short-edge rule, which is not a width rule', () => {
    // 300 wide by 200 tall: wide enough for a width rule, too short for
    // Google's short-edge rule.
    const plan = planPreparation(asset({ width: 300, height: 200 }), 'google_business');
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.problems.map((p) => p.code)).toContain('too_small');
  });

  it('holds a Story to 60 seconds, not the feed’s fifteen minutes', () => {
    const long = asset({ kind: 'video', format: 'mp4', durationSeconds: 90, byteSize: 5 * MB });
    expect(planStoryVideo(long).ok).toBe(false);
    // The same clip is fine as a feed video.
    expect(planPreparation(long, 'instagram').ok).toBe(true);
  });

  it('computes geometry correctly', () => {
    expect(scaleToWidth(2880, 3600, 1440)).toEqual({ width: 1440, height: 1800 });
    expect(cropToRatioRange(1080, 1350, 0.8, 1.91)).toEqual({ width: 1080, height: 1350 });
    expect(cropToRatioRange(1440, 400, 0.8, 1.91).width).toBe(764);
  });
});

/* ========================================================================== */
/* 4. Only a MediaHost can mint PublishableMedia                              */
/* ========================================================================== */

describe('PublishableMedia cannot be forged', () => {
  const valid = {
    kind: 'image' as const,
    url: 'https://cdn.example.invalid/a.jpg',
    contentType: 'image/jpeg',
    byteSize: 400_000,
    width: 1080,
    height: 1350,
    durationSeconds: null,
    preparedFor: 'instagram' as const,
    handle: 'h1',
    hostedAt: '2026-09-11T00:00:00.000Z',
  };

  it('mints from a real https URL', () => {
    const minted = mintPublishableMedia(valid);
    expect(minted).not.toBeNull();
    expect(minted?.url).toBe('https://cdn.example.invalid/a.jpg');
  });

  /** The whole point. A host cannot hand back a device path, even by mistake. */
  it('refuses a local file URI', () => {
    expect(mintPublishableMedia({ ...valid, url: 'file:///storage/a.jpg' })).toBeNull();
    expect(mintPublishableMedia({ ...valid, url: 'content://media/42' })).toBeNull();
  });

  it('refuses plaintext http, which Meta will not fetch', () => {
    expect(mintPublishableMedia({ ...valid, url: 'http://cdn.example.invalid/a.jpg' })).toBeNull();
  });

  it('refuses an empty handle or a zero-byte file', () => {
    expect(mintPublishableMedia({ ...valid, handle: '  ' })).toBeNull();
    expect(mintPublishableMedia({ ...valid, byteSize: 0 })).toBeNull();
  });

  /**
   * COMPILE-TIME BOUNDARY.
   *
   * `PublishableMedia` carries a branded property keyed by a module-private
   * `unique symbol`, so no code outside `media/types.ts` can write an object
   * literal that satisfies it. `@ts-expect-error` asserts that: if this line
   * ever stops being an error, typecheck FAILS, and the boundary has been
   * loosened.
   */
  it('cannot be written as an object literal', () => {
    // @ts-expect-error a hand-written object is not PublishableMedia
    const forged: PublishableMedia = { ...valid };
    expect(forged).toBeDefined();
  });
});

/* ========================================================================== */
/* 5. The unconfigured seams refuse honestly                                  */
/* ========================================================================== */

describe('nothing is hosted today, and it says so', () => {
  it('the media host reports not_connected and uploads nothing', async () => {
    const state = await unconfiguredMediaHost.publish({} as PreparedMedia);
    expect(state.status).toBe('unavailable');
    if (state.status === 'unavailable') expect(state.message).toBe(MEDIA_HOST_NOT_CONFIGURED);
    expect(unconfiguredMediaHost.isConfigured()).toBe(false);
  });

  it('explains why, in terms an owner can act on', () => {
    expect(MEDIA_HOST_NOT_CONFIGURED).toMatch(/fetch pictures from a web address/i);
    // It does not claim the post is fine.
    expect(MEDIA_HOST_NOT_CONFIGURED).toMatch(/cannot go out/i);
  });

  it('the preparer converts nothing rather than returning the original', async () => {
    const state = await unconfiguredPreparer.prepare(asset(), 'instagram');
    expect(state.status).toBe('unavailable');
  });
});

/* ========================================================================== */
/* 6. Hosting is per platform                                                 */
/* ========================================================================== */

function prepared(platform: PreparedMedia['preparedFor'], id = 'p1'): PreparedMedia {
  return {
    source: asset({ id }),
    uri: `file:///prepared/${id}.jpg`,
    kind: 'image',
    format: 'jpeg',
    width: 1080,
    height: 1350,
    byteSize: 400_000,
    preparedFor: platform,
    changes: [],
  };
}

function workingHost(): MediaHost {
  let n = 0;
  return {
    id: 'test',
    displayName: 'Test host',
    isConfigured: () => true,
    publish: async (artifact) => {
      n += 1;
      const minted = mintPublishableMedia({
        kind: artifact.kind,
        url: `https://cdn.example.invalid/${n}.jpg`,
        contentType: 'image/jpeg',
        byteSize: artifact.byteSize,
        width: artifact.width,
        height: artifact.height,
        durationSeconds: null,
        preparedFor: artifact.preparedFor,
        handle: `h${n}`,
        hostedAt: '2026-09-11T00:00:00.000Z',
      });
      return minted === null
        ? unavailable('not_supported', 'could not mint')
        : ready(minted, '2026-09-11T00:00:00.000Z');
    },
    revoke: async () => ready(undefined, '2026-09-11T00:00:00.000Z'),
  };
}

describe('hosting one platform’s media', () => {
  it('returns hosted URLs for that platform', async () => {
    const state = await hostForPlatform(workingHost(), 'instagram', [prepared('instagram')]);
    expect(isReady(state)).toBe(true);
    expect(unwrapOrNull(state)?.media[0]?.url).toMatch(/^https:\/\//);
  });

  /** A Facebook-prepared PNG must never be uploaded as Instagram's media. */
  it('refuses an artifact prepared for a different platform', async () => {
    const state = await hostForPlatform(workingHost(), 'instagram', [prepared('facebook')]);
    expect(state.status).toBe('unavailable');
  });

  it('passes a host failure through rather than returning a partial list', async () => {
    const failing: MediaHost = {
      ...workingHost(),
      publish: async () => unavailable('offline', 'Upload failed.'),
    };
    const state = await hostForPlatform(failing, 'instagram', [prepared('instagram')]);
    expect(state.status).toBe('unavailable');
  });
});

/* ========================================================================== */
/* 7. The publisher boundary                                                  */
/* ========================================================================== */

const NOW = new Date('2026-09-11T04:00:00.000Z');

function publisherWith(
  publishers: Parameters<typeof createSocialPublisher>[0]['publishers'],
  extra: Partial<Parameters<typeof createSocialPublisher>[0]> = {},
) {
  const store = createInMemoryPostStore([]);
  const publisher = createSocialPublisher({
    store,
    publishers,
    businessId: 'b1',
    timeZone: 'Asia/Kolkata',
    now: () => NOW,
    newId: (() => {
      let n = 0;
      return () => `id-${(n += 1)}`;
    })(),
    ...extra,
  });
  return { store, publisher };
}

describe('a local URI cannot enter a PlatformPublisher', () => {
  /**
   * COMPILE-TIME BOUNDARY, again. An adapter receives `PlatformPublishRequest`,
   * whose `media` is `PublishableMedia[]`. Handing it a `MediaAsset` — the type
   * that carries a `file://` uri — does not typecheck.
   */
  it('does not accept a MediaAsset where hosted media is required', () => {
    const adapter: PlatformPublisher = {
      platform: 'instagram',
      publishNow: async (request) => {
        // @ts-expect-error a device asset is not PublishableMedia
        const bad: readonly PublishableMedia[] = [asset()];
        expect(bad).toBeDefined();
        expect(request.media.every((item) => item.url.startsWith('https://'))).toBe(true);
        return { ok: true, remoteId: 'r', permalink: null, publishedAt: NOW.toISOString() };
      },
    };
    expect(adapter.platform).toBe('instagram');
  });

  it('an adapter only ever sees https media', async () => {
    const seen: string[] = [];
    const adapter: PlatformPublisher = {
      platform: 'instagram',
      publishNow: async (request) => {
        for (const item of request.media) seen.push(item.url);
        return { ok: true, remoteId: 'r1', permalink: null, publishedAt: NOW.toISOString() };
      },
    };

    const workingPreparer: MediaPreparer = {
      id: 'test',
      isConfigured: () => true,
      prepare: async (source, platform) =>
        ready(
          { ...prepared(platform), source },
          NOW.toISOString(),
        ),
    };

    const { publisher } = publisherWith(
      { instagram: adapter },
      { preparer: workingPreparer, mediaHost: workingHost() },
    );

    await publisher.schedule({
      body: 'x',
      mediaUris: ['file:///storage/photo.jpg'],
      targets: ['instagram'],
      scheduledFor: null,
    });
    await publisher.attemptPublish('id-1');

    expect(seen.length).toBeGreaterThan(0);
    for (const url of seen) {
      expect(url.startsWith('https://')).toBe(true);
      expect(isLocalUri(url)).toBe(false);
    }
  });
});

/* ========================================================================== */
/* 8. Media failures stay on their own platform                               */
/* ========================================================================== */

describe('a media failure does not spread', () => {
  const publishes = (remoteId: string) => ({
    ok: true as const,
    remoteId,
    permalink: null,
    publishedAt: NOW.toISOString(),
  });

  function adapterFor(platform: PreparedMedia['preparedFor'], remoteId: string): PlatformPublisher {
    return { platform, publishNow: async () => publishes(remoteId) };
  }

  /**
   * Instagram-only preparation failure. Facebook and Google publish the same
   * post alongside it, because preparation and hosting are per target and the
   * loop simply continues.
   */
  const instagramOnlyFailure: MediaPreparer = {
    id: 'test',
    isConfigured: () => true,
    prepare: async (source, platform) =>
      platform === 'instagram'
        ? unavailable('not_supported', 'Could not convert this photo for Instagram.')
        : ready({ ...prepared(platform), source }, NOW.toISOString()),
  };

  it('leaves Facebook and Google published when Instagram’s media fails', async () => {
    const { store, publisher } = publisherWith(
      {
        instagram: adapterFor('instagram', 'ig-1'),
        facebook: adapterFor('facebook', 'fb-1'),
        google_business: adapterFor('google_business', 'gbp-1'),
      },
      { preparer: instagramOnlyFailure, mediaHost: workingHost() },
    );

    await publisher.schedule({
      body: 'x',
      mediaUris: ['file:///storage/photo.jpg'],
      targets: ['instagram', 'facebook', 'google_business'],
      scheduledFor: null,
    });
    await publisher.attemptPublish('id-1');

    const post = await store.get('id-1');
    const target = (platform: string) => post?.targets.find((t) => t.platform === platform);

    expect(target('facebook')?.status).toBe('succeeded');
    expect(target('facebook')?.remoteId).toBe('fb-1');
    expect(target('google_business')?.status).toBe('succeeded');

    expect(target('instagram')?.status).toBe('failed');
    expect(target('instagram')?.failure?.code).toBe('media_not_publishable');
    // And it never claims Instagram published.
    expect(target('instagram')?.remoteId).toBeNull();
    expect(target('instagram')?.permalink).toBeNull();
  });

  it('an upload failure does not corrupt the post or the other targets', async () => {
    const failingHost: MediaHost = {
      ...workingHost(),
      publish: async (artifact) =>
        artifact.preparedFor === 'instagram'
          ? unavailable('offline', 'Upload failed.')
          : workingHost().publish(artifact),
    };

    const workingPreparer: MediaPreparer = {
      id: 'test',
      isConfigured: () => true,
      prepare: async (source, platform) => ready({ ...prepared(platform), source }, NOW.toISOString()),
    };

    const { store, publisher } = publisherWith(
      {
        instagram: adapterFor('instagram', 'ig-1'),
        facebook: adapterFor('facebook', 'fb-1'),
      },
      { preparer: workingPreparer, mediaHost: failingHost },
    );

    await publisher.schedule({
      body: 'x',
      mediaUris: ['file:///storage/photo.jpg'],
      targets: ['instagram', 'facebook'],
      scheduledFor: null,
    });
    await publisher.attemptPublish('id-1');

    const post = await store.get('id-1');
    expect(post?.targets.find((t) => t.platform === 'facebook')?.status).toBe('succeeded');
    expect(post?.targets.find((t) => t.platform === 'instagram')?.status).toBe('failed');
    // The post itself survives: content, media and schedule are untouched.
    expect(post?.content.facebook).toBeDefined();
    expect(post?.media).toHaveLength(1);
    expect(post?.state).toBe('published');
  });

  it('a text-only post publishes with no host configured at all', async () => {
    // Facebook publishes words alone, so the absence of a bucket it does not
    // need must not block it.
    const { store, publisher } = publisherWith({ facebook: adapterFor('facebook', 'fb-1') });

    await publisher.schedule({
      body: 'Open until nine tonight.',
      mediaUris: [],
      targets: ['facebook'],
      scheduledFor: null,
    });
    await publisher.attemptPublish('id-1');

    expect((await store.get('id-1'))?.targets[0]?.status).toBe('succeeded');
  });
});

/* ========================================================================== */
/* 9. Measurement                                                             */
/* ========================================================================== */

describe('knowing whether an asset has been measured', () => {
  it('accepts a fully measured image', () => {
    expect(isMeasured(asset())).toBe(true);
  });

  it('rejects anything with a gap', () => {
    expect(isMeasured(asset({ format: 'unknown' }))).toBe(false);
    expect(isMeasured(asset({ width: null }))).toBe(false);
    expect(isMeasured(asset({ byteSize: null }))).toBe(false);
    expect(isMeasured(asset({ kind: 'video', format: 'mp4', durationSeconds: null }))).toBe(false);
  });
});

/* ========================================================================== */
/* 10. Content types are untouched by all of this                             */
/* ========================================================================== */

describe('the platform content model is unchanged', () => {
  it('still builds three different objects', () => {
    expect(instagramContent(words, { kind: 'single_image', image: asset(), altText: null }).platform)
      .toBe('instagram');
    expect(facebookContent(words, { kind: 'text' }).platform).toBe('facebook');
    expect(gbpContent(words, { kind: 'STANDARD' }).platform).toBe('google_business');
  });
});
