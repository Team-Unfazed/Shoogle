import {
  buildPostsView,
  describeOutcome,
  describeTargetResults,
  newTarget,
  primaryAction,
  publishSummary,
  resultFor,
  targetsForAction,
  type Platform,
  type PublishFailureKind,
  type PublishTarget,
  type SocialPost,
} from '../index';

/**
 * PARTIAL SUCCESS.
 *
 * A post aimed at three platforms where two succeed is the easiest thing in this
 * product to misreport. It genuinely reached two, so `state` is `published` and
 * `published` is terminal — Instagram cannot be un-published. But if the list
 * then shows it the way it shows a clean success, the owner believes all three
 * went out and finds out from a customer that Facebook never did.
 *
 * So the overall outcome is DERIVED from the per-target results on every read,
 * and is deliberately not a field on `SocialPost`: a stored summary can disagree
 * with the targets it summarises, and the moment it does, one of the two is
 * lying to the owner.
 */

const IST = 'Asia/Kolkata';
const NOW = new Date('2026-09-13T04:00:00.000Z');

/* -------------------------------------------------------------------------- */
/* Builders                                                                   */
/* -------------------------------------------------------------------------- */

function published(platform: Platform, remoteId = `r-${platform}`): PublishTarget {
  return {
    platform,
    status: 'succeeded',
    permalink: `https://example.invalid/${remoteId}`,
    remoteId,
    publishedAt: '2026-09-12T03:30:00.000Z',
    failure: null,
  };
}

function broken(
  platform: Platform,
  kind: PublishFailureKind,
  message = 'Something went wrong.',
  status: 'failed' | 'skipped' = 'failed',
): PublishTarget {
  return {
    platform,
    status,
    permalink: null,
    remoteId: null,
    publishedAt: null,
    failure: { code: kind === 'authorization' ? 'auth_expired' : 'rejected', kind, message, retryable: true },
  };
}

/** The owner's own skip: product rule 5, and carries no reason. */
function skippedByOwner(platform: Platform): PublishTarget {
  return { ...newTarget(platform), status: 'skipped' };
}

function post(targets: PublishTarget[], over: Partial<SocialPost> = {}): SocialPost {
  return {
    id: 'p1',
    businessId: 'b1',
    title: 'Weekday mornings',
    state: 'published',
    content: {},
    media: [],
    carouselId: null,
    schedule: null,
    targets,
    insights: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  };
}

/* ========================================================================== */
/* 1. all_succeeded requires a remote id from every target                    */
/* ========================================================================== */

describe('all_succeeded is earned, not set', () => {
  it('reports all_succeeded when every target carries a provider id', () => {
    const summary = publishSummary(post([published('instagram'), published('facebook')]));
    expect(summary.outcome).toBe('all_succeeded');
    expect(summary.isPartial).toBe(false);
    expect(summary.needsAttention).toBe(false);
  });

  /**
   * THE ONE THAT MATTERS. A target marked `succeeded` with no remote id is not
   * a publication — nothing confirms it went out. It must not count toward
   * all_succeeded, and it must not read as published.
   */
  it('refuses all_succeeded when a target claims success with no remote id', () => {
    const unconfirmed: PublishTarget = { ...published('facebook'), remoteId: null, permalink: null };
    const summary = publishSummary(post([published('instagram'), unconfirmed]));

    expect(summary.outcome).not.toBe('all_succeeded');
    expect(summary.published).toEqual(['instagram']);
    expect(resultFor(unconfirmed).kind).not.toBe('published');
  });

  it('refuses all_succeeded when the owner deliberately skipped a target', () => {
    // Not a problem — but not every target published, so not all_succeeded.
    const summary = publishSummary(post([published('instagram'), skippedByOwner('facebook')]));
    expect(summary.outcome).toBe('partial');
    expect(summary.isPartial).toBe(true);
    expect(summary.needsAttention).toBe(false);
  });

  it('reports not_attempted for a post nobody has published yet', () => {
    const summary = publishSummary(post([newTarget('instagram')], { state: 'scheduled' }));
    expect(summary.outcome).toBe('not_attempted');
    expect(summary.published).toEqual([]);
  });

  it('reports all_failed when nothing published', () => {
    const summary = publishSummary(
      post([broken('instagram', 'publish'), broken('facebook', 'authorization')]),
    );
    expect(summary.outcome).toBe('all_failed');
    expect(summary.isPartial).toBe(false);
    expect(summary.needsAttention).toBe(true);
  });
});

/* ========================================================================== */
/* 2. Auth and non-auth problems stay distinct                                */
/* ========================================================================== */

