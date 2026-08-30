/**
 * THE SHOOGLE AGENT — status, runway and action results. Owner: Pranay.
 *
 * This is the honest answer to a competitor card that reads "GBP AI Agent ·
 * Active · 0 Photos left — Profile stays fresh & active for 1 more week", and
 * to a feed that says "New Post Published" and stops there.
 *
 * THREE THINGS THAT CARD GETS WRONG, AND WHAT IS DONE HERE INSTEAD
 * ---------------------------------------------------------------
 * 1. IT IS ALWAYS "ACTIVE". A pill that reads the same whatever is true carries
 *    no information. There is deliberately NO `active` member in `AgentStatus`
 *    and the word does not appear in any copy in this file. The agent is either
 *    able to act — which today it is not, because no Google credentials exist —
 *    or it names the exact thing stopping it. Eight statuses, each a real,
 *    separately-reachable condition, and `able_to_act` is the only one that
 *    permits work.
 * 2. "1 MORE WEEK" IS NOT DERIVED FROM ANYTHING. A runway is a claim about the
 *    future built on two facts: what is genuinely scheduled, and when something
 *    was genuinely last published. When either is unknown the runway is
 *    `unknown` — never a comfortable default. And a runway of ZERO scheduled
 *    items is a different value from an UNKNOWN one; both exist here, they are
 *    different members of the union, and they render differently.
 * 3. "PUBLISHED" IS ASSERTED, NOT CONFIRMED. Every action carries a
 *    `AgentActionResult`, and only `confirmed_by_google` counts as done. A
 *    review reply sits in `pending_moderation`, because Google moderates
 *    replies and a 200 from `updateReply` is not publication. An action whose
 *    outcome nobody confirmed is `result_unknown`, which is explicitly NOT a
 *    success.
 *
 * Everything in this file is pure. Nothing fetches, nothing invents a value,
 * and nothing here can produce a number the caller did not supply.
 */

import { type DataState } from '@/lib/state/DataState';
import type { AccentName } from '@/theme/tokens';

import { describeVoiceOfMerchant, type VoiceOfMerchantOutcome } from '../../voiceOfMerchant';

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * `2020-01-01T00:00:00.000Z` -> `1 January 2020`. Returns null for anything
 * unparseable, and callers must handle null rather than printing a raw string
 * or, worse, today's date.
 */
export function formatAgentDay(iso: string): string | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  const month = MONTHS[date.getUTCMonth()];
  if (month === undefined) return null;
  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

/** The dated timeline form: `Wed, 1 January 2020`. */
export function formatAgentTimelineDay(iso: string): string | null {
  const day = formatAgentDay(iso);
  if (day === null) return null;
  const weekday = WEEKDAYS[new Date(Date.parse(iso)).getUTCDay()];
  return weekday === undefined ? day : `${weekday}, ${day}`;
}

/** Whole UTC days since the epoch, or null when the input is not a date. */
function utcDayNumber(iso: string): number | null {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return Math.floor(parsed / 86_400_000);
}

/**
 * The owner-facing reason a `DataState` is not ready.
 *
 * `loading` is given the caller's own sentence rather than a shared one,
 * because "still checking" and "cannot check" are different facts.
 */
function reasonFor(state: DataState<unknown>, whileLoading: string): string {
  switch (state.status) {
    case 'loading':
      return whileLoading;
    case 'unavailable':
      return state.message;
    case 'error':
      return state.message;
    case 'ready':
      // Unreachable: callers only ask when the state is not ready. Kept total
      // so a future state cannot silently fall through to an empty string.
      return whileLoading;
  }
}

/* -------------------------------------------------------------------------- */
/* What the agent can be asked to do                                          */
/* -------------------------------------------------------------------------- */

/**
 * The four kinds of work. Each is named for the ATTEMPT, not the outcome:
 * `publish_post`, never `post_published`. The outcome is a separate field, so
 * an entry cannot be labelled "Published" by the same string that says what was
 * tried.
 */
export type AgentActionKind =
  | 'publish_post'
  | 'publish_media'
  | 'reply_to_review'
  | 'update_hours';

export interface AgentWorkDefinition {
  kind: AgentActionKind;
  label: string;
  /** What the agent will do, stated in the future because it has not happened. */
  willDo: string;
  /** What Shoogle will accept as proof it landed. The competitor shows none. */
  proofOfDone: string;
}

