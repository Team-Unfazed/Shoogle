/**
 * The Home view model, and the shapes Home needs from other features.
 * Owner: Aryan.
 *
 * ## Why these types live here and not in `lib/providers/contracts.ts`
 *
 * Home has no provider of its own. It is an AGGREGATOR: it renders a summary
 * of work that Social, SEO and Website own. Putting a "dashboard contract" in
 * the shared contracts file would mean every one of those engineers editing
 * one file to feed one screen.
 *
 * So the dependency runs the other way. Home declares the small, honest shape
 * it needs from each module, and the owning feature adapts its own richer
 * types down to it inside its own folder. Nothing here reaches into anyone
 * else's code, and nothing here implies an integration exists.
 *
 * ## The rule that governs every type in this file
 *
 * Unknown is not zero. Every count that a module might legitimately not know
 * is `number | null`, and every module summary arrives as a `DataState<T>` so
 * that "we could not load Social" and "Social has nothing scheduled" can never
 * collapse into the same pixels.
 */

import type { DataState } from '@/lib/state/DataState';
import type { AccentName } from '@/theme/tokens';
import type { Business, ProviderConnection, ProviderId } from '@/types/domain';

/* -------------------------------------------------------------------------- */
/* What each module owes Home                                                 */
/* -------------------------------------------------------------------------- */

/** The three module rows at the bottom of Home, in render order. */
export type ModuleId = 'social' | 'seo' | 'website';

/**
 * Social's summary. Owner: Yash.
 *
 * Counts are plain numbers because a ready summary genuinely knows them — a
 * scheduled queue of zero is a fact, not an absence. If Social cannot count
 * something, it returns a non-ready `DataState` for the whole summary rather
 * than a zero here.
 */
export interface SocialSummary {
  scheduledCount: number;
  draftCount: number;
  failedCount: number;
}

/**
 * SEO's summary. Owner: Pranay.
 *
 * `improvedKeywordCount` is nullable on purpose: review counts come from the
 * GBP API, but keyword movement depends on impression data that Google reports
 * below a threshold as a bound rather than a number. SEO can know one and not
 * the other, so the unknown lives on the field, not on the whole summary.
 */
export interface SeoSummary {
  unansweredReviewCount: number;
  improvedKeywordCount: number | null;
}

/** Website's summary. Owner: Devashish. */
export interface WebsiteSummary {
  status: 'none' | 'draft' | 'awaiting_review' | 'published';
}

/**
 * One metric destined for the 3-up row.
 *
 * Each tile carries its OWN state and names the provider it depends on. That
 * is the whole point: Google being connected while Instagram is not must show
 * one real number beside one honest dash, never three dashes and never a
 * fabricated zero.
 */
export interface HomeMetricSource {
  key: string;
  label: string;
  provider: ProviderId;
  state: DataState<{ value: number; changePct: number | null }>;
}

/**
 * Everything Home aggregates over.
 *
 * `suggestions` is separate from the module summaries because two different
 * kinds of proposal exist. Some are DERIVED from state ("one review is
 * unanswered"); those the aggregator works out for itself. Others are
 * AUTHORED by the content engine ("here is a post ready to schedule"); no
 * amount of counting produces one, so they arrive as their own source.
 */
export interface HomeSources {
  business: DataState<Business>;
  connections: DataState<ProviderConnection[]>;
  metrics: HomeMetricSource[];
  metricsPeriod: string;
  social: DataState<SocialSummary>;
  seo: DataState<SeoSummary>;
  website: DataState<WebsiteSummary>;
  suggestions: DataState<HomeSuggestion[]>;
  insights: DataState<HomeInsightChip[]>;
  /**
   * Unread notifications. A `DataState` and not a plain number because the bell
   * dot is a claim: an unsubstantiated red dot sends the owner looking for
   * something that may not be there. Unknown means no dot.
   */
  unreadNotifications: DataState<number>;
}

/* -------------------------------------------------------------------------- */
/* What Home hands to the layout                                              */
/* -------------------------------------------------------------------------- */

/**
 * Why a suggestion exists, which is also its rank order. `blocked` first
 * because something the owner already set up has stopped working, and no
 * proposal is worth more than telling them that.
 */
export type SuggestionKind = 'blocked' | 'content' | 'attention' | 'nudge';

export interface HomeSuggestion {
  id: string;
  kind: SuggestionKind;
  /** Uppercase strap line, e.g. "SOCIAL POST". */
  label: string;
  accent: AccentName;
  title: string;
  /** May be Hindi/Marathi/Hinglish when it quotes generated content — rule 12. */
  body: string;
  primaryLabel: string;
  href: string;
}

export interface HomeInsightChip {
  id: string;
  label: string;
  accent: AccentName;
  text: string;
}

/**
 * A metric tile, resolved.
 *
 * `value: null` and `note` always travel together: if we do not have the
 * number we say why in the same breath. `isLoading` is separate from an
 * unknown value so the screen can tell "still fetching" apart from "cannot
 * know", which are different promises to the owner.
 */
export interface HomeMetricTile {
  key: string;
  label: string;
  value: number | null;
  changePct: number | null;
  note: string | null;
  isLoading: boolean;
}

export interface HomeAlert {
  id: string;
  title: string;
  body: string;
  actionLabel: string;
  href: string;
}

export interface HomeModuleRow {
  id: ModuleId;
  title: string;
  subtitle: string;
  accent: AccentName;
  icon: ModuleId;
  href: string;
  /** Renders the subtitle in the accent colour, for items needing attention. */
  emphasis: boolean;
}

export interface HomeBusinessIdentity {
  name: string;
  locality: string;
  initials: string;
}

export interface HomeViewModel {
  business: HomeBusinessIdentity | null;
  /** True only when we KNOW there is at least one unread notification. */
  hasUnreadNotifications: boolean;
  headline: HomeSuggestion | null;
  /** How many further suggestions exist behind the headline. */
  moreSuggestions: number;
  insights: HomeInsightChip[];
  metricsPeriod: string;
  metrics: HomeMetricTile[];
  alert: HomeAlert | null;
  modules: HomeModuleRow[];
  /** True while any source is still loading. Drives indeterminate UI only. */
  isLoading: boolean;
  /** True when any contributing value came from a labelled fixture. */
  isFixture: boolean;
  /**
   * True when Shoogle knows nothing at all yet, so the screen shows its empty
   * state instead of a page of dashes.
   */
  isEmpty: boolean;
}
