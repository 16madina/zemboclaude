import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { auth } from '../lib/firebase';
import { TableRoom } from '../table/TableScreen';
import { MicroReal } from '../talk/MicroOuvertReal';
import { SlamReal } from '../talk/SlamReal';
import { MotDor } from '../games/MotDor';
import { LettresDor } from '../games/LettresDor';
import { DemoPreview, DemoScene } from './DemoLive';
import { Initial, Viewer } from './LiveViewer';
import type { OnAirLive } from './onair';

// L'univers des lives, comme sur TikTok : une fois dans un live,
// - on glisse vers le haut pour passer au live suivant (vers le bas pour revenir au précédent) ;
// - on glisse de gauche à droite pour ressortir dans le fil.
// Seul le live à l'écran est vraiment ouvert ; ses voisins sont déjà préparés en aperçu.

export function LiveSwiper({ lives, start, onClose }: { lives: OnAirLive[]; start: number | null; onClose: () => void }) {
  return (
    <Modal visible={start !== null} transparent animationType="none" onRequestClose={onClose}>
      <SafeAreaProvider>{start !== null && <Swiper lives={lives} start={start} onClose={onClose} />}</SafeAreaProvider>
    </Modal>
  );
}

function Swiper({ lives, start, onClose }: { lives: OnAirLive[]; start: number; onClose: () => void }) {
  const { width: W, height: H } = useWindowDimensions();
  // la liste est figée à l'entrée : un live qui commence ou se termine ne fait pas sauter l'écran
  const list = useMemo(() => lives, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [active, setActive] = useState(Math.min(start, Math.max(0, list.length - 1)));

  // ── glisser de gauche à droite : le live suit le doigt, puis on ressort dans le fil ──
  const x = useRef(new Animated.Value(0)).current;
  const pan = useMemo(
    () =>
      PanResponder.create({
        // seulement un geste nettement horizontal vers la droite (les touchers et le défilement vertical passent)
        onMoveShouldSetPanResponderCapture: (_e, g) => g.dx > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
        onPanResponderMove: (_e, g) => x.setValue(Math.max(0, g.dx)),
        onPanResponderRelease: (_e, g) => {
          if (g.dx > W * 0.28 || g.vx > 0.7) {
            Animated.timing(x, { toValue: W, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => onClose());
          } else {
            Animated.spring(x, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
          }
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [W, x, onClose],
  );
  const shade = x.interpolate({ inputRange: [0, W], outputRange: [0.55, 0], extrapolate: 'clamp' });

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActive(Math.round(e.nativeEvent.contentOffset.y / H));
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* le fil reste visible derrière quand on glisse pour sortir */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: shade }]} pointerEvents="none" />
      <Animated.View style={[styles.sheet, { transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        <FlatList
          data={list}
          keyExtractor={(l) => l.room}
          initialScrollIndex={active}
          getItemLayout={(_, i) => ({ length: H, offset: H * i, index: i })}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          renderItem={({ item, index }) => (
            <View style={{ width: W, height: H, overflow: 'hidden', backgroundColor: '#000' }}>
              {index === active ? (
                <LiveScene live={item} onClose={onClose} />
              ) : Math.abs(index - active) === 1 ? (
                <Waiting live={item} />
              ) : null}
            </View>
          )}
        />
      </Animated.View>
    </View>
  );
}

/** Le live complet, selon son format */
function LiveScene({ live, onClose }: { live: OnAirLive; onClose: () => void }) {
  if (live.demo) return <DemoScene live={live} onClose={onClose} />;
  // les lives réels demandent un compte ; sans compte, l'écran simple du live
  if (!auth.currentUser) return <Viewer start={live} onClose={onClose} />;
  switch (live.format) {
    case 'table':
      return <TableRoom config={{ title: live.title, capacity: 6 }} hostRoom={live.room} onClose={onClose} />;
    case 'openmic':
      return <MicroReal hostRoom={live.room} start={live} onClose={onClose} />;
    case 'slam':
      return <SlamReal hostRoom={live.room} start={live} onClose={onClose} />;
    case 'motdor':
      return <MotDor open instant follow={live} onClose={onClose} />;
    case 'lettres':
      return <LettresDor open instant follow={live} onClose={onClose} />;
    default:
      return <Viewer start={live} onClose={onClose} />;
  }
}

/** Le live voisin, pendant qu'on glisse vers lui : son aperçu (exemples) ou son hôte */
function Waiting({ live }: { live: OnAirLive }) {
  if (live.demo) return <DemoPreview live={live} muted offset={0} />;
  const who = live.pseudo || live.name;
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <LinearGradient colors={['#3A2B10', '#120D06', '#0A0806']} style={StyleSheet.absoluteFill} />
      {live.face ? <Image source={live.face} style={styles.face} /> : <Initial name={who} size={104} />}
      <Text style={styles.name}>{who}</Text>
      <Text style={styles.sub}>est en direct</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { ...StyleSheet.absoluteFill, backgroundColor: '#000', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: -4, height: 0 } },
  center: { alignItems: 'center', justifyContent: 'center' },
  face: { width: 104, height: 104, borderRadius: 52, borderWidth: 3, borderColor: colors.gold },
  name: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 12 },
  sub: { color: colors.goldLight, fontSize: 14, fontWeight: '700', marginTop: 2 },
});
