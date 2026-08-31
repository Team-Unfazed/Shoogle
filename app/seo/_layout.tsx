import { Stack } from 'expo-router';

/**
 * Pranay's route namespace — SEO / Google Business Profile / Audit.
 *
 * CONTRIBUTING.md assigns each engineer a route folder so five people never
 * collide on a filename:
 *
 *   app/social/    Yash        app/website/   Devashish
 *   app/seo/       Pranay      app/account/   Aryan
 *
 * Everything reached from the Business tab that is not the tab root itself
 * lives here: the audit report, rankings, reviews, Google Business posts,
 * profile detail, hours, service areas, and the verification (Voice of
 * Merchant) states.
 *
 * These are pushed onto the ROOT stack rather than nested inside the tab
 * navigator, so a detail screen covers the tab bar and the Android back
 * gesture returns to Business. That matches how `app/notifications.tsx`
 * already behaves — no change to the app shell is required, which is
 * deliberate: `app/_layout.tsx` and `app/(tabs)/_layout.tsx` belong to the
 * foundation and must not be edited to add a feature route.
 */
export default function SeoLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Android-native forward/back transition, matching the root stack.
        animation: 'slide_from_right',
        animationDuration: 180,
      }}
    />
  );
}
