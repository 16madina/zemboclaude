import { memo, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, goldGradient, textShadow } from '../theme';
import { formatCount } from '../utils/format';
import { auth } from '../lib/firebase';
import { CameraFeed, mediaAvailable, useLiveMedia } from './media';
import { Initial } from './LiveViewer';
import { FORMAT_LABEL, type OnAirLive } from './onair';

// Un live en cours dans le fil de l'accueil. Quand la carte est à l'écran, on voit déjà
// la caméra de l'hôte (sans le son) ; on touche pour entrer dans le live.

const ICON: Record<OnAirLive['format'], keyof typeof Ionicons.glyphMap> = {
  table: 'people',
  slam: 'mic',
  openmic: 'musical-notes',
  lettres: 'text',
  motdor: 'chatbubble-ellipses',
};

export const LiveFeedCard = memo(function LiveFeedCard({
  live,
  height,
  isActive,
  onOpen,
}: {
  live: OnAirLive;
  height: number;
  isActive: boolean;
  onOpen: (l: OnAirLive) => void;
}) {
  // aperçu de la caméra seulement quand la carte est à l'écran (et pour les membres connectés)
  const preview = isActive && mediaAvailable && !!auth.currentUser;
  const media = useLiveMedia(preview ? live.room : null, { publish: false, mic: false, audio: false });
  const cams = media.cameras();
  const main = cams.find((c) => c.id === live.uid) ?? cams[0] ?? null;

  // le rond autour de l'hôte « respire », comme un live qui bat
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isActive) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isActive, pulse]);
  const ring = { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.2] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }] };
  const who = live.pseudo || live.name;

  return (
    <Pressable style={[styles.container, { height }]} onPress={() => onOpen(live)}>
      {main ? (
        <CameraFeed trackRef={main.track} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <LinearGradient colors={['#3A2B10', '#120D06', '#0A0806']} style={StyleSheet.absoluteFill} />
          <View style={styles.avatarWrap}>
            <Animated.View style={[styles.ring, ring]} />
            <Initial name={who} size={104} />
          </View>
          <Text style={styles.centerName}>{who}</Text>
          <Text style={styles.centerSub}>est en direct</Text>
        </View>
      )}
      <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent']} style={styles.topShade} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.bottomShade} pointerEvents="none" />

      <View style={styles.info} pointerEvents="none">
        <View style={styles.row}>
          <LinearGradient colors={goldGradient} style={styles.liveTag}>
            <Text style={styles.liveTagText}>LIVE</Text>
          </LinearGradient>
          <View style={styles.format}>
            <Ionicons name={ICON[live.format]} size={12} color={colors.goldLight} />
            <Text style={styles.formatText}>{FORMAT_LABEL[live.format]}</Text>
          </View>
          <View style={styles.format}>
            <Ionicons name="eye" size={12} color={colors.goldLight} />
            <Text style={styles.formatText}>{formatCount(live.viewers)}</Text>
          </View>
        </View>
        <Text style={styles.host}>@{live.pseudo}</Text>
        {!!live.title && live.title !== FORMAT_LABEL[live.format] && (
          <Text style={styles.title} numberOfLines={2}>
            {live.title}
          </Text>
        )}
        <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
          <Ionicons name="radio" size={16} color={colors.bg} />
          <Text style={styles.ctaText}>Regarder le live</Text>
        </LinearGradient>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  avatarWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 124, height: 124, borderRadius: 62, borderWidth: 3, borderColor: colors.gold },
  centerName: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 6 },
  centerSub: { color: colors.goldLight, fontSize: 14, fontWeight: '700', marginTop: 2 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  bottomShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 320 },
  info: { position: 'absolute', left: 12, right: 24, bottom: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveTag: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  liveTagText: { color: colors.bg, fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
  format: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  formatText: { color: colors.goldLight, fontSize: 12, fontWeight: '700' },
  host: { color: colors.white, fontSize: 16, fontWeight: '800', marginTop: 10, ...textShadow },
  title: { color: colors.white, fontSize: 14, marginTop: 4, lineHeight: 19, ...textShadow },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 22, marginTop: 14, alignSelf: 'flex-start', paddingHorizontal: 22 },
  ctaText: { color: colors.bg, fontWeight: '900', fontSize: 15 },
});
