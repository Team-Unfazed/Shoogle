/**
 * The Instagram prompt. Owner: Yash.
 *
 * Instagram is read by someone SCROLLING. They are not searching for a salon;
 * they are half-watching a feed and stopped for a photo. So this prompt asks
 * for a first line that earns the second, and nothing else.
 *
 * What this prompt deliberately does NOT ask for, and the other two do:
 *   - no search-intent phrasing. Instagram captions are not indexed the way a
 *     Google post is, so writing for a searcher here wastes the one line that
 *     matters and reads like SEO filler to the person actually looking at it.
 *   - no call-to-action button language. There is no button.
 *   - no opening hours or address. They belong on the profile, not in every
 *     caption.
 *
 * Hashtags ARE asked for here and nowhere else, because Instagram is the only
 * one of the three that documents a hashtag limit and treats them as a real
 * discovery surface.
 */

import { PLATFORM_CAPABILITIES, isVerified } from '../../platforms';
import { placeLabel, type BusinessContext, type ContentObjective } from '../context';

import { factSheet, languageLine, objectiveLine } from './shared';

export function instagramPrompt(
  context: BusinessContext,
  objective: ContentObjective,
): string {
  const captionLimit = PLATFORM_CAPABILITIES.instagram.captionMaxCharacters;
  const hashtagLimit = PLATFORM_CAPABILITIES.instagram.hashtagMaxCount;
  const place = placeLabel(context);

  const lines: string[] = [
    'Write ONE Instagram caption for a small local business in India.',
    '',
    'WHO IS READING IT',
    'Someone scrolling their feed who stopped because of the photo.',
    'They are not searching for anything, so do not write for a searcher.',
    'You have one line to earn the second line.',
    '',
    'HOW TO WRITE IT',
    '- Open with something specific and concrete. No question openers, no',
    '  "looking for…", no "in today\'s world".',
    '- Vary your sentence lengths. Short. Then a longer one that carries a bit',
    '  more. People do not write in even blocks.',
    '- Sound like the owner talking, not like a brand. Contractions are fine.',
    '- Do not repeat the business name more than once.',
    '- No emoji walls. At most two, and only if they carry meaning.',
  ];

  if (place !== null) {
    lines.push(
      `- You may mention ${place} once, naturally, if it fits. Do not force it and`,
      '  do not name any other place.',
    );
  }

  if (isVerified(captionLimit)) {
    lines.push(`- Hard limit: ${captionLimit.value} characters including hashtags.`);
  }
  lines.push('- Aim for 60-120 words. Shorter is usually better here.');

  lines.push('', 'HASHTAGS');
  if (isVerified(hashtagLimit)) {
    lines.push(
      `- Give 3 to 6 hashtags. Instagram allows ${hashtagLimit.value}; using all of them`,
      '  reads as spam. Fewer, more specific tags do more.',
    );
  } else {
    lines.push('- Give 3 to 6 specific hashtags.');
  }
  lines.push('- Put them on their own line at the end, each starting with #.');

  lines.push('', objectiveLine(objective), '', factSheet(context), '', languageLine(objective));

  lines.push(
    '',
    'OUTPUT',
    'Return the caption text only. No preamble, no explanation, no quotes around it.',
  );

  return lines.join('\n');
}
