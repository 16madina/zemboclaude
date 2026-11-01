import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, GestureResponderEvent } from 'react-native';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEvent } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../theme';
import type { Post } from '../data/feed';
import { ActionRail } from './ActionRail';
import { PostInfo } from './PostInfo';

type Props = {
  post: Post;
  height: number;
  isActive: boolean;
  onComments: (post: Post) => void;
  onShare: (post: Post) => void;
  onOpenLive: (post: Post) => void;
};

type Heart = { id: number; x: number; y: number; rot: number };

// Une vidéo plein écran du fil
export const VideoPost = memo(function VideoPost({ post, height, isActive, onComments, onShare, onOpenLive }: Props) {
  const player = useVideoPlayer(post.video, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.1;
  });

  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
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

  const toggleLike = useCallback(() => {
    setLiked((l) => {
      if (!l) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return !l;
    });
  }, []);

  // 1 tap = pause / lecture, 2 taps = j'aime
  const onTap = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = 0;
      addHeart(locationX, locationY);
      if (!liked) {
        setLiked(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      if (isLive) onOpenLive(post);
      else setPaused((p) => !p);
    }, 280);
  };

  return (
    <View style={[styles.container, { height }]}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />

      <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent']} style={styles.topShade} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.bottomShade} pointerEvents="none" />

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
        spinning={isActive && !paused}
        onLike={toggleLike}
        onSave={() => setSaved((s) => !s)}
        onComments={() => onComments(post)}
        onShare={() => onShare(post)}
        onAvatar={isLive ? () => onOpenLive(post) : undefined}
      />

      {!isLive && <ProgressBar player={player} paused={paused} />}
    </View>
  );
});

// Fine barre de progression dorée en bas de la vidéo
function ProgressBar({ player, paused }: { player: VideoPlayer; paused: boolean }) {
  const ev = useEvent(player, 'timeUpdate');
  const t = ev?.currentTime ?? 0;
  const d = player.duration || 0;
  const pct = d > 0 ? Math.min(1, t / d) : 0;
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
