import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View, GestureResponderEvent } from 'react-native';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme';
import type { Post } from '../data/feed';
import { ActionRail } from './ActionRail';
import { PostInfo } from './PostInfo';
import { useSession } from '../lib/session';
import { setFollow, setLike, setSaved, useFollows, useLiked, useSaved } from '../post/social';
import { FilterLayer, TextsLayer, useEditPlayback } from '../post/edit';
import { useWindowDimensions } from 'react-native';

type Props = {
  post: Post;
  height: number;
  isActive: boolean;
  onComments: (post: Post) => void;
  onShare: (post: Post) => void;
  onOpenLive: (post: Post) => void;
  /** ouvre le profil de l'auteur (publications réelles) */
  onProfile?: (post: Post) => void;
};

type Heart = { id: number; x: number; y: number; rot: number };

// Une vidéo plein écran du fil
export const VideoPost = memo(function VideoPost({ post, height, isActive, onComments, onShare, onOpenLive, onProfile }: Props) {
  const isPhoto = post.kind === 'photo';
  const player = useVideoPlayer(isPhoto ? null : post.video, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.1;
  });

  const [paused, setPaused] = useState(false);
  const { width } = useWindowDimensions();
  useEditPlayback(player, post.edit, isActive && !paused, post.soundRef);
  const { user, guest, requireAuth } = useSession();
  const me = user?.uid ?? null;
  const real = !!post.uid;
  const mine = real && post.uid === me;
  // publications réelles : état lu sur le serveur ; exemples : état local
  const serverLiked = useLiked(me, post);
  const serverSaved = useSaved(me, post);
  const serverFollows = useFollows(me, post.uid);
  const [demoLiked, setDemoLiked] = useState(false);
  const [demoSaved, setDemoSaved] = useState(false);
  const [demoFollows, setDemoFollows] = useState(false);
  const liked = real ? serverLiked : demoLiked;
  const saved = real ? serverSaved : demoSaved;
  const follows = real ? serverFollows : demoFollows;
  // le serveur met les chiffres à jour en 1 à 2 s : on affiche le changement tout de suite
  const [likeDelta, setLikeDelta] = useState(0);
  const [saveDelta, setSaveDelta] = useState(0);
  useEffect(() => setLikeDelta(0), [post.likes]);
  useEffect(() => setSaveDelta(0), [post.saves]);

  /** Vrai s'il faut un compte (et prévient la personne) */
  const needAccount = (what: string) => {
    if (!real || me) return false;
    if (guest) Alert.alert('Crée ton compte', `En mode test sans compte, tu ne peux pas ${what}.`);
    else requireAuth(`Connecte-toi pour ${what}.`);
    return true;
  };
  const [hearts, setHearts] = useState<Heart[]>([]);
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLive = post.kind === 'live';

  // Lecture uniquement quand la vidéo est à l'écran
  useEffect(() => {
    if (isActive && !paused) player.play();
    else player.pause();
  }, [isActive, paused, player]);

  // On repart du début quand on revient sur la vidéo
  useEffect(() => {
    if (!isActive) {
      setPaused(false);
      try {
        player.currentTime = 0;
      } catch {}
    }
  }, [isActive, player]);

  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
  }, []);

  const addHeart = useCallback((x: number, y: number) => {
    const id = Date.now() + Math.random();
    setHearts((h) => [...h, { id, x, y, rot: Math.random() * 40 - 20 }]);
  }, []);

  const like = (on: boolean) => {
    if (needAccount('aimer les publications')) return;
    if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!real) return setDemoLiked(on);
    if (on === liked) return;
    setLikeDelta((d) => d + (on ? 1 : -1));
    setLike(me!, post.id, on).catch(() => setLikeDelta(0));
  };
  const toggleLike = () => like(!liked);
  const toggleSave = () => {
    if (needAccount('enregistrer les publications')) return;
    if (!real) return setDemoSaved((v) => !v);
    setSaveDelta((d) => d + (saved ? -1 : 1));
    setSaved(me!, post.id, !saved).catch(() => setSaveDelta(0));
  };
  const follow = () => {
    if (needAccount('t’abonner')) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!real) return setDemoFollows(true);
    setFollow(me!, post.uid!, true).catch(() => {});
  };

  // 1 tap = pause / lecture, 2 taps = j'aime
  const onTap = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = 0;
      addHeart(locationX, locationY);
      if (!liked) like(true);
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      if (isLive) onOpenLive(post);
      else if (!isPhoto) setPaused((p) => !p);
    }, 280);
  };

  return (
    <View style={[styles.container, { height }]}>
      {isPhoto ? (
        <>
          {/* fond flou + photo entière */}
          <Image source={post.thumb ?? post.image} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={30} />
          <Image source={post.image} placeholder={post.thumb} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} />
        </>
      ) : post.duo ? (
        // Duo : la vidéo d'origine à gauche, la nouvelle à droite
        <View style={[StyleSheet.absoluteFill, styles.duoRow]}>
          <DuoSource duo={post.duo} own={player} active={isActive && !paused} />
          <View style={{ flex: 1 }}>
            <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
          </View>
        </View>
      ) : (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      )}

      <FilterLayer id={post.edit?.filter} />

      <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent']} style={styles.topShade} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.bottomShade} pointerEvents="none" />
      <TextsLayer texts={post.edit?.texts} width={width} height={height} />

      <Pressable style={StyleSheet.absoluteFill} onPress={onTap}>
        {paused && (
          <View style={styles.center} pointerEvents="none">
            <Ionicons name="play" size={84} color="rgba(255,255,255,0.7)" />
          </View>
        )}
      </Pressable>

      {hearts.map((h) => (
        <BigHeart key={h.id} {...h} onDone={() => setHearts((all) => all.filter((x) => x.id !== h.id))} />
      ))}

      <PostInfo post={post} active={isActive && !paused} onOpenLive={() => onOpenLive(post)} />
      <ActionRail
        post={post}
        liked={liked}
        saved={saved}
        likeCount={real ? post.likes + likeDelta : post.likes + (liked ? 1 : 0)}
        saveCount={real ? post.saves + saveDelta : post.saves + (saved ? 1 : 0)}
        canFollow={!follows && !mine}
        spinning={isActive && !paused}
        onLike={toggleLike}
        onSave={toggleSave}
        onFollow={follow}
        onComments={() => onComments(post)}
        onShare={() => onShare(post)}
        onAvatar={isLive ? () => onOpenLive(post) : real && onProfile ? () => onProfile(post) : undefined}
      />

      {!isLive && !isPhoto && <ProgressBar player={player} paused={paused} start={post.edit?.start} end={post.edit?.end} />}
    </View>
  );
});

