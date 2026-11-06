import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, goldGradient, textShadow } from '../theme';
import { formatCount } from '../utils/format';
import type { Post } from '../data/feed';
import { usePostActions } from '../post/sounds';

type Props = {
  post: Post;
  liked: boolean;
  saved: boolean;
  likeCount: number;
  saveCount: number;
  /** le « + » sous la photo : absent si déjà abonné(e) ou si c'est ma publication */
  canFollow: boolean;
  spinning: boolean;
  onLike: () => void;
  onSave: () => void;
  onFollow: () => void;
  onComments: () => void;
  onShare: () => void;
  onAvatar?: () => void;
};

// Colonne de boutons à droite de la vidéo
export function ActionRail({
  post,
  liked,
  saved,
  likeCount,
  saveCount,
  canFollow,
  spinning,
  onLike,
  onSave,
  onFollow,
  onComments,
  onShare,
  onAvatar,
}: Props) {
  const isLive = post.kind === 'live';
  const { openSound } = usePostActions();

  return (
    <View style={styles.rail} pointerEvents="box-none">
      {/* Photo de profil + bouton S'abonner */}
      <Pressable onPress={onAvatar} style={styles.avatarWrap}>
        {isLive ? (
          <LinearGradient colors={goldGradient} style={styles.liveRing}>
            <Image source={post.user.avatar} style={styles.avatarLive} />
          </LinearGradient>
        ) : (
          <Image source={post.user.avatar} style={styles.avatar} />
        )}
        {isLive ? (
          <LinearGradient colors={goldGradient} style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </LinearGradient>
        ) : (
          canFollow && (
            <Pressable onPress={onFollow} hitSlop={8} style={styles.followBtn}>
              <Ionicons name="add" size={16} color={colors.bg} />
            </Pressable>
          )
        )}
      </Pressable>

      <RailButton
        icon="heart"
        color={liked ? colors.gold : colors.white}
        label={formatCount(Math.max(0, likeCount))}
        onPress={onLike}
        bounce={liked}
      />
      {!isLive && (
        <RailButton icon="chatbubble-ellipses" label={formatCount(post.comments)} onPress={onComments} />
      )}
      {!isLive && (
        <RailButton
          icon="bookmark"
          color={saved ? colors.gold : colors.white}
          label={formatCount(Math.max(0, saveCount))}
          onPress={onSave}
          bounce={saved}
          size={32}
        />
      )}
      <RailButton icon="arrow-redo" label={formatCount(post.shares)} onPress={onShare} />

      {!isLive && (
        <Pressable onPress={() => openSound(post)} hitSlop={6}>
          <SoundDisc avatar={post.user.avatar} spinning={spinning} />
        </Pressable>
      )}
    </View>
  );
}

function RailButton({
  icon,
  label,
  onPress,
  color = colors.white,
  bounce,
  size = 36,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  bounce?: boolean;
  size?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (bounce) {
      scale.setValue(0.6);
      Animated.spring(scale, { toValue: 1, friction: 3, tension: 160, useNativeDriver: true }).start();
    }
  }, [bounce, scale]);

  return (
    <Pressable onPress={onPress} style={styles.btn} hitSlop={6}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={icon} size={size} color={color} style={styles.iconShadow} />
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

// Disque qui tourne avec la photo du son
function SoundDisc({ avatar, spinning }: { avatar: string | number; spinning: boolean }) {
  const rot = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (spinning) {
      rot.setValue(0);
      anim.current = Animated.loop(
        Animated.timing(rot, { toValue: 1, duration: 5000, easing: Easing.linear, useNativeDriver: true }),
      );
      anim.current.start();
    } else {
      anim.current?.stop();
    }
    return () => anim.current?.stop();
  }, [spinning, rot]);

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={[styles.disc, { transform: [{ rotate }] }]}>
      <LinearGradient colors={['#3A2E18', '#0A0806', '#3A2E18']} style={styles.discInner}>
        <Image source={avatar} style={styles.discImg} />
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    right: 8,
    bottom: 18,
    alignItems: 'center',
    width: 64,
  },
  avatarWrap: { alignItems: 'center', marginBottom: 22 },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: colors.white,
    backgroundColor: colors.surface2,
  },
  liveRing: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarLive: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: colors.bg },
  followBtn: {
    position: 'absolute',
    bottom: -10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: { position: 'absolute', bottom: -8, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4 },
  liveBadgeText: { color: colors.bg, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  btn: { alignItems: 'center', marginBottom: 16 },
  iconShadow: { ...textShadow },
  label: { color: colors.white, fontSize: 13, fontWeight: '600', marginTop: 2, ...textShadow },
  disc: { marginTop: 6, width: 48, height: 48 },
  discInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.5)',
  },
  discImg: { width: 26, height: 26, borderRadius: 13 },
});
