import { Stack } from 'expo-router';

/**
 * Yash's route namespace — Social: composing, scheduling and publishing posts.
 *
 * CONTRIBUTING.md assigns each engineer a route folder so five people never
 * collide on a filename:
 *
 *   app/social/    Yash        app/website/   Devashish
 *   app/seo/       Pranay      app/account/   Aryan
 *
 * Everything reached from the Posts tab that is not the tab root itself lives
 * here. Screens are pushed onto the ROOT stack rather than nested inside the
 * tab navigator, so a compose screen covers the tab bar and the Android back
 * gesture returns to Posts — matching `app/seo/` and `app/notifications.tsx`.
 *
 * No change to the app shell is required, and that is deliberate:
 * `app/_layout.tsx` and `app/(tabs)/_layout.tsx` belong to the foundation and
 * must not be edited to add a feature route.
 */
export default function SocialLayout() {
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
