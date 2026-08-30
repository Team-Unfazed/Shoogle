/**
 * Area B — Name, address, phone, reach. Weight 14 (3+3+2+3+2+1).
 * docs/research/local-seo-methodology.md §2 area B.
 */

import type { CheckDefinition } from '../types';

import {
  CAP_NO_API_WRITE,
  CAP_PATCHABLE_NO_METHOD,
  fail,
  haversineMetres,
  isPlausibleIndianPhone,
  looksKeywordStuffed,
  need,
  normaliseBusinessName,
  notApplicable,
  notChecked,
  pass,
  warn,
} from './helpers';

/** True when the listing is a service-area business with no walk-in address. */
const isServiceAreaOnly = (businessType: string | undefined): boolean =>
  businessType === 'CUSTOMER_LOCATION_ONLY';

/** B1 — one name, everywhere. Weight 3. */
const B1: CheckDefinition = {
  id: 'B1',
  area: 'nap',
  weight: 3,
  scored: true,
  name: 'Name consistent',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_NO_API_WRITE(
    '§9 lists the writable Location fields and `title` is not among them; treat renaming as guided ' +
      'until the matrix confirms it.',
  ),
  sources: ['gbp.info', 'own', 'web'],
  // `website` is read opportunistically: with it we compare three names, without
  // it we compare two. Both are real measurements, so it is not a hard need.
  needs: ['location', 'owner'],
  leadingIndicator: 'searchkeywords.impressions.monthly for the business name itself.',
  failureCheck:
    'A business may legitimately trade under a registered name that differs from its shopfront ' +
    'name. One dismissal must suppress this pair forever.',
  evaluate(ctx) {
    const got = need(ctx, 'location', 'owner');
    if (!got.ok) return got.evaluation;
    const { location, owner } = got.data;

    if (location.title === null) {
      return notChecked('no_data_yet', 'Google did not return a name for this listing.');
    }

    const stuffing = looksKeywordStuffed(location.title);
    if (stuffing.length > 0) {
      return fail({
        title: 'Your Google name has extra words in it',
        detail:
          `Your listing is called "${location.title}". Google's rules say the name should be the ` +
          'name on your shopfront and nothing else, and listings that add sales words to it get ' +
          'edited or suspended. Take out ' +
          `"${stuffing.join('", "')}" and it is safe.`,
        observation: `location.title contains marketing words: ${stuffing.join(', ')}.`,
        evidence: [`Google name: ${location.title}`, `Flagged words: ${stuffing.join(', ')}`],
      });
    }

    const shoogleName = owner.declaredName ?? owner.business.name;
    const websiteState = ctx.observations.website;
    const siteName =
      websiteState.status === 'ready' ? websiteState.value.siteBusinessName : null;

    const gbpKey = normaliseBusinessName(location.title);
    const ownKey = normaliseBusinessName(shoogleName);
    const siteKey = siteName === null ? null : normaliseBusinessName(siteName);

    const mismatches: string[] = [];
    if (gbpKey !== ownKey) mismatches.push(`Shoogle has "${shoogleName}"`);
    if (siteKey !== null && siteKey !== gbpKey) mismatches.push(`your website says "${siteName}"`);

    if (mismatches.length === 0) return pass();

    return warn(0.5, {
      title: 'Your business name is different in different places',
      detail:
        `Google shows "${location.title}", and ${mismatches.join(', and ')}. Customers and Google ` +
        'both use the name to match you to searches — pick one and we will make them agree.',
      observation: `Name mismatch across sources: ${mismatches.join('; ')}.`,
      evidence: [
        `Google: ${location.title}`,
        `Shoogle: ${shoogleName}`,
        ...(siteName === null ? [] : [`Website: ${siteName}`]),
      ],
      confidence: 'inferred',
    });
  },
};

