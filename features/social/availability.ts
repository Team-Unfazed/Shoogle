/**
 * Per-platform availability. Owner: Yash.
 *
 * ================= PRODUCT RULE 13, ENFORCED BY SHAPE ======================
 *
 * ONE PLATFORM NEVER BLOCKS ANOTHER.
 *
 * An owner with an Instagram professional account and no Facebook Page must be
 * able to use Shoogle's Instagram features normally. A Facebook Page is
 * OPTIONAL at the product level: Meta requires one to publish *to Facebook*,
 * and that requirement belongs to the Facebook connection and nowhere else.
 * Google's pending API access must not hide Instagram. An expired Facebook
 * token must not stop a GBP post.
 *
 * WHY THIS IS A SIGNATURE AND NOT A COMMENT
 * -----------------------------------------
 * A rule that lives in prose gets broken by the first convenient `if` — which
 * is exactly how `publisher.ts` came to refuse a whole post because one of its
 * targets was unreachable. So the rule is enforced the way this codebase
 * enforces its other invariants: by making the violation unwriteable.
 *
 * `availabilityFor()` receives ONE platform's connection. Not a map, not a
 * registry, not a lookup function. There is no other platform in scope, so
 * "check whether Facebook is connected before offering Instagram" is not a
 * thing a reviewer has to catch — it is a thing that does not compile.
 *
 * `availabilityForAll()` is a pure fan-out over that function: no shared state,
 * no ordering, no short-circuit, no early return. Adding one would be visible.
 *
 * WHAT THIS FILE IS NOT
 * ---------------------
 * It answers "may Shoogle offer this platform, and if not, what does the owner
 * do about it?" It performs no I/O, holds no token and completes no OAuth flow.
 * The connections it reads are supplied by the caller.
 */

import { PLATFORM_LABEL, SOCIAL_PLATFORMS, type Platform } from './types';

/* -------------------------------------------------------------------------- */
/* One platform's connection                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Everything Shoogle knows about ONE platform's link, and nothing about any
 * other. This type is deliberately incapable of describing a second platform.
 */
export interface PlatformConnection {
  readonly platform: Platform;
  /**
   * Whether a live authorization exists for THIS platform.
   * `expired` is distinct from `missing`: one needs reconnecting, the other
   * needs connecting, and telling an owner to "connect Facebook" when they
   * already did is a small lie that costs real support time.
   */
  readonly authorization: 'valid' | 'expired' | 'missing';
  /**
   * Scopes the provider actually granted. Checked, never assumed — a provider
   * may return fewer scopes than were requested, and treating the request as
   * the answer is how an app discovers at publish time that it cannot publish.
   */
  readonly grantedScopes: readonly string[];
  /** Owner-facing account name, when the provider gave one. */
  readonly accountLabel: string | null;
  /**
   * FACEBOOK ONLY — the Pages this authorization can publish to.
   *
   * Three states, all different:
   *   `null`  the connect flow has not enumerated Pages yet, so the connection
   *           is incomplete. NOT the same as "no Pages".
   *   `[]`    a genuine known zero: this person administers no eligible Page.
   *   ids     publishable.
   *
   * Null on every other platform, and read nowhere else. This is the whole of
   * Meta's Page requirement, contained to the one platform it applies to.
   */
  readonly eligiblePageIds: readonly string[] | null;
  /**
   * Approval by the provider itself, where the provider gates API access
   * independently of the owner's own authorization. GBP sits at 0 QPM until
   * Google approves the access request; that is not the owner's fault and must
   * not read as "not connected".
   */
  readonly providerApproval: 'granted' | 'pending' | 'not_required';
}

/**
 * Scopes each platform must have granted before Shoogle may offer it.
 * Sourced, per `docs/research/`. Not a guess and not a wish-list — asking for
 * more than these enlarges App Review for no product reason.
 */
export const REQUIRED_SCOPES: Record<Platform, readonly string[]> = {
  // docs/research/meta-instagram.md §1
  instagram: ['instagram_business_basic', 'instagram_business_content_publish'],
  // docs/research/meta-facebook-pages.md §5 — pages_manage_posts depends on
  // the other two, so all three are genuinely required.
  facebook: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
  // docs/research/google-business-profile.md §2 — one scope covers everything.
  google_business: ['https://www.googleapis.com/auth/business.manage'],
};

/* -------------------------------------------------------------------------- */
/* The answer                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Why one platform cannot be published to.
 *
 * Every reason belongs to the platform it describes. `no_eligible_page` is a
 * FACEBOOK reason with a FACEBOOK action; it has no representation anywhere
 * Instagram or GBP can see it, which is what stops Meta's Page requirement
 * leaking into the rest of the product.
 */
export type UnavailableReason =
  | 'integration_not_built'
  | 'not_connected'
  | 'authorization_expired'
  | 'permission_missing'
  /** Facebook only. */
  | 'no_eligible_page'
  /** Google Business Profile only. */
  | 'awaiting_provider_approval';

/** What the owner can do about it. `null` when there is nothing they can do. */
export interface OwnerAction {
  kind: 'connect' | 'reconnect' | 'choose_page';
  label: string;
}

