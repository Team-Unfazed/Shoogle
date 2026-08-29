/**
 * Shoogle provider contracts - DECLARATIONS ONLY.
 *
 * Nothing here performs I/O. Each interface is the seam a feature engineer
 * implements inside their own feature folder, so that:
 *   - the shell and design system can render every honest state today, and
 *   - five engineers can work in parallel without editing each other's code.
 *
 * Every method returns `Result<T>` (= `Promise<DataState<T>>`). That forces
 * callers through `loading | ready | unavailable | error` and makes it
 * impossible to accidentally show unknown data as zero.
 */

import type { DataState } from '@/lib/state/DataState';
import type { Business, Post, PostStatus, ProviderId } from '@/types/domain';
import type { ConnectionInfo, Metric, Paginated, Result } from './types';

/* -------------------------------------------------------------------------- */
/* Shared capability surface                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Implemented by every provider. The shell uses this - and only this - to
 * decide whether to show "Connect" or real content. It never assumes a
 * provider is available.
 */
export interface ConnectableProvider {
  readonly id: ProviderId;
  /** Owner-facing name, e.g. "Google Business Profile". */
  readonly displayName: string;
  /** Current link state. */
  getConnection(): Result<ConnectionInfo>;
  /**
   * Begin the OAuth flow. Returns the connection once the redirect resolves.
   * Implementations must use `expo-auth-session` with the `shoogle://` scheme.
   */
  connect(): Result<ConnectionInfo>;
  /** Revoke locally and, where the provider supports it, remotely. */
  disconnect(): Result<void>;
}

/* -------------------------------------------------------------------------- */
/* Google Business Profile - owner: Pranay                                    */
/* -------------------------------------------------------------------------- */

export interface GbpLocation {
  locationId: string;
  title: string;
  storefrontAddress: string | null;
  primaryCategory: string | null;
  /** Whether Google has verified the listing. Gates most write operations. */
  verificationState: 'verified' | 'unverified' | 'pending' | 'unknown';
}

export interface GbpReview {
  reviewId: string;
  authorDisplayName: string;
  starRating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  createTime: string;
  reply: { comment: string; updateTime: string } | null;
}

export interface GoogleBusinessProfileProvider extends ConnectableProvider {
  readonly id: 'google_business';
  listLocations(): Result<GbpLocation[]>;
  getLocation(locationId: string): Result<GbpLocation>;
  /** Profile performance metrics. Unknown metrics are omitted, never zeroed. */
  getPerformance(locationId: string, period: string): Result<Metric[]>;
  listReviews(locationId: string, cursor?: string): Result<Paginated<GbpReview>>;
  replyToReview(locationId: string, reviewId: string, comment: string): Result<GbpReview>;
  /** Publish a Google post. Requires a verified location. */
  createLocalPost(locationId: string, body: string, scheduledFor: string | null): Result<Post>;
  updateBusinessHours(locationId: string, hours: unknown): Result<void>;
}

/* -------------------------------------------------------------------------- */
/* Social - owner: Yash                                                       */
/* -------------------------------------------------------------------------- */

export interface SocialAccount {
  provider: ProviderId;
  accountId: string;
  handle: string;
  /** Followers, or null when the provider does not expose it for this account. */
  followerCount: number | null;
}

export interface InstagramProvider extends ConnectableProvider {
  readonly id: 'instagram';
  getAccount(): Result<SocialAccount>;
  getInsights(period: string): Result<Metric[]>;
}

export interface LinkedInProvider extends ConnectableProvider {
  readonly id: 'linkedin';
  getAccount(): Result<SocialAccount>;
  listOrganizations(): Result<{ id: string; name: string }[]>;
}

/** Draft handed to the publisher. Scheduling is the default (product rule 4). */
export interface PublishRequest {
  body: string;
  mediaUris: string[];
  targets: ProviderId[];
  /** ISO timestamp. `null` means publish now - always an explicit owner choice. */
  scheduledFor: string | null;
}

export interface SocialPublisher {
  /** Which targets this publisher can currently reach. */
  availableTargets(): Result<ProviderId[]>;
  schedule(request: PublishRequest): Result<Post>;
  /** Owner can always pause or skip - product rule 5. */
  cancelScheduled(postId: string): Result<void>;
  skipOccurrence(postId: string): Result<Post>;
  getStatus(postId: string): Result<{ postId: string; status: PostStatus }>;
}

