/**
 * The parts every prompt shares. Owner: Yash.
 *
 * Only three things are genuinely common across Instagram, Facebook and Google:
 * the facts the model may use, the language to write in, and the owner's
 * objective. Everything else — who is reading, what the surface rewards, what
 * shape the output takes — differs per platform and lives in the per-platform
 * files. That split is deliberate: a shared "tone" block would quietly become
 * one caption in three costumes.
 *
 * ================== THE FACT SHEET IS THE ANTI-FABRICATION HALF ============
 *
 * `factSheet` renders `BusinessContext` and then states, in the prompt, that
 * nothing outside it may be asserted. That is the FIRST half of the guard and
 * the weaker one — a prompt is a request. `fabrication.ts` checks the output
 * and rejects violations, which is the half that actually holds.
 *
 * Both exist because they fail differently: the prompt reduces how often a
 * model invents, and the checker catches it when it does anyway.
 */

import { assertableFacts, hasOffer, placeLabel, type BusinessContext, type ContentObjective } from '../context';
import { CAPTION_LANGUAGE_LABEL } from '../../types';

import type { ContentObjectiveKind } from '../context';

const OBJECTIVE_INSTRUCTION: Record<ContentObjectiveKind, string> = {
  promote_service: 'The point of this post is to make one specific service sound worth booking.',
  announce_offer: 'The point of this post is to announce the offer recorded below. Do not invent terms it does not state.',
  share_update: 'The point of this post is to share a piece of news about the business.',
  answer_question: 'The point of this post is to answer one question customers actually ask.',
  showcase_work: 'The point of this post is to show off a recent piece of work.',
};

export function objectiveLine(objective: ContentObjective): string {
  return [
    'WHAT THE OWNER ASKED FOR',
    OBJECTIVE_INSTRUCTION[objective.kind],
    `In their words: "${objective.brief.trim()}"`,
  ].join('\n');
}

export function languageLine(objective: ContentObjective): string {
  const label = CAPTION_LANGUAGE_LABEL[objective.language];
  if (objective.language === 'hinglish') {
    return [
      'LANGUAGE',
      'Write in Hinglish — Hindi and English mixed the way people actually speak',
      'in urban India, in Latin script. Do not translate; write it naturally.',
    ].join('\n');
  }
  if (objective.language === 'en') {
    return ['LANGUAGE', 'Write in English. Indian English is correct here, not American.'].join('\n');
  }
  return [
    'LANGUAGE',
    `Write in ${label}, in its own script. Do not transliterate into Latin script,`,
    'and do not append an English translation.',
  ].join('\n');
}

/**
 * Every fact the model may use, and the rule that it may use nothing else.
 *
 * The closing sentence is the important one. Without it a model treats the
 * fact sheet as *context* rather than as *the boundary*, and fills gaps with
 * plausible invention — which is exactly the failure `fabrication.ts` exists to
 * catch.
 */
export function factSheet(context: BusinessContext): string {
  const lines: string[] = ['THE ONLY FACTS YOU MAY USE', `Business name: ${context.name}`, `Type: ${context.category}`];

  const place = placeLabel(context);
  lines.push(place === null ? 'Location: not stated — do not name any place.' : `Location: ${place}`);

  lines.push(
    context.services.length === 0
      ? 'Services: not stated — do not name any specific service.'
      : `Services offered: ${context.services.join(', ')}`,
  );

  if (context.audience !== null) lines.push(`Who they serve: ${context.audience}`);
  lines.push(
    context.hours === null
      ? 'Opening hours: not stated — do not mention hours or say they are open late.'
      : `Opening hours: ${context.hours}`,
  );

  if (hasOffer(context) && context.offer !== null) {
    lines.push(`Current offer: ${context.offer.description}`);
    if (context.offer.amount !== null) lines.push(`Offer amount: ${context.offer.amount}`);
    if (context.offer.endsAt !== null) lines.push(`Offer ends: ${context.offer.endsAt}`);
  } else {
    lines.push(
      'Current offer: NONE. Do not mention a discount, sale, deal, free item or',
      'special price of any kind. There is no offer to advertise.',
    );
  }

  if (context.keywords.length > 0) {
    lines.push(
      `Words worth including if they fit naturally: ${context.keywords.join(', ')}`,
      'Use each at most once. Repeating them is stuffing and will be rejected.',
    );
  }

  lines.push(
    '',
    'HARD RULE: everything you assert must come from the list above. Do not invent',
    'prices, percentages, phone numbers, awards, certifications, guarantees,',
    'years in business, customer counts, or services that are not listed. If you',
    'do not know something, write around it. A vaguer sentence is always better',
    'than an invented fact.',
  );

  return lines.join('\n');
}

/** The facts as a flat list, for tests and for the fabrication checker. */
export function factsFor(context: BusinessContext): string[] {
  return assertableFacts(context);
}
