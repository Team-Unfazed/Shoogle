import type { DataState } from '@/lib/state/DataState';
import type { SessionUser } from '@/lib/providers/contracts';

/**
 * Sign-in seam. Owner: Sunny.
 *
 * WHY THIS EXISTS
 * ---------------
 * The sign-in screen must never present an enabled button that does nothing.
 * "Backend is configured" and "sign-in is implemented" are different facts, and
 * conflating them produces a button that looks live and silently fails - the
 * exact pretend behaviour the foundation must not ship.
 *
 * So the screen asks THIS module whether a real handler exists. Until the auth
 * feature registers one, the button stays disabled and says so.
 *
 * HOW TO USE IT (auth feature)
 * ----------------------------
 *     import { registerSignInHandler } from '@/features/auth/handlers';
 *
 *     registerSignInHandler({
 *       async signInWithEmail(email, password) {
 *         const supabase = getSupabase();
 *         ...
 *         return ready(user, new Date().toISOString());
 *       },
 *     });
 *
 * Call it once, from the auth feature's own entry point. The screen needs no
 * change: it enables itself as soon as a handler is present, and a successful
 * sign-in propagates through SessionProvider's auth-state subscription, which
 * redirects out of the (auth) group automatically.
 */

export interface SignInHandler {
  /**
   * Attempt an email/password sign-in.
   *
   * Return `ready(user, ...)` on success, or `failed(code, message, retryable)`
   * with an owner-facing message. Never throw for an expected outcome such as
   * wrong credentials, and never leak a provider payload or token into the
   * message.
   */
  signInWithEmail(email: string, password: string): Promise<DataState<SessionUser>>;
}

let handler: SignInHandler | null = null;

/** Register the real implementation. Called once by the auth feature. */
export function registerSignInHandler(next: SignInHandler): void {
  handler = next;
}

/** True only when a real implementation exists. Drives the button's enabled state. */
export function isSignInImplemented(): boolean {
  return handler !== null;
}

/** Returns the registered handler, or null when auth is not built yet. */
export function getSignInHandler(): SignInHandler | null {
  return handler;
}

/** Test hook. Not for production code paths. */
export function clearSignInHandler(): void {
  handler = null;
}
