/**
 * Area I — Website & schema signals. Weight 4 (2+1+1).
 * docs/research/local-seo-methodology.md §2 area I.
 *
 * Weighted low on purpose. Most Shoogle businesses either have no website, or
 * have one Devashish's generator produced — in which case these are his to get
 * right, not the owner's to fix. The audit reports them; it does not lecture.
 *
 * CONVENTION, and the caller must honour it: a business that has given Shoogle
 * NO website URL is expressed as `unavailable('not_supported', ...)` on the
 * `website` observation, and these three checks become `not_applicable` — a
 * business with no website is not a business with a broken website. Any other
 * unavailable reason means "there is a site and we could not read it", which is
 * `not_checked`.
 *
 * These checks never produce a fixHref into app/website/. That route belongs to
 * Devashish, it does not exist yet, and linking to it would be a dead control.
 */

import type { CheckContext, CheckDefinition, CheckEvaluation } from '../types';

import { CAP_NO_API_WRITE, fail, notApplicable, notChecked, notCheckedFor, pass, warn } from './helpers';

const CAP_WEBSITE = CAP_NO_API_WRITE(
  'the owner\'s own website is outside every Google API. For a Shoogle-generated site the write ' +
    'path belongs to app/website/ (Devashish), which is a coordination point, not our call.',
);

type SiteGate =
  | { ok: true; site: import('../types').WebsiteObservation }
  | { ok: false; evaluation: CheckEvaluation };

/** Resolves the website observation, applying the "no site at all" convention. */
function siteOrSkip(ctx: CheckContext): SiteGate {
  const state = ctx.observations.website;
  if (state.status === 'ready') return { ok: true, site: state.value };
  if (state.status === 'unavailable' && state.reason === 'not_supported') {
    return {
      ok: false,
      evaluation: notApplicable('You have not given us a website, so there is nothing to check.'),
    };
  }
  const { reason, detail } = notCheckedFor(state);
  return { ok: false, evaluation: notChecked(reason, detail) };
}

/** I1 — does the site load on a phone at all? Weight 2. */
const I1: CheckDefinition = {
  id: 'I1',
  area: 'website',
  weight: 2,
  scored: true,
  name: 'Site loads on a phone',
  severity: 'important',
  confidence: 'observed',
  intendedFixMode: 'guided',
  capability: CAP_WEBSITE,
  sources: ['web'],
  needs: ['website'],
  leadingIndicator: 'WEBSITE_CLICKS over 28 days.',
  failureCheck: 'One failed fetch is not a broken site. Confirm across two runs before raising.',
  evaluate(ctx) {
    const gate = siteOrSkip(ctx);
    if (!gate.ok) return gate.evaluation;
    const site = gate.site;

    if (site.fetchOutcome === 'network_error') {
      return fail({
        title: 'Your website does not load',
        detail:
          'We could not open your site at all. Everyone who taps the link on Google is getting ' +
          'nothing. Your hosting provider is the one to ask.',
        observation: `${site.requestedUrl} did not respond.`,
        evidence: [`Address: ${site.requestedUrl}`, 'Result: no response'],
      });
    }
    if (site.fetchOutcome === 'tls_error') {
      return fail({
        title: 'Your website shows a security warning',
        detail:
          'Phones put a full-page warning in front of your site before it loads, and most people ' +
          'turn back there. Your hosting provider can renew the certificate.',
        observation: `${site.requestedUrl} failed certificate validation.`,
        evidence: [`Address: ${site.requestedUrl}`, 'Result: invalid certificate'],
      });
    }
    if (site.httpStatus !== null && site.httpStatus >= 400) {
      return fail({
        title: `Your website returns an error (${site.httpStatus})`,
        detail: 'Everyone who taps your website link hits an error page instead of your business.',
        observation: `${site.requestedUrl} returned HTTP ${site.httpStatus}.`,
        evidence: [`Address: ${site.requestedUrl}`, `Result: error ${site.httpStatus}`],
      });
    }
    if (!site.hasViewportMeta) {
      return warn(0.5, {
        title: 'Your website is not built for phones',
        detail:
          'It loads, but it opens zoomed out with tiny text. Almost everyone who taps that link is ' +
          'on a phone.',
        observation: 'No viewport meta tag in the returned markup.',
        evidence: [`Address: ${site.finalUrl ?? site.requestedUrl}`, 'Mobile layout tag: missing'],
        confidence: 'inferred',
      });
    }
    return pass();
  },
};

