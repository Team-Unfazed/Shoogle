import { isUnavailable, unwrapOrNull } from '@/lib/state/DataState';

import {
  buildPostsView,
  facebookContent,
  isPostsViewEmpty,
  NO_POSTS_BODY,
  NO_POSTS_TITLE,
  postsViewState,
  type SocialPost,
} from '../index';

const IST = 'Asia/Kolkata';
const NOW = new Date('2026-08-31T04:00:00.000Z'); // Monday 09:30 IST

function base(id: string, overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id,
    businessId: 'b1',
    title: id,
    state: 'draft',
    content: {},
    media: [],
    carouselId: null,
    schedule: null,
    targets: [],
    insights: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function scheduled(id: string, dueAt: string, platforms: SocialPost['targets'][number]['platform'][] = ['instagram']) {
  return base(id, {
    state: 'scheduled',
    schedule: { dueAt, timeZone: IST, owner: 'shoogle' },
    targets: platforms.map((platform) => ({
      platform,
      status: 'not_attempted' as const,
      permalink: null,
      remoteId: null,
      publishedAt: null,
      failure: null,
    })),
  });
}

describe('the posts view', () => {
  it('picks the soonest scheduled post as next up and labels it truthfully', () => {
    const view = buildPostsView(
      [
        scheduled('later', '2026-09-04T13:00:00.000Z'),
        scheduled('sooner', '2026-09-01T03:30:00.000Z'),
      ],
      IST,
      NOW,
    );

    expect(view.nextUp?.id).toBe('sooner');
    expect(view.nextUp?.label).toBe('NEXT UP · TOMORROW 9:00 AM');
    expect(view.scheduled.map((row) => row.id)).toEqual(['sooner', 'later']);
    expect(view.scheduled[0]?.when).toBe('Tue · 9:00 AM');
  });

  it('names multiple targets short-form', () => {
    const view = buildPostsView(
      [scheduled('a', '2026-09-01T03:30:00.000Z', ['instagram', 'google_business'])],
      IST,
      NOW,
    );
    expect(view.scheduled[0]?.where).toBe('IG + GBP');
  });

  /* -- Unknown is not zero ------------------------------------------------ */

  it('shows reach as null when no provider has reported it', () => {
    const published = base('p', {
      state: 'published',
      targets: [
        {
          platform: 'instagram',
          status: 'succeeded',
          permalink: null,
          remoteId: 'r1',
          publishedAt: '2026-08-30T03:30:00.000Z',
          failure: null,
        },
      ],
      insights: null,
    });

    const view = buildPostsView([published], IST, NOW);
    expect(view.counts.lastReach).toBeNull();
    // …and the row says when it went out rather than inventing a number.
    expect(view.published[0]?.result).toBe('Published Sun · 9:00 AM');
  });

  it('uses reported numbers when a provider actually reported them', () => {
    const published = base('p', {
      state: 'published',
      targets: [
        {
          platform: 'instagram',
          status: 'succeeded',
          permalink: null,
          remoteId: 'r1',
          publishedAt: '2026-08-30T03:30:00.000Z',
          failure: null,
        },
      ],
      insights: { reach: 2412, saves: 84, reportedAt: '2026-08-30T10:00:00.000Z' },
    });

    const view = buildPostsView([published], IST, NOW);
    expect(view.counts.lastReach).toBe(2412);
    expect(view.published[0]?.result).toBe('2,412 reached · 84 saves');
  });

  it('does not sum reach across posts, which would double-count people', () => {
    const make = (id: string, reach: number, at: string) =>
      base(id, {
        state: 'published',
        targets: [
          {
            platform: 'instagram',
            status: 'succeeded',
            permalink: null,
            remoteId: `r-${id}`,
            publishedAt: at,
            failure: null,
          },
        ],
        insights: { reach, saves: null, reportedAt: at },
      });

    const view = buildPostsView(
      [make('old', 100, '2026-08-20T03:30:00.000Z'), make('new', 300, '2026-08-29T03:30:00.000Z')],
      IST,
      NOW,
    );
    expect(view.counts.lastReach).toBe(300);
  });

  /* -- Only confirmed publications appear --------------------------------- */

  it('leaves a "published" post out of the list when no target carries a remote id', () => {
    const unconfirmed = base('p', {
      state: 'published',
      targets: [
        {
          platform: 'instagram',
          status: 'succeeded',
          permalink: null,
          remoteId: null,
          publishedAt: null,
          failure: null,
        },
      ],
    });
    expect(buildPostsView([unconfirmed], IST, NOW).published).toEqual([]);
  });

  /* -- Failures ----------------------------------------------------------- */

  it('states the failure rather than the post title, and carries the reason', () => {
    const failedPost = base('f', {
      title: 'Weekend slots are open',
      state: 'failed',
      targets: [
        {
          platform: 'instagram',
          status: 'failed',
          permalink: null,
          remoteId: null,
          publishedAt: null,
          failure: { code: 'auth_expired', message: 'Instagram permission expired', retryable: true },
        },
      ],
    });

    const view = buildPostsView([failedPost], IST, NOW);
    expect(view.failed?.title).toBe('Failed to publish');
    expect(view.failed?.reason).toBe('Instagram permission expired');
  });

  /* -- Drafts ------------------------------------------------------------- */

  /**
   * REORDERED 2026-09-11, as a consequence of per-platform content.
   *
   * This used to report "Caption missing" first. Content is now written PER
   * PLATFORM, so there is nothing to write until the owner has chosen where the
   * post is going — "Caption missing" on a post with no target would be asking
   * for a caption that has no platform to belong to.
   */
  it('asks for a target first, because content is per platform', () => {
    expect(buildPostsView([base('d')], IST, NOW).needsAttention?.body).toBe('No account chosen');
  });

  it('names the platforms still unwritten, rather than saying "caption missing"', () => {
    const twoTargets = base('d', {
      targets: [
        { platform: 'instagram', status: 'not_attempted', permalink: null, remoteId: null, publishedAt: null, failure: null },
        { platform: 'facebook', status: 'not_attempted', permalink: null, remoteId: null, publishedAt: null, failure: null },
      ],
      content: {
        facebook: facebookContent(
          { body: 'Words', hashtags: [], language: 'en', origin: 'owner', generatedBy: null },
          { kind: 'text' },
        ),
      },
    });

    // Facebook is written, Instagram is not. "Caption missing" would be wrong
    // in both directions: something IS written, and what is missing is
    // specifically Instagram's.
    expect(buildPostsView([twoTargets], IST, NOW).needsAttention?.body).toBe('Instagram not written yet');
  });

  it('moves on to media once every targeted platform has words', () => {
    const written = base('d', {
      targets: [
        { platform: 'facebook', status: 'not_attempted', permalink: null, remoteId: null, publishedAt: null, failure: null },
      ],
      content: {
        facebook: facebookContent(
          { body: 'Words', hashtags: [], language: 'en', origin: 'owner', generatedBy: null },
          { kind: 'text' },
        ),
      },
    });
    expect(buildPostsView([written], IST, NOW).needsAttention?.body).toBe('No image yet');
  });

  it('counts drafts, generating and ready posts together, not scheduled ones', () => {
    const view = buildPostsView(
      [base('a'), base('b', { state: 'generating' }), base('c', { state: 'ready' }), scheduled('d', '2026-09-01T03:30:00.000Z')],
      IST,
      NOW,
    );
    expect(view.counts.drafts).toBe(3);
    expect(view.counts.scheduled).toBe(1);
  });
});

describe('the view state', () => {
  it('reports not_connected when there is no source at all', () => {
    const state = postsViewState(null, IST, NOW);
    expect(isUnavailable(state)).toBe(true);
    if (isUnavailable(state)) {
      expect(state.reason).toBe('not_connected');
      expect(state.message).toBe(NO_POSTS_BODY);
    }
    expect(NO_POSTS_TITLE).toBe('Nothing scheduled');
    // Product rule 5 is promised in this copy, so it must stay in it.
    expect(NO_POSTS_BODY).toMatch(/skip or pause/i);
  });

  it('distinguishes "the source answered with nothing" from "no source"', () => {
    const state = postsViewState([], IST, NOW);
    expect(state.status).toBe('ready');
    const view = unwrapOrNull(state);
    expect(view && isPostsViewEmpty(view)).toBe(true);
  });

  it('carries the fixture flag through so the banner cannot be missed', () => {
    const state = postsViewState([base('a', { isFixture: true })], IST, NOW);
    expect(state.status === 'ready' && state.isFixture).toBe(true);
  });
});
