/**
 * Area C — Categories & services. Weight 18 (5+5+3+3+2), joint-heaviest area.
 * docs/research/local-seo-methodology.md §2 area C.
 *
 * C2 is flagged in the research as "the most dangerous check in the audit": it
 * proposes changing the field that most affects visibility, from inference. Its
 * guardrails are implemented here, not left to the UI — it is never `auto`, it
 * always cites its evidence, and it refuses to run without an evidence base.
 */

import type { BusinessCategory } from '@/types/domain';

import { formatKeywordImpressions, type CheckDefinition } from '../types';

import {
  CAP_PATCHABLE_NO_METHOD,
  fail,
  itemsIfRead,
  need,
  notApplicable,
  notChecked,
  pass,
  readList,
  warn,
} from './helpers';

/**
 * Words we expect to see inside a Google category name for each of Shoogle's
 * verticals. Used ONLY to detect an obvious mismatch, never to pick a category
 * for the owner — the real option list comes from `categories.list` (region IN),
 * which is a provider call, not a hard-coded table.
 */
const CATEGORY_MARKERS: Record<BusinessCategory, string[]> = {
  salon: ['salon', 'barber', 'beauty', 'spa', 'hair', 'nail', 'makeup'],
  gym: ['gym', 'fitness', 'yoga', 'pilates', 'crossfit', 'sports club'],
  clinic: ['clinic', 'doctor', 'dentist', 'dental', 'physician', 'hospital', 'medical', 'physio'],
  restaurant: ['restaurant', 'cafe', 'café', 'coffee', 'food', 'dhaba', 'bar', 'pizza', 'caterer'],
  bakery: ['bakery', 'bakers', 'cake', 'patisserie', 'confection', 'sweet'],
  boutique: ['boutique', 'clothing', 'fashion', 'tailor', 'apparel', 'saree', 'dress'],
  repair_shop: ['repair', 'mechanic', 'garage', 'electrician', 'plumber', 'service centre', 'service center'],
  other: [],
};

/** C1 — a primary category at all. Weight 5, critical. */
const C1: CheckDefinition = {
  id: 'C1',
  area: 'categories',
  weight: 5,
  scored: true,
  name: 'Primary category set',
  severity: 'critical',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('categories.primaryCategory'),
  sources: ['gbp.info'],
  needs: ['location'],
  leadingIndicator: 'searchkeywords.impressions.monthly — the mix of queries should widen.',
  failureCheck: 'If the listing appears in category-style searches today, our read of this field is wrong.',
  evaluate(ctx) {
    const got = need(ctx, 'location');
    if (!got.ok) return got.evaluation;
    const { location } = got.data;

    if (location.primaryCategory !== null) return pass();
    return fail({
      title: 'Your listing has no main category',
      detail:
        'Google uses the main category to decide which searches you can show up in. Without one you ' +
        'are competing for nothing. It is one tap under Edit profile in the Google Business ' +
        'Profile app, and we will show you where.',
      observation: 'categories.primaryCategory is absent.',
      evidence: ['Main category: none'],
    });
  },
};

