/**
 * The write path. Owner: Pranay.
 *
 * THE CEILING THIS EXISTS FOR
 * ---------------------------
 * docs/research/google-business-profile.md §10: Business Information **edits are
 * capped at 10 per minute per Google Business Profile**, and Google states that
 * ceiling "cannot be increased" — no quota request touches it. Reads are a
 * different limit entirely (300 QPM per API) and are never queued.
 *
 * So every edit on the profile, hours and areas screens goes through
 * `createGbpWriteQueue`, a rolling-window limiter keyed by profile. A bulk fix
 * across several fields therefore QUEUES, and this module reports that queue's
 * real state rather than animating a bar.
 *
 * WHAT "PROGRESS" IS ALLOWED TO MEAN HERE
 * ---------------------------------------
 * Every transition below is caused by something that actually happened:
 *
 *   queued   the edit is in the lane and has not started
 *   sending  the queue released it and the provider call is in flight
 *   accepted the provider returned `ready` — Google ACCEPTED the edit
 *   blocked  the provider returned `unavailable` (today: not connected)
 *   failed   the provider returned `error`
 *
 * There is no timer, no interpolation and no optimistic step. CONTRIBUTING
 * rule 6 forbids progress theatre and rule 5 forbids reporting a success the
 * provider did not confirm.
 *
 * AND "ACCEPTED" IS NOT "LIVE"
 * ----------------------------
 * `GbpHoursUpdateOutcome.willReachGoogle` is false whenever the profile does not
 * hold Voice of Merchant, because Google only propagates edits once it does. An
 * accepted edit on an unverified profile has changed nothing a customer can see,
 * and this module keeps those two facts in separate fields so a screen cannot
 * accidentally merge them into "Published".
 */

import { GBP_EDIT_QPM_PER_PROFILE } from '../../endpoints';
import type { GbpWriteQueue } from '../../writeQueue';
import type { DataState } from '@/lib/state/DataState';

import type { ProfileFieldId } from './fields';

/* -------------------------------------------------------------------------- */
/* One edit                                                                   */
/* -------------------------------------------------------------------------- */

/** What a provider write tells us. Deliberately the smallest honest shape. */
export interface EditAcceptance {
  /**
   * False when the profile does not hold Voice of Merchant. Google says edits
   * only propagate once it does, so this must never be assumed true.
   */
  willReachGoogle: boolean;
}

export interface PlannedEdit {
  /** Stable within one plan. Used as a React key and in progress lookups. */
  id: string;
  fieldId: ProfileFieldId;
  /** Owner-facing name of what is being changed. */
  label: string;
  /** The `updateMask` path this edit would send. Shown, not hidden. */
  updateMask: string;
  /** The provider call. Its `DataState` is reported verbatim — never upgraded. */
  submit: () => Promise<DataState<EditAcceptance>>;
}

export type EditStatus =
  | { kind: 'queued' }
  | { kind: 'sending' }
  | { kind: 'accepted'; willReachGoogle: boolean; acceptedAt: string }
  | { kind: 'blocked'; reason: string; message: string }
  | { kind: 'failed'; code: string; message: string; retryable: boolean };

export interface EditProgress {
  id: string;
  fieldId: ProfileFieldId;
  label: string;
  updateMask: string;
  status: EditStatus;
}

/* -------------------------------------------------------------------------- */
/* Running a plan                                                             */
/* -------------------------------------------------------------------------- */

export interface RunEditPlanOptions {
  /** Google's ceiling is per profile, so the queue lane is keyed by profile. */
  profileKey: string;
  edits: readonly PlannedEdit[];
  queue: GbpWriteQueue;
  /** Called on every real transition, with the whole plan each time. */
  onProgress: (progress: readonly EditProgress[]) => void;
}

function initialProgress(edits: readonly PlannedEdit[]): EditProgress[] {
  return edits.map((edit) => ({
    id: edit.id,
    fieldId: edit.fieldId,
    label: edit.label,
    updateMask: edit.updateMask,
    status: { kind: 'queued' },
  }));
}

/**
 * Run every edit through the per-profile queue, in submission order.
 *
 * Resolves with the final progress list. It never rejects: a thrown provider is
 * reported as a failed edit, because a plan that vanishes mid-run tells the
 * owner nothing about which of their changes landed.
 */
export async function runEditPlan(options: RunEditPlanOptions): Promise<readonly EditProgress[]> {
  const progress = initialProgress(options.edits);
  const emit = (): void => options.onProgress(progress.map((entry) => ({ ...entry })));
  emit();

  const set = (index: number, status: EditStatus): void => {
    const entry = progress[index];
    if (entry === undefined) return;
    progress[index] = { ...entry, status };
    emit();
  };

  await Promise.all(
    options.edits.map((edit, index) =>
      options.queue.enqueue(options.profileKey, async () => {
        set(index, { kind: 'sending' });
        try {
          const outcome = await edit.submit();
          switch (outcome.status) {
            case 'ready':
              set(index, {
                kind: 'accepted',
                willReachGoogle: outcome.value.willReachGoogle,
                acceptedAt: outcome.fetchedAt,
              });
              break;
            case 'unavailable':
              set(index, {
                kind: 'blocked',
                reason: outcome.reason,
                message: outcome.message,
              });
              break;
            case 'error':
              set(index, {
                kind: 'failed',
                code: outcome.code,
                message: outcome.message,
                retryable: outcome.retryable,
              });
              break;
            case 'loading':
              // A provider that answers `loading` has told us nothing. It is not
              // a success and it is not a failure, so it is reported as neither.
              set(index, {
                kind: 'failed',
                code: 'gbp_edit_no_answer',
                message:
                  'Shoogle sent this change and got no answer back, so it cannot tell you whether Google took it.',
                retryable: true,
              });
              break;
          }
        } catch (error) {
          set(index, {
            kind: 'failed',
            code: 'gbp_edit_threw',
            message:
              error instanceof Error
                ? `This change could not be sent: ${error.message}`
                : 'This change could not be sent, and Shoogle could not read why.',
            retryable: true,
          });
        }
      }),
    ),
  );

  return progress.map((entry) => ({ ...entry }));
}

