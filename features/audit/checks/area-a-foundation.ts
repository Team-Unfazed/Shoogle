/**
 * Area A — Foundation & verification. Weight 10 (A2 6 + A3 4), plus the
 * unscored gate A1. See docs/research/local-seo-methodology.md §2 area A.
 */

import type { CheckDefinition } from '../types';

import { CAP_NO_API_WRITE, CAP_PATCHABLE_NO_METHOD, fail, need, notChecked, notCheckedFor, pass, warn } from './helpers';

/**
 * A1 — is a Google listing linked at all?
 *
 * The gate (§3.3 G-identity). Unscored: it is not a quality of the listing, it
 * is whether we are auditing a listing at all.
 *
 * Note what this check can and cannot conclude. "Not connected" is something
 * Shoogle knows for itself, so it is a MEASURED fail and produces a finding.
 * "Connected, but `listLocations()` did not answer" is an unknown, so it is
 * `not_checked` and produces NO finding — we must not tell an owner to connect
 * an account they have already connected.
 */
const A1: CheckDefinition = {
  id: 'A1',
  area: 'foundation',
  weight: 0,
  scored: false,
  name: 'Listing linked',
  severity: 'critical',
  confidence: 'observed',
  intendedFixMode: 'owner',
  capability: CAP_NO_API_WRITE('linking an account is an OAuth flow, not an API write.'),
  sources: ['registry'],
  needs: ['connection', 'locations'],
  leadingIndicator: 'A connected google_business provider in the registry.',
  failureCheck:
    'If the owner can see Shoogle reading their listing elsewhere in the app, this check is wrong.',
  evaluate(ctx) {
    const connection = ctx.observations.connection;

    // `unavailable('not_connected')` is the honest answer the registry gives for
    // a provider nobody has linked. That is an answer, not a missing answer.
    if (connection.status === 'unavailable' && connection.reason === 'not_connected') {
      return fail({
        title: "Connect your Google listing",
        detail:
          "Shoogle can't see your Google Business Profile yet. Connect it and we'll check your " +
          'categories, hours, photos and reviews, and tell you what to fix first.',
        observation: 'No connected google_business provider is registered.',
        evidence: [connection.message],
      });
    }

    if (connection.status !== 'ready') {
      const { reason, detail } = notCheckedFor(connection);
      return notChecked(reason, detail);
    }

    if (connection.value.status !== 'connected') {
      return fail({
        title: "Connect your Google listing",
        detail:
          connection.value.status === 'expired' || connection.value.status === 'revoked'
            ? "Shoogle's access to your Google listing has stopped working. Reconnect it and we'll " +
              'pick up where we left off.'
            : "Shoogle can't see your Google Business Profile yet. Connect it and we'll check " +
              'your categories, hours, photos and reviews.',
        observation: `Connection status is '${connection.value.status}'.`,
        evidence: [`google_business connection status: ${connection.value.status}`],
      });
    }

    const locations = ctx.observations.locations;
    if (locations.status !== 'ready') {
      const { reason, detail } = notCheckedFor(locations);
      return notChecked(reason, detail);
    }

    // A measured zero: the account is linked and genuinely has no listing on it.
    // Different fact, different sentence, different fix.
    if (locations.value.locationIds.length === 0) {
      return fail({
        title: 'No business listing on that Google account',
        detail:
          'Your Google account is connected, but it has no business listing on it. If you manage ' +
          'your shop from a different Google account, connect that one instead.',
        observation: 'listLocations() returned 0 locations for a connected account.',
        evidence: ['locations returned: 0'],
      });
    }

    return pass();
  },
};

/** A2 — verified listing. Weight 6, critical. Blocks most writes, so it outranks everything (§5.3.2). */
const A2: CheckDefinition = {
  id: 'A2',
  area: 'foundation',
  weight: 6,
  scored: true,
  name: 'Verified listing',
  severity: 'critical',
  confidence: 'observed',
  intendedFixMode: 'guided',
  capability: CAP_NO_API_WRITE(
    '§4: verification is a postcard/phone/video flow. No API completes it for the owner.',
  ),
  sources: ['gbp.info', 'gbp.verify'],
  needs: ['location', 'verification'],
  leadingIndicator: 'metadata.hasVoiceOfMerchant flipping to true.',
  failureCheck:
    'If a local post publishes successfully (canOperateLocalPost true and the post returns published), ' +
    'our verification read is wrong — recheck before raising this again.',
  evaluate(ctx) {
    const got = need(ctx, 'location', 'verification');
    if (!got.ok) return got.evaluation;
    const { location, verification } = got.data;

    if (location.metadata.hasVoiceOfMerchant) return pass();

    if (verification.hasPendingVerification) {
      return warn(0.5, {
        title: 'Your Google verification is still in progress',
        detail:
          `Google has your verification request${
            verification.pendingMethod === null ? '' : ` (${verification.pendingMethod})`
          } and hasn't finished it yet. Until it does, we can't change anything on your listing for you. ` +
          "If nothing arrives within two weeks, start it again and we'll show you how.",
        observation:
          'metadata.hasVoiceOfMerchant is false and a pending verification request exists.',
        evidence: [
          'hasVoiceOfMerchant: false',
          `pending verification: yes${
            verification.pendingMethod === null ? '' : ` (${verification.pendingMethod})`
          }`,
        ],
        severity: 'important',
      });
    }

    return fail({
      title: "Your Google listing isn't verified",
      detail:
        "Until Google verifies your listing, it limits what shows publicly and Shoogle can't " +
        "change anything for you. Verification is a postcard or a phone call from Google — we'll " +
        'walk you through it, it takes about five minutes to start.',
      observation: 'metadata.hasVoiceOfMerchant is false and no verification request is pending.',
      evidence: ['hasVoiceOfMerchant: false', 'pending verification: none'],
    });
  },
};