/** C2 — does the primary category match what the business actually does? Weight 5, inferred. */
const C2: CheckDefinition = {
  id: 'C2',
  area: 'categories',
  weight: 5,
  scored: true,
  name: 'Primary category fits',
  severity: 'important',
  confidence: 'inferred',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('categories.primaryCategory'),
  sources: ['gbp.info', 'gbp.legacy', 'own'],
  needs: ['location', 'owner', 'reviews'],
  leadingIndicator: 'searchkeywords.impressions.monthly across two monthly windows.',
  failureCheck:
    'If the query mix has not shifted within two monthly windows of the change, this recommendation ' +
    'was wrong and must be reversible in one tap.',
  proposesCategoryChange: true,
  evaluate(ctx) {
    const got = need(ctx, 'location', 'owner', 'reviews');
    if (!got.ok) return got.evaluation;
    const { location, owner, reviews } = got.data;

    if (location.primaryCategory === null) {
      return notApplicable('There is no main category to judge yet — see the finding above.');
    }

    // Guardrail from §2 area C: with almost no reviews and no services listed we
    // have nothing to infer from, and inference without evidence is a guess.
    //
    // A service list Google never returned is NOT an empty service list. If the
    // reviews are too thin to carry the inference on their own, an unread
    // service list leaves us with nothing measured at all — that is
    // `not_checked` carrying Google's reason, not "you listed no services".
    if (reviews.items.length < 5) {
      const services = location.serviceItems;
      if (services.kind === 'not_read') return notChecked(services.why, services.detail);
      if (services.items.length === 0) {
        return notChecked(
          'insufficient_data',
          'We need a few reviews or your list of services before we can judge whether your category fits.',
        );
      }
    }

    const markers = CATEGORY_MARKERS[owner.business.category];
    if (markers.length === 0) {
      return notChecked(
        'insufficient_data',
        'We do not know your line of business precisely enough to judge your Google category.',
      );
    }

    const current = location.primaryCategory.displayName;
    const currentKey = current.toLowerCase();
    if (markers.some((m) => currentKey.includes(m))) return pass();

    const keywordState = ctx.observations.searchKeywords;
    const keywordEvidence =
      keywordState.status === 'ready'
        ? keywordState.value
            .slice(0, 3)
            // A threshold is a lower bound, never a number (§7b of the GBP matrix).
            .map((k) => `"${k.keyword}" — ${formatKeywordImpressions(k.impressions)} people`)
        : [];

    // Evidence only — an unread service list contributes nothing rather than
    // being cited as "no services on record", which we did not measure.
    const readServices = itemsIfRead(location.serviceItems);
    const serviceEvidence = (readServices ?? []).slice(0, 4).map((s) => s.name);
    const declaredEvidence = owner.declaredServices.slice(0, 4);
    const whatYouDo = [...serviceEvidence, ...declaredEvidence].slice(0, 4);

    return warn(0.5, {
      title: `You are listed as "${current}" — is that what you mainly do?`,
      detail:
        `Google has you under "${current}"` +
        (whatYouDo.length > 0 ? `, but the work you have told us about is ${whatYouDo.join(', ')}` : '') +
        '. Your main category decides which searches you can appear in at all. If it is wrong, ' +
        'changing it is one tap under Edit profile in the Google Business Profile app — we will ' +
        'show you where, and it is just as easy to change back.',
      observation: `primaryCategory "${current}" does not match the ${owner.business.category} category family.`,
      evidence: [
        `Google main category: ${current}`,
        `You told Shoogle you run a: ${owner.business.category}`,
        ...(whatYouDo.length > 0 ? [`Services on record: ${whatYouDo.join(', ')}`] : []),
        ...(keywordEvidence.length > 0 ? [`People found you searching: ${keywordEvidence.join('; ')}`] : []),
        `Reviews available to read: ${reviews.items.length}`,
      ],
    });
  },
};

/** C3 — supporting categories. Weight 3. */
const C3: CheckDefinition = {
  id: 'C3',
  area: 'categories',
  weight: 3,
  scored: true,
  name: 'Supporting categories',
  severity: 'important',
  confidence: 'inferred',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('categories.additionalCategories'),
  sources: ['gbp.info'],
  needs: ['location'],
  leadingIndicator: 'searchkeywords.impressions.monthly — the number of distinct queries.',
  failureCheck: 'If added categories bring no new queries in two monthly windows, stop recommending more.',
  evaluate(ctx) {
    const got = need(ctx, 'location');
    if (!got.ok) return got.evaluation;
    const { location } = got.data;

    // "Google did not send us your extra categories" is not "you have none".
    const extra = readList(location.additionalCategories);
    if (!extra.ok) return extra.evaluation;
    const count = extra.items.length;

    if (count === 0) {
      return fail({
        title: 'You only have one category',
        detail:
          'Adding two or three more categories for the other things you do puts you into more ' +
          'searches without changing your main one. They sit beside your main one under Edit ' +
          'profile in the Google Business Profile app — we will show you where to tap.',
        observation: 'additionalCategories is empty.',
        evidence: ['Extra categories: 0'],
      });
    }
    if (count > 9) {
      return warn(0.5, {
        title: `You have ${count} extra categories`,
        detail:
          'Past about nine, extra categories start working against you — Google has to guess what ' +
          'you mainly are. Dropping the ones you rarely do makes the rest count for more.',
        observation: `additionalCategories has ${count} entries.`,
        evidence: [`Extra categories: ${count}`],
      });
    }
    return pass();
  },
};