export type PlatformAvailability =
  | { readonly platform: Platform; readonly available: true; readonly accountLabel: string | null }
  | {
      readonly platform: Platform;
      readonly available: false;
      readonly reason: UnavailableReason;
      /** Owner-facing sentence. Names this platform and no other. */
      readonly message: string;
      readonly action: OwnerAction | null;
    };

export interface PlatformInputs {
  /** This platform's connection, or null when nothing is linked. */
  connection: PlatformConnection | null;
  /** Whether a publishing adapter exists for this platform. */
  hasAdapter: boolean;
}

/* -------------------------------------------------------------------------- */
/* The one function                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Whether ONE platform can be published to, judged only on its own connection.
 *
 * Note what is not a parameter: any other platform, any registry, any lookup.
 * That absence is the enforcement — see the file header.
 */
export function availabilityFor(platform: Platform, inputs: PlatformInputs): PlatformAvailability {
  const { connection, hasAdapter } = inputs;
  const name = PLATFORM_LABEL[platform];

  if (connection !== null && connection.platform !== platform) {
    // A programming error, not a state an owner can be in. Failing loudly beats
    // silently judging Instagram on Facebook's connection — which is precisely
    // the coupling this module exists to prevent.
    throw new Error(
      `availabilityFor(${platform}) was given a ${connection.platform} connection. A platform is judged only on its own.`,
    );
  }

  if (!hasAdapter) {
    return {
      platform,
      available: false,
      reason: 'integration_not_built',
      message: `Shoogle cannot publish to ${name} yet — that integration is not built.`,
      action: null,
    };
  }

  if (connection === null || connection.authorization === 'missing') {
    return {
      platform,
      available: false,
      reason: 'not_connected',
      message: `Connect ${name} to post to it.`,
      action: { kind: 'connect', label: `Connect ${name}` },
    };
  }

  if (connection.authorization === 'expired') {
    return {
      platform,
      available: false,
      reason: 'authorization_expired',
      message: `Shoogle's permission to post to ${name} has expired.`,
      action: { kind: 'reconnect', label: `Reconnect ${name}` },
    };
  }

  if (connection.providerApproval === 'pending') {
    return {
      platform,
      available: false,
      reason: 'awaiting_provider_approval',
      // Not the owner's fault and not fixable by them. No action offered,
      // because offering one they cannot complete is worse than offering none.
      message: `${name} has not yet approved Shoogle's API access. Nothing is wrong with your account.`,
      action: null,
    };
  }

  const missingScopes = REQUIRED_SCOPES[platform].filter(
    (scope) => !connection.grantedScopes.includes(scope),
  );
  if (missingScopes.length > 0) {
    return {
      platform,
      available: false,
      reason: 'permission_missing',
      message: `${name} did not grant Shoogle permission to post on your behalf.`,
      action: { kind: 'reconnect', label: `Reconnect ${name}` },
    };
  }

  /*
   * Meta's Facebook Page requirement, contained entirely to Facebook.
   *
   * `null` means the connect flow has not enumerated Pages, so the connection
   * is incomplete — not that there are none. `[]` is a genuine known zero.
   * Neither is visible to any other platform's branch.
   */
  if (platform === 'facebook') {
    const pages = connection.eligiblePageIds;
    if (pages === null) {
      return {
        platform,
        available: false,
        reason: 'not_connected',
        message: `Finish connecting ${name} by choosing which Page to post to.`,
        action: { kind: 'choose_page', label: 'Choose a Page' },
      };
    }
    if (pages.length === 0) {
      return {
        platform,
        available: false,
        reason: 'no_eligible_page',
        // Says what is true and stops. It does NOT tell the owner to go and
        // create a Page: product rule 13 forbids nagging toward one, and this
        // sentence must never appear anywhere but the Facebook row.
        message: `This account does not manage a Facebook Page that Shoogle can post to. Instagram and Google Business are unaffected.`,
        action: null,
      };
    }
  }

  return { platform, available: true, accountLabel: connection.accountLabel };
}

/**
 * Every platform's availability, each computed from its own inputs.
 *
 * A pure fan-out. There is deliberately no accumulator, no early return and no
 * cross-platform read — adding one would stand out, which is the point.
 */
export function availabilityForAll(
  inputs: Partial<Record<Platform, PlatformInputs>>,
): Record<Platform, PlatformAvailability> {
  const out = {} as Record<Platform, PlatformAvailability>;
  for (const platform of SOCIAL_PLATFORMS) {
    out[platform] = availabilityFor(
      platform,
      inputs[platform] ?? { connection: null, hasAdapter: false },
    );
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* The target picker                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What the composer's platform selector shows.
 *
 * EVERY platform is always listed. An unavailable one is shown with its own
 * reason and its own action, never hidden and never disabled-without-saying-why
 * — an owner who cannot see Facebook cannot understand why it is not posting,
 * and an owner who is shown nothing but "Connect Facebook" learns nothing about
 * Instagram.
 */
export function selectableTargets(
  availability: Record<Platform, PlatformAvailability>,
): PlatformAvailability[] {
  return SOCIAL_PLATFORMS.map((platform) => availability[platform]);
}

/** The platforms a post can actually be aimed at right now. May be empty. */
export function availablePlatforms(
  availability: Record<Platform, PlatformAvailability>,
): Platform[] {
  return SOCIAL_PLATFORMS.filter((platform) => availability[platform].available);
}