describe('an authorization problem is not a publishing failure', () => {
  it('an auth failure produces Reconnect required, with a reconnect action', () => {
    const result = resultFor(broken('facebook', 'authorization', 'Permission expired.'));
    expect(result.kind).toBe('reconnect_required');
    expect(result.label).toBe('Reconnect required');
    expect(result.action).toBe('reconnect');
  });

  it('a non-auth failure produces Failed, with a retry action', () => {
    const result = resultFor(broken('instagram', 'publish', 'Image was rejected.'));
    expect(result.kind).toBe('failed');
    expect(result.label).toBe('Failed');
    expect(result.action).toBe('retry');
  });

  it('an unreachable platform Shoogle skipped asks for a reconnect, not a retry', () => {
    // Retrying changes nothing while the platform cannot be reached.
    const result = resultFor(broken('facebook', 'authorization', 'Facebook skipped.', 'skipped'));
    expect(result.kind).toBe('reconnect_required');
    expect(result.action).toBe('reconnect');
  });

  it('the owner’s deliberate skip stays distinct from both', () => {
    const result = resultFor(skippedByOwner('facebook'));
    expect(result.kind).toBe('skipped_by_owner');
    expect(result.label).toBe('Skipped by you');
    // Nothing to fix, so nothing is offered. Nagging about a deliberate choice
    // would be worse than saying nothing.
    expect(result.action).toBeNull();
    expect(result.detail).toBeNull();
  });

  it('an untouched target is Not attempted', () => {
    const result = resultFor(newTarget('google_business'));
    expect(result.kind).toBe('not_attempted');
    expect(result.label).toBe('Not attempted');
    expect(result.action).toBeNull();
  });

  it('keeps a deliberate skip out of the attention count', () => {
    const summary = publishSummary(post([published('instagram'), skippedByOwner('facebook')]));
    expect(summary.skippedByOwner).toEqual(['facebook']);
    expect(summary.needsReconnect).toEqual([]);
    expect(summary.failed).toEqual([]);
    expect(primaryAction(summary)).toBeNull();
  });
});

/* ========================================================================== */
/* 3. The worked example                                                      */
/* ========================================================================== */

describe('Instagram ✓, Facebook needs reconnection, Google ✓', () => {
  const theCase = post([
    published('instagram', 'ig-1'),
    broken('facebook', 'authorization', 'Facebook permission expired.'),
    published('google_business', 'gbp-1'),
  ]);
  const summary = publishSummary(theCase);

  it('keeps Instagram’s success completely intact', () => {
    const instagram = summary.results.find((r) => r.platform === 'instagram');
    expect(instagram?.kind).toBe('published');
    expect(instagram?.remoteId).toBe('ig-1');
    expect(instagram?.permalink).toBe('https://example.invalid/ig-1');
    expect(instagram?.action).toBeNull();
  });

  it('never claims Facebook published', () => {
    const facebook = summary.results.find((r) => r.platform === 'facebook');
    expect(facebook?.kind).toBe('reconnect_required');
    expect(facebook?.remoteId).toBeNull();
    expect(facebook?.permalink).toBeNull();
  });

  it('reports the outcome as partial and needing attention', () => {
    expect(summary.outcome).toBe('partial');
    expect(summary.isPartial).toBe(true);
    expect(summary.needsAttention).toBe(true);
    expect([...summary.published].sort()).toEqual(['google_business', 'instagram']);
    expect(summary.needsReconnect).toEqual(['facebook']);
  });

  it('names every platform with its own result, rather than counting them', () => {
    // A count tells the owner how many; what she needs is WHICH. She cannot
    // reconnect a number.
    const line = describeTargetResults(summary);
    expect(line).toBe(
      'Instagram published · Facebook reconnect required · Google Business published',
    );
  });

  it('offers reconnect, because it blocks the retry', () => {
    expect(primaryAction(summary)).toBe('reconnect');
  });

  /** Reconnecting must not re-publish Instagram — that would post twice. */
  it('applies the action ONLY to the affected target', () => {
    expect(targetsForAction(summary, 'reconnect')).toEqual(['facebook']);
    expect(targetsForAction(summary, 'reconnect')).not.toContain('instagram');
    expect(targetsForAction(summary, 'reconnect')).not.toContain('google_business');
  });

  it('scopes a retry to the targets that can actually be retried', () => {
    const mixed = publishSummary(
      post([
        published('instagram'),
        broken('facebook', 'authorization'),
        broken('google_business', 'publish'),
      ]),
    );
    // Retrying an authorization problem fails identically until reconnection,
    // so Facebook is not in the retry set.
    expect(targetsForAction(mixed, 'retry')).toEqual(['google_business']);
    expect(targetsForAction(mixed, 'reconnect')).toEqual(['facebook']);
  });
});

/* ========================================================================== */
/* 4. A partial post can never render as fully successful                     */
/* ========================================================================== */

