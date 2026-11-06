import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { colors } from '../theme';
import { EXPLORE_FEED, FEED, FOLLOWING_FEED, type Post } from '../data/feed';
import { VideoPost } from '../components/VideoPost';
import { TopTabs, type FeedTab } from '../components/TopTabs';
import { CommentsSheet } from '../components/CommentsSheet';
import { ShareSheet } from '../components/ShareSheet';
import { LiveScreen } from './LiveScreen';
import { useFeedPosts } from '../post/posts';
import { useFollowingFeed } from '../post/social';
import { UserProfile, type ProfileTarget } from '../post/UserProfile';
import { useSession } from '../lib/session';
import { OpenHashtagContext } from '../post/hashtags';
import { HashtagPage } from '../post/HashtagPage';


// Page d'accueil : vidéos plein écran qui défilent verticalement
export function HomeScreen({ focused, jumpTop = 0 }: { focused: boolean; jumpTop?: number }) {
  const [tab, setTab] = useState<FeedTab>('foryou');
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);
  const [shareFor, setShareFor] = useState<Post | null>(null);
  const [live, setLive] = useState<Post | null>(null);

  const real = useFeedPosts();
  const { user } = useSession();
  const followed = useFollowingFeed(user?.uid);
  const [profileOf, setProfileOf] = useState<ProfileTarget | null>(null);
  const [tagOf, setTagOf] = useState<string | null>(null);
  const openProfile = useCallback((p: Post) => p.uid && setProfileOf({ uid: p.uid, pseudo: p.user.handle, name: p.user.name }), []);
  const listRef = useRef<FlatList<Post>>(null);
  // les vraies publications des membres passent en premier, puis les exemples (retirés avant le lancement)
  const data = useMemo(
    () => (tab === 'foryou' ? [...real, ...FEED] : tab === 'explore' ? [...real, ...EXPLORE_FEED] : [...followed, ...FOLLOWING_FEED]),
    [tab, real, followed],
  );

  // après une publication : onglet Pour toi, tout en haut
  useEffect(() => {
    if (!jumpTop) return;
    setTab('foryou');
    setActive(0);
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
  }, [jumpTop]);
  const playing = focused && !live && !profileOf && !tagOf;

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
    <OpenHashtagContext.Provider value={setTagOf}>
    <View style={styles.root} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 && (
        <FlatList
          ref={listRef}
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
              onProfile={openProfile}
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
      <UserProfile target={profileOf} onClose={() => setProfileOf(null)} />
      <HashtagPage tag={tagOf} onClose={() => setTagOf(null)} />
    </View>
    </OpenHashtagContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
