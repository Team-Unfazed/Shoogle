/**
 * Area H — Description & attributes. Weight 7 (3+2+2).
 * docs/research/local-seo-methodology.md §2 area H.
 *
 * H3 never hard-codes an attribute id. The set of attributes available for a
 * category in India comes from `attributes.list` and changes without notice
 * (matrix §9: "Call this before offering any attribute toggle; never hard-code
 * an attribute list."). With no catalog, H3 is `not_checked`, not a guessed list.
 */

import type { CheckDefinition } from '../types';

import {
  CAP_PATCHABLE_NO_METHOD,
  fail,
  itemsIfRead,
  need,
  notApplicable,
  pass,
  readList,
  warn,
} from './helpers';

const MIN_DESCRIPTION_CHARS = 250;
const MAX_DESCRIPTION_CHARS = 750;

const URL_PATTERN = /(https?:\/\/|www\.)\S+/i;
const PHONE_PATTERN = /(\+?91[\s-]?)?\d{5}[\s-]?\d{5}|\b\d{10}\b/;

/** H1 — is there a description at all? Weight 3. */
const H1: CheckDefinition = {
  id: 'H1',
  area: 'description',
  weight: 3,
  scored: true,
  name: 'Description present',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('profile.description'),
  sources: ['gbp.info'],
  needs: ['location'],
  leadingIndicator: 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH over 28 days.',
  failureCheck: 'If the listing shows a description publicly that profile.description does not return, our read is wrong.',
  evaluate(ctx) {
    const got = need(ctx, 'location');
    if (!got.ok) return got.evaluation;
    const { location } = got.data;

    const description = location.profileDescription?.trim() ?? '';
    if (description.length > 0) return pass();

    return fail({
      title: 'Your listing has no description',
      detail:
        'This is the paragraph that tells someone why to pick you instead of the next shop. It goes ' +
        'under Edit profile in the Google Business Profile app, in your own words — we will show ' +
        'you where to tap.',
      observation: 'profile.description is absent or empty.',
      evidence: ['Description: none'],
    });
  },
};

/** H2 — is the description any good? Weight 2, minor. */
const H2: CheckDefinition = {
  id: 'H2',
  area: 'description',
  weight: 2,
  scored: true,
  name: 'Description quality',
  severity: 'minor',
  confidence: 'inferred',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('profile.description'),
  sources: ['gbp.info', 'web'],
  needs: ['location', 'owner'],
  leadingIndicator: 'searchkeywords.impressions.monthly for service-shaped queries.',
  failureCheck: 'Length and keyword rules here are practitioner heuristics, not Google requirements, except the link rule.',
  evaluate(ctx) {
    const got = need(ctx, 'location', 'owner');
    if (!got.ok) return got.evaluation;
    const { location, owner } = got.data;

    const description = location.profileDescription?.trim() ?? '';
    if (description.length === 0) {
      return notApplicable('There is no description yet — see the finding above.');
    }

    const lower = description.toLowerCase();
    const problems: string[] = [];
    const evidence = [`Length: ${description.length} characters`];

    // This one IS a Google rule, not a heuristic: descriptions with links are removed.
    const hasUrl = URL_PATTERN.test(description);
    const hasPhone = PHONE_PATTERN.test(description);
    if (hasUrl) problems.push('it contains a link, and Google removes descriptions with links in them');
    if (hasPhone) problems.push('it contains a phone number, which Google does not allow there');

    const locality = owner.business.locality?.trim() ?? '';
    const mentionsLocality = locality.length > 0 && lower.includes(locality.toLowerCase().split(',')[0]?.trim() ?? locality.toLowerCase());
    if (locality.length > 0 && !mentionsLocality) problems.push(`it does not mention ${locality}`);

    // A service list Google never returned is left out entirely rather than
    // read as "no services", which would change what we accuse the copy of.
    const services = [
      ...owner.declaredServices,
      ...(itemsIfRead(location.serviceItems) ?? []).map((s) => s.name),
    ].filter((s) => s.trim().length > 0);
    const mentionsService = services.some((s) => lower.includes(s.toLowerCase()));
    if (services.length > 0 && !mentionsService) problems.push('it does not say what you actually do');

    if (description.length < MIN_DESCRIPTION_CHARS) {
      problems.push('it is very short, so there is little for anyone to read');
    } else if (description.length > MAX_DESCRIPTION_CHARS) {
      problems.push('it is long enough that Google cuts it off part way');
    }

    const websiteState = ctx.observations.website;
    if (websiteState.status === 'ready') {
      const meta = websiteState.value.metaDescription?.trim() ?? '';
      if (meta.length > 0 && meta.toLowerCase() === lower) {
        problems.push('it is copied word for word from your website');
      }
    }

    if (problems.length === 0) return pass();

    // A link or a phone number gets the description removed outright: observed, and a real problem.
    if (hasUrl || hasPhone) {
      return fail({
        title: 'Your description breaks one of Google’s rules',
        detail:
          `Your description ${problems[0]}. That usually means it disappears from your listing ` +
          'entirely. Taking that bit out is under Edit profile in the Google Business Profile ' +
          'app — we will show you where to tap.',
        observation: `profile.description contains ${hasUrl ? 'a URL' : ''}${hasUrl && hasPhone ? ' and ' : ''}${hasPhone ? 'a phone number' : ''}.`,
        evidence,
      });
    }

    return warn(Math.max(0.2, 1 - 0.25 * problems.length), {
      title: 'Your description could work harder',
      detail:
        `Right now ${problems.join(', and ')}. Those are the things people scan for, and the ` +
        'description is yours to word — we will show you where to edit it.',
      observation: `profile.description issues: ${problems.join('; ')}.`,
      evidence,
    });
  },
};

