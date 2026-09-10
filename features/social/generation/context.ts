/**
 * BusinessContext — the single source of truth for what a generator may say.
 * Owner: Yash.
 *
 * ==================== THE ONLY FACTS THAT MAY BE USED ======================
 *
 * Everything a generated post asserts about a business must be traceable to a
 * field below. That is not a style rule, it is the anti-fabrication contract:
 * `fabrication.ts` checks generated text against this object and rejects any
 * claim, number, price, offer or service that is not here.
 *
 * A model that invents "20% off this week" for a salon that has no offer has
 * not written a weak caption — it has published a false advertisement in a real
 * business's voice. The owner finds out when a customer arrives expecting the
 * discount.
 *
 * WHY THIS IS NARROW
 * ------------------
 * It carries no customer names, no review text, no phone numbers and no
 * pricing beyond what the owner explicitly stated. Widening it is the moment to
 * re-read the data-use terms of whichever model tier is configured — see
 * `features/seo/ai/gemini.ts`, which refuses anything not classified as
 * fixture data.
 */

import type { BusinessCategory } from '@/types/domain';

import type { CaptionLanguage, Platform } from '../types';

/* -------------------------------------------------------------------------- */
/* The context                                                                */
/* -------------------------------------------------------------------------- */

export interface BusinessContext {
  readonly businessId: string;
  readonly name: string;
  readonly category: BusinessCategory;
  /**
   * Neighbourhood or area, e.g. "Vashi". Null when the owner has not told us —
   * and null means the generator may not name a locality at all, not that it
   * may guess one from the city.
   */
  readonly locality: string | null;
  /** City, e.g. "Navi Mumbai". Null when unknown. */
  readonly city: string | null;
  /**
   * Services the business actually offers. A generated post may name these and
   * ONLY these — "we also do bridal makeup" is a fabrication if it is not here.
   */
  readonly services: readonly string[];
  /**
   * Keywords the owner wants to rank for. Guidance for the model, not licence
   * to repeat them: `humanize.ts` rejects stuffing.
   */
  readonly keywords: readonly string[];
  /** Who the post is talking to, in the owner's words. Null when unstated. */
  readonly audience: string | null;
  /**
   * A live offer, if and only if one genuinely exists. **Null is the default
   * and the safe state.** A non-null value here is the ONLY licence a
   * generator has to mention a discount.
   */
  readonly offer: BusinessOffer | null;
  /** Opening hours as the owner stated them. Null when unknown. */
  readonly hours: string | null;
}

export interface BusinessOffer {
  /** What the offer is, in the owner's words, e.g. "20% off colour". */
  readonly description: string;
  /** The discount as the owner stated it, e.g. "20%". Null when unquantified. */
  readonly amount: string | null;
  /** When it ends, ISO. Null for an open-ended offer. */
  readonly endsAt: string | null;
}

/**
 * What the owner asked for on this particular post.
 *
 * Separate from `BusinessContext` because the context is durable and the
 * objective is per-post. Product rule 2 — minimise owner input — means `brief`
 * is the only free-text field the composer asks for.
 */
export interface ContentObjective {
  readonly kind: ContentObjectiveKind;
  /** The owner's own words, e.g. "monsoon offer, quiet weekday mornings". */
  readonly brief: string;
  readonly language: CaptionLanguage;
  /** Platforms this objective is being written for. */
  readonly platforms: readonly Platform[];
}

export type ContentObjectiveKind =
  | 'promote_service'
  | 'announce_offer'
  | 'share_update'
  | 'answer_question'
  | 'showcase_work';

export const OBJECTIVE_LABEL: Record<ContentObjectiveKind, string> = {
  promote_service: 'Promote a service',
  announce_offer: 'Announce an offer',
  share_update: 'Share an update',
  answer_question: 'Answer a common question',
  showcase_work: 'Show recent work',
};

/* -------------------------------------------------------------------------- */
/* Derived facts                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Every fact a generator is allowed to assert, as plain strings.
 *
 * `fabrication.ts` checks generated text against exactly this list, so the two
 * cannot drift: adding a field to `BusinessContext` without adding it here
 * means the generator may not use it, which fails safe.
 */
export function assertableFacts(context: BusinessContext): string[] {
  const facts: string[] = [context.name, context.category];
  if (context.locality !== null) facts.push(context.locality);
  if (context.city !== null) facts.push(context.city);
  if (context.audience !== null) facts.push(context.audience);
  if (context.hours !== null) facts.push(context.hours);
  facts.push(...context.services, ...context.keywords);
  if (context.offer !== null) {
    facts.push(context.offer.description);
    if (context.offer.amount !== null) facts.push(context.offer.amount);
  }
  return facts.filter((fact) => fact.trim() !== '');
}

/**
 * Whether this business has a genuine offer to talk about.
 *
 * The `announce_offer` objective is refused when this is false, rather than
 * letting a model invent something to announce. An owner who picks "announce an
 * offer" with no offer recorded has made a mistake Shoogle can name.
 */
export function hasOffer(context: BusinessContext): boolean {
  return context.offer !== null && context.offer.description.trim() !== '';
}

/**
 * "Vashi, Navi Mumbai", or the city alone, or null.
 *
 * Never invents a locality from a city or vice versa — a post that places a
 * salon in the wrong neighbourhood is worse for local search than one that
 * names no neighbourhood at all.
 */
export function placeLabel(context: BusinessContext): string | null {
  if (context.locality !== null && context.city !== null) {
    return `${context.locality}, ${context.city}`;
  }
  return context.locality ?? context.city;
}
