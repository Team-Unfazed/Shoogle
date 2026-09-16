/**
 * The Google Business Profile prompt. Owner: Yash.
 *
 * ============ THIS IS THE ONE THAT CARRIES THE SEO/AEO/GEO WEIGHT ===========
 *
 * A GBP local post is the only one of the three read by someone who is ACTIVELY
 * SEARCHING. They typed "salon near me" or "bakery open now" into Google or
 * Maps and are comparing three listings. That changes everything about how the
 * text should be written, and it is why this prompt is the longest of the
 * three rather than the Instagram one with the word "Google" swapped in.
 *
 * The three things it asks for that the other two prompts must NOT:
 *
 *   SEO  — plain search vocabulary. Write the words a person types, not the
 *          words a brand would choose. "Haircut" beats "hair transformation".
 *          Used naturally and once; `humanize.ts` rejects stuffing, so a prompt
 *          that encouraged repetition would fight its own validator.
 *
 *   AEO  — answer-engine structure. Assistants and AI overviews quote text that
 *          answers a question in a self-contained sentence. "We do walk-ins on
 *          weekday mornings" can be lifted and quoted; "come see us!" cannot.
 *          So this prompt asks for at least one standalone, quotable answer.
 *
 *   GEO  — the locality, stated once, in a sentence that makes sense to someone
 *          who does not know the area. This is the whole reason a local post
 *          exists, and it is also where fabrication does the most damage: a
 *          post that places a shop in the wrong neighbourhood is worse than one
 *          that names no neighbourhood at all, which is why `placeLabel`
 *          returns null rather than guessing.
 *
 * Also unlike the other two: no hashtags (not a GBP concept), no emoji (they
 * read badly in a search result), and the call to action is a BUTTON Google
 * renders — so the text must not duplicate it.
 */

import { placeLabel, type BusinessContext, type ContentObjective } from '../context';
import type { GbpCtaType } from '../../content';

import { factSheet, languageLine, objectiveLine } from './shared';

const CTA_DESCRIPTION: Record<GbpCtaType, string> = {
  BOOK: 'a "Book" button',
  ORDER: 'an "Order online" button',
  SHOP: 'a "Shop" button',
  LEARN_MORE: 'a "Learn more" button',
  SIGN_UP: 'a "Sign up" button',
  CALL: 'a "Call" button',
};

export function gbpPrompt(
  context: BusinessContext,
  objective: ContentObjective,
  options: { callToAction?: GbpCtaType | null } = {},
): string {
  const place = placeLabel(context);
  const cta = options.callToAction ?? null;

  const lines: string[] = [
    'Write ONE Google Business Profile local post for a small local business in India.',
    '',
    'WHO IS READING IT',
    'Someone who just searched Google or Google Maps — "near me", "open now",',
    'or the name of a service — and is comparing two or three listings right now.',
    'They are deciding where to go in the next few minutes or days.',
    '',
    'HOW TO WRITE IT',
    '- Lead with what the business does and who it is for. No greeting, no',
    '  "Hi everyone", no hook. They are not browsing; they are choosing.',
    '- Use the plain words a person would type into Google. "Haircut", not',
    '  "hair transformation". "Repair", not "revitalise".',
    '- Include at least ONE sentence that answers a real question completely on',
    '  its own, so it still makes sense quoted out of context. For example a',
    '  sentence about who a service suits, or when to come, or what is included.',
    '  This is what an assistant or an AI answer can actually lift and quote.',
    '- Plain sentences. No emoji, no hashtags, no exclamation marks stacked up.',
    '- 40 to 100 words. A local post is scanned, not read.',
  ];

  if (place !== null) {
    lines.push(
      `- Name ${place} exactly once, in a sentence that would make sense to`,
      '  someone who does not know the area. This is a local post; the place is',
      '  the point. Do not name any other locality, and do not guess a landmark.',
    );
  } else {
    lines.push(
      '- No location has been recorded, so do not name a neighbourhood, area or',
      '  landmark at all. Placing this business in the wrong place is worse than',
      '  placing it nowhere.',
    );
  }

  if (cta !== null) {
    lines.push(
      `- Google renders ${CTA_DESCRIPTION[cta]} under this post. Do not write`,
      '  "click below", "tap the button" or repeat what the button already says.',
    );
  }

  lines.push('', objectiveLine(objective), '', factSheet(context), '', languageLine(objective));

  lines.push(
    '',
    'OUTPUT',
    'Return the post text only. No preamble, no heading, no hashtags, no quotes',
    'around it.',
  );

  return lines.join('\n');
}