/* -------------------------------------------------------------------------- */
/* SEO - owner: Pranay                                                        */
/* -------------------------------------------------------------------------- */

export interface KeywordRanking {
  keyword: string;
  /**
   * Position in local results, or null when not ranked / not measured.
   * Null must render as "Not ranked" or "Not measured" - never 0.
   */
  position: number | null;
  previousPosition: number | null;
  measuredAt: string;
}

export interface SeoProvider {
  getRankings(businessId: string): Result<KeywordRanking[]>;
  getKeyword(businessId: string, keyword: string): Result<KeywordRanking>;
}

/* -------------------------------------------------------------------------- */
/* Audit - owner: Pranay                                                      */
/* -------------------------------------------------------------------------- */

export interface AuditFinding {
  id: string;
  title: string;
  /** Why this matters, in plain English. */
  detail: string;
  severity: 'critical' | 'important' | 'minor';
  /** Route the owner can open to fix it. */
  fixHref: string | null;
}

export interface AuditReport {
  /** 0-100. Only produced when enough signals were collected. */
  score: number;
  /** Signals that could not be collected - surfaced honestly, not silently dropped. */
  uncheckedAreas: string[];
  findings: AuditFinding[];
  generatedAt: string;
}

export interface AuditProvider {
  /** Latest stored report, or `unavailable('no_data_yet', ...)` before the first run. */
  getLatestReport(businessId: string): Result<AuditReport>;
  runAudit(businessId: string): Result<AuditReport>;
}

/* -------------------------------------------------------------------------- */
/* Website - owner: Devashish                                                 */
/* -------------------------------------------------------------------------- */

export type WebsiteStatus =
  | 'not_started'
  | 'generating'
  | 'ready_for_review'
  | 'published'
  | 'failed';

export interface WebsiteState {
  status: WebsiteStatus;
  /** Live URL, only once genuinely published. */
  publishedUrl: string | null;
  previewUrl: string | null;
  lastGeneratedAt: string | null;
}

export interface WebsiteGenerator {
  getState(businessId: string): Result<WebsiteState>;
  /**
   * Kick off generation. Implementations must report real progress or none -
   * no fake progress bars (product rule 10).
   */
  generate(businessId: string): Result<WebsiteState>;
  publish(businessId: string): Result<WebsiteState>;
}

/* -------------------------------------------------------------------------- */
/* Billing - owner: Aryan                                                     */
/* -------------------------------------------------------------------------- */

export interface Plan {
  id: string;
  name: string;
  /** Paise, to avoid float rounding. */
  priceInPaise: number;
  interval: 'month' | 'year';
  features: string[];
}

export interface Subscription {
  planId: string;
  status: 'none' | 'trialing' | 'active' | 'past_due' | 'cancelled';
  currentPeriodEnd: string | null;
}

export interface BillingProvider {
  listPlans(): Result<Plan[]>;
  getSubscription(businessId: string): Result<Subscription>;
  /** Opens the provider's hosted checkout. No card data ever touches Shoogle. */
  startCheckout(planId: string): Result<{ checkoutUrl: string }>;
  cancel(businessId: string): Result<Subscription>;
}

/* -------------------------------------------------------------------------- */
/* Auth - owner: Sunny                                                        */
/* -------------------------------------------------------------------------- */

export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
}

export interface AuthProvider {
  getSession(): Result<SessionUser | null>;
  signInWithEmail(email: string, password: string): Result<SessionUser>;
  signUpWithEmail(email: string, password: string): Result<SessionUser>;
  sendPasswordReset(email: string): Result<void>;
  signOut(): Result<void>;
  onAuthStateChange(listener: (state: DataState<SessionUser | null>) => void): () => void;
}

/* -------------------------------------------------------------------------- */
/* Business profile - owner: Pranay                                           */
/* -------------------------------------------------------------------------- */

export interface BusinessProvider {
  getBusiness(businessId: string): Result<Business>;
  /**
   * Product rule 3: never ask the owner for what we can retrieve. Implementations
   * should hydrate from a connected provider first and only prompt for gaps.
   */
  updateBusiness(businessId: string, patch: Partial<Business>): Result<Business>;
}