// Duo : vidéo d'origine, muette (son son passe par le son repris), recalée quand la nouvelle vidéo boucle
function DuoSource({ duo, own, active }: { duo: NonNullable<Post['duo']>; own: VideoPlayer; active: boolean }) {
  const src = useVideoPlayer(duo.url, (p) => {
    p.muted = true;
    p.loop = true;
  });
  useEffect(() => {
    if (active) {
      try {
        src.currentTime = duo.start ?? 0;
      } catch {}
      src.play();
    } else src.pause();
  }, [active, src, duo.start]);
  useEffect(() => {
    let last = 0;
    const sub = own.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime + 0.5 < last) {
        try {
          src.currentTime = duo.start ?? 0;
        } catch {}
      }
      last = currentTime;
    });
    return () => sub.remove();
  }, [own, src, duo.start]);
  return (
    <View style={{ flex: 1 }}>
      <VideoView player={src} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <View style={styles.duoTag}>
        <Ionicons name="copy" size={11} color={colors.bg} />
        <Text style={styles.duoTagText} numberOfLines={1}>
          Duo · @{duo.pseudo}
        </Text>
      </View>
    </View>
  );
}

// Fine barre de progression dorée en bas de la vidéo
function ProgressBar({ player, paused, start = 0, end }: { player: VideoPlayer; paused: boolean; start?: number; end?: number }) {
  const ev = useEvent(player, 'timeUpdate');
  const t = ev?.currentTime ?? 0;
  const d = (end ?? player.duration ?? 0) - start;
  const pct = d > 0 ? Math.min(1, Math.max(0, (t - start) / d)) : 0;
  return (
    <View style={[styles.progressTrack, paused && styles.progressTrackPaused]} pointerEvents="none">
      <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

// Grand cœur doré qui apparaît au double tap
function BigHeart({ x, y, rot, onDone }: Heart & { onDone: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(
      onDone,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scale = a.interpolate({ inputRange: [0, 0.15, 0.3, 1], outputRange: [0.3, 1.25, 1, 1.5] });
  const opacity = a.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 0] });
  const translateY = a.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0, -110] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bigHeart,
        { left: x - 55, top: y - 55, opacity, transform: [{ translateY }, { scale }, { rotate: `${rot}deg` }] },
      ]}
    >
      <Ionicons name="heart" size={110} color={colors.gold} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  duoRow: { flexDirection: 'row', gap: 2 },
  duoTag: {
    position: 'absolute',
    left: 8,
    top: 110,
    maxWidth: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gold,
  },
  duoTagText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },
  bottomShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 300 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  bigHeart: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.18)' },
  progressTrackPaused: { height: 4 },
  progressFill: { height: '100%', backgroundColor: colors.gold },
});
