import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { tap, useWorld } from './store';

// Petits éléments visuels communs à Zembo Meet

export function WorldTitle({ size = 26, tagline = true }: { size?: number; tagline?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[styles.title, { fontSize: size, letterSpacing: size * 0.16 }]}>
        ZEMB<Text style={{ fontSize: size * 0.82 }}>🌍</Text> <Text style={{ color: colors.gold }}>MEET</Text>
      </Text>
      {tagline && (
        <Text style={styles.tagline}>
          Le monde est à un <Text style={{ color: colors.gold }}>Hello.</Text>
        </Text>
      )}
    </View>
  );
}

export function GoldButton({
  label,
  onPress,
  disabled,
  style,
  big,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
}) {
  if (disabled) {
    return (
      <View style={[styles.btn, styles.btnOff, big && styles.btnBig, style]}>
        <Text style={styles.btnOffText}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }] }, style]}
    >
      <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.btn, big && styles.btnBig, styles.glow]}>
        <Text style={styles.btnText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function OutlineButton({ label, onPress, style }: { label: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.btn, styles.outline, { opacity: pressed ? 0.7 : 1 }, style]}
    >
      <Text style={styles.outlineText}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void }) {
  const body = (
    <View style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
    >
      {body}
    </Pressable>
  );
}

/** Message éphémère en haut de Zembo Meet */
export function WorldToast() {
  const { toast } = useWorld();
  const insets = useSafeAreaInsets();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: toast ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [toast, a]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        { top: insets.top + 8, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] },
      ]}
    >
      <Text style={styles.toastText}>{toast}</Text>
    </Animated.View>
  );
}

const CONFETTI = ['#F7E08A', '#D4AF37', '#FFF1C2', '#E8577E', '#C98A2B'];

/** Pluie de confettis dorés (animation native) */
export function Confetti({ count = 36 }: { count?: number }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        delay: Math.random() * 1600,
        duration: 2600 + Math.random() * 2200,
        size: 5 + Math.random() * 7,
        rot: Math.random() * 360,
        color: CONFETTI[i % CONFETTI.length],
        round: i % 5 === 0,
        v: new Animated.Value(0),
      })),
    [count, width],
  );
  useEffect(() => {
    const loops = pieces.map((p) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(p.delay),
          Animated.timing(p.v, { toValue: 1, duration: p.duration, easing: Easing.linear, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [pieces]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: -20,
            width: p.size,
            height: p.round ? p.size : p.size * 1.8,
            borderRadius: p.round ? p.size : 2,
            backgroundColor: p.color,
            opacity: p.v.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateY: p.v.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
              { rotate: p.v.interpolate({ inputRange: [0, 1], outputRange: [`${p.rot}deg`, `${p.rot + 420}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

export type WorldTab = 'discover' | 'hellos' | 'messages' | 'profile';
const TABS: { key: WorldTab; emoji: string; label: string }[] = [
  { key: 'discover', emoji: '🌍', label: 'Découvrir' },
  { key: 'hellos', emoji: '👋', label: 'Hellos' },
  { key: 'messages', emoji: '💬', label: 'Messages' },
  { key: 'profile', emoji: '👤', label: 'Mon profil' },
];

/** Barre du bas propre à Zembo Meet (remplace celle de Zembo) */
export function WorldDock({ value, onChange, badges }: { value: WorldTab; onChange: (t: WorldTab) => void; badges: Partial<Record<WorldTab, number>> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom - 8, 8) }]}>
      {TABS.map((t) => {
        const on = value === t.key;
        const n = badges[t.key];
        return (
          <Pressable
            key={t.key}
            style={styles.dockItem}
            onPress={() => {
              if (!on) {
                tap();
                onChange(t.key);
              }
            }}
          >
            <View>
              <Text style={[styles.dockEmoji, { opacity: on ? 1 : 0.55 }]}>{t.emoji}</Text>
              {!!n && (
                <View style={styles.dockBadge}>
                  <Text style={styles.dockBadgeText}>{n}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.dockLabel, on && styles.dockLabelOn]}>{t.label}</Text>
            {on && <View style={styles.dockLine} />}
          </Pressable>
        );
      })}
    </View>
  );
}

export const worldBg = '#0B0805';

const styles = StyleSheet.create({
  title: { color: colors.goldLight, fontWeight: '900', textShadowColor: 'rgba(212,175,55,0.45)', textShadowRadius: 12 },
  tagline: { color: 'rgba(247,241,225,0.9)', fontSize: 13.5, fontWeight: '600', marginTop: 4 },
  btn: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  btnBig: { height: 56, borderRadius: 28 },
  glow: { shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  btnText: { color: '#1D1405', fontSize: 15.5, fontWeight: '900' },
  btnOff: { borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)', backgroundColor: 'rgba(255,255,255,0.04)' },
  btnOffText: { color: colors.textFaint, fontSize: 15.5, fontWeight: '800' },
  outline: { borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)' },
  outlineText: { color: colors.gold, fontSize: 14.5, fontWeight: '700' },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(247,241,225,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chipOn: { borderColor: 'rgba(212,175,55,0.75)', backgroundColor: 'rgba(212,175,55,0.15)' },
  chipText: { color: 'rgba(247,241,225,0.8)', fontSize: 12.5, fontWeight: '600' },
  chipTextOn: { color: colors.gold, fontWeight: '800' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(24,18,10,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
  },
  toastText: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  dock: {
    flexDirection: 'row',
    paddingTop: 8,
    backgroundColor: 'rgba(11,8,5,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(212,175,55,0.3)',
  },
  dockItem: { flex: 1, alignItems: 'center', paddingBottom: 6 },
  dockEmoji: { fontSize: 22 },
  dockBadge: {
    position: 'absolute',
    top: -3,
    right: -12,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: worldBg,
  },
  dockBadgeText: { color: '#1D1405', fontSize: 9.5, fontWeight: '900' },
  dockLabel: { color: 'rgba(247,241,225,0.45)', fontSize: 10.5, fontWeight: '600', marginTop: 3 },
  dockLabelOn: { color: colors.gold, fontWeight: '800' },
  dockLine: { position: 'absolute', bottom: 0, width: 22, height: 2.5, borderRadius: 2, backgroundColor: colors.gold },
});

/** Photo plein écran : un portrait local remplit l'écran ; une photo carrée s'affiche en haut sur un fond flouté d'elle-même */
export function PersonBackdrop({ photo }: { photo: number | string }) {
  const { width } = useWindowDimensions();
  if (typeof photo !== 'string') return <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,6,3,0.35)' }]} />
      <Image source={photo} style={{ width, height: width * 1.18 }} contentFit="cover" contentPosition="top" transition={250} />
      <LinearGradient colors={['transparent', 'rgba(8,6,3,0.0)', 'rgba(8,6,3,0.9)']} locations={[0, 0.6, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: width * 1.18 }} />
    </View>
  );
}
