import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBoundary, FixtureBanner } from '@/components/shared';
import { Button, Card, EmptyState, Tabs, Text, useToast } from '@/components/ui';
import { useSession } from '@/features/auth/SessionProvider';
import {
  AttentionRow,
  CreatePostButton,
  FailedRow,
  NextUpCard,
  PublishedRow,
  ScheduledRow,
  SectionLabel,
  StatTile,
} from '@/features/social/components/PostsParts';
import { postsFixture } from '@/fixtures/posts';
import { isFixtureModeEnabled } from '@/lib/env';
import { useTheme } from '@/theme';

/**
 * POSTS TAB. Feature owner: Yash.
 *
 * Laid out to match the `social` screen in "Shoogle Social.dc.html": next-up
 * card, three stat tiles, and Scheduled / Needs attention / Published sections,
 * with a floating Create post button.
 *
 * PRODUCT RULE 4: posts are scheduled by default. The create flow, when Yash
 * builds it, must make Schedule the primary action and "Post now" secondary.
 *
 * PRODUCT RULE 5: skipping and pausing stay one tap from this list. The row
 * actions must never require opening a detail screen first.
 *
 * Content is a labelled development fixture; nothing is published, and the
 * "Published" row only ever appears for a post a provider actually confirmed.
 */
type PostFilter = 'posts' | 'photos' | 'performance';

export default function PostsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { isPreview } = useSession();
  const [filter, setFilter] = useState<PostFilter>('posts');

  const data = isFixtureModeEnabled() || isPreview ? postsFixture : null;
  const showFixtureBanner = data !== null && !isPreview;

  const notBuilt = (what: string) => () =>
    toast.show({ message: `${what} is not built yet.`, tone: 'neutral' });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top + 8 }}>
      <ErrorBoundary label="Posts">
        <View style={styles.header}>
          <Text
            accessibilityRole="header"
            style={{
              flex: 1,
              fontFamily: theme.fontFamily.display,
              fontSize: 24,
              letterSpacing: -0.48,
              color: theme.colors.text,
            }}>
            Posts
          </Text>
          <Button
            label="Calendar"
            variant="secondary"
            size="small"
            fullWidth={false}
            onPress={notBuilt('The calendar')}
          />
        </View>

        <View style={{ paddingHorizontal: 18, paddingTop: 6 }}>
          <Tabs
            items={[
              { value: 'posts', label: 'Posts' },
              { value: 'photos', label: 'Photos' },
              { value: 'performance', label: 'Performance' },
            ]}
            value={filter}
            onChange={setFilter}
            accessibilityLabel="Posts views"
          />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}>
          {showFixtureBanner ? <FixtureBanner /> : null}

          {filter !== 'posts' ? (
            <Card style={{ marginTop: 4 }}>
              <EmptyState
                compact
                icon={filter === 'photos' ? 'images-outline' : 'bar-chart-outline'}
                title={filter === 'photos' ? 'Photos and videos' : 'Performance'}
                body="This view is part of the Social feature and is not built yet."
              />
            </Card>
          ) : data === null ? (
            <Card style={{ marginTop: 4 }}>
              <EmptyState
                compact
                icon="calendar-outline"
                title="Nothing scheduled"
                body="Connect an account and Shoogle will schedule posts for you. You can skip or pause any of them before they go out."
              />
            </Card>
          ) : (
            <>
              {data.nextUp ? (
                <NextUpCard
                  label={data.nextUp.label}
                  title={data.nextUp.title}
                  channel={data.nextUp.channel}
                  mediaLabel={data.nextUp.mediaLabel}
                  onPreview={notBuilt('Post preview')}
                  onEdit={notBuilt('The post editor')}
                />
              ) : null}

              <View style={styles.stats}>
                <StatTile value={data.counts.scheduled} label="Scheduled" />
                <StatTile value={data.counts.drafts} label="Draft" accent="amber" />
                {/* Reach is null when no provider has reported it — never 0. */}
                <StatTile value={data.counts.lastReach} label="Last reach" />
              </View>

              <SectionLabel>Scheduled</SectionLabel>
              {data.scheduled.map((post) => (
                <ScheduledRow
                  key={post.id}
                  title={post.title}
                  when={post.when}
                  where={post.where}
                  mediaLabel={post.mediaLabel}
                  onPress={notBuilt('Post detail')}
                />
              ))}

              {data.needsAttention ? (
                <>
                  <SectionLabel>Needs attention</SectionLabel>
                  <AttentionRow
                    title={data.needsAttention.title}
                    body={data.needsAttention.body}
                    actionLabel={data.needsAttention.actionLabel}
                    onPress={notBuilt('The post editor')}
                  />
                </>
              ) : null}

              {data.published.length > 0 || data.failed ? (
                <SectionLabel>Published</SectionLabel>
              ) : null}
              {data.published.map((post) => (
                <PublishedRow
                  key={post.id}
                  title={post.title}
                  result={post.result}
                  mediaLabel={post.mediaLabel}
                />
              ))}
              {data.failed ? (
                <FailedRow
                  title={data.failed.title}
                  reason={data.failed.reason}
                  onRetry={notBuilt('Retrying a failed post')}
                />
              ) : null}
            </>
          )}
        </ScrollView>

        {filter === 'posts' ? (
          <CreatePostButton
            onPress={notBuilt('The create-post flow')}
            bottom={theme.spacing.lg}
          />
        ) : null}
      </ErrorBoundary>
    </View>
  );
}

const styles = {
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  scroll: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 96, gap: 12 },
  stats: { flexDirection: 'row' as const, gap: 9 },
};