describe('the Posts view cannot present a partial post as a clean success', () => {
  const partial = post([
    published('instagram', 'ig-1'),
    broken('facebook', 'authorization', 'Facebook permission expired.'),
  ]);

  it('marks the published row partial and needing attention', () => {
    const row = buildPostsView([partial], IST, NOW).published[0];
    expect(row).toBeDefined();
    expect(row?.partial).toBe(true);
    expect(row?.needsAttention).toBe(true);
  });

  it('never shows a bare "Published" line for it', () => {
    const row = buildPostsView([partial], IST, NOW).published[0];
    expect(row?.result).not.toBe('Published');
    expect(row?.result).toMatch(/^Partly published/);
    expect(row?.result).toMatch(/Facebook reconnect required/);
  });

  /**
   * Reach numbers beside a post that only half went out would be the most
   * misleading thing on the screen: real numbers implying a publication that
   * did not fully happen.
   */
  it('suppresses reported metrics on a partial post in favour of the outcome', () => {
    const withInsights = post(partial.targets, {
      insights: { reach: 2412, saves: 84, reportedAt: '2026-09-12T10:00:00.000Z' },
    });
    const row = buildPostsView([withInsights], IST, NOW).published[0];

    expect(row?.result).not.toMatch(/2,412/);
    expect(row?.result).toMatch(/Partly published/);
  });

  it('carries the per-platform breakdown on the row itself', () => {
    const row = buildPostsView([partial], IST, NOW).published[0];
    expect(row?.perPlatform).toBe('Instagram published · Facebook reconnect required');
  });

  it('offers Reconnect on the row', () => {
    const row = buildPostsView([partial], IST, NOW).published[0];
    expect(row?.actionLabel).toBe('Reconnect');
  });

  it('puts the post in the attention slot as well as the published list', () => {
    const view = buildPostsView([partial], IST, NOW);
    expect(view.needsAttention?.id).toBe('p1');
    expect(view.needsAttention?.actionLabel).toBe('Reconnect');
  });

  it('still renders a clean success cleanly', () => {
    const clean = post([published('instagram'), published('facebook')]);
    const row = buildPostsView([clean], IST, NOW).published[0];

    expect(row?.partial).toBe(false);
    expect(row?.needsAttention).toBe(false);
    expect(row?.actionLabel).toBeNull();
    // The familiar line survives for the case it was written for.
    expect(row?.result).toMatch(/^Published /);
  });

  it('offers Retry rather than Reconnect when the problem is a rejection', () => {
    const rejected = post([published('instagram'), broken('facebook', 'publish', 'Image rejected.')]);
    const row = buildPostsView([rejected], IST, NOW).published[0];
    expect(row?.actionLabel).toBe('Retry');
    expect(row?.result).toMatch(/Facebook failed/);
  });

  it('does not flag a post the owner deliberately kept off one platform', () => {
    const deliberate = post([published('instagram'), skippedByOwner('facebook')]);
    const view = buildPostsView([deliberate], IST, NOW);
    const row = view.published[0];

    // Partial, but nothing is wrong: no attention, no action, no nagging.
    expect(row?.partial).toBe(true);
    expect(row?.needsAttention).toBe(false);
    expect(row?.actionLabel).toBeNull();
    expect(view.needsAttention).toBeNull();
  });
});

/* ========================================================================== */
/* 5. The summary is derived, not stored                                      */
/* ========================================================================== */

describe('the summary is derived on every read', () => {
  it('is not a field on the post', () => {
    const subject = post([published('instagram')]);
    expect('summary' in subject).toBe(false);
    expect('outcome' in subject).toBe(false);
  });

  it('changes the moment a target changes, with nothing to invalidate', () => {
    const before = publishSummary(post([published('instagram'), newTarget('facebook')]));
    expect(before.outcome).toBe('partial');

    const after = publishSummary(post([published('instagram'), published('facebook')]));
    expect(after.outcome).toBe('all_succeeded');
  });

  it('describes an outcome without inventing a publication', () => {
    expect(describeOutcome(publishSummary(post([published('instagram'), published('facebook')]))))
      .toBe('Published everywhere');
    expect(describeOutcome(publishSummary(post([newTarget('instagram')])))).toBe('Not published yet');
    expect(describeOutcome(publishSummary(post([broken('instagram', 'publish')]))))
      .toMatch(/^Not published/);
  });

  it('says which platforms went out when a partial post has nothing wrong', () => {
    const summary = publishSummary(post([published('instagram'), skippedByOwner('facebook')]));
    expect(describeOutcome(summary)).toBe('Published to Instagram');
  });

  it('reports in_progress while a target is in flight', () => {
    const inFlight: PublishTarget = { ...newTarget('facebook'), status: 'in_flight' };
    const summary = publishSummary(post([published('instagram'), inFlight]));
    expect(summary.outcome).toBe('in_progress');
    expect(resultFor(inFlight).label).toBe('Publishing…');
  });
});
