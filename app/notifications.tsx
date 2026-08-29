
import { Screen, TopBar } from '@/components/shared';
import { Card, EmptyState } from '@/components/ui';

/**
 * Notifications. Feature owner: Aryan.
 *
 * Foundation shell only. It shows an honest empty state rather than sample
 * notifications - a fabricated "Your post went live" would be a false claim
 * about a publish that never happened (product rules 6 and 9).
 */
export default function NotificationsScreen() {
  return (
    <Screen testID="screen-notifications" header={<TopBar title="Notifications" bordered />} edgeBottom>
      <Card style={{ marginTop: 16 }}>
        <EmptyState
          compact
          icon="notifications-outline"
          title="No notifications"
          body="Shoogle will tell you here when something actually happens."
        />
      </Card>
    </Screen>
  );
}
