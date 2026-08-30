import * as fs from 'node:fs';
import * as path from 'node:path';

import { GBP_OAUTH_SCOPE, type GbpRequest } from '@/features/gbp/endpoints';
import type { GbpTransportOutcome } from '@/features/gbp/errors';
import {
  classifyReply,
  describeReplyModeration,
  replyTimestamp,
  toContractReview,
} from '@/features/gbp/mappers';
import { buildMetrics, buildWindows, normaliseKeywordRows } from '@/features/gbp/performance';
import {
  createGoogleBusinessProfileProvider,
  type GbpSession,
  type GbpTransport,
} from '@/features/gbp/provider';
import type { GbpReviewDetail } from '@/features/gbp/types';
import { voiceOfMerchantGate } from '@/features/gbp/voiceOfMerchant';
import { LIVE_DAILY_METRICS } from '@/features/seo';
import { fixtureVoiceOfMerchantStates } from '@/fixtures/gbp';
import { UNAVAILABLE_COPY } from '@/lib/state/DataState';

/**
 * Regression tests for five confirmed honesty violations.
 *
 * Each block below pins one specific lie the adapter used to be able to tell.
 * None of them is a style preference: every one of them put a sentence in front
 * of a business owner that was not true.
 */

const SESSION: GbpSession = {
  accessToken: 'test-token',
  grantedScopes: [GBP_OAUTH_SCOPE],
  accountId: 'acc-1',
  handle: 'test@example.invalid',
  lastSyncedAt: null,
};

const ok = (body: unknown): GbpTransportOutcome => ({ outcome: 'http', status: 200, body });

function harness(routes: Partial<Record<string, GbpTransportOutcome>>) {
  const calls: GbpRequest[] = [];
  const transport: GbpTransport = {
    async send(request) {
      calls.push(request);
      return (
        routes[request.operation] ?? {
          outcome: 'http',
          status: 404,
          body: { error: { code: 404, status: 'NOT_FOUND', message: 'no route' } },
        }
      );
    },
  };
  const provider = createGoogleBusinessProfileProvider({
    transport,
    getSession: async () => SESSION,
    now: () => '2020-01-08T00:00:00.000Z',
    latestPerformanceDate: () => '2020-01-07',
  });
  return { provider, calls };
}

const KEYWORDS_OP = 'locations.searchkeywords.impressions.monthly.list';

/* -------------------------------------------------------------------------- */
/* 1. Unmappable keyword rows are never silently dropped                       */
/* -------------------------------------------------------------------------- */

describe('search keywords: a list Shoogle could not read is not "you have no keywords"', () => {
  it('counts the rows it refused instead of filtering them into nothing', () => {
    expect(
      normaliseKeywordRows([
        { searchKeyword: 'salon nerul', insightsValue: { value: '42' } },
        { searchKeyword: '   ', insightsValue: { value: '9' } },
        { searchKeyword: 'no volume', insightsValue: {} },
      ]),
    ).toEqual({
      rows: [{ keyword: 'salon nerul', impressions: { kind: 'exact', value: 42 } }],
      skipped: 2,
    });
  });

  it('refuses outright when EVERY row Google sent was unmappable', async () => {
    const { provider } = harness({
      [KEYWORDS_OP]: ok({
        searchKeywordsCounts: [
          { searchKeyword: 'a', insightsValue: {} },
          { searchKeyword: '', insightsValue: { value: '3' } },
        ],
      }),
    });

    const state = await provider.listSearchKeywords('loc-1', 3);
    // The old code returned ready([]) here, which renders as "no search
    // keywords" — a claim about the owner's business we have no evidence for.
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.code).toBe('gbp_keywords_unmappable');
    expect(state.message).toMatch(/not the same as having no keywords/i);
  });

  it('carries the skipped count so a partial list can be labelled partial', async () => {
    const { provider } = harness({
      [KEYWORDS_OP]: ok({
        searchKeywordsCounts: [
          { searchKeyword: 'salon nerul', insightsValue: { value: '42' } },
          { searchKeyword: 'haircut', insightsValue: { threshold: '15' } },
          { searchKeyword: 'unreadable', insightsValue: {} },
        ],
      }),
    });

    const state = await provider.listSearchKeywords('loc-1', 3);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value.rows).toHaveLength(2);
    // Without this the two-row list would be indistinguishable from a complete one.
    expect(state.value.skipped).toBe(1);
  });

  it('still reports a genuinely empty response as a measured, complete empty list', async () => {
    const { provider } = harness({ [KEYWORDS_OP]: ok({ searchKeywordsCounts: [] }) });
    const state = await provider.listSearchKeywords('loc-1', 3);
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value).toEqual({ rows: [], skipped: 0 });
  });
});

/* -------------------------------------------------------------------------- */
/* 2. A partial review page never looks complete                               */
/* -------------------------------------------------------------------------- */

