import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, goldGradient, textShadow } from '../theme';
import { formatCount } from '../utils/format';
import type { Post } from '../data/feed';

// Bloc en bas à gauche : pseudo, légende, son
export function PostInfo({ post, active, onOpenLive }: { post: Post; active: boolean; onOpenLive?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isLive = post.kind === 'live';

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {isLive && (
        <View style={styles.liveRow}>
          <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.livePill}>
            <Text style={styles.livePillText}>LIVE</Text>
          </LinearGradient>
          <Text style={styles.viewers}>
            <Ionicons name="people" size={12} color={colors.white} /> {formatCount(post.viewers ?? 0)} spectateurs
          </Text>
        </View>
      )}

      <View style={styles.nameRow}>
        <Text style={styles.name}>{post.user.name}</Text>
        {post.user.verified && <Ionicons name="checkmark-circle" size={14} color={colors.gold} style={{ marginLeft: 4 }} />}
      </View>

      <Pressable onPress={() => setExpanded((e) => !e)}>
        <Text style={styles.caption} numberOfLines={expanded ? undefined : 2}>
          {isLive ? post.liveTitle : post.caption}{' '}
          {!isLive && post.hashtags.map((h) => <Text key={h} style={styles.tag}>#{h} </Text>)}
        </Text>
      </Pressable>

      {isLive ? (
        <Pressable onPress={onOpenLive}>
          <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.liveCta}>
            <Ionicons name="radio" size={16} color={colors.bg} />
            <Text style={styles.liveCtaText}>Appuie pour regarder le LIVE</Text>
          </LinearGradient>
        </Pressable>
      ) : (
        <View style={styles.soundRow}>
          <Ionicons name="musical-notes" size={14} color={colors.white} style={textShadow} />
          <Marquee text={post.sound} running={active} />
        </View>
      )}
    </View>
  );
}

// Texte du son qui défile
function Marquee({ text, running }: { text: string; running: boolean }) {
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  const content = `${text}     •     `;

  useEffect(() => {
    if (!w || !running) {
      x.stopAnimation();
      return;
    }
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: -w, duration: w * 28, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [w, running, x]);

  return (
    <View style={styles.marqueeBox}>
      <Animated.View style={[styles.marqueeRow, { transform: [{ translateX: x }] }]}>
        <Text style={styles.sound} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          {content}
        </Text>
        <Text style={styles.sound}>
          {content}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 84, bottom: 18 },
  liveRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  livePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginRight: 8 },
  livePillText: { color: colors.bg, fontWeight: '800', fontSize: 12, letterSpacing: 0.6 },
  viewers: { color: colors.white, fontSize: 13, fontWeight: '600', ...textShadow },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  name: { color: colors.white, fontSize: 16, fontWeight: '700', ...textShadow },
  caption: { color: colors.white, fontSize: 15, lineHeight: 20, ...textShadow },
  tag: { fontWeight: '700', color: colors.goldLight },
  soundRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  marqueeBox: { overflow: 'hidden', width: 190, marginLeft: 6 },
  marqueeRow: { flexDirection: 'row', width: 2000 },
  sound: { color: colors.white, fontSize: 14, ...textShadow },
  liveCta: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  liveCtaText: { color: colors.bg, fontWeight: '800', fontSize: 14 },
});
