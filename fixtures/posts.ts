/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA.
 *
 * Read fixtures/README.md before using anything here. Owner: Yash.
 *
 * These are `SocialPost` records in exactly the shape the real store returns,
 * so the Posts tab runs its genuine derivation path (`buildPostsView`) rather
 * than a parallel one that only fixtures take. Content is transcribed from
 * "Shoogle Social.dc.html"; every value is invented.
 *
 * WHY THE SCHEDULES ARE RELATIVE TO NOW
 * -------------------------------------
 * The next-up banner says "TOMORROW 9:00 AM" only when the post genuinely is
 * tomorrow at 9am — the words are derived from the instant, not stored as a
 * string. A fixed 2020 timestamp would make the banner read "THU 5:30 AM" and
 * the whole list look like a museum. Relative instants keep the fixture
 * exercising the real formatting code, including the timezone conversion.
 *
 * Reach and saves appear on exactly ONE post, the published one, and only
 * because that post has a `reportedAt`. Nothing else carries a metric: an
 * unmeasured post's insights are `null`, which is what the store would return.
 */

import { instantAtZonedTime, zonedDateAhead, type SocialPost } from '@/features/social';

/** The fixture business is in Navi Mumbai, so its posts are scheduled in IST. */
export const FIXTURE_TIME_ZONE = 'Asia/Kolkata';

const FIXTURE_BUSINESS_ID = 'fixture-business-0001';

function dueIn(days: number, hour: number, minute: number, now: Date): string {
  const { year, month, day } = zonedDateAhead(now, days, FIXTURE_TIME_ZONE);
  return instantAtZonedTime(year, month, day, hour, minute, FIXTURE_TIME_ZONE);
}

function scheduled(
  id: string,
  title: string,
  dueAt: string,
  platforms: SocialPost['targets'][number]['platform'][],
  media: SocialPost['media'],
  createdAt: string,
): SocialPost {
  return {
    id,
    businessId: FIXTURE_BUSINESS_ID,
    title,
    state: 'scheduled',
    caption: {
      body: `${title}. Development fixture caption — not a real business's words.`,
      hashtags: [],
      language: 'en',
      origin: 'owner',
      generatedBy: null,
    },
    media,
    carouselId: null,
    schedule: { dueAt, timeZone: FIXTURE_TIME_ZONE, owner: 'shoogle' },
    targets: platforms.map((platform) => ({
      platform,
      status: 'not_attempted',
      permalink: null,
      remoteId: null,
      publishedAt: null,
      failure: null,
    })),
    insights: null,
    createdAt,
    updatedAt: createdAt,
    isFixture: true,
  };
}

function image(id: string): SocialPost['media'] {
  return [
    {
      id,
      kind: 'image',
      format: 'jpeg',
      uri: `file:///fixtures/${id}.jpg`,
      width: 1080,
      height: 1350,
      byteSize: 412_000,
      durationSeconds: null,
      altText: 'Development fixture image.',
    },
  ];
}

function video(id: string): SocialPost['media'] {
  return [
    {
      id,
      kind: 'video',
      format: 'mp4',
      uri: `file:///fixtures/${id}.mp4`,
      width: 1080,
      height: 1920,
      byteSize: 8_400_000,
      durationSeconds: 22,
      altText: 'Development fixture video.',
    },
  ];
}

/**
 * The fixture post list.
 *
 * A function, not a constant, because the schedules are relative to the clock.
 * Access is still gated the same way everything in `fixtures/` is: the Posts
 * tab only calls this when `isFixtureModeEnabled()` (or dev preview) is on, and
 * shows an undismissable banner while it does.
 */
export function socialPostsFixture(now: Date = new Date()): SocialPost[] {
  const createdAt = new Date(now.getTime() - 3 * 86_400_000).toISOString();

  return [
    scheduled(
      'fixture-post-1',
      'Step-by-step licence renewal guide',
      dueIn(1, 9, 0, now),
      ['instagram'],
      video('fixture-media-1'),
      createdAt,
    ),
    scheduled(
      'fixture-post-2',
      'Smooth driving test, zero stress',
      dueIn(3, 18, 30, now),
      ['instagram', 'facebook'],
      image('fixture-media-2'),
      createdAt,
    ),
    scheduled(
      'fixture-post-3',
      'Monsoon driving tips',
      dueIn(6, 11, 0, now),
      ['google_business'],
      image('fixture-media-3'),
      createdAt,
    ),

    // A draft the owner has to finish. No caption, so the list says exactly
    // that rather than "incomplete".
    {
      id: 'fixture-draft-1',
      businessId: FIXTURE_BUSINESS_ID,
      title: 'Draft: Monsoon offer',
      state: 'draft',
      caption: null,
      media: image('fixture-media-4'),
      carouselId: null,
      schedule: null,
      targets: [],
      insights: null,
      createdAt,
      updatedAt: createdAt,
      isFixture: true,
    },

    // The only post carrying numbers, and only because a provider "reported"
    // them. Remote id present: this is what a confirmed publication looks like.
    {
      id: 'fixture-published-1',
      businessId: FIXTURE_BUSINESS_ID,
      title: 'Smooth driving test, zero stress',
      state: 'published',
      caption: {
        body: 'Development fixture caption for an already-published post.',
        hashtags: ['NaviMumbai'],
        language: 'en',
        origin: 'owner',
        generatedBy: null,
      },
      media: image('fixture-media-5'),
      carouselId: null,
      schedule: {
        dueAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
        timeZone: FIXTURE_TIME_ZONE,
        owner: 'shoogle',
      },
      targets: [
        {
          platform: 'instagram',
          status: 'succeeded',
          permalink: 'https://example.invalid/fixture-post',
          remoteId: 'fixture-remote-1',
          publishedAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
          failure: null,
        },
      ],
      insights: {
        reach: 2412,
        saves: 84,
        reportedAt: new Date(now.getTime() - 86_400_000).toISOString(),
      },
      createdAt,
      updatedAt: createdAt,
      isFixture: true,
    },

    // A real failure, with the provider's reason attached to the target that
    // failed. Nothing here implies the post went out.
    {
      id: 'fixture-failed-1',
      businessId: FIXTURE_BUSINESS_ID,
      title: 'Weekend slots are open',
      state: 'failed',
      caption: {
        body: 'Development fixture caption for a post that failed to publish.',
        hashtags: [],
        language: 'en',
        origin: 'owner',
        generatedBy: null,
      },
      media: image('fixture-media-6'),
      carouselId: null,
      schedule: {
        dueAt: new Date(now.getTime() - 3_600_000).toISOString(),
        timeZone: FIXTURE_TIME_ZONE,
        owner: 'shoogle',
      },
      targets: [
        {
          platform: 'instagram',
          status: 'failed',
          permalink: null,
          remoteId: null,
          publishedAt: null,
          failure: {
            code: 'auth_expired',
            message: 'Instagram permission expired · Retry',
            retryable: true,
          },
        },
      ],
      insights: null,
      createdAt,
      updatedAt: createdAt,
      isFixture: true,
    },
  ];
}