/** B2 — a complete postal address. Weight 3, critical. */
const B2: CheckDefinition = {
  id: 'B2',
  area: 'nap',
  weight: 3,
  scored: true,
  name: 'Address complete',
  severity: 'critical',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('storefrontAddress'),
  sources: ['gbp.info'],
  needs: ['location'],
  leadingIndicator: 'BUSINESS_DIRECTION_REQUESTS over 28 days.',
  failureCheck: 'A service-area business has no storefront address by design — that is N/A, not a fail.',
  evaluate(ctx) {
    const got = need(ctx, 'location');
    if (!got.ok) return got.evaluation;
    const { location } = got.data;

    if (isServiceAreaOnly(location.serviceArea?.businessType)) {
      return notApplicable('You travel to customers, so Google does not show a shop address.');
    }

    const address = location.storefrontAddress;
    if (address === null) {
      return fail({
        title: 'Your listing has no address',
        detail:
          'Google has no street address for you, so you will not show up when someone nearby ' +
          'searches for what you do. Add it and we will put it on your listing.',
        observation: 'storefrontAddress is absent on a storefront business.',
        evidence: ['storefrontAddress: none'],
      });
    }

    const missing: string[] = [];
    if (address.addressLines.filter((l) => l.trim().length > 0).length === 0) {
      missing.push('street address');
    }
    if (address.locality === null || address.locality.trim() === '') missing.push('area or city');
    if (address.administrativeArea === null || address.administrativeArea.trim() === '') {
      missing.push('state');
    }
    if (address.postalCode === null || address.postalCode.trim() === '') missing.push('PIN code');

    if (missing.length === 0) return pass();

    const isPinOnly = missing.length === 1 && missing[0] === 'PIN code';
    const draft = {
      title: `Your address is missing its ${missing.join(' and ')}`,
      detail:
        `Google has your address without the ${missing.join(' and ')}. People searching nearby ` +
        'may not be shown your shop at all. Give us the missing bit and we will complete it.',
      observation: `storefrontAddress is missing: ${missing.join(', ')}.`,
      evidence: [
        `Street: ${address.addressLines.join(', ') || 'missing'}`,
        `Area: ${address.locality ?? 'missing'}`,
        `State: ${address.administrativeArea ?? 'missing'}`,
        `PIN code: ${address.postalCode ?? 'missing'}`,
      ],
    };
    return isPinOnly ? warn(0.5, { ...draft, severity: 'important' }) : fail(draft);
  },
};

/** B3 — does the map pin land where the address is? Weight 2. */
const B3: CheckDefinition = {
  id: 'B3',
  area: 'nap',
  weight: 2,
  scored: true,
  name: 'Map pin accurate',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'guided',
  capability: CAP_NO_API_WRITE(
    '§9: `latlng` is Conditional — "only returned if accepted at creation or set through the GBP UI". ' +
      'No confirmed API write, so this stays guided.',
  ),
  sources: ['gbp.info'],
  needs: ['location'],
  leadingIndicator: 'BUSINESS_DIRECTION_REQUESTS over 28 days.',
  failureCheck:
    'Geocoding an Indian address is itself approximate. If the owner says the pin is right, believe ' +
    'the owner — the geocode is the weaker source.',
  evaluate(ctx) {
    const got = need(ctx, 'location');
    if (!got.ok) return got.evaluation;
    const { location } = got.data;

    if (isServiceAreaOnly(location.serviceArea?.businessType)) {
      return notApplicable('You travel to customers, so there is no shop pin to check.');
    }
    if (location.latLng === null) {
      return notChecked(
        'not_supported',
        'Google only returns the map pin for some listings, and it did not return yours.',
      );
    }
    if (location.geocodedAddressLatLng === null) {
      return notChecked(
        'insufficient_data',
        'We could not work out where your written address is, so there is nothing to compare the pin against.',
      );
    }

    const metres = haversineMetres(location.latLng, location.geocodedAddressLatLng);
    const evidence = [
      `Map pin: ${location.latLng.latitude.toFixed(5)}, ${location.latLng.longitude.toFixed(5)}`,
      `Your address sits at: ${location.geocodedAddressLatLng.latitude.toFixed(5)}, ${location.geocodedAddressLatLng.longitude.toFixed(5)}`,
      `Distance: ${metres} m`,
    ];

    if (metres <= 60) return pass();
    if (metres <= 200) {
      return warn(0.5, {
        title: `Your map pin is about ${metres} m from your address`,
        detail:
          'Someone following directions will be put down a short walk away, often on the wrong side ' +
          'of the road. You can drag the pin onto your door in Google Maps — we will show you where to tap.',
        observation: `Pin is ${metres} m from the geocoded address.`,
        evidence,
        confidence: 'inferred',
      });
    }
    return fail({
      title: `Your map pin is about ${metres} m from your address`,
      detail:
        'Customers following directions will end up somewhere else entirely and many will give up. ' +
        'Dragging the pin onto your door in Google Maps fixes it in under a minute — we will show ' +
        'you where to tap.',
      observation: `Pin is ${metres} m from the geocoded address.`,
      evidence,
    });
  },
};

/** B4 — a phone number that works. Weight 3, critical. */
const B4: CheckDefinition = {
  id: 'B4',
  area: 'nap',
  weight: 3,
  scored: true,
  name: 'Phone reachable',
  severity: 'critical',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('phoneNumbers'),
  sources: ['gbp.info'],
  needs: ['location'],
  leadingIndicator: 'CALL_CLICKS over 28 days.',
  failureCheck:
    'We check the shape of the number, not whether it rings. A valid-looking number that is out of ' +
    'service still passes — only an owner or a test call can prove otherwise.',
  evaluate(ctx) {
    const got = need(ctx, 'location');
    if (!got.ok) return got.evaluation;
    const { location } = got.data;

    if (location.primaryPhone === null || location.primaryPhone.trim() === '') {
      return fail({
        title: 'Your listing has no phone number',
        detail:
          'The call button is the most-used button on a local listing, and right now yours is not ' +
          'there. Add your number and people can ring you straight from the search result.',
        observation: 'phoneNumbers.primaryPhone is absent.',
        evidence: ['Primary phone: none'],
      });
    }

    if (!isPlausibleIndianPhone(location.primaryPhone)) {
      return fail({
        title: 'The phone number on your listing does not look right',
        detail:
          `Google has "${location.primaryPhone}" for you, which is not a working Indian number. ` +
          'Anyone tapping call gets nothing. Send us the right one and we will correct it.',
        observation: `primaryPhone "${location.primaryPhone}" failed Indian number validation.`,
        evidence: [`Primary phone: ${location.primaryPhone}`],
      });
    }
    return pass();
  },
};

