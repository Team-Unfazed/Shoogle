import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorState, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Catches render-time crashes so one broken feature cannot white-screen the
 * whole app.
 *
 * Placement: one boundary wraps the entire app (in `app/_layout.tsx`), and each
 * feature should wrap its own subtree so a crash in Social does not take down
 * Home. Feature engineers: wrap your screen's body, not the layout.
 *
 * In development the real error message and component stack are shown, because
 * hiding them wastes an engineer's time. In production the owner sees a plain
 * apology and a Try-again button - never a stack trace, never a raw message
 * that might contain an identifier or URL.
 */
interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Shown in the fallback, e.g. "Posts". Helps the owner say what broke. */
  label?: string;
  /** Called when the boundary catches. Wire real crash reporting here later. */
  onError?: (error: Error, componentStack: string) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    this.props.onError?.(error, info.componentStack ?? '');
    // No crash reporter is wired yet. When one is added it goes here - do not
    // add analytics or telemetry to this file without agreeing it with the team.
    if (__DEV__) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  reset = () => this.setState({ error: null, componentStack: null });

  override render() {
    if (this.state.error) {
      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          componentStack={this.state.componentStack}
          label={this.props.label}
          onReset={this.reset}
        />
      );
    }
    return this.props.children;
  }
}

function ErrorBoundaryFallback({
  error,
  componentStack,
  label,
  onReset,
}: {
  error: Error;
  componentStack: string | null;
  label?: string;
  onReset: () => void;
}) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bg }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ErrorState
          title={label ? `${label} could not load` : 'Something went wrong'}
          message="This part of the app stopped unexpectedly. Your data has not been changed."
          onRetry={onReset}
        />

        {__DEV__ ? (
          <View
            style={[
              styles.devBox,
              { backgroundColor: theme.colors.card2, borderRadius: theme.radii.lg },
            ]}>
            <Text variant="label" tone="red">
              Development detail
            </Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 6 }} selectable>
              {error.message}
            </Text>
            {componentStack ? (
              <Text variant="caption" tone="muted2" style={{ marginTop: 8 }} selectable>
                {componentStack.trim().split('\n').slice(0, 8).join('\n')}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Button
          label="Try again"
          onPress={onReset}
          style={{ marginTop: 20 }}
          accessibilityHint="Reloads this part of the app"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  devBox: { padding: 14, marginTop: 20 },
});
