/**
 * features/seo/components — the screen parts for `app/seo/`. Owner: Pranay.
 *
 * Everything here is PRESENTATIONAL. Nothing in this folder fetches, and
 * nothing in it can reach `fixtures/` (ESLint blocks that outside `app/` and
 * tests), so the decision about where data came from — and the fixture banner
 * that must accompany it — stays with the screen.
 *
 * These are composed from `@/components/ui` and `@/components/shared`. They are
 * not a second design system: no colour, radius, font size or spacing is
 * written here that did not come from `@/theme`.
 */

export { AiDraftCard, type AiDraftCardProps } from './AiDraftCard';
export {
  AiFindingCard,
  AiVisibilityView,
  BlockedWorkCard,
  type AiVisibilityInspection,
  type AiVisibilityViewProps,
} from './AiVisibilityView';
export {
  DirectoryChecklistCard,
  type DirectoryChecklistCardProps,
} from './DirectoryChecklistCard';
export {
  EvidenceBadge,
  EvidenceLine,
  ObservedStamp,
  formatIsoDay,
  formatMonthStart,
  type EvidenceLineProps,
} from './evidence';
export { KeywordRow, type KeywordRowProps } from './KeywordRow';
export { SchemaCard, type SchemaCardProps } from './SchemaCard';
export {
  SearchKeywordsView,
  leadSentence,
  type SearchKeywordsViewProps,
} from './SearchKeywordsView';