/**
 * The four definitions, keyed. `AGENT_PLANNED_WORK` below is derived from this
 * record rather than declared beside it, so the list and the lookup can never
 * disagree about how many kinds of work exist.
 */
const WORK_BY_KIND: Readonly<Record<AgentActionKind, AgentWorkDefinition>> = Object.freeze({
  publish_post: Object.freeze({
    kind: 'publish_post',
    label: 'Posts',
    willDo:
      'Write and publish a Google Business post — an offer, an event or an update — on a schedule you can change or stop.',
    proofOfDone:
      'Google returns the post with a state of LIVE and a link to it. Until it does, this reads "result unknown", not "published".',
  }),
  publish_media: Object.freeze({
    kind: 'publish_media',
    label: 'Photos and videos',
    willDo: 'Publish photos and videos you have approved, so the listing does not go stale.',
    proofOfDone:
      'Google returns the created media item. Google removed photo VIEW counts in 2023, so Shoogle will report that a photo went up and will never claim how many people saw it.',
  }),
  reply_to_review: Object.freeze({
    kind: 'reply_to_review',
    label: 'Review replies',
    willDo: 'Draft a reply to a new review and submit it for you once you approve it.',
    proofOfDone:
      'Google moderates replies. Shoogle will show "submitted, pending review" until Google reports the reply is live — those are two different states and it will never merge them.',
  }),
  update_hours: Object.freeze({
    kind: 'update_hours',
    label: 'Opening hours',
    willDo:
      'Set special hours for festival days and correct hours Google changed without asking you.',
    proofOfDone:
      'Google accepts the edit. Acceptance is not the same as the change being live on Maps, and Shoogle will say which one it has.',
  }),
});

/** The order the empty feed lists them in. */
export const AGENT_ACTION_KIND_ORDER: readonly AgentActionKind[] = Object.freeze([
  'publish_post',
  'publish_media',
  'reply_to_review',
  'update_hours',
]);

/**
 * The empty feed is built from this list. It describes intent in the future
 * tense and never implies any of it has happened.
 */
export const AGENT_PLANNED_WORK: readonly AgentWorkDefinition[] = Object.freeze(
  AGENT_ACTION_KIND_ORDER.map((kind) => WORK_BY_KIND[kind]),
);

