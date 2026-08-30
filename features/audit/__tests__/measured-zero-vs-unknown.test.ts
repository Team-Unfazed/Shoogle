/**
 * The single most important behaviour in this module.
 *
 * A provider that answered "none" and a provider that did not answer are
 * different facts. `ready({ items: [] })` is a MEASURED ZERO: it fails its check
 * and produces a finding the owner can act on. `unavailable(...)` is an UNKNOWN:
 * it produces no finding at all, contributes nothing to the score in either
 * direction, and is named in `uncheckedAreas`.
 *
 * Everything else in the engine depends on these two never collapsing into each
 * other, so they are tested side by side, on the same check, for every source.
 */

import { unavailable } from '@/lib/state/DataState';

import { runAuditEngine } from '../engine';
import { input, ok, locationDetail } from '../test-support/build';
import type { CheckId, CheckOutcome } from '../types';

function outcomeOf(run: ReturnType<typeof runAuditEngine>, id: CheckId): CheckOutcome {
  const result = run.results.find((r) => r.check.id === id);
  if (result === undefined) throw new Error(`no result for ${id}`);
  return result.outcome;
}

const findingIds = (run: ReturnType<typeof runAuditEngine>): string[] =>
  run.findings.map((f) => f.checkId);

describe('a measured zero is not an unknown', () => {
  describe('reviews', () => {
    it('ready with an empty list fails F1 and says "you have no reviews yet"', () => {
      const run = runAuditEngine(
        input({ reviews: ok({ items: [], replyFieldTrusted: true }) }),
      );

      expect(outcomeOf(run, 'F1').kind).toBe('fail');
      expect(findingIds(run)).toContain('F1');
      const finding = run.findings.find((f) => f.checkId === 'F1');
      expect(finding?.title).toBe('You have no Google reviews yet');
      expect(finding?.evidence).toContain('Reviews on Google: 0');
      // The zero is a real observation, so it is scored rather than skipped:
      // the Reviews area has a real score, and nothing about it is "not connected".
      const reviewsArea = run.score.areas.find((a) => a.area === 'reviews');
      expect(reviewsArea?.areaScore).not.toBeNull();
      expect(run.uncheckedAreas).not.toContain('Reviews — not connected');
    });

    it('unavailable makes F1 not_checked, emits no finding, and names the area', () => {
      const run = runAuditEngine(
        input({ reviews: unavailable('not_connected', 'No Google Business Profile is linked.') }),
      );

      const outcome = outcomeOf(run, 'F1');
      expect(outcome.kind).toBe('not_checked');
      if (outcome.kind === 'not_checked') expect(outcome.reason).toBe('not_connected');
      expect(findingIds(run)).not.toContain('F1');
      expect(run.uncheckedAreas).toContain('Reviews — not connected');
    });

    it('distinguishes "Google did not answer" from "there is nothing there"', () => {
      const errored = runAuditEngine(
        input({
          reviews: {
            status: 'error',
            code: 'gbp_500',
            message: 'Google returned an error.',
            retryable: true,
          },
        }),
      );
      const empty = runAuditEngine(
        input({ reviews: unavailable('no_data_yet', 'This profile has no reviews yet.') }),
      );

      const erroredOutcome = outcomeOf(errored, 'F1');
      const emptyOutcome = outcomeOf(empty, 'F1');
      expect(erroredOutcome.kind).toBe('not_checked');
      expect(emptyOutcome.kind).toBe('not_checked');
      if (erroredOutcome.kind === 'not_checked') {
        // An error must NOT be laundered into "no data yet" — that would tell
        // the owner their profile is empty when we simply could not read it.
        expect(erroredOutcome.reason).toBe('provider_error');
      }
      if (emptyOutcome.kind === 'not_checked') expect(emptyOutcome.reason).toBe('no_data_yet');
      expect(errored.uncheckedAreas).toContain("Reviews — Google didn't respond");
      expect(empty.uncheckedAreas).toContain('Reviews — nothing there yet');
    });
  });

  describe('photos', () => {
    it('ready with zero owner photos fails E1 and E2 with findings', () => {
      const run = runAuditEngine(input({ media: ok({ ownerUploaded: [] }) }));

      expect(outcomeOf(run, 'E1').kind).toBe('fail');
      expect(outcomeOf(run, 'E2').kind).toBe('fail');
      // E3 has nothing to age, which is not-applicable rather than a failure.
      expect(outcomeOf(run, 'E3').kind).toBe('not_applicable');
      expect(findingIds(run)).toEqual(expect.arrayContaining(['E1', 'E2']));
    });

    it('unavailable photos produce no photo findings at all', () => {
      const run = runAuditEngine(
        input({ media: unavailable('not_connected', 'Not linked.') }),
      );

      expect(outcomeOf(run, 'E1').kind).toBe('not_checked');
      expect(findingIds(run)).not.toContain('E1');
      expect(findingIds(run)).not.toContain('E2');
      expect(run.uncheckedAreas).toContain('Photos — not connected');
    });

    it('does not let an unknown drag the score down the way a measured zero does', () => {
      const unknown = runAuditEngine(input({ media: unavailable('not_connected', 'Not linked.') }));
      const measuredZero = runAuditEngine(input({ media: ok({ ownerUploaded: [] }) }));
      const healthy = runAuditEngine(input());

      // Not knowing about photos leaves the score exactly where it was.
      expect(unknown.report.status).toBe('ready');
      expect(unknown.score.score).toBe(healthy.score.score);
      // Knowing that there are none is a real, scored failure.
      expect(measuredZero.score.score).not.toBeNull();
      expect(measuredZero.score.score ?? 100).toBeLessThan(healthy.score.score ?? 0);
    });
  });

  describe('google posts', () => {
    it('ready with zero posts fails G1', () => {
      const run = runAuditEngine(input({ localPosts: ok({ items: [] }) }));
      expect(outcomeOf(run, 'G1').kind).toBe('fail');
      expect(run.findings.find((f) => f.checkId === 'G1')?.title).toBe(
        "You've never posted to Google",
      );
    });

    it('a listing that cannot post at all is not_applicable, not a failure', () => {
      const run = runAuditEngine(
        input({
          location: ok(
            locationDetail({
              metadata: {
                hasVoiceOfMerchant: true,
                canOperateLocalPost: false,
                canModifyServiceList: true,
                canHaveFoodMenus: false,
                placeId: 'ChIJtest',
              },
            }),
          ),
          localPosts: ok({ items: [] }),
        }),
      );

      expect(outcomeOf(run, 'G1').kind).toBe('not_applicable');
      expect(findingIds(run)).not.toContain('G1');
      // not_applicable leaves the denominator entirely and is never listed as unchecked.
      expect(run.uncheckedAreas.join(' ')).not.toContain('Google posts');
    });
  });

  describe('the connection itself', () => {
    it('"not connected" is something we measured, so it produces a finding', () => {
      const run = runAuditEngine(
        input({ connection: unavailable('not_connected', 'No Google Business Profile is linked.') }),
      );
      expect(outcomeOf(run, 'A1').kind).toBe('fail');
      expect(run.findings.find((f) => f.checkId === 'A1')?.title).toBe('Connect your Google listing');
    });

    it('a connected account with zero listings is a different, measured fact', () => {
      const run = runAuditEngine(input({ locations: ok({ locationIds: [] }) }));
      expect(outcomeOf(run, 'A1').kind).toBe('fail');
      expect(run.findings.find((f) => f.checkId === 'A1')?.title).toBe(
        'No business listing on that Google account',
      );
    });

    it('a connected account whose listings we could not read tells the owner nothing', () => {
      const run = runAuditEngine(
        input({ locations: unavailable('rate_limited', 'Google is limiting requests.') }),
      );
      // We must NOT tell someone to connect an account they have already connected.
      expect(outcomeOf(run, 'A1').kind).toBe('not_checked');
      expect(findingIds(run)).not.toContain('A1');
    });
  });

  describe('fields Google returned as absent', () => {
    it('a null phone number is a measured absence and fails B4', () => {
      const run = runAuditEngine(input({ location: ok(locationDetail({ primaryPhone: null })) }));
      expect(outcomeOf(run, 'B4').kind).toBe('fail');
      expect(run.findings.find((f) => f.checkId === 'B4')?.title).toBe(
        'Your listing has no phone number',
      );
    });

    it('a map pin Google never returns is unknown, not a wrong pin', () => {
      const run = runAuditEngine(input({ location: ok(locationDetail({ latLng: null })) }));
      const outcome = outcomeOf(run, 'B3');
      expect(outcome.kind).toBe('not_checked');
      if (outcome.kind === 'not_checked') expect(outcome.reason).toBe('not_supported');
      expect(findingIds(run)).not.toContain('B3');
    });
  });
});
