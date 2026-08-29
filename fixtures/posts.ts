/**
 * DEVELOPMENT FIXTURES — NOT CUSTOMER DATA.
 *
 * Content transcribed from "Shoogle Social.dc.html" so the Posts tab can be
 * built and reviewed against the wireframe. Every value is invented.
 * Read fixtures/README.md before using it.
 */

import type { PostStatus } from '@/types/domain';

export interface PostRow {
  id: string;
  title: string;
  /** Human-readable schedule, e.g. "Wed · 9:00 AM". */
  when: string;
  /** Where it goes, e.g. "Instagram" or "IG + FB". */
  where: string;
  status: PostStatus;
  /** Media caption shown on the placeholder tile. */
  mediaLabel: string;
}

export interface PostsFixture {
  nextUp: {
    label: string;
    title: string;
    channel: string;
    mediaLabel: string;
  } | null;
  counts: { scheduled: number; drafts: number; lastReach: number | null };
  scheduled: PostRow[];
  needsAttention: { id: string; title: string; body: string; actionLabel: string } | null;
  published: {
    id: string;
    title: string;
    /** Real result copy, only ever shown for a genuinely published post. */
    result: string;
    mediaLabel: string;
  }[];
  failed: { id: string; title: string; reason: string } | null;
}

export const postsFixture: PostsFixture = {
  nextUp: {
    label: 'NEXT UP · TOMORROW 9:00 AM',
    title: 'Step-by-step licence renewal guide',
    channel: 'Instagram · Reel',
    mediaLabel: 'reel cover',
  },

  counts: { scheduled: 3, drafts: 1, lastReach: 2412 },

  scheduled: [
    {
      id: 'fixture-post-1',
      title: 'Step-by-step licence renewal guide',
      when: 'Wed · 9:00 AM',
      where: 'Instagram',
      status: 'scheduled',
      mediaLabel: 'reel',
    },
    {
      id: 'fixture-post-2',
      title: 'Smooth driving test, zero stress',
      when: 'Fri · 6:30 PM',
      where: 'IG + FB',
      status: 'scheduled',
      mediaLabel: 'photo',
    },
    {
      id: 'fixture-post-3',
      title: 'Monsoon driving tips',
      when: 'Sun · 11:00 AM',
      where: 'Facebook',
      status: 'scheduled',
      mediaLabel: 'photo',
    },
  ],

  needsAttention: {
    id: 'fixture-draft-1',
    title: 'Draft: Monsoon offer',
    body: 'Caption missing · 3 din se pending',
    actionLabel: 'Finish',
  },

  published: [
    {
      id: 'fixture-published-1',
      title: 'Smooth driving test, zero stress',
      result: '2,412 reached · 84 saves',
      mediaLabel: 'photo',
    },
  ],

  failed: {
    id: 'fixture-failed-1',
    title: 'Failed to publish',
    reason: 'Instagram permission expired · Retry',
  },
};
