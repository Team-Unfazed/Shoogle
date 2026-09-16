/**
 * The Facebook prompt. Owner: Yash.
 *
 * Facebook sits between the other two and is the easiest to get wrong by
 * copying one of them.
 *
 * The reader is not scrolling a visual feed the way an Instagram reader is, and
 * they are not searching the way a Google reader is. They are a local person
 * who already follows the Page, or who was shown it because a neighbour
 * engaged with it. That makes Facebook the NOTICEBOARD surface: practical
 * information, stated plainly, that someone might share with a friend.
 *
 * Concrete differences from the Instagram prompt:
 *   - LONGER is allowed. Meta documents no message limit, so this asks for
 *     100-200 words rather than 60-120.
 *   - NO hashtags. They are not a discovery surface on a Page and they read as
 *     imported-from-Instagram, which is precisely what this must not be.
 *   - Practical detail is WELCOME — hours, what to bring, where to park —
 *     where Instagram was told to leave it on the profile.
 *   - A post can be words alone, so the prompt never assumes a photo exists.
 */

import { placeLabel, type BusinessContext, type ContentObjective } from '../context';

import { factSheet, languageLine, objectiveLine } from './shared';

export function facebookPrompt(
  context: BusinessContext,
  objective: ContentObjective,
  options: { hasMedia?: boolean; hasLink?: boolean } = {},
): string {
  const place = placeLabel(context);
  const lines: string[] = [
    'Write ONE Facebook Page post for a small local business in India.',
    '',
    'WHO IS READING IT',
    'A local person who follows this Page, or who was shown the post because a',
    'neighbour engaged with it. Think noticeboard, not billboard: something',
    'useful enough that someone might tag a friend in the comments.',
    '',
    'HOW TO WRITE IT',
    '- Plain, warm, practical. Say the useful thing early.',
    '- Practical detail belongs here: what to expect, when to come, what to ask',
    '  for. Only from the facts below.',
    '- Vary sentence length. Do not write three sentences of identical shape.',
    '- No hashtags at all. Hashtags on a Page post read as copied from Instagram.',
    '- No "link in bio" — that is an Instagram phrase and makes no sense here.',
    '- 100 to 200 words. You have more room than an Instagram caption; use it',
    '  for substance, not for padding.',
  ];

  if (options.hasMedia !== true) {
    lines.push(
      '- This post may have no photo, so it has to stand up on its own words.',
      '  Do not write "swipe up", "see the photo" or "check out the image".',
    );
  }

  if (options.hasLink === true) {
    lines.push('- A link is attached. Refer to it naturally; do not paste a URL in the text.');
  }

  if (place !== null) {
    lines.push(`- ${place} may be mentioned once if it reads naturally.`);
  }

  lines.push('', objectiveLine(objective), '', factSheet(context), '', languageLine(objective));

  lines.push(
    '',
    'OUTPUT',
    'Return the post text only. No preamble, no explanation, no hashtags, no',
    'quotes around it.',
  );

  return lines.join('\n');
}
