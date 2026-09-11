import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DataStateView, ErrorBoundary, FixtureBanner } from '@/components/shared';
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
import { isPostsViewEmpty, NO_POSTS_BODY, NO_POSTS_TITLE, usePostsView } from '@/features/social';
import { socialPostsFixture } from '@/fixtures/posts';
import { isFixtureModeEnabled } from '@/lib/env';
import { useTheme } from '@/theme';

/**
 * POSTS TAB. Feature owner: Yash.
 *
 * Laid out to match the `social` screen in "Shoogle Social.dc.html": next-up
 * card, three stat tiles, and Scheduled / Needs attention / Published sections,
 * with a floating Create post button.
 *
 * THIS SCREEN DERIVES NOTHING ITSELF. It renders a `PostsView`, which
 * `features/social/view.ts` builds from `SocialPost[]` — the same shape the
 * real store will return. Every label on screen (the next-up time, the "Wed ·
 * 9:00 AM" rows, the published result line) is computed from post data by
 * tested pure functions, so the honesty rules are enforced where they can be
 * asserted rather than inside JSX.
 *
 * PRODUCT RULE 4: posts are scheduled by default. The create flow, when it is
 * built, must make Schedule the primary action and "Post now" secondary — the
 * publisher already models it that way (`PublishRequest.scheduledFor`).
 *
 * PRODUCT RULE 5: skipping and pausing stay one tap from this list. The row
 * actions must never require opening a detail screen first.
 *
 * PRODUCT RULE 6/7: the "Last reach" tile shows a dash unless a provider has
 * reported reach for the most recent published post, and a published row shows
 * the time it went out rather than inventing numbers for it.
 *
 * Content is a labelled development fixture; nothing is published, and a
 * "Published" row only ever appears for a post a provider confirmed with a
 * remote id.
 */
type PostFilter = 'posts' | 'photos' | 'performance';

/**
 * Used only to format a published row's fallback timestamp when the post's own
 * schedule is gone. The real value is `Business.timezone`, which comes from the
 * BusinessProvider contract (Pranay's) once that is wired up; every scheduled
 * post already carries its own zone, so this affects nothing on the list today.
 */
const FALLBACK_TIME_ZONE = 'Asia/Kolkata';

export default function PostsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPreview } = useSession();
  const [filter, setFilter] = useState<PostFilter>('posts');

  const showsFixtures = isFixtureModeEnabled() || isPreview;

  // `null` is the honest "no source at all" — no connected account, no store.
  const posts = useMemo(() => (showsFixtures ? socialPostsFixture() : null), [showsFixtures]);
  const timeZone = posts?.find((post) => post.schedule !== null)?.schedule?.timeZone ?? FALLBACK_TIME_ZONE;
  const state = usePostsView(posts, timeZone);

  const showFixtureBanner = posts !== null && !isPreview;

  const notBuilt = (what: string) => () =>
    toast.show({ message: `${what} is not built yet.`, tone: 'neutral' });

  const nothingScheduled = (
    <Card style={{ marginTop: 4 }}>
      <EmptyState compact icon="calendar-outline" title={NO_POSTS_TITLE} body={NO_POSTS_BODY} />
    </Card>
  );

  return (
    <View
      testID="posts-screen"
      style={{ flex: 1, backgroundColor: theme.colors.bg, paddingTop: insets.top + 8 }}>
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
          ) : (
            <DataStateView
              state={state}
              skeletonLines={5}
              emptyWhen={isPostsViewEmpty}
              emptyOverride={nothingScheduled}>
              {(view) => (
                <>
                  {view.nextUp ? (
                    <NextUpCard
                      label={view.nextUp.label}
                      title={view.nextUp.title}
                      channel={view.nextUp.channel}
                      mediaLabel={view.nextUp.mediaLabel}
                      onPreview={notBuilt('Post preview')}
                      onEdit={notBuilt('The post editor')}
                    />
                  ) : null}

                  <View style={styles.stats}>
                    <StatTile value={view.counts.scheduled} label="Scheduled" />
                    <StatTile value={view.counts.drafts} label="Draft" accent="amber" />
                    {/* Null until a provider reports reach — never 0. */}
                    <StatTile value={view.counts.lastReach} label="Last reach" />
                  </View>

                  {view.scheduled.length > 0 ? <SectionLabel>Scheduled</SectionLabel> : null}
                  {view.scheduled.map((post) => (
                    <ScheduledRow
                      key={post.id}
                      title={post.title}
                      when={post.when}
                      where={post.where}
                      mediaLabel={post.mediaLabel}
                      onPress={notBuilt('Post detail')}
                    />
                  ))}

                  {view.needsAttention ? (
                    <>
                      <SectionLabel>Needs attention</SectionLabel>
                      <AttentionRow
                        title={view.needsAttention.title}
                        body={view.needsAttention.body}
                        actionLabel={view.needsAttention.actionLabel}
                        onPress={notBuilt('The post editor')}
                      />
                    </>
                  ) : null}

                  {view.published.length > 0 || view.failed ? (
                    <SectionLabel>Published</SectionLabel>
                  ) : null}
                  {view.published.map((post) => (
                    <PublishedRow
                      key={post.id}
                      title={post.title}
                      result={post.result}
                      mediaLabel={post.mediaLabel}
                    />
                  ))}
                  {view.failed ? (
                    <FailedRow
                      title={view.failed.title}
                      reason={view.failed.reason}
                      onRetry={notBuilt('Retrying a failed post')}
                    />
                  ) : null}
                </>
              )}
            </DataStateView>
          )}
        </ScrollView>

        {filter === 'posts' ? (
          <CreatePostButton
            onPress={() => router.push('/social/compose')}
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