/** I2 — does the site tell Google what kind of business it is? Weight 1, minor. */
const I2: CheckDefinition = {
  id: 'I2',
  area: 'website',
  weight: 1,
  scored: true,
  name: 'LocalBusiness schema',
  severity: 'minor',
  confidence: 'observed',
  intendedFixMode: 'guided',
  capability: CAP_WEBSITE,
  sources: ['web', 'gbp.info'],
  needs: ['website'],
  leadingIndicator: 'WEBSITE_CLICKS over 28 days.',
  failureCheck: 'Structured data is one signal among many; its absence is never why a business is invisible.',
  evaluate(ctx) {
    const gate = siteOrSkip(ctx);
    if (!gate.ok) return gate.evaluation;
    const site = gate.site;

    if (site.fetchOutcome !== 'ok' || (site.httpStatus !== null && site.httpStatus >= 400)) {
      return notApplicable('Your website is not loading, so there is nothing to read on it yet.');
    }

    const schema = site.jsonLdLocalBusiness;
    if (schema === null) {
      return fail({
        title: "Your website doesn't tell Google what kind of business it is",
        detail:
          'There is a small block of hidden text that says "this is a shop, here is its address and ' +
          'phone number". Yours has none, so Google has to guess.',
        observation: 'No JSON-LD LocalBusiness block found in the markup.',
        evidence: [`Address: ${site.finalUrl ?? site.requestedUrl}`, 'Business details block: none'],
      });
    }

    const missing: string[] = [];
    if (schema.name === null) missing.push('the business name');
    if (schema.streetAddress === null) missing.push('the address');
    if (schema.telephone === null) missing.push('the phone number');
    if (schema.geoPrecision === null || schema.geoPrecision < 5) missing.push('an accurate location');
    if (!schema.hasOpeningHoursSpecification) missing.push('the opening hours');

    const locationState = ctx.observations.location;
    const mismatches: string[] = [];
    if (locationState.status === 'ready') {
      const loc = locationState.value;
      if (
        schema.telephone !== null &&
        loc.primaryPhone !== null &&
        schema.telephone.replace(/\D/g, '').slice(-10) !== loc.primaryPhone.replace(/\D/g, '').slice(-10)
      ) {
        mismatches.push('the phone number on it does not match your Google listing');
      }
    }

    if (missing.length === 0 && mismatches.length === 0) return pass();

    const parts = [
      ...(missing.length > 0 ? [`it is missing ${missing.join(', ')}`] : []),
      ...mismatches,
    ];
    return warn(Math.max(0.2, 1 - 0.2 * parts.length), {
      title: 'The business details on your website are incomplete',
      detail: `Your site has the hidden details block, but ${parts.join(', and ')}.`,
      observation: `JSON-LD ${schema.type}: missing [${missing.join(', ')}]; mismatches [${mismatches.join(', ')}].`,
      evidence: [
        `Type declared: ${schema.type}`,
        ...(missing.length > 0 ? [`Missing: ${missing.join(', ')}`] : []),
        ...mismatches.map((m) => `Mismatch: ${m}`),
      ],
    });
  },
};

/** I3 — is the phone number tappable? Weight 1, minor. */
const I3: CheckDefinition = {
  id: 'I3',
  area: 'website',
  weight: 1,
  scored: true,
  name: 'Click-to-call',
  severity: 'minor',
  confidence: 'observed',
  intendedFixMode: 'guided',
  capability: CAP_WEBSITE,
  sources: ['web'],
  needs: ['website'],
  leadingIndicator: 'CALL_CLICKS over 28 days.',
  failureCheck: 'A tel: link rendered by JavaScript after load would not appear in the fetched markup.',
  evaluate(ctx) {
    const gate = siteOrSkip(ctx);
    if (!gate.ok) return gate.evaluation;
    const site = gate.site;

    if (site.fetchOutcome !== 'ok' || (site.httpStatus !== null && site.httpStatus >= 400)) {
      return notApplicable('Your website is not loading, so there is nothing to read on it yet.');
    }
    if (site.telLinkPresent) return pass();

    return fail({
      title: 'The phone number on your website is not tappable',
      detail:
        'On a phone, a number you cannot tap means copying it out by hand. That is one more reason ' +
        'not to call.',
      observation: 'No tel: link found in the fetched markup.',
      evidence: [`Address: ${site.finalUrl ?? site.requestedUrl}`, 'Tap-to-call link: none'],
    });
  },
};

export const AREA_I_CHECKS: CheckDefinition[] = [I1, I2, I3];
