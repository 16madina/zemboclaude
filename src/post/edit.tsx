import { useEffect, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import type { VideoPlayer } from 'expo-video';
import { colors } from '../theme';
import { MELODIES } from '../talk/melodies';

// Montage « à la lecture » : la vidéo envoyée n'est pas recalculée.
// On enregistre les réglages (coupe, volumes, musique, textes, filtre, couverture)
// et Zembo les applique quand la vidéo est lue.

export type FilterId = 'none' | 'chaud' | 'or' | 'froid' | 'nb' | 'vintage' | 'eclat' | 'nuit';

export type TextItem = {
  id: string;
  text: string;
  /** position du centre, de 0 à 1 */
  x: number;
  y: number;
  color: string;
  /** fond derrière le texte */
  bg: boolean;
  /** taille de la police en part de la largeur (0,05 à 0,12) */
  size: number;
};

export type PostEdit = {
  /** coupe, en secondes */
  start?: number;
  end?: number;
  /** volume du son de la vidéo (0 à 1) */
  volume?: number;
  music?: { id: string; volume: number } | null;
  texts?: TextItem[];
  filter?: FilterId;
  /** moment de la couverture, en secondes */
  cover?: number;
};

// ── Filtres : un calque de couleur posé sur l'image ──

type BlendMode = ViewStyle['mixBlendMode'];
export const FILTERS: { id: FilterId; name: string; color: string; opacity: number; blend: BlendMode }[] = [
  { id: 'none', name: 'Original', color: 'transparent', opacity: 0, blend: 'normal' },
  { id: 'or', name: 'Doré', color: '#E2B33C', opacity: 0.5, blend: 'overlay' },
  { id: 'chaud', name: 'Chaud', color: '#FF7A00', opacity: 0.45, blend: 'soft-light' },
  { id: 'froid', name: 'Froid', color: '#2F7BFF', opacity: 0.5, blend: 'soft-light' },
  { id: 'nb', name: 'Noir & blanc', color: '#808080', opacity: 1, blend: 'saturation' },
  { id: 'vintage', name: 'Vintage', color: '#C8A06E', opacity: 0.38, blend: 'multiply' },
  { id: 'eclat', name: 'Éclat', color: '#FFFFFF', opacity: 0.22, blend: 'soft-light' },
  { id: 'nuit', name: 'Nuit', color: '#1A1060', opacity: 0.35, blend: 'multiply' },
];

export function FilterLayer({ id }: { id?: FilterId }) {
  const f = FILTERS.find((x) => x.id === id);
  if (!f || f.id === 'none') return null;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: f.color, opacity: f.opacity, mixBlendMode: f.blend }]} />;
}

// ── Textes ──

export const TEXT_COLORS = ['#FFFFFF', '#F3D27A', '#111111', '#FF4D6D', '#3CC8FF', '#7CE38B'];

export function TextBubble({ item, width }: { item: TextItem; width: number }) {
  const dark = item.color === '#111111';
  return (
    <View style={[styles.bubble, item.bg && { backgroundColor: dark ? '#FFFFFF' : 'rgba(0,0,0,0.55)' }]}>
      <Text
        style={[
          styles.bubbleText,
          { color: item.color, fontSize: Math.max(12, width * item.size), lineHeight: Math.max(14, width * item.size * 1.2) },
          !item.bg && styles.bubbleShadow,
        ]}
      >
        {item.text}
      </Text>
    </View>
  );
}

/** Textes posés sur la vidéo (lecture seule, pour le fil) */
export function TextsLayer({ texts, width, height }: { texts?: TextItem[]; width: number; height: number }) {
  if (!texts?.length) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {texts.map((t) => (
        <View key={t.id} style={[styles.placed, { left: t.x * width, top: t.y * height }]}>
          <View style={styles.center}>
            <TextBubble item={t} width={width} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Musique Zembo ──

export type Track = { id: string; name: string; mood: string; file: number };
const seen = new Set<string>();
export const TRACKS: Track[] = MELODIES.filter((m) => m.file && !seen.has(m.name) && seen.add(m.name)).map((m) => ({
  id: m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name: m.name,
  mood: m.mood,
  file: m.file!,
}));
export const trackOf = (id?: string | null) => TRACKS.find((t) => t.id === id);

/**
 * Applique le montage à un lecteur vidéo : coupe (boucle entre début et fin), volume, musique.
 * `active` : la vidéo est à l'écran et joue.
 */
export function useEditPlayback(
  player: VideoPlayer,
  edit: PostEdit | undefined,
  active: boolean,
  /** son repris d'une autre vidéo (« Utiliser ce son », Duo) : lu à la place de la musique */
  sound?: { url?: string; start?: number } | null,
) {
  const start = edit?.start ?? 0;
  const end = edit?.end;
  const trackFile = trackOf(edit?.music?.id)?.file;
  const soundUrl = !trackFile ? sound?.url : undefined;
  const soundStart = soundUrl ? (sound?.start ?? 0) : 0;
  const track = trackFile || soundUrl ? true : null;
  const music = useAudioPlayer(trackFile ?? (soundUrl ? { uri: soundUrl } : null));
  const last = useRef(0);

  // volume du son d'origine
  useEffect(() => {
    try {
      player.volume = edit?.volume ?? 1;
    } catch {}
  }, [player, edit?.volume]);

  // musique : même volume, joue et s'arrête avec la vidéo
  useEffect(() => {
    if (!track) return;
    music.loop = true;
    music.volume = trackFile ? (edit?.music?.volume ?? 0.8) : 1;
    if (active) {
      if (soundStart && music.currentTime < soundStart) music.seekTo(soundStart).catch(() => {});
      music.play();
    }
    else music.pause();
  }, [music, track, active, edit?.music?.volume, trackFile, soundStart]);

  // coupe : on repart au début choisi et on boucle avant la fin choisie
  useEffect(() => {
    if (!start && end === undefined && !track) return;
    if (active && start) {
      try {
        player.currentTime = start;
      } catch {}
    }
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      const restart = () => {
        try {
          player.currentTime = start;
        } catch {}
        if (track) music.seekTo(soundStart).catch(() => {});
      };
      if (end !== undefined && currentTime >= end - 0.05) restart();
      else if (currentTime < start - 0.3) restart();
      else if (track && currentTime + 0.5 < last.current) music.seekTo(soundStart).catch(() => {}); // la vidéo a bouclé seule
      last.current = currentTime;
    });
    return () => sub.remove();
  }, [player, start, end, active, track, music, soundStart]);
}

// ── Curseur doré (0 à 1) ──

export function GoldSlider({ value, onChange, style }: { value: number; onChange: (v: number) => void; style?: ViewStyle }) {
  const width = useRef(1);
  const cb = useRef(onChange);
  cb.current = onChange;
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => cb.current(Math.min(1, Math.max(0, e.nativeEvent.locationX / width.current))),
      onPanResponderMove: (e) => cb.current(Math.min(1, Math.max(0, e.nativeEvent.locationX / width.current))),
    }),
  ).current;
  return (
    <View
      style={[styles.slider, style]}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width || 1;
      }}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${value * 100}%` }]} />
      </View>
      <View pointerEvents="none" style={[styles.sliderKnob, { left: `${value * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  placed: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: 600 },
  bubble: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, maxWidth: 320 },
  bubbleText: { fontWeight: '900', textAlign: 'center' },
  bubbleShadow: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  slider: { height: 34, justifyContent: 'center' },
  sliderTrack: { height: 5, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  sliderFill: { height: '100%', backgroundColor: colors.gold },
  sliderKnob: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    backgroundColor: colors.goldLight,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
