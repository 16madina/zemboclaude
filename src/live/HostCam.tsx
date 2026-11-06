import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, goldGradient, textShadow } from '../theme';
import { formatCount } from '../utils/format';
import { CameraFeed, mediaAvailable, useLiveMedia } from './media';

// Bulle « EN DIRECT » de l'hôte : sa caméra telle que les spectateurs la voient,
// le nombre de vrais spectateurs, et de quoi couper la caméra ou le micro.

export function HostCam({
  room,
  viewers,
  name,
  style,
  controls = 'left',
  onError,
}: {
  room: string | null;
  viewers: number;
  name?: string;
  style?: StyleProp<ViewStyle>;
  /** côté des petits boutons (caméra, micro, retourner) */
  controls?: 'left' | 'right';
  onError?: () => void;
}) {
  const [cam, setCam] = useState(true);
  const [mic, setMic] = useState(true);
  const media = useLiveMedia(mediaAvailable ? room : null, { publish: true, camera: cam, mic, name });
  const me = media.cameraOf('me');
  useEffect(() => {
    if (media.status === 'error') onError?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.status]);
  if (!room) return null;

  const toggle = (which: 'cam' | 'mic') => {
    Haptics.selectionAsync().catch(() => {});
    if (which === 'cam') setCam((v) => !v);
    else setMic((v) => !v);
  };

  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none">
      <LinearGradient colors={goldGradient} style={styles.frame}>
        <View style={styles.inner}>
          {me && cam ? (
            <CameraFeed trackRef={me} mirror={media.facing === 'user'} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={styles.off}>
              <Ionicons name={cam && mediaAvailable ? 'videocam' : 'videocam-off'} size={20} color={colors.goldLight} />
              <Text style={styles.offText}>{!mediaAvailable ? 'Vidéo dans l’app installée' : !cam ? 'Caméra coupée' : 'Connexion…'}</Text>
            </View>
          )}
          <View style={styles.badge}>
            <View style={styles.dot} />
            <Text style={styles.badgeText}>EN DIRECT</Text>
          </View>
          <View style={styles.count}>
            <Ionicons name="eye" size={10} color={colors.white} />
            <Text style={styles.countText}>{formatCount(viewers)}</Text>
          </View>
        </View>
      </LinearGradient>
      {mediaAvailable && (
        <View style={[styles.btns, controls === 'right' ? { right: -34 } : { left: -34 }]}>
          <Pressable onPress={() => toggle('cam')} hitSlop={6} style={[styles.btn, !cam && styles.btnOff]}>
            <Ionicons name={cam ? 'videocam' : 'videocam-off'} size={14} color={cam ? colors.goldLight : colors.bg} />
          </Pressable>
          <Pressable onPress={() => toggle('mic')} hitSlop={6} style={[styles.btn, !mic && styles.btnOff]}>
            <Ionicons name={mic ? 'mic' : 'mic-off'} size={14} color={mic ? colors.goldLight : colors.bg} />
          </Pressable>
          <Pressable onPress={() => void media.flipCamera()} hitSlop={6} style={styles.btn}>
            <Ionicons name="camera-reverse" size={14} color={colors.goldLight} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const W = 86;
const H = 116;
const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  frame: { width: W + 4, height: H + 4, borderRadius: 16, padding: 2 },
  inner: { flex: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#14100A' },
  off: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6 },
  offText: { color: colors.textDim, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  badge: { position: 'absolute', top: 5, left: 5, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF4D4D' },
  badgeText: { color: colors.white, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.4 },
  count: { position: 'absolute', bottom: 5, left: 5, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  countText: { color: colors.white, fontSize: 10, fontWeight: '800', ...textShadow },
  btns: { position: 'absolute', top: 4, gap: 6 },
  btn: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.5)', alignItems: 'center', justifyContent: 'center' },
  btnOff: { backgroundColor: colors.gold, borderColor: colors.gold },
});