/** C4 — services listed. Weight 3. Gated on `canModifyServiceList` (§2.1). */
const C4: CheckDefinition = {
  id: 'C4',
  area: 'categories',
  weight: 3,
  scored: true,
  name: 'Services listed',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('serviceItems'),
  sources: ['gbp.info', 'own'],
  needs: ['location', 'owner'],
  leadingIndicator: 'searchkeywords.impressions.monthly for service-shaped queries.',
  failureCheck: 'Some categories do not support a service list at all; canModifyServiceList decides, not us.',
  evaluate(ctx) {
    const got = need(ctx, 'location', 'owner');
    if (!got.ok) return got.evaluation;
    const { location, owner } = got.data;

    if (!location.metadata.canModifyServiceList) {
      return notApplicable('Google does not offer a service list for your type of business.');
    }

    // A list Google never returned cannot be reported as an empty list.
    const services = readList(location.serviceItems);
    if (!services.ok) return services.evaluation;

    if (services.items.length === 0) {
      const example = owner.declaredServices[0] ?? 'the work you do';
      return fail({
        title: "Your services aren't listed on Google",
        detail:
          `Someone searching for "${example}" near them cannot find you if you have not said you do ` +
          'it. Your service list is under Edit profile in the Google Business Profile app — we ' +
          'will show you where to tap.',
        observation: 'serviceItems is empty on a location that supports a service list.',
        evidence: [
          'Services on Google: 0',
          `Services you told Shoogle about: ${owner.declaredServices.length}`,
        ],
      });
    }

    const listed = new Set(services.items.map((s) => s.name.trim().toLowerCase()));
    const missing = owner.declaredServices.filter((s) => !listed.has(s.trim().toLowerCase()));
    if (missing.length === 0) return pass();

    return warn(0.5, {
      title: `${missing.length} of the services you do are not on Google`,
      detail:
        `You told us you do ${missing.slice(0, 3).join(', ')}, and that is not on your listing. ` +
        'We will show you where to add them so those searches can find you.',
      observation: `${missing.length} declared services are absent from serviceItems.`,
      evidence: [
        `On Google: ${services.items.length}`,
        `Missing: ${missing.slice(0, 5).join(', ')}`,
      ],
      confidence: 'inferred',
    });
  },
};

/** C5 — prices on services. Weight 2, minor. */
const C5: CheckDefinition = {
  id: 'C5',
  area: 'categories',
  weight: 2,
  scored: true,
  name: 'Service prices',
  severity: 'minor',
  confidence: 'inferred',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('serviceItems[].price'),
  sources: ['gbp.info'],
  needs: ['location'],
  leadingIndicator: 'CALL_CLICKS over 28 days — fewer "how much?" calls, more booking calls.',
  failureCheck: 'Not every category supports prices; if the API rejects a price write, this check is wrong here.',
  evaluate(ctx) {
    const got = need(ctx, 'location');
    if (!got.ok) return got.evaluation;
    const { location } = got.data;

    if (!location.metadata.canModifyServiceList) {
      return notApplicable('Google does not offer a service list for your type of business.');
    }

    const services = readList(location.serviceItems);
    if (!services.ok) return services.evaluation;

    if (services.items.length === 0) {
      return notApplicable('There are no services listed yet, so there are no prices to add.');
    }

    const total = services.items.length;
    const priced = services.items.filter((s) => s.priceInPaise !== null).length;
    if (priced === total) return pass();

    const evidence = [`Services listed: ${total}`, `Services with a price: ${priced}`];
    if (priced === 0) {
      return fail({
        title: 'None of your services show a price',
        detail:
          'Adding prices helps people decide before they call, and cuts down the "how much?" calls ' +
          'you take all day. A price sits beside each service in the Google Business Profile app — ' +
          'we will show you where to tap.',
        observation: `0 of ${total} serviceItems carry a price.`,
        evidence,
      });
    }
    return warn(priced / total, {
      title: `${total - priced} of your ${total} services have no price`,
      detail:
        'People compare before they call. Filling in the rest takes a minute and saves you the ' +
        '"how much?" phone calls.',
      observation: `${priced} of ${total} serviceItems carry a price.`,
      evidence,
    });
  },
};

export const AREA_C_CHECKS: CheckDefinition[] = [C1, C2, C3, C4, C5];
