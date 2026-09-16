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

/**
 * A business Shoogle works for.
 *
 * UNKNOWN IS NOT A PLACEHOLDER
 * ----------------------------
 * `name`, `category`, `locality` and `city` are all nullable, and null means
 * exactly one thing: **nobody has told Shoogle yet.** Sign-up creates a bare row so the
 * owner is never held at a form (product rules 2 and 11), and these fields are
 * filled in later — hydrated from a connected provider where possible (rule 3),
 * or typed by the owner.
 *
 * There is deliberately no placeholder name and no `category: 'other'` default.
 * A stand-in value would be indistinguishable from a real answer, which breaks
 * two things at once: provider hydration could not tell what it may safely
 * overwrite, and `features/social/generation` would add an invented business
 * name to the facts a generator is allowed to assert — so the anti-fabrication
 * guard would approve a caption naming a business that has no such name. The
 * same reasoning as `Metric`/`Score` being `number | null`: unknown is not zero,
 * and it is not a placeholder either.
 *
 * `timezone` is the exception and is NOT nullable. It is infrastructure rather
 * than a claim about the business — scheduling needs a zone from the first
 * moment — so a new business starts in 'Asia/Kolkata' and the owner may change
 * it. Defaulting it asserts nothing false about them.
 */
export interface Business {
  id: string;
  /** Null until the owner names it or a provider supplies it. Never a placeholder. */
  name: string | null;
  /** Null until known. Never defaulted to 'other' — that is a real answer. */
  category: BusinessCategory | null;
  /**
   * Neighbourhood or area, e.g. "Nerul". Null until known.
   *
   * Paired with `city`, and the pair is never inferred one from the other:
   * placing a salon in the wrong neighbourhood is worse for local search than
   * naming no neighbourhood at all. `features/social/generation` reads the same
   * pair and formats it in one place (`placeLabel`), so nothing else should
   * join these two strings by hand.
   */
  locality: string | null;
  /**
   * City, e.g. "Navi Mumbai". Null until known.
   *
   * Stored alongside `locality` rather than derived from it: Google returns
   * both in a single `storefrontAddress` read, so hydrating one without the
   * other would be an arbitrary split of one fact.
   */
  city: string | null;
  /** IANA timezone; scheduling depends on it. Defaults to 'Asia/Kolkata'. */
  timezone: string;
}

/* -------------------------------------------------------------------------- */
/* Membership                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What someone may do in a business.
 *
 * ========================= WHY THERE ARE EXACTLY TWO ========================
 *
 * Not the conventional owner/admin/member triad — two tiers, because two is
 * what Shoogle's customer actually distinguishes. A two-chair salon has one
 * person who owns the business and the money, and one or more people who help
 * with posts. The stylist writing captions must not be able to disconnect the
 * Instagram account, change the subscription, or remove the owner.
 *
 *   `owner`   business identity, provider connections, membership, billing —
 *             plus everything a member can do.
 *   `member`  create, edit, schedule and skip posts; read posts, metrics and
 *             the audit. Nothing that destroys a credential or costs money.
 *
 * A third tier earns its place when an owner needs to delegate *membership
 * management* without granting billing, and no planned feature needs that yet.
 * Adding a role later is a cheap enum addition; removing one is not, so the
 * reversible choice is to start narrow. It also matters that every extra role
 * is another RLS policy branch, and RLS failures are silent.
 */
export const BUSINESS_ROLES = ['owner', 'member'] as const;

export type Role = (typeof BUSINESS_ROLES)[number];

/** Owner-facing role names. English UI, per product rule 12. */
export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  member: 'Member',
};

/**
 * Whether a value from outside the app is a role Shoogle recognises.
 *
 * Roles cross the network as plain strings. Widening `Role` without widening
 * this check would let an unrecognised role read as valid, and a role nobody
 * can interpret must never be treated as a permission.
 */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (BUSINESS_ROLES as readonly string[]).includes(value);
}

/**
 * One person's membership of one business.
 *
 * ============================ WHAT THIS IS NOT ==============================
 *
 * It is not an invitation. There is no pending state, no token and no invited
 * email here: a row means the person IS a member, today. Invitations are a
 * later feature with their own flow, and an invitations table keyed by email
 * would also let anyone who could read it discover which businesses an address
 * had been invited to.
 *
 * It is not soft-deleted either. A `status` column would create a second truth
 * about "is this person a member?", which every access-control rule would then
 * have to remember to check — and forgetting it in one place is a silent
 * authorisation hole rather than an error. Removal is removal.
 *
 * ========================= THE RULES THIS TYPE OBEYS ========================
 *
 * - `(businessId, userId)` is the identity. A person is in a business once.
 * - A business may have MANY owners. Succession, co-founders and spouse-run
 *   shops all need it, and single-owner makes a lost account unrecoverable.
 * - A user may belong to MANY businesses (a salon owner with two branches).
 * - A business must ALWAYS have at least one owner.
 *
 * ⚠️ THE LAST-OWNER RULE IS NOT ENFORCED HERE, AND MUST NOT BE COPIED HERE.
 * It belongs to the database, as a concurrency-safe trigger: two people leaving
 * at the same moment each see another owner remaining, and both commit. A
 * client-side check cannot see the other transaction, and a business with zero
 * owners is unreachable — every access rule routes through membership, so
 * nobody can repair it. A screen may disable a control, but the guarantee is
 * the trigger's.
 */
export interface BusinessMember {
  businessId: string;
  userId: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

/**
 * Whether two records describe the same membership.
 *
 * Compares the identity pair ONLY. Two records that disagree about `role` are
 * the same membership at different times — one is stale — not two memberships.
 */
export function sameMembership(a: BusinessMember, b: BusinessMember): boolean {
  return a.businessId === b.businessId && a.userId === b.userId;
}

/* -------------------------------------------------------------------------- */
/* Providers                                                                  */
/* -------------------------------------------------------------------------- */

/** Every external account Shoogle can link. */
export type ProviderId = 'google_business' | 'instagram' | 'facebook';

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
