/**
 * Shared domain vocabulary. Feature engineers extend their own types inside
 * their feature folder; only concepts used by MORE THAN ONE feature belong here.
 */

/** Business categories Shoogle targets. */
export type BusinessCategory =
  | 'salon'
  | 'gym'
  | 'clinic'
  | 'restaurant'
  | 'bakery'
  | 'boutique'
  | 'repair_shop'
  | 'other';

export interface Business {
  id: string;
  name: string;
  category: BusinessCategory;
  /** Free-text locality, e.g. "Nerul, Navi Mumbai". */
  locality: string | null;
  /** IANA timezone; scheduling depends on it. */
  timezone: string;
}

/** Every external account Shoogle can link. */
export type ProviderId = 'google_business' | 'instagram' | 'facebook' | 'linkedin';

/**
 * Link state for an external account. `not_connected` is the honest default —
 * the app must never imply an integration exists before the owner links it.
 */
export type ConnectionStatus =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'expired'
  | 'revoked'
  | 'error';

export interface ProviderConnection {
  provider: ProviderId;
  status: ConnectionStatus;
  /** Display handle, e.g. "@vahanready". Null until connected. */
  handle: string | null;
  /** ISO timestamp of the last successful sync, or null if never. */
  lastSyncedAt: string | null;
  /** Owner-facing error, present only when status is 'error' | 'expired'. */
  message?: string;
}

/** Lifecycle of a post. Matches the design system's status badges exactly. */
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'skipped';

export interface PostTarget {
  provider: ProviderId;
  status: PostStatus;
  /** Permalink, only once genuinely published. */
  url: string | null;
}

export interface Post {
  id: string;
  status: PostStatus;
  /** Caption body. May be Hindi/Marathi/Hinglish — product rule 12. */
  body: string;
  /** ISO timestamp. Posts are scheduled by default (product rule 4). */
  scheduledFor: string | null;
  targets: PostTarget[];
  /** True when this record came from a labelled development fixture. */
  isFixture?: boolean;
}

/** A single owner-facing action Shoogle proposes. Operator, not CRM. */
export interface SuggestedAction {
  id: string;
  title: string;
  /** One line of plain English on why it matters. */
  rationale: string;
  accent: 'blue' | 'green' | 'amber';
  /** Route to open when tapped. */
  href: string;
}