/** B5 — website link present and actually loading. Weight 2. */
const B5: CheckDefinition = {
  id: 'B5',
  area: 'nap',
  weight: 2,
  scored: true,
  name: 'Website link present and live',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('websiteUri'),
  sources: ['gbp.info', 'web'],
  needs: ['location'],
  leadingIndicator: 'WEBSITE_CLICKS over 28 days.',
  failureCheck: 'A site that is down for an hour is not a broken link. Confirm across two runs before re-raising.',
  evaluate(ctx) {
    const got = need(ctx, 'location');
    if (!got.ok) return got.evaluation;
    const { location } = got.data;

    if (location.websiteUri === null || location.websiteUri.trim() === '') {
      return fail({
        title: 'Your Google listing has no website link',
        detail:
          'People who want to see your prices, photos or menu before calling have nowhere to go. ' +
          'If you have a site, we can add the link now.',
        observation: 'websiteUri is absent.',
        evidence: ['Website link: none'],
      });
    }

    const websiteState = ctx.observations.website;
    if (websiteState.status !== 'ready') {
      // We measured that a link exists. We did NOT measure whether it works, and
      // this check is about both — so it is unchecked, not a pass.
      return notChecked(
        websiteState.status === 'unavailable' ? websiteState.reason : 'provider_error',
        `Your listing links to ${location.websiteUri}, but we could not open it to check that it loads.`,
      );
    }

    const site = websiteState.value;
    if (site.fetchOutcome === 'network_error') {
      return fail({
        title: 'The website link on your listing does not open',
        detail:
          `Everyone who taps your website link on Google is sent to ${location.websiteUri}, and ` +
          'nothing loads. Either point the link somewhere that works, or take it off.',
        observation: `Fetching ${site.requestedUrl} failed at the network level.`,
        evidence: [`Website link: ${location.websiteUri}`, 'Result: the site did not respond'],
      });
    }
    if (site.fetchOutcome === 'tls_error') {
      return fail({
        title: 'Your website shows a security warning',
        detail:
          "Phones show a red “not secure” screen before your site loads, and most people " +
          'turn back there. Your hosting provider can fix the certificate.',
        observation: `Fetching ${site.requestedUrl} failed TLS validation.`,
        evidence: [`Website link: ${location.websiteUri}`, 'Result: invalid security certificate'],
      });
    }
    if (site.httpStatus !== null && site.httpStatus >= 400) {
      return fail({
        title: `Your website link is broken (error ${site.httpStatus})`,
        detail:
          'Every customer who taps the website link on your Google listing hits an error page. ' +
          'That is a lost customer each time.',
        observation: `${site.requestedUrl} returned HTTP ${site.httpStatus}.`,
        evidence: [`Website link: ${location.websiteUri}`, `Result: error ${site.httpStatus}`],
      });
    }
    return pass();
  },
};

/** B6 — service-area businesses must say where they go. Weight 1. */
const B6: CheckDefinition = {
  id: 'B6',
  area: 'nap',
  weight: 1,
  scored: true,
  name: 'Service area defined',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('serviceArea'),
  sources: ['gbp.info', 'own'],
  needs: ['location'],
  leadingIndicator: 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH over 28 days.',
  failureCheck: 'A pure storefront has no service area by design — that is N/A, not a fail.',
  evaluate(ctx) {
    const got = need(ctx, 'location');
    if (!got.ok) return got.evaluation;
    const { location } = got.data;

    const businessType = location.serviceArea?.businessType;
    if (businessType !== 'CUSTOMER_LOCATION_ONLY' && businessType !== 'CUSTOMER_AND_BUSINESS_LOCATION') {
      return notApplicable('Customers come to your shop, so there is no travel area to list.');
    }

    if ((location.serviceArea?.placeCount ?? 0) > 0) return pass();

    return fail({
      title: "You travel to customers but haven't told Google where",
      detail:
        'Add the areas you cover and you will start appearing in searches from those ' +
        'neighbourhoods. Tell us the areas and we will add them.',
      observation: `serviceArea.businessType is ${businessType} with 0 places listed.`,
      evidence: [`Business type: ${businessType}`, 'Areas listed: 0'],
      // A service-area business with no service area is invisible in the places
      // it actually serves, which is the definition of critical (§5.1).
      severity: businessType === 'CUSTOMER_LOCATION_ONLY' ? 'critical' : 'important',
    });
  },
};

export const AREA_B_CHECKS: CheckDefinition[] = [B1, B2, B3, B4, B5, B6];
