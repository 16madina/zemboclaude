import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { colors } from '../theme';
import type { DuoRef } from './sounds';

// Duo : deux cases au format vertical, la vidéo d'origine et la nouvelle,
// côte à côte ou l'une au-dessus de l'autre (au choix).

export type DuoLayout = 'lr' | 'rl' | 'tb' | 'bt';
export const DUO_LAYOUTS: { id: DuoLayout; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'lr', label: 'Côte à côte · moi à droite', icon: 'tablet-landscape-outline' },
  { id: 'rl', label: 'Côte à côte · moi à gauche', icon: 'tablet-landscape-outline' },
  { id: 'tb', label: 'Haut / bas · moi en bas', icon: 'tablet-portrait-outline' },
  { id: 'bt', label: 'Haut / bas · moi en haut', icon: 'tablet-portrait-outline' },
];

/** Dispose les deux cases dans la zone donnée */
export function DuoFrame({
  layout = 'lr',
  width,
  height,
  original,
  me,
  pseudo,
}: {
  layout?: DuoLayout;
  width: number;
  height: number;
  original: React.ReactNode;
  me: React.ReactNode;
  /** auteur de la vidéo d'origine (étiquette) */
  pseudo?: string;
}) {
  const gap = 6;
  const row = layout === 'lr' || layout === 'rl';
  // chaque case garde le format vertical 9:16 et tient dans la zone
  let w = row ? (width - gap * 3) / 2 : ((height - gap * 3) / 2) * (9 / 16);
  let h = w * (16 / 9);
  if (row && h > height - gap * 2) {
    h = height - gap * 2;
    w = h * (9 / 16);
  }
  if (!row && w > width - gap * 2) {
    w = width - gap * 2;
    h = w * (16 / 9);
  }
  const box = { width: w, height: h };
  const first = layout === 'lr' || layout === 'tb' ? original : me;
  const second = layout === 'lr' || layout === 'tb' ? me : original;
  const originalFirst = layout === 'lr' || layout === 'tb';
  return (
    <View style={[StyleSheet.absoluteFill, styles.stage, { flexDirection: row ? 'row' : 'column', gap }]}>
      <View style={[styles.box, box, originalFirst && styles.boxOriginal]}>
        {first}
        {originalFirst && !!pseudo && <Tag pseudo={pseudo} />}
      </View>
      <View style={[styles.box, box, !originalFirst && styles.boxOriginal]}>
        {second}
        {!originalFirst && !!pseudo && <Tag pseudo={pseudo} />}
      </View>
    </View>
  );
}

function Tag({ pseudo }: { pseudo: string }) {
  return (
    <View style={styles.tag}>
      <Ionicons name="copy" size={10} color={colors.bg} />
      <Text style={styles.tagText} numberOfLines={1}>
        @{pseudo}
      </Text>
    </View>
  );
}

/** Vidéo d'origine d'un Duo : muette (son son passe par le son repris), recalée quand la nouvelle vidéo boucle */
export function DuoSource({ duo, own, active }: { duo: DuoRef; own: VideoPlayer; active: boolean }) {
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
  return <VideoView player={src} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  box: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#111' },
  boxOriginal: { borderWidth: 1.5, borderColor: 'rgba(212,175,55,0.7)' },
  tag: {
    position: 'absolute',
    left: 6,
    top: 6,
    maxWidth: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.gold,
  },
  tagText: { color: colors.bg, fontSize: 10.5, fontWeight: '900' },
});