/* -------------------------------------------------------------------------- */
/* Reporting the plan                                                         */
/* -------------------------------------------------------------------------- */

export interface PlanSummary {
  total: number;
  /** Edits that have finished, whatever the outcome. */
  settled: number;
  accepted: number;
  /** Accepted, but the profile does not hold Voice of Merchant. */
  acceptedNotLive: number;
  blocked: number;
  failed: number;
  inFlight: number;
  waiting: number;
}

export function summarisePlan(progress: readonly EditProgress[]): PlanSummary {
  const summary: PlanSummary = {
    total: progress.length,
    settled: 0,
    accepted: 0,
    acceptedNotLive: 0,
    blocked: 0,
    failed: 0,
    inFlight: 0,
    waiting: 0,
  };
  for (const entry of progress) {
    switch (entry.status.kind) {
      case 'queued':
        summary.waiting += 1;
        break;
      case 'sending':
        summary.inFlight += 1;
        break;
      case 'accepted':
        summary.accepted += 1;
        summary.settled += 1;
        if (!entry.status.willReachGoogle) summary.acceptedNotLive += 1;
        break;
      case 'blocked':
        summary.blocked += 1;
        summary.settled += 1;
        break;
      case 'failed':
        summary.failed += 1;
        summary.settled += 1;
        break;
    }
  }
  return summary;
}

/**
 * One line describing where the plan is. Counts only, never a percentage:
 * "3 of 7" is a fact, "43%" invites a bar that fills itself.
 */
export function planSentence(summary: PlanSummary): string {
  if (summary.total === 0) return 'There is nothing queued.';
  if (summary.settled === summary.total) {
    const parts: string[] = [];
    if (summary.accepted > 0) parts.push(`${summary.accepted} accepted by Google`);
    if (summary.blocked > 0) parts.push(`${summary.blocked} could not be sent`);
    if (summary.failed > 0) parts.push(`${summary.failed} failed`);
    return `${summary.total} of ${summary.total} attempted — ${parts.join(', ')}.`;
  }
  return `${summary.settled} of ${summary.total} attempted. ${summary.inFlight} sending, ${summary.waiting} waiting for a slot.`;
}

/** Owner-facing English for one edit's status. Never says "live" on a guess. */
export function describeEditStatus(status: EditStatus): { text: string; accent: 'green' | 'amber' | 'red' | 'neutral' } {
  switch (status.kind) {
    case 'queued':
      return { text: 'Waiting for a slot', accent: 'neutral' };
    case 'sending':
      return { text: 'Sending to Google', accent: 'neutral' };
    case 'accepted':
      return status.willReachGoogle
        ? { text: 'Google accepted it', accent: 'green' }
        : {
            text: 'Accepted — not live yet',
            accent: 'amber',
          };
    case 'blocked':
      return { text: 'Not sent', accent: 'amber' };
    case 'failed':
      return { text: 'Failed', accent: 'red' };
  }
}

export const ACCEPTED_NOT_LIVE_NOTE =
  'Google accepted the change but this profile is not in good standing, and Google only publishes edits once it is. ' +
  'Nothing a customer sees has changed yet.';

/* -------------------------------------------------------------------------- */
/* The budget, stated plainly                                                 */
/* -------------------------------------------------------------------------- */

export interface QueueBudget {
  slotsRemaining: number;
  maxPerWindow: number;
  pending: number;
}

export function readQueueBudget(queue: GbpWriteQueue, profileKey: string): QueueBudget {
  return {
    slotsRemaining: queue.slotsRemaining(profileKey),
    maxPerWindow: GBP_EDIT_QPM_PER_PROFILE,
    pending: queue.pendingCount(profileKey),
  };
}

/**
 * Why the queue exists, in the owner's words.
 *
 * The second sentence matters: Shoogle counts an attempt against this budget
 * even when the attempt never left the phone. Counting conservatively risks
 * spacing changes out slightly more than necessary; counting optimistically
 * risks tripping a ceiling Google says cannot be raised.
 */
export const QUEUE_EXPLAINER =
  `Google accepts ${GBP_EDIT_QPM_PER_PROFILE} changes a minute for one profile and says that limit cannot be raised, ` +
  'so Shoogle spaces changes out instead of firing them all at once. Every attempt counts against the budget, ' +
  'including ones that never leave your phone.';
