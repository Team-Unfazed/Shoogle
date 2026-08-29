import { Link, Stack } from 'expo-router';

import { Screen } from '@/components/shared';
import { EmptyState, Text } from '@/components/ui';

/**
 * Unknown route. Reached mainly via a stale or malformed `shoogle://` deep link.
 * It says what happened plainly and offers one way back.
 */
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen testID="screen-not-found" edgeBottom>
        <EmptyState
          icon="help-circle-outline"
          title="Page not found"
          body="That link does not point anywhere in Shoogle."
        />
        <Link href="/" asChild>
          <Text variant="bodyStrong" tone="blue" align="center" accessibilityRole="link">
            Go to Home
          </Text>
        </Link>
      </Screen>
    </>
  );
}
