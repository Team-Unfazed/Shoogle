/**
 * The suggestion engine.
 *
 * The rule that matters most: a suggestion is only ever derived from a `ready`
 * source. Proposing "reply to 2 reviews" while SEO is still loading sends the
 * owner to a screen that contradicts the card that sent them.
 */

import { failed, loading, ready, unavailable } from '@/lib/state/DataState';
import { disconnectedSources } from '../aggregate';
import { rankSuggestions, suggestionsFrom } from '../suggestions';
import type { HomeSources, HomeSuggestion } from '../types';

const AT = '2020-01-01T00:00:00.000Z';

const authored = (over: Partial<HomeSuggestion> = {}): HomeSuggestion => ({
  id: 'authored-1',
  kind: 'content',
  label: 'SOCIAL POST',
  accent: 'blue',
  title: 'Monday morning post ready',
  body: 'A drafted caption.',
  primaryLabel: 'Review & schedule',
  href: '/(tabs)/posts',
  ...over,
});

const ids = (sources: HomeSources) => suggestionsFrom(sources).map((s) => s.id);

/* -------------------------------------------------------------------------- */

describe('a suggestion needs a ready source', () => {
  it('proposes nothing when nothing is connected', () => {
    expect(suggestionsFrom(disconnectedSources())).toEqual([]);
  });

  it('proposes nothing from a source that is merely loading', () => {
    expect(ids({ ...disconnectedSources(), seo: loading() })).toEqual([]);
  });

  it('proposes nothing from a source that errored', () => {
    expect(ids({ ...disconnectedSources(), seo: failed('E_NET', 'x') })).toEqual([]);
  });

  it('proposes nothing from an unavailable source', () => {
    expect(ids({ ...disconnectedSources(), website: unavailable('auth_expired', 'x') })).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */

describe('derivation from state', () => {
  it('raises a failed post as blocked work', () => {
    const [suggestion] = suggestionsFrom({
      ...disconnectedSources(),
      social: ready({ scheduledCount: 0, draftCount: 0, failedCount: 1 }, AT),
    });
    expect(suggestion?.kind).toBe('blocked');
    expect(suggestion?.title).toBe('A post did not publish');
  });

  it('says nothing about a queue that is simply empty', () => {
    expect(
      ids({
        ...disconnectedSources(),
        social: ready({ scheduledCount: 0, draftCount: 0, failedCount: 0 }, AT),
        seo: ready({ unansweredReviewCount: 0, improvedKeywordCount: 0 }, AT),
        website: ready({ status: 'published' }, AT),
      }),
    ).toEqual([]);
  });

  it('pluralises against the count it was given', () => {
    const one = suggestionsFrom({
      ...disconnectedSources(),
      seo: ready({ unansweredReviewCount: 1, improvedKeywordCount: null }, AT),
    });
    expect(one[0]?.title).toBe('1 review without a reply');

    const many = suggestionsFrom({
      ...disconnectedSources(),
      seo: ready({ unansweredReviewCount: 4, improvedKeywordCount: null }, AT),
    });
    expect(many[0]?.title).toBe('4 reviews without a reply');
  });

  it('passes authored suggestions through untouched', () => {
    const suggestion = authored();
    const [out] = suggestionsFrom({
      ...disconnectedSources(),
      suggestions: ready([suggestion], AT),
    });
    expect(out).toEqual(suggestion);
  });
});

/* -------------------------------------------------------------------------- */

describe('ranking', () => {
  it('puts broken work above everything else', () => {
    const ranked = rankSuggestions([
      authored({ id: 'a', kind: 'content' }),
      authored({ id: 'b', kind: 'blocked' }),
      authored({ id: 'c', kind: 'attention' }),
    ]);
    expect(ranked.map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('puts prepared work above work that only needs judging', () => {
    // Shoogle is an operator: proposing ready work IS the product. A dashboard
    // that only ever surfaces chores is the CRM we said we would not build.
    const ranked = rankSuggestions([
      authored({ id: 'chore', kind: 'attention' }),
      authored({ id: 'post', kind: 'content' }),
    ]);
    expect(ranked[0]?.id).toBe('post');
  });

  it('is stable within a kind, so the headline does not flicker', () => {
    const input = [
      authored({ id: 'z', kind: 'attention' }),
      authored({ id: 'a', kind: 'attention' }),
    ];
    expect(rankSuggestions(input).map((s) => s.id)).toEqual(['a', 'z']);
    expect(rankSuggestions([...input].reverse()).map((s) => s.id)).toEqual(['a', 'z']);
  });

  it('does not mutate the caller list', () => {
    const input = [authored({ id: 'a', kind: 'nudge' }), authored({ id: 'b', kind: 'blocked' })];
    rankSuggestions(input);
    expect(input.map((s) => s.id)).toEqual(['a', 'b']);
  });
});
