import { Redirect, Tabs, useRouter, useSegments } from 'expo-router';
import { useCallback } from 'react';

import { FullScreenLoader } from '@/components/shared';
import { Navigation, PRIMARY_NAVIGATION } from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';

/**
 * The authenticated shell: four tabs, and nothing else.
 *
 *   Home - Posts - Business - Settings
 *
 * DO NOT ADD A FIFTH TAB. Every other surface (SEO, Google Business Profile,
 * Website, Audit, Carousel, Billing) is reached from inside one of these four.
 * If your feature has no obvious home, that is a product conversation - not a
 * reason to widen the bar.
 *
 * The bar itself is the `Navigation` primitive, supplied via `tabBar` so its
 * appearance and accessibility live in the design system and can be tested
 * without a navigator.
 */
export default function TabsLayout() {
  const { state, isAuthenticated } = useSession();
  const router = useRouter();
  const segments = useSegments();

  if (state.status === 'loading') {
    return <FullScreenLoader label="Loading your business" />;
  }

  // Guard: never render the authenticated shell without a confirmed session.
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // Last segment identifies the active route; `(tabs)` alone means the index.
  const last = segments[segments.length - 1];
  const activeKey = last && last !== '(tabs)' ? last : 'index';

  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: 'shift' }}
      tabBar={() => (
        <TabBar
          activeKey={activeKey}
          onSelect={(key) => router.navigate(key === 'index' ? '/(tabs)' : (`/(tabs)/${key}` as never))}
        />
      )}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="posts" options={{ title: 'Posts' }} />
      <Tabs.Screen name="business" options={{ title: 'Business' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

function TabBar({ activeKey, onSelect }: { activeKey: string; onSelect: (key: string) => void }) {
  // Badge counts are intentionally absent. A count must reflect something real;
  // until a feature supplies one, showing 0 would violate "unknown is not zero".
  const handleSelect = useCallback((key: string) => onSelect(key), [onSelect]);
  return (
    <Navigation
      items={PRIMARY_NAVIGATION}
      activeKey={activeKey}
      onSelect={handleSelect}
      testID="primary-navigation"
    />
  );
}