describe('listReviews: nine of ten reviews is not a complete list', () => {
  const review = (id: string, starRating: string) => ({
    reviewId: id,
    reviewer: { displayName: 'A' },
    starRating,
    comment: 'ok',
    createTime: '2020-01-01T00:00:00Z',
  });

  const reviewsRoute = (reviews: unknown[]) => ({
    'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.healthy),
    'reviews.list': ok({ reviews }),
  });

  it('refuses the whole page when even one review could not be mapped', async () => {
    const { provider } = harness(
      reviewsRoute([
        review('r1', 'FIVE'),
        review('r2', 'FOUR'),
        // Google reported no usable star rating: the shared contract's 1-5
        // rating cannot express it.
        review('r3', 'STAR_RATING_UNSPECIFIED'),
      ]),
    );

    const state = await provider.listReviews('loc-1');
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.code).toBe('gbp_reviews_partial');
    expect(state.message).toMatch(/could not read 1 of them/i);
  });

  it('keeps the "none of them were readable" case as its own distinct failure', async () => {
    const { provider } = harness(reviewsRoute([review('r1', 'STAR_RATING_UNSPECIFIED')]));
    const state = await provider.listReviews('loc-1');
    if (state.status !== 'error') throw new Error('expected error');
    expect(state.code).toBe('gbp_reviews_unmappable');
  });

  it('returns a ready list only when nothing at all was lost', async () => {
    const { provider } = harness(reviewsRoute([review('r1', 'FIVE'), review('r2', 'ONE')]));
    const state = await provider.listReviews('loc-1');
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value.items).toHaveLength(2);
  });

  it('still gives the detailed reader everything, with the losses named', async () => {
    const { provider } = harness(
      reviewsRoute([review('r1', 'FIVE'), { reviewer: { displayName: 'B' } }]),
    );
    const state = await provider.listReviewsDetailed('loc-1');
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.value.reviews).toHaveLength(1);
    expect(state.value.skipped).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. No fabricated reply timestamp can escape                                 */
/* -------------------------------------------------------------------------- */

describe('review replies: no invented timestamp, ever', () => {
  const detail = (over: Partial<GbpReviewDetail>): GbpReviewDetail => ({
    reviewId: 'r1',
    authorDisplayName: 'A',
    isAnonymous: false,
    starRating: 5,
    comment: 'good',
    createTime: '2020-01-01T00:00:00Z',
    updateTime: '2020-01-05T00:00:00Z',
    replyComment: null,
    replyModeration: { kind: 'no_reply' },
    ...over,
  });

  it('drops the reply rather than borrowing the REVIEW’s timestamp for it', () => {
    const projected = toContractReview(
      detail({
        replyComment: 'thank you',
        // Google gave us a reply with no time on it at all.
        replyModeration: { kind: 'state_not_reported', submittedAt: null },
      }),
    );

    if (!projected.ok) throw new Error('expected a projectable review');
    // The old code emitted `updateTime: detail.updateTime ?? detail.createTime`
    // here — the moment the CUSTOMER wrote, presented as when the OWNER replied.
    expect(projected.review.reply).toBeNull();
    expect(projected.replyOmitted).toBe(true);
  });

  it('uses the reply’s own timestamp when Google actually sent one', () => {
    const projected = toContractReview(
      detail({
        replyComment: 'thank you',
        replyModeration: { kind: 'state_not_understood', raw: 'X', submittedAt: '2020-01-06T00:00:00Z' },
      }),
    );
    if (!projected.ok) throw new Error('expected a projectable review');
    expect(projected.review.reply).toEqual({
      comment: 'thank you',
      updateTime: '2020-01-06T00:00:00Z',
    });
    expect(projected.replyOmitted).toBe(false);
    // Never the review's own times.
    expect(projected.review.reply?.updateTime).not.toBe('2020-01-01T00:00:00Z');
    expect(projected.review.reply?.updateTime).not.toBe('2020-01-05T00:00:00Z');
  });

  it('never emits an empty string where a timestamp belongs', () => {
    const moderations: GbpReviewDetail['replyModeration'][] = [
      { kind: 'no_reply' },
      { kind: 'published', updateTime: '2020-01-06T00:00:00Z' },
      { kind: 'published_time_unknown' },
      { kind: 'pending_moderation', submittedAt: null },
      { kind: 'pending_moderation', submittedAt: '2020-01-06T00:00:00Z' },
      { kind: 'rejected', reason: null, helpUri: null },
      { kind: 'state_not_understood', raw: 'X', submittedAt: null },
      { kind: 'state_not_reported', submittedAt: null },
    ];

    for (const replyModeration of moderations) {
      const projected = toContractReview(detail({ replyComment: 'thank you', replyModeration }));
      if (!projected.ok) throw new Error('expected a projectable review');
      const reply = projected.review.reply;
      if (reply === null) continue;
      expect(reply.updateTime).not.toBe('');
      expect(reply.updateTime.length).toBeGreaterThan(0);
      expect(reply.updateTime).toBe(replyTimestamp(replyModeration));
    }
  });

  it('refuses to call a reply published-at-a-time when Google gave no time', () => {
    // A verified 'published' meaning with no updateTime on the wire. The old
    // code returned { kind: 'published', updateTime: '' }.
    const withoutTime = classifyReply({ comment: 'thanks', state: 'PUBLISHED_UNVERIFIED' });
    // REVIEW_REPLY_STATE_MEANINGS is deliberately empty, so nothing normalises
    // to 'published' today — but whatever it normalises to must not carry a
    // fabricated time.
    expect(replyTimestamp(withoutTime)).toBeNull();
    expect(describeReplyModeration(withoutTime)).not.toMatch(/live on Google$/);
  });

  it('names the star-rating loss instead of returning a bare null', () => {
    const projected = toContractReview(detail({ starRating: null }));
    expect(projected.ok).toBe(false);
    if (projected.ok) return;
    expect(projected.reason).toMatch(/star rating/i);
  });

  it('refuses to hand back a replied-to review whose reply it cannot carry', async () => {
    const replied = {
      reviewId: 'r1',
      reviewer: { displayName: 'A' },
      starRating: 'FIVE',
      comment: 'good',
      createTime: '2020-01-01T00:00:00Z',
      // A reply with a comment and NO updateTime at all.
      reviewReply: { comment: 'thank you' },
    };
    const { provider } = harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.healthy),
      'reviews.updateReply': ok({}),
      'reviews.get': ok(replied),
      'reviews.list': ok({ reviews: [replied] }),
    });

    const state = await provider.replyToReview('loc-1', 'r1', 'thank you');
    expect(state.status).toBe('error');
    if (state.status !== 'error') return;
    expect(state.message).toMatch(/did not say when/i);
    expect(state.message).not.toMatch(/published/i);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. "Google is still verifying you" is not "you have no activity"            */
/* -------------------------------------------------------------------------- */

describe('wait_for_voice_of_merchant never renders as "nothing yet"', () => {
  const gate = voiceOfMerchantGate({ kind: 'wait_for_voice_of_merchant' });

  it('does not use no_data_yet', () => {
    expect(gate?.reason).toBe('insufficient_data');
    expect(gate?.reason).not.toBe('no_data_yet');
  });

  it('renders copy that says nothing about the owner having no activity', () => {
    if (gate === null) throw new Error('waiting for Voice of Merchant must be gated');
    const copy = UNAVAILABLE_COPY[gate.reason];
    // This is the whole point of the fix: the reason code drives app-wide copy.
    expect(copy.title).not.toMatch(/nothing/i);
    expect(copy.body).not.toMatch(/no activity/i);
    expect(UNAVAILABLE_COPY.no_data_yet.body).toMatch(/no activity/i);
  });

  it('keeps the real explanation in the message', () => {
    if (gate === null) throw new Error('waiting for Voice of Merchant must be gated');
    expect(gate.message).toMatch(/Google/);
    expect(gate.message).toMatch(/nothing to fix/i);
  });

  it('reaches a caller as insufficient_data, not as an empty review list', async () => {
    const { provider } = harness({
      'locations.getVoiceOfMerchantState': ok(fixtureVoiceOfMerchantStates.wait),
    });
    const state = await provider.listReviews('loc-1');
    expect(state).toMatchObject({ status: 'unavailable', reason: 'insufficient_data' });
  });
});

/* -------------------------------------------------------------------------- */
/* 5. One metric registry, not two                                             */
/* -------------------------------------------------------------------------- */

describe('the daily metric registry has a single source of truth', () => {
  const featuresDir = path.join(__dirname, '..', '..');

  const sourceFiles = (root: string): string[] =>
    fs
      .readdirSync(root, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? entry.name === '__tests__'
            ? []
            : sourceFiles(path.join(root, entry.name))
          : entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')
            ? [path.join(root, entry.name)]
            : [],
      );

  it('is not re-declared anywhere under features/gbp', () => {
    for (const file of sourceFiles(path.join(featuresDir, 'gbp'))) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/export const LIVE_DAILY_METRICS/);
      expect(source).not.toMatch(/export const DAILY_METRIC_UNKNOWN/);
      expect(source).not.toMatch(/export const DAILY_METRIC_LABELS/);
      expect(source).not.toMatch(/export function isRenderableDailyMetric/);
    }
  });

  it('is the seo registry that features/gbp actually uses for keys and labels', () => {
    const windows = buildWindows('2020-01-07', 7);
    const { metrics } = buildMetrics(
      {
        multiDailyMetricTimeSeries: [
          {
            dailyMetricTimeSeries: [
              {
                dailyMetric: 'CALL_CLICKS',
                timeSeries: {
                  datedValues: [{ date: { year: 2020, month: 1, day: 7 }, value: '3' }],
                },
              },
            ],
          },
        ],
      },
      windows,
      'last 7 days',
    );
    expect(metrics[0]?.key).toBe(LIVE_DAILY_METRICS.CALL_CLICKS.key);
    expect(metrics[0]?.label).toBe(LIVE_DAILY_METRICS.CALL_CLICKS.label);
  });

  it('creates no import cycle: features/seo does not reach back into features/gbp', () => {
    for (const file of sourceFiles(path.join(featuresDir, 'seo'))) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from '@\/features\/gbp/);
      expect(source).not.toMatch(/from '\.\.\/gbp/);
    }
  });
});