/** H3 — the small labels that answer questions before people call. Weight 2, minor. */
const H3: CheckDefinition = {
  id: 'H3',
  area: 'description',
  weight: 2,
  scored: true,
  name: 'Attributes set',
  severity: 'minor',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: {
    apiSupportsWrite: true,
    providerMethod: null,
    matrixNote:
      'docs/research/google-business-profile.md §9: locations.updateAttributes writes attributes, ' +
      'but contracts.ts declares no method for it. Blocker recorded for Sunny.',
  },
  sources: ['gbp.info'],
  needs: ['location', 'attributeCatalog'],
  leadingIndicator: 'CALL_CLICKS over 28 days — fewer "do you have parking?" calls.',
  failureCheck:
    'The attribute set for a category in India changes without notice. If attributes.list is ' +
    'unavailable this check must be not_checked, never a guessed list.',
  evaluate(ctx) {
    const got = need(ctx, 'location', 'attributeCatalog');
    if (!got.ok) return got.evaluation;
    const { location, attributeCatalog } = got.data;

    const candidates = attributeCatalog.highValueAttributeIds.filter(
      (id) => attributeCatalog.availableAttributeIds.includes(id),
    );
    if (candidates.length === 0) {
      return notApplicable('Google offers no extra labels for your kind of business.');
    }

    // Which labels are already ticked is the whole measurement here. If Google
    // never sent them, we cannot say any are missing.
    const alreadySet = readList(location.attributeIds);
    if (!alreadySet.ok) return alreadySet.evaluation;

    const set = new Set(alreadySet.items);
    const missing = candidates.filter((id) => !set.has(id));
    if (missing.length === 0) return pass();

    const labels = missing.map((id) => attributeCatalog.labelsById[id] ?? id);
    const ratio = 1 - missing.length / candidates.length;
    const draft = {
      title: `You haven't set ${labels.slice(0, 3).join(', ')}`,
      detail:
        'These show up as small labels on your listing and answer questions before anyone has to ' +
        'call and ask. They are under Edit profile in the Google Business Profile app — we will ' +
        'show you where to tap and tick the ones that are true.',
      observation: `${missing.length} of ${candidates.length} available high-value attributes are unset.`,
      evidence: [
        `Labels set: ${alreadySet.items.length}`,
        `Worth adding: ${labels.join(', ')}`,
      ],
    };
    return ratio > 0 ? warn(ratio, draft) : fail(draft);
  },
};

export const AREA_H_CHECKS: CheckDefinition[] = [H1, H2, H3];