export function agentWorkLabel(kind: AgentActionKind): string {
  return WORK_BY_KIND[kind].label;
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/** The owner's own switch. `changedAt` is null when it has never been touched. */
export interface AgentPausePreference {
  paused: boolean;
  changedAt: string | null;
}

/** What the agent would act on. Ready ONLY when a profile is genuinely linked. */
export interface AgentTarget {
  locationId: string;
  /** Owner-facing name of the profile, when the provider supplied one. */
  label: string;
}

/**
 * Google allows ten EDITS per minute per profile and states the ceiling cannot
 * be raised. `unknown` is the honest default: we have never spoken to Google,
 * so we do not know the headroom and must not claim it is fine.
 */
export type AgentQuota =
  | { kind: 'unknown' }
  | { kind: 'has_headroom'; editSlotsRemaining: number }
  | { kind: 'exhausted'; retryAfter: string | null };

/**
 * Every condition the agent can be in. There is no `active`.
 *
 * `checking` is not a spinner for its own sake — it is the state in which we
 * genuinely do not yet know, and saying either "can act" or "cannot act" would
 * be a guess.
 */
export type AgentStatus =
  /** Still establishing the facts. Not a claim in either direction. */
  | { kind: 'checking' }
  /** No Google Business Profile is linked. Today, always this. */
  | { kind: 'not_connected'; message: string }
  /** Linked, but Google would not tell us the profile's state. */
  | { kind: 'profile_state_unknown'; message: string }
  /** Linked, and Google named something the profile must resolve first. */
  | { kind: 'profile_not_ready'; outcome: VoiceOfMerchantOutcome }
  /** We could not read the owner's pause switch, so we assume nothing. */
  | { kind: 'pause_state_unknown'; message: string }
  /** The owner stopped it. */
  | { kind: 'paused_by_owner'; pausedAt: string | null }
  /** Google's per-profile edit ceiling is spent for this minute. */
  | { kind: 'rate_limited'; retryAfter: string | null }
  /** Everything above is clear. The only state in which work may happen. */
  | { kind: 'able_to_act'; hasBusinessAuthority: boolean };

export type AgentStatusKind = AgentStatus['kind'];

export interface AgentStatusInputs {
  /** Ready only when a profile is genuinely linked. */
  target: DataState<AgentTarget>;
  /** Only meaningful once `target` is ready. */
  voiceOfMerchant: DataState<VoiceOfMerchantOutcome>;
  /** Loading is NOT "not paused", and a failed read is NOT "not paused". */
  pause: DataState<AgentPausePreference>;
  quota: AgentQuota;
}

export interface AgentStatusResolution {
  /** The single most fundamental reason, or `able_to_act`. */
  status: AgentStatus;
  /**
   * Everything else that is ALSO true and would also stop the agent. Showing
   * only the first blocker lets an owner fix it and still find nothing works.
   */
  alsoBlocking: string[];
  /** True only for `able_to_act`. Nothing else may be read as permission. */
  canAct: boolean;
}

/**
 * Resolve the one status, in precedence order.
 *
 * The order is deliberate: capability before intent. If nothing is connected,
 * "Paused by you" would imply the agent would run if resumed, which is false.
 * The pause is still reported, in `alsoBlocking`, and the pause control itself
 * always reads the stored preference rather than this status.
 */
export function resolveAgentStatus(inputs: AgentStatusInputs): AgentStatusResolution {
  const blockers: AgentStatus[] = [];

  if (inputs.target.status === 'loading' || inputs.pause.status === 'loading') {
    blockers.push({ kind: 'checking' });
  }

  if (inputs.target.status !== 'ready' && inputs.target.status !== 'loading') {
    blockers.push({
      kind: 'not_connected',
      message: reasonFor(inputs.target, NOT_CONNECTED_WHILE_CHECKING),
    });
  }

  if (inputs.target.status === 'ready') {
    if (inputs.voiceOfMerchant.status === 'ready') {
      if (inputs.voiceOfMerchant.value.kind !== 'has_voice_of_merchant') {
        blockers.push({ kind: 'profile_not_ready', outcome: inputs.voiceOfMerchant.value });
      }
    } else if (inputs.voiceOfMerchant.status !== 'loading') {
      blockers.push({
        kind: 'profile_state_unknown',
        message: reasonFor(inputs.voiceOfMerchant, PROFILE_STATE_WHILE_CHECKING),
      });
    } else {
      blockers.push({ kind: 'checking' });
    }
  }

  if (inputs.pause.status === 'ready') {
    if (inputs.pause.value.paused) {
      blockers.push({ kind: 'paused_by_owner', pausedAt: inputs.pause.value.changedAt });
    }
  } else if (inputs.pause.status !== 'loading') {
    blockers.push({
      kind: 'pause_state_unknown',
      message: reasonFor(inputs.pause, PAUSE_STATE_WHILE_CHECKING),
    });
  }

  if (inputs.quota.kind === 'exhausted') {
    blockers.push({ kind: 'rate_limited', retryAfter: inputs.quota.retryAfter });
  }

  if (blockers.length === 0) {
    const outcome = inputs.voiceOfMerchant;
    const hasAuthority =
      outcome.status === 'ready' &&
      outcome.value.kind === 'has_voice_of_merchant' &&
      outcome.value.hasBusinessAuthority;
    return {
      status: { kind: 'able_to_act', hasBusinessAuthority: hasAuthority },
      alsoBlocking: [],
      canAct: true,
    };
  }

  const ordered = [...blockers].sort(
    (a, b) => STATUS_PRECEDENCE[a.kind] - STATUS_PRECEDENCE[b.kind],
  );
  const primary = ordered[0] ?? { kind: 'checking' as const };

  return {
    status: primary,
    alsoBlocking: ordered.slice(1).map((status) => describeAgentStatus(status).headline),
    canAct: false,
  };
}

const STATUS_PRECEDENCE: Readonly<Record<AgentStatusKind, number>> = Object.freeze({
  checking: 0,
  not_connected: 1,
  profile_state_unknown: 2,
  profile_not_ready: 3,
  pause_state_unknown: 4,
  paused_by_owner: 5,
  rate_limited: 6,
  able_to_act: 7,
});

const NOT_CONNECTED_WHILE_CHECKING =
  'Shoogle is still working out whether a Google Business Profile is linked.';
const PROFILE_STATE_WHILE_CHECKING = 'Shoogle is still asking Google about this profile.';
const PAUSE_STATE_WHILE_CHECKING = 'Shoogle is still reading whether you have paused it.';

export interface AgentStatusDescription {
  /**
   * The pill. "Can act" is the only positive value and it is reachable from
   * exactly one status. There is no "Active".
   */
  badge: string;
  accent: AccentName;
  headline: string;
  body: string;
  /** The one thing the owner can do about it, or null when there is nothing. */
  ownerAction: string | null;
  canAct: boolean;
}

export function describeAgentStatus(status: AgentStatus): AgentStatusDescription {
  switch (status.kind) {
    case 'checking':
      return {
        badge: 'Checking',
        accent: 'neutral',
        headline: 'Working out what Shoogle can do',
        body: 'Shoogle has not finished establishing whether it can act. Until it has, it will not claim either way.',
        ownerAction: null,
        canAct: false,
      };

    case 'not_connected':
      return {
        badge: 'Cannot act',
        accent: 'neutral',
        headline: 'Cannot act — not connected',
        body: status.message,
        ownerAction: 'Connect a Google Business Profile',
        canAct: false,
      };

    case 'profile_state_unknown':
      return {
        badge: 'Cannot act',
        accent: 'neutral',
        headline: 'Cannot act — Google did not report this profile’s state',
        body: status.message,
        ownerAction: null,
        canAct: false,
      };

    case 'profile_not_ready': {
      const explanation = describeVoiceOfMerchant(status.outcome);
      return {
        badge: 'Cannot act',
        accent: 'amber',
        headline: `Cannot act — ${explanation.title.toLowerCase()}`,
        body: explanation.writesMayNotReachGoogle
          ? `${explanation.body} Anything Shoogle changed would not reach Search or Maps, so it will not try.`
          : explanation.body,
        ownerAction: explanation.ownerAction,
        canAct: false,
      };
    }

    case 'pause_state_unknown':
      return {
        badge: 'Cannot act',
        accent: 'amber',
        headline: 'Cannot act — your pause setting could not be read',
        body: `${status.message} Shoogle will not act while it cannot tell whether you have stopped it.`,
        ownerAction: null,
        canAct: false,
      };

    case 'paused_by_owner': {
      const day = status.pausedAt === null ? null : formatAgentDay(status.pausedAt);
      return {
        badge: 'Paused',
        accent: 'amber',
        headline: 'Paused by you',
        body:
          day === null
            ? 'You have paused Shoogle. It will not publish anything or reply to anything until you resume it.'
            : `You paused Shoogle on ${day}. It will not publish anything or reply to anything until you resume it.`,
        ownerAction: null,
        canAct: false,
      };
    }

    case 'rate_limited': {
      const day = status.retryAfter === null ? null : formatAgentDay(status.retryAfter);
      return {
        badge: 'Waiting on Google',
        accent: 'amber',
        headline: 'Held back by Google’s edit limit',
        body:
          'Google allows ten edits a minute per profile and states that ceiling cannot be raised. Shoogle has used this minute’s allowance and will carry on when it resets.' +
          (day === null ? '' : ` Next attempt after ${day}.`),
        ownerAction: null,
        canAct: false,
      };
    }

    case 'able_to_act':
      return {
        badge: 'Can act',
        accent: 'green',
        headline: 'Shoogle can act',
        body: status.hasBusinessAuthority
          ? 'Google recognises this account as the owner of the listing, so changes Shoogle makes reach Search and Maps.'
          : 'The profile is live on Google and Shoogle can work on it, though Google has not given this account full owner authority over the listing.',
        ownerAction: null,
        canAct: true,
      };
  }
}

/**
 * Every state this screen can report, in the order it reports them.
 *
 * Rendered as a reference list so an owner can see that the pill has more than
 * one possible value — the competitor's reads "Active" whatever is true. This
 * makes NO claim about which of these is currently false; only the resolved
 * status is claimed.
 */
export const AGENT_STATUS_LEDGER: readonly { kind: AgentStatusKind; label: string; meaning: string }[] =
  Object.freeze([
    Object.freeze({
      kind: 'not_connected' as const,
      label: 'Not connected',
      meaning: 'No Google Business Profile is linked, so there is nothing to act on.',
    }),
    Object.freeze({
      kind: 'profile_state_unknown' as const,
      label: 'Profile state unknown',
      meaning: 'Google answered without saying whether the listing is usable. Shoogle does not guess.',
    }),
    Object.freeze({
      kind: 'profile_not_ready' as const,
      label: 'Profile not ready',
      meaning:
        'Google needs the listing verified, is still processing it, has someone else claiming it, or has restricted it. Each is named separately.',
    }),
    Object.freeze({
      kind: 'pause_state_unknown' as const,
      label: 'Pause setting unreadable',
      meaning: 'Shoogle could not read whether you stopped it, so it stops.',
    }),
    Object.freeze({
      kind: 'paused_by_owner' as const,
      label: 'Paused by you',
      meaning: 'You stopped it. Nothing publishes until you resume.',
    }),
    Object.freeze({
      kind: 'rate_limited' as const,
      label: 'Held by Google’s limit',
      meaning: 'Ten edits a minute per profile is Google’s ceiling and cannot be raised.',
    }),
    Object.freeze({
      kind: 'able_to_act' as const,
      label: 'Can act',
      meaning: 'The only state in which Shoogle publishes anything.',
    }),
  ]);

/* -------------------------------------------------------------------------- */
/* What pausing does                                                          */
/* -------------------------------------------------------------------------- */

/** Pausing must state what it stops. Vague reassurance is not a control. */
export const PAUSE_STOPS: readonly string[] = Object.freeze([
  'Publishing Google Business posts, including anything already scheduled.',
  'Publishing photos and videos.',
  'Submitting replies to reviews.',
  'Changing your opening hours or any other profile field.',
]);

/** And what it does not stop, so pausing is not mistaken for switching off. */
export const PAUSE_DOES_NOT_STOP: readonly string[] = Object.freeze([
  'Reading your profile and measuring what Google reports.',
  'Showing you what Shoogle would have done, so you can do it yourself.',
]);

/* -------------------------------------------------------------------------- */
/* Runway                                                                     */
/* -------------------------------------------------------------------------- */

/** One thing the agent has genuinely scheduled. No item, no runway. */
export interface AgentScheduledItem {
  id: string;
  kind: AgentActionKind;
  headline: string;
  /** ISO date this is due to publish. */
  dueAt: string;
}

/**
 * When something was last published to the profile.
 *
 * `never` is a MEASURED fact — Google told us there is nothing. `unknown` is
 * the absence of that fact. They are different members precisely so a screen
 * cannot render them the same way.
 */
export type AgentLastPublished =
  | { kind: 'unknown'; reason: string }
  | { kind: 'never' }
  | { kind: 'at'; at: string };

/**
 * How far ahead the agent is covered.
 *
 * `nothing_scheduled` carries a real zero. `unknown` carries no number at all —
 * there is deliberately no `itemCount` field on it, so a renderer cannot reach
 * for one and find a default.
 */
export type AgentRunway =
  | { kind: 'unknown'; reason: string; lastPublished: AgentLastPublished }
  | { kind: 'nothing_scheduled'; lastPublished: AgentLastPublished }
  | {
      kind: 'scheduled';
      itemCount: number;
      /** The furthest-out scheduled item. */
      coversUntil: string;
      /** Whole days from today to `coversUntil`. Never negative. */
      daysOfCover: number;
      /** True when the last scheduled item was due before today and has not gone out. */
      overdue: boolean;
      lastPublished: AgentLastPublished;
    };

export interface RunwayInputs {
  /** Items the agent has genuinely scheduled. Not ready means unknown. */
  scheduled: DataState<AgentScheduledItem[]>;
  lastPublished: AgentLastPublished;
  /** Today, as an ISO date. Injected so this is testable and never "now". */
  today: string;
}

const RUNWAY_WHILE_CHECKING = 'Shoogle is still reading what is scheduled.';

/**
 * Derive the runway from real scheduled items and a real last-publish date.
 *
 * There is no fallback. If the schedule cannot be read, or if any item carries
 * a date that will not parse, the answer is `unknown` with the reason — not a
 * shorter runway, and never "about a week".
 */
export function computeRunway(inputs: RunwayInputs): AgentRunway {
  if (inputs.scheduled.status !== 'ready') {
    return {
      kind: 'unknown',
      reason: reasonFor(inputs.scheduled, RUNWAY_WHILE_CHECKING),
      lastPublished: inputs.lastPublished,
    };
  }

  const items = inputs.scheduled.value;
  if (items.length === 0) {
    return { kind: 'nothing_scheduled', lastPublished: inputs.lastPublished };
  }

  const todayDay = utcDayNumber(inputs.today);
  if (todayDay === null) {
    return {
      kind: 'unknown',
      reason: 'Shoogle could not read today’s date, so it cannot say how far ahead you are covered.',
      lastPublished: inputs.lastPublished,
    };
  }

  let furthest: { at: string; day: number } | null = null;
  for (const item of items) {
    const day = utcDayNumber(item.dueAt);
    if (day === null) {
      return {
        kind: 'unknown',
        reason: `One scheduled item ("${item.headline}") carries a date Shoogle cannot read, so the runway would be wrong. It is not shown rather than shown short.`,
        lastPublished: inputs.lastPublished,
      };
    }
    if (furthest === null || day > furthest.day) furthest = { at: item.dueAt, day };
  }

  if (furthest === null) {
    return { kind: 'nothing_scheduled', lastPublished: inputs.lastPublished };
  }

  const diff = furthest.day - todayDay;
  return {
    kind: 'scheduled',
    itemCount: items.length,
    coversUntil: furthest.at,
    daysOfCover: diff > 0 ? diff : 0,
    overdue: diff < 0,
    lastPublished: inputs.lastPublished,
  };
}

export interface RunwayDescription {
  /** The headline number, already formatted. Null renders as an em dash. */
  countLabel: string | null;
  /** What the number counts, or why there is not one. */
  countCaption: string;
  headline: string;
  body: string;
  lastPublishedLabel: string;
  accent: AccentName;
  /**
   * True when the zero on screen is a MEASURED zero rather than an absence.
   * The two must never look alike, so the renderer branches on this.
   */
  isMeasuredZero: boolean;
}

export function describeRunway(runway: AgentRunway): RunwayDescription {
  const lastPublishedLabel = describeLastPublished(runway.lastPublished);

  switch (runway.kind) {
    case 'unknown':
      return {
        countLabel: null,
        countCaption: 'not known',
        headline: 'Runway unknown',
        body: `${runway.reason} A runway is a claim about the next few weeks, and Shoogle will not make one it cannot support.`,
        lastPublishedLabel,
        accent: 'neutral',
        isMeasuredZero: false,
      };

    case 'nothing_scheduled':
      return {
        countLabel: '0',
        countCaption: 'items scheduled',
        headline: 'Nothing scheduled',
        body: 'This is a counted zero, not a gap in what Shoogle knows: the schedule was read and it is empty. Nothing will go out until something is scheduled.',
        lastPublishedLabel,
        accent: 'amber',
        isMeasuredZero: true,
      };

    case 'scheduled': {
      const until = formatAgentDay(runway.coversUntil);
      if (runway.overdue) {
        return {
          countLabel: String(runway.itemCount),
          countCaption: runway.itemCount === 1 ? 'item scheduled' : 'items scheduled',
          headline: 'Scheduled, but overdue',
          body:
            until === null
              ? 'The last scheduled item was due before today and has not gone out.'
              : `The last scheduled item was due on ${until} and has not gone out. Your runway has already run out.`,
          lastPublishedLabel,
          accent: 'red',
          isMeasuredZero: false,
        };
      }
      return {
        countLabel: String(runway.itemCount),
        countCaption: runway.itemCount === 1 ? 'item scheduled' : 'items scheduled',
        headline:
          runway.daysOfCover === 0
            ? 'Covered until today'
            : `Covered for ${runway.daysOfCover} more ${runway.daysOfCover === 1 ? 'day' : 'days'}`,
        body:
          until === null
            ? 'Counted from the items on your schedule.'
            : `Counted from the items on your schedule, the last of which is due on ${until}. This is a count of what is booked, not a claim about your ranking — Google publishes no ranking, so Shoogle does not claim one.`,
        lastPublishedLabel,
        accent: 'green',
        isMeasuredZero: false,
      };
    }
  }
}

function describeLastPublished(last: AgentLastPublished): string {
  switch (last.kind) {
    case 'unknown':
      return `Last published: not known. ${last.reason}`;
    case 'never':
      return 'Last published: never. Google reports nothing has been published to this profile.';
    case 'at': {
      const day = formatAgentDay(last.at);
      return day === null ? 'Last published: not known' : `Last published: ${day}`;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Actions and their results                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What became of an action.
 *
 * `confirmed_by_google` is the ONLY success, and it carries the moment Google
 * confirmed plus the evidence sentence, so the claim is never bare.
 */
export type AgentActionResult =
  | { kind: 'confirmed_by_google'; confirmedAt: string; evidence: string }
  /** Submitted and waiting on Google's moderation. Not published. */
  | { kind: 'pending_moderation'; submittedAt: string | null }
  /** Google took the edit but it is not live on Search or Maps. */
  | { kind: 'accepted_not_live'; reason: string }
  /** Nobody confirmed anything. Explicitly not a success. */
  | { kind: 'result_unknown'; reason: string }
  | { kind: 'failed'; reason: string };

export type AgentActionResultKind = AgentActionResult['kind'];

/** Where the thing itself lives. External URL only — never an in-app route. */
export interface AgentActionLink {
  label: string;
  url: string;
}

export interface AgentAction {
  id: string;
  kind: AgentActionKind;
  /** What was attempted, in plain words. */
  headline: string;
  /** When Shoogle did it. */
  occurredAt: string;
  result: AgentActionResult;
  /**
   * Null when the provider gave no link. The card then says so rather than
   * rendering a button that goes nowhere.
   */
  link: AgentActionLink | null;
  /**
   * The observation this action rests on. The competitor's feed reports
   * activity with no reason and no result; this field is why ours is different,
   * and it is required, so an action cannot be added without one.
   */
  because: string;
}

export interface AgentActionResultDescription {
  label: string;
  accent: AccentName;
  body: string;
  /** True only for `confirmed_by_google`. Nothing else may be styled as done. */
  isSuccess: boolean;
}

export function describeActionResult(result: AgentActionResult): AgentActionResultDescription {
  switch (result.kind) {
    case 'confirmed_by_google': {
      const day = formatAgentDay(result.confirmedAt);
      return {
        label: 'Confirmed by Google',
        accent: 'green',
        body:
          day === null
            ? `Google confirmed this. ${result.evidence}`
            : `Google confirmed this on ${day}. ${result.evidence}`,
        isSuccess: true,
      };
    }

    case 'pending_moderation': {
      const day = result.submittedAt === null ? null : formatAgentDay(result.submittedAt);
      return {
        label: 'Submitted, pending review',
        accent: 'amber',
        body:
          (day === null ? 'Submitted to Google. ' : `Submitted to Google on ${day}. `) +
          'Google moderates replies before they appear, and has not said this one is live. Submitted and published are two different things.',
        isSuccess: false,
      };
    }

    case 'accepted_not_live':
      return {
        label: 'Accepted, not live yet',
        accent: 'amber',
        body: `${result.reason} Google accepting an edit is not the same as it appearing on Search or Maps.`,
        isSuccess: false,
      };

    case 'result_unknown':
      return {
        label: 'Result unknown',
        accent: 'neutral',
        body: `${result.reason} This is not a success. Shoogle will say so until Google confirms otherwise.`,
        isSuccess: false,
      };

    case 'failed':
      return {
        label: 'Failed',
        accent: 'red',
        body: result.reason,
        isSuccess: false,
      };
  }
}

/**
 * Actions newest first.
 *
 * Anything with an unreadable date sorts last rather than being dropped: a
 * feed that silently omits an action is a feed that under-reports what the
 * agent did to someone's business.
 */
export function sortActionsNewestFirst(actions: readonly AgentAction[]): AgentAction[] {
  return [...actions].sort((a, b) => {
    const left = Date.parse(a.occurredAt);
    const right = Date.parse(b.occurredAt);
    if (Number.isNaN(left) && Number.isNaN(right)) return 0;
    if (Number.isNaN(left)) return 1;
    if (Number.isNaN(right)) return -1;
    return right - left;
  });
}

/**
 * How many of these actually landed.
 *
 * Returns counts, never a percentage: a "92% success rate" over four actions is
 * fabricated precision. `unconfirmed` deliberately lumps pending, unknown and
 * accepted-not-live together as "not yet confirmed", because none of them is a
 * success and presenting them separately in a summary invites rounding one up.
 */
export function summariseActions(actions: readonly AgentAction[]): {
  total: number;
  confirmed: number;
  unconfirmed: number;
  failed: number;
} {
  let confirmed = 0;
  let failed = 0;
  for (const action of actions) {
    if (action.result.kind === 'confirmed_by_google') confirmed += 1;
    else if (action.result.kind === 'failed') failed += 1;
  }
  return {
    total: actions.length,
    confirmed,
    failed,
    unconfirmed: actions.length - confirmed - failed,
  };
}
