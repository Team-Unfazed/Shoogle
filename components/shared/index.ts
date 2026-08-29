/**
 * Shell components shared by every feature.
 *
 * These implement the app frame - safe areas, keyboard, error/loading
 * boundaries, honest data rendering. Feature engineers consume them; they
 * should rarely need to change them. If you think you do, raise it with the
 * team rather than editing in place: five features depend on this behaviour.
 */
export { DataStateView } from './DataStateView';
export { ErrorBoundary } from './ErrorBoundary';
export { FixtureBanner } from './FixtureBanner';
export { FullScreenLoader, LoadingBoundary } from './LoadingBoundary';
export { Screen } from './Screen';
export { TopBar } from './TopBar';

export type { DataStateViewProps } from './DataStateView';
export type { LoadingBoundaryProps } from './LoadingBoundary';
export type { ScreenProps } from './Screen';
export type { TopBarAction, TopBarProps } from './TopBar';
