import { useState } from 'react';

import { ErrorBoundary, Screen, TopBar } from '@/components/shared';
import { Card, EmptyState, PageHeader, Tabs } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * POSTS TAB - foundation placeholder. Feature owner: Yash.
 *
 * Shows the tab scaffolding for the three post views. No posts are rendered
 * because none exist: fabricating a schedule would be fake customer data.
 *
 * PRODUCT RULE 4: posts are SCHEDULED by default. When Yash builds the create
 * flow, "Schedule" is the primary action and "Post now" is the secondary one -
 * not the other way round.
 *
 * PRODUCT RULE 5: every scheduled post must expose Skip and Pause without
 * entering a detail screen.
 */
type PostFilter = 'scheduled' | 'published' | 'drafts';

export default function PostsScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState<PostFilter>('scheduled');

  // Counts are omitted rather than passed as 0 - we do not know them yet.
  const tabs = [
    { value: 'scheduled' as const, label: 'Scheduled' },
    { value: 'published' as const, label: 'Published' },
    { value: 'drafts' as const, label: 'Drafts' },
  ];

  const empty: Record<PostFilter, { title: string; body: string }> = {
    scheduled: {
      title: 'Nothing scheduled',
      body: 'Scheduled posts will appear here. You can skip or pause any of them before they go out.',
    },
    published: {
      title: 'Nothing published yet',
      body: 'Posts show up here only after a provider confirms they went live.',
    },
    drafts: {
      title: 'No drafts',
      body: 'Drafts you have not scheduled yet will be kept here.',
    },
  };

  return (
    <Screen
      testID="screen-posts"
      header={<TopBar showBack={false} />}>
      <ErrorBoundary label="Posts">
        <PageHeader title="Posts" subtitle="Scheduled by default." />

        <Tabs
          items={tabs}
          value={filter}
          onChange={setFilter}
          accessibilityLabel="Filter posts"
          style={{ marginTop: theme.spacing.lg }}
        />

        <Card style={{ marginTop: theme.spacing.lg }}>
          <EmptyState
            compact
            icon="calendar-outline"
            title={empty[filter].title}
            body={empty[filter].body}
          />
        </Card>
      </ErrorBoundary>
    </Screen>
  );
}
