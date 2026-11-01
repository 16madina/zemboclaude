import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, goldGradient } from '../theme';
import { photoUrl, type Seat } from './data';
import type { Projected } from './layout';

type Props = {
  seat: Seat;
  p: Projected;
  base: number; // taille de base de la bulle (plus petite sur les grandes tables)
  speaking: boolean;
  muted: boolean;
  onPress: () => void;
  onMic: () => void;
};

// Bulle vidéo d'une personne, posée sur sa tête en 3D (plus tard : sa caméra en direct)
export function SeatBubble({ seat, p, base, speaking, muted, onPress, onMic }: Props) {
  const size = Math.max(40, Math.min(78, base * p.scale));
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!speaking) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [speaking, pulse]);

  const label = seat.name ? (seat.you ? `${seat.name} (Toi)` : seat.name) : 'Place libre';

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { left: p.x - size / 2 - 24, top: p.y - size / 2, width: size + 48 }]}>
      <Pressable onPress={onPress} style={{ width: size, height: size }}>
        {speaking && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                width: size + 10,
                height: size + 10,
                borderRadius: (size + 10) / 2,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
              },
            ]}
          />
        )}
        {seat.name ? (
          <LinearGradient colors={goldGradient} style={[styles.border, { width: size, height: size, borderRadius: size / 2 }]}>
            <Image source={photoUrl(seat.name)} style={{ width: size - 5, height: size - 5, borderRadius: (size - 5) / 2 }} />
            {speaking && <TalkBars />}
          </LinearGradient>
        ) : (
          <View style={[styles.empty, { width: size, height: size, borderRadius: size / 2 }]}>
            <Ionicons name="add" size={size * 0.34} color={colors.gold} />
          </View>
        )}

        {seat.name && (
          <Pressable onPress={onMic} hitSlop={6} style={[styles.mic, !muted && speaking && styles.micOn]}>
            <Ionicons name={muted ? 'mic-off' : 'mic'} size={10} color={!muted && speaking ? colors.bg : colors.goldLight} />
          </Pressable>
        )}
      </Pressable>

      <View style={[styles.namePill, !seat.name && styles.namePillFree]}>
        {seat.host && <Ionicons name="star" size={9} color={colors.gold} style={{ marginRight: 3 }} />}
        <Text style={[styles.name, seat.you && { color: colors.goldLight }, !seat.name && styles.nameFree]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
}

// Petites barres dorées qui bougent quand la personne parle
function TalkBars() {
  const a = useRef(new Animated.Value(0.3)).current;
  const b = useRef(new Animated.Value(0.6)).current;
  const c = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loops = [a, b, c].map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 220 + i * 90, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.25, duration: 240 + i * 70, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [a, b, c]);
  return (
    <View style={styles.bars} pointerEvents="none">
      {[a, b, c].map((v, i) => (
        <Animated.View key={i} style={[styles.bar, { transform: [{ scaleY: v }] }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  ring: {
    position: 'absolute',
    left: -5,
    top: -5,
    borderWidth: 2.5,
    borderColor: colors.goldLight,
    shadowColor: colors.gold,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  border: { alignItems: 'center', justifyContent: 'center' },
  empty: {
    backgroundColor: 'rgba(8,6,3,0.9)',
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderColor: 'rgba(212,175,55,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mic: {
    position: 'absolute',
    right: -3,
    bottom: -1,
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#1a120a',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micOn: { backgroundColor: colors.gold, borderColor: colors.goldLight },
  namePill: {
    marginTop: -7,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8,6,3,0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(212,175,55,0.5)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    maxWidth: 104,
  },
  namePillFree: { borderStyle: 'dashed' },
  name: { color: colors.white, fontSize: 10.5, fontWeight: '700' },
  nameFree: { color: colors.gold, fontWeight: '600' },
  bars: { position: 'absolute', bottom: 5, flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: 11 },
  bar: { width: 3, height: 11, borderRadius: 2, backgroundColor: colors.goldLight },
});
