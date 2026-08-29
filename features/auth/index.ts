/**
 * features/auth - public surface. Owner: Sunny.
 *
 * Other features import from '@/features/auth' and nothing deeper.
 *
 * The foundation ships two seams here, both consumed by the app shell:
 *   - SessionProvider / useSession  - who is signed in
 *   - registerSignInHandler         - how sign-in actually happens
 *
 * Neither implements authentication. See README.md for the boundary rules.
 */
export { SessionProvider, useSession } from './SessionProvider';
export {
  registerSignInHandler,
  isSignInImplemented,
  getSignInHandler,
  clearSignInHandler,
} from './handlers';
export type { SignInHandler } from './handlers';
export type { SessionContextValue } from './SessionProvider';
