import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { colors } from '../theme';
import { EXPLORE_FEED, FEED, FOLLOWING_FEED, type Post } from '../data/feed';
import { VideoPost } from '../components/VideoPost';
import { TopTabs, type FeedTab } from '../components/TopTabs';
import { CommentsSheet } from '../components/CommentsSheet';
import { ShareSheet } from '../components/ShareSheet';
import { LiveScreen } from './LiveScreen';

const FEEDS: Record<FeedTab, Post[]> = { foryou: FEED, following: FOLLOWING_FEED, explore: EXPLORE_FEED };

// Page d'accueil : vidéos plein écran qui défilent verticalement
export function HomeScreen({ focused }: { focused: boolean }) {
  const [tab, setTab] = useState<FeedTab>('foryou');
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);
  const [shareFor, setShareFor] = useState<Post | null>(null);
  const [live, setLive] = useState<Post | null>(null);

  const data = FEEDS[tab];
  const playing = focused && !live;

  const changeTab = (t: FeedTab) => {
    setTab(t);
    setActive(0);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!height) return;
    setActive(Math.round(e.nativeEvent.contentOffset.y / height));
  };

  const openComments = useCallback((p: Post) => setCommentsFor(p), []);
  const openShare = useCallback((p: Post) => setShareFor(p), []);
  const openLive = useCallback((p: Post) => setLive(p), []);
  const firstLive = useMemo(() => FEED.find((p) => p.kind === 'live') ?? null, []);

  return (
    <View style={styles.root} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 && (
        <FlatList
          key={tab}
          data={data}
          keyExtractor={(p) => `${tab}-${p.id}`}
          renderItem={({ item, index }) => (
            <VideoPost
              post={item}
              height={height}
              isActive={playing && index === active}
              onComments={openComments}
              onShare={openShare}
              onOpenLive={openLive}
            />
          )}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews
        />
      )}

      <TopTabs value={tab} onChange={changeTab} onLive={() => setLive(firstLive)} />

      <CommentsSheet post={commentsFor} onClose={() => setCommentsFor(null)} />
      <ShareSheet post={shareFor} onClose={() => setShareFor(null)} />
      <LiveScreen post={live} onClose={() => setLive(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
