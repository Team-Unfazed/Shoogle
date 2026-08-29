import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/shared';
import { ToastProvider } from '@/components/ui';
import { SessionProvider } from '@/features/auth/SessionProvider';
import { ThemeProvider, useAppFonts } from '@/theme';
import { darkColors, lightColors } from '@/theme/tokens';

/**
 * Root layout - the app shell.
 *
 * Provider order matters and is deliberate:
 *
 *   GestureHandlerRootView  must be outermost for gestures/sheets to work
 *     SafeAreaProvider      insets must exist before anything measures them
 *       ThemeProvider       tokens must exist before any component renders
 *         ErrorBoundary     catches crashes from everything below
 *           SessionProvider needs the theme for its own error UI
 *             ToastProvider must be inside Session so a sign-out can toast
 *
 * Do not reorder without understanding why. Do not add feature providers here -
 * mount them inside your own feature's layout instead, so five engineers are
 * never editing this file at once.
 */

// Hold the native splash until fonts are resolved, so the first frame the owner
// sees is already in the Shoogle type scale rather than the system font.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts();
  const scheme = useColorScheme();

  useEffect(() => {
    // Proceed on font failure too: a missing webfont must not brick the app.
    // React Native falls back to the platform font, which is degraded but usable.
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    // Native splash is still up; rendering nothing avoids a flash of unstyled text.
    return null;
  }

  const background = scheme === 'dark' ? darkColors.bg : lightColors.bg;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: background }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ErrorBoundary label="Shoogle">
            <SessionProvider>
              <ToastProvider>
                <StatusBar style="auto" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: background },
                    // Android-native forward/back transition.
                    animation: 'slide_from_right',
                    animationDuration: 180,
                  }}>
                  <Stack.Screen name="index" options={{ animation: 'fade' }} />
                  <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                  <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                  <Stack.Screen
                    name="+not-found"
                    options={{ presentation: 'modal', animation: 'fade_from_bottom' }}
                  />
                </Stack>
              </ToastProvider>
            </SessionProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
