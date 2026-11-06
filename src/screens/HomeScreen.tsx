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
import { auth } from '../lib/firebase';
import { PostActionsHost } from '../post/PostActionsHost';
import { useOnAirLives, type OnAirLive } from '../live/onair';
import { LiveFeedCard } from '../live/LiveFeedCard';
import { LiveViewer } from '../live/LiveViewer';
import { TableViewer } from '../table/TableScreen';
import { MicroViewer } from '../talk/MicroOuvertReal';
import { SlamViewer } from '../talk/SlamReal';
import { DemoLive } from '../live/DemoLive';
import { DEMO_LIVES } from '../live/demoLives';

/** Un live en cours présenté comme une carte du fil */
const liveItem = (l: OnAirLive): Post => ({
  id: `live-${l.room}`,
  kind: 'live',
  video: '',
  uid: l.uid,
  user: { handle: l.pseudo, name: l.name || l.pseudo, avatar: '' },
  caption: l.title,
  hashtags: [],
  sound: 'LIVE',
  likes: 0,
  comments: 0,
  saves: 0,
  shares: 0,
  viewers: l.viewers,
  liveTitle: l.title,
  onAir: l,
});

/** Glisse les lives dans le fil : un en 2e position, puis un toutes les 4 vidéos */
function withLives(posts: Post[], lives: Post[]) {
  if (!lives.length) return posts;
  const out: Post[] = [];
  let k = 0;
  posts.forEach((p, i) => {
    out.push(p);
    if (k < lives.length && (i === 0 || (i > 0 && i % 4 === 0))) out.push(lives[k++]);
  });
  while (k < lives.length) out.push(lives[k++]);
  return out;
}


// Page d'accueil : vidéos plein écran qui défilent verticalement
export function HomeScreen({ focused, jumpTop = 0 }: { focused: boolean; jumpTop?: number }) {
  const [tab, setTab] = useState<FeedTab>('foryou');
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);
  const [shareFor, setShareFor] = useState<Post | null>(null);
  const [live, setLive] = useState<Post | null>(null);

  const real = useFeedPosts();
  const { user, requireAuth } = useSession();
  // les vrais lives en cours des autres membres
  const onAir = useOnAirLives();
  // La liste des lives du fil ne change que tout en haut : plus bas, un live qui commence ou se
  // termine décalerait la vidéo qu'on regarde. Les chiffres (spectateurs, titre) restent à jour.
  // (suivis des lives d'exemple, retirés avant le lancement comme les vidéos d'exemple)
  const others = useMemo(() => [...onAir.filter((l) => l.uid !== user?.uid), ...DEMO_LIVES], [onAir, user?.uid]);
  const [shownRooms, setShownRooms] = useState<string[]>([]);
  const atTop = active === 0;
  useEffect(() => {
    if (!atTop) return;
    const next = others.map((l) => l.room);
    setShownRooms((cur) => (cur.join() === next.join() ? cur : next));
  }, [atTop, others]);
  const lastKnown = useRef(new Map<string, OnAirLive>());
  others.forEach((l) => lastKnown.current.set(l.room, l));
  const lives = useMemo(
    () => shownRooms.map((r) => lastKnown.current.get(r)).filter((l): l is OnAirLive => !!l).map(liveItem),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shownRooms, others],
  );
  const [watch, setWatch] = useState<OnAirLive | null>(null);
  const [tableOf, setTableOf] = useState<OnAirLive | null>(null);
  const [microOf, setMicroOf] = useState<OnAirLive | null>(null);
  const [slamOf, setSlamOf] = useState<OnAirLive | null>(null);
  const [demoOf, setDemoOf] = useState<OnAirLive | null>(null);
  // une Zembo Table s'ouvre autour de la table ; les autres lives dans l'écran spectateur
  const openRealLive = useCallback(
    (l: OnAirLive) =>
      l.demo
        ? setDemoOf(l)
        : requireAuth('Connecte-toi pour regarder le live.', () => {
        if (!auth.currentUser) return setWatch(l);
        if (l.format === 'table') setTableOf(l);
        else if (l.format === 'openmic') setMicroOf(l);
        else if (l.format === 'slam') setSlamOf(l);
        else setWatch(l);
      }),
    [requireAuth],
  );
  const followed = useFollowingFeed(user?.uid);
  const [profileOf, setProfileOf] = useState<ProfileTarget | null>(null);
  const [tagOf, setTagOf] = useState(false);
  const openProfile = useCallback((p: Post) => p.uid && setProfileOf({ uid: p.uid, pseudo: p.user.handle, name: p.user.name }), []);
  const listRef = useRef<FlatList<Post>>(null);
  // les vraies publications des membres passent en premier, puis les exemples (retirés avant le lancement)
  const data = useMemo(
    () =>
      tab === 'foryou'
        ? withLives([...real, ...FEED], lives)
        : tab === 'explore'
          ? withLives([...real, ...EXPLORE_FEED], lives)
          : [...followed, ...FOLLOWING_FEED],
    [tab, real, followed, lives],
  );

  // après une publication : onglet Pour toi, tout en haut
  useEffect(() => {
    if (!jumpTop) return;
    setTab('foryou');
    setActive(0);
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
  }, [jumpTop]);
  const playing = focused && !live && !watch && !tableOf && !microOf && !slamOf && !demoOf && !profileOf && !tagOf;

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
    <PostActionsHost onBusy={setTagOf}>
    <View style={styles.root} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 && (
        <FlatList
          ref={listRef}
          key={tab}
          data={data}
          keyExtractor={(p) => `${tab}-${p.id}`}
          renderItem={({ item, index }) =>
            item.onAir ? (
              <LiveFeedCard live={item.onAir} height={height} isActive={playing && index === active} onOpen={openRealLive} />
            ) : (
            <VideoPost
              post={item}
              height={height}
              isActive={playing && index === active}
              onComments={openComments}
              onShare={openShare}
              onOpenLive={openLive}
              onProfile={openProfile}
            />
            )
          }
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

      <TopTabs value={tab} onChange={changeTab} onLive={() => (others[0] ? openRealLive(others[0]) : setLive(firstLive))} />

      <CommentsSheet post={commentsFor} onClose={() => setCommentsFor(null)} />
      <ShareSheet post={shareFor} onClose={() => setShareFor(null)} />
      <LiveScreen post={live} onClose={() => setLive(null)} />
      <LiveViewer live={watch} onClose={() => setWatch(null)} />
      <TableViewer live={tableOf} onClose={() => setTableOf(null)} />
      <MicroViewer live={microOf} onClose={() => setMicroOf(null)} />
      <SlamViewer live={slamOf} onClose={() => setSlamOf(null)} />
      <DemoLive live={demoOf} onClose={() => setDemoOf(null)} />
      <UserProfile target={profileOf} onClose={() => setProfileOf(null)} />
    </View>
    </PostActionsHost>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
