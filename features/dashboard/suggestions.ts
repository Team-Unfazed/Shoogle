/**
 * What Shoogle proposes the owner does next. Owner: Aryan.
 *
 * Product rule 1 says Shoogle is an operator, not a CRM: it proposes work and
 * does it. This file is where that promise is kept or broken, so it has one
 * non-negotiable rule.
 *
 * ## A suggestion may only be derived from a `ready` source
 *
 * "Reply to Priya's review" is a claim that a review exists and is unanswered.
 * If SEO's summary is `loading`, `unavailable` or `error`, we do not know that,
 * and proposing it anyway means sending the owner to a screen that contradicts
 * the card that sent them. Every derivation below therefore begins by checking
 * `isReady`, and there is no fallback branch that guesses.
 *
 * The counterpart to that rule: suggestions we CANNOT derive are not missing
 * from the product, they arrive as their own source. A drafted post ready to
 * schedule is authored by the content engine — no amount of counting produces
 * one — so it comes in on `sources.suggestions` and is merged here.
 *
 * ## Ranking
 *
 * `blocked` beats everything: something the owner already set up has stopped
 * working, and no proposal is worth more than saying so. `content` comes next
 * because proposing prepared work IS the product — a dashboard that only ever
 * reports problems is the CRM we said we would not build. `attention` is work
 * the owner must judge, and `nudge` is optional polish.
 */

import { isReady } from '@/lib/state/DataState';
import type { HomeSources, HomeSuggestion, SuggestionKind } from './types';

/** Higher wins. Gaps left between values so a kind can be slotted in later. */
const KIND_WEIGHT: Record<SuggestionKind, number> = {
  blocked: 40,
  content: 30,
  attention: 20,
  nudge: 10,
};

/* -------------------------------------------------------------------------- */
/* Derivation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Suggestions derived from module state, plus any the content engine authored.
 *
 * Order here does not matter — `rankSuggestions` decides what the owner sees
 * first. What matters is that every branch is gated on a ready source.
 */
export function suggestionsFrom(sources: HomeSources): HomeSuggestion[] {
  const out: HomeSuggestion[] = [];

  /* Authored by the content engine, not derivable from counts. -------------- */
  if (isReady(sources.suggestions)) {
    out.push(...sources.suggestions.value);
  }

  /* Social ------------------------------------------------------------------ */
  if (isReady(sources.social)) {
    const { failedCount, draftCount } = sources.social.value;

    if (failedCount > 0) {
      out.push({
        id: 'derived-social-failed',
        kind: 'blocked',
        label: 'POST FAILED',
        accent: 'red',
        title: failedCount === 1 ? 'A post did not publish' : `${failedCount} posts did not publish`,
        body: 'Check what went wrong and try again.',
        primaryLabel: 'Review',
        href: '/(tabs)/posts',
      });
    }

    if (draftCount > 0) {
      out.push({
        id: 'derived-social-draft',
        kind: 'nudge',
        label: 'DRAFT',
        accent: 'blue',
        title: draftCount === 1 ? 'One draft is waiting' : `${draftCount} drafts are waiting`,
        // Product rule 4: scheduling is the default action, not posting now.
        body: 'Finish it and put it on the schedule.',
        primaryLabel: 'Open drafts',
        href: '/(tabs)/posts',
      });
    }
  }

  /* SEO --------------------------------------------------------------------- */
  if (isReady(sources.seo)) {
    const { unansweredReviewCount } = sources.seo.value;

    if (unansweredReviewCount > 0) {
      const plural = unansweredReviewCount === 1 ? '' : 's';
      out.push({
        id: 'derived-seo-reviews',
        kind: 'attention',
        label: 'REVIEWS',
        accent: 'green',
        title: `${unansweredReviewCount} review${plural} without a reply`,
        body: 'Replying quickly is the cheapest thing you can do for local ranking.',
        primaryLabel: 'Reply',
        href: '/seo/reviews',
      });
    }
  }

  /* Website ------------------------------------------------------------------ */
  if (isReady(sources.website)) {
    const { status } = sources.website.value;

    if (status === 'awaiting_review') {
      out.push({
        id: 'derived-website-review',
        kind: 'attention',
        label: 'WEBSITE',
        accent: 'amber',
        title: 'Your website is ready for review',
        body: 'Take a look and publish it when you are happy.',
        primaryLabel: 'Review',
        href: '/(tabs)/business',
      });
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Ranking                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Sort by kind, then by id for a stable order.
 *
 * The id tie-break matters more than it looks: without it, two `attention`
 * suggestions could swap places between renders and the headline card would
 * flicker between them on every refresh. `sort` is applied to a copy so the
 * caller's array is not mutated.
 */
export function rankSuggestions(suggestions: HomeSuggestion[]): HomeSuggestion[] {
  return [...suggestions].sort((a, b) => {
    const byKind = KIND_WEIGHT[b.kind] - KIND_WEIGHT[a.kind];
    return byKind !== 0 ? byKind : a.id.localeCompare(b.id);
  });
}