/** A3 — is Google telling customers you are open, and is that true? Weight 4, critical. */
const A3: CheckDefinition = {
  id: 'A3',
  area: 'foundation',
  weight: 4,
  scored: true,
  name: 'Open status is true',
  severity: 'critical',
  confidence: 'observed',
  intendedFixMode: 'assisted',
  capability: CAP_PATCHABLE_NO_METHOD('openInfo'),
  sources: ['gbp.info', 'own'],
  needs: ['location', 'owner'],
  leadingIndicator: 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH over 28 days.',
  failureCheck:
    'If the owner confirms they are in fact temporarily closed, this is not a finding and must be ' +
    'suppressed until their declared status changes.',
  evaluate(ctx) {
    const got = need(ctx, 'location', 'owner');
    if (!got.ok) return got.evaluation;
    const { location, owner } = got.data;

    if (location.openInfo === null) {
      // Google returned the location without an openInfo block. We cannot
      // compare a status we do not have — that is an unknown, not a problem.
      return notChecked('no_data_yet', 'Google did not return an open/closed status for this listing.');
    }

    const googleStatus = location.openInfo.status;
    const declared = owner.declaredOpenStatus;

    if (googleStatus === 'OPEN') {
      if (declared === 'temporarily_closed' || declared === 'permanently_closed') {
        return fail({
          title: 'Google says you are open, but you told us you are closed',
          detail:
            'Customers are being sent to a shop that is closed. Tell us which is right and we will ' +
            'make your listing match.',
          observation: `openInfo.status is OPEN; the owner declared '${declared}'.`,
          evidence: ['Google: OPEN', `You told Shoogle: ${declared.replace('_', ' ')}`],
        });
      }
      return pass();
    }

    if (googleStatus === 'CLOSED_TEMPORARILY') {
      if (declared === 'open') {
        return fail({
          title: "Google is telling customers you're temporarily closed",
          detail:
            "Google shows your shop as temporarily closed. You told us you're open. Every person " +
            'searching for you today is being told not to come. We can set this back to open.',
          observation: "openInfo.status is CLOSED_TEMPORARILY; the owner declared 'open'.",
          evidence: ['Google: temporarily closed', 'You told Shoogle: open'],
        });
      }
      if (declared === 'temporarily_closed') return pass();
      // Never asked. We measured what Google says; we have not measured the truth.
      return warn(0.5, {
        title: 'Google shows you as temporarily closed — is that right?',
        detail:
          "Your listing says you're temporarily closed, and you haven't told us either way. If " +
          "you're trading, say so and we'll switch it back — right now people searching for you " +
          'are being told not to come.',
        observation:
          'openInfo.status is CLOSED_TEMPORARILY and the owner has never declared a trading status.',
        evidence: ['Google: temporarily closed', 'You told Shoogle: nothing yet'],
        severity: 'important',
        confidence: 'inferred',
      });
    }

    // CLOSED_PERMANENTLY
    if (declared === 'permanently_closed') return pass();
    if (declared === 'open' || declared === 'temporarily_closed') {
      return fail({
        title: 'Google says your business has closed for good',
        detail:
          "Your listing is marked permanently closed. That's the strongest possible signal to stop " +
          'sending you customers, and it usually happens by mistake or from a bad edit. We can put ' +
          'it right.',
        observation: `openInfo.status is CLOSED_PERMANENTLY; the owner declared '${declared}'.`,
        evidence: ['Google: permanently closed', `You told Shoogle: ${declared.replace('_', ' ')}`],
      });
    }
    return warn(0.5, {
      title: 'Google says your business has closed for good — is that right?',
      detail:
        "Your listing is marked permanently closed and you haven't told us either way. If you're " +
        'still trading, tell us and we will fix it today.',
      observation:
        'openInfo.status is CLOSED_PERMANENTLY and the owner has never declared a trading status.',
      evidence: ['Google: permanently closed', 'You told Shoogle: nothing yet'],
      severity: 'important',
      confidence: 'inferred',
    });
  },
};

export const AREA_A_CHECKS: CheckDefinition[] = [A1, A2, A3];
