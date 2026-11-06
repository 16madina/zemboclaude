import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { formatCount } from '../utils/format';
import { thumbOf, type Post } from '../data/feed';
import { VideoViewer } from '../components/VideoViewer';
import { trackOf } from './edit';
import { useSoundPosts, type SoundRef } from './sounds';
import { RecordScreen, type RecordMode, type Recorded } from './RecordScreen';
import { PublishScreen } from './PublishScreen';

// Page d'un son : écouter, voir toutes les vidéos faites avec, et « Utiliser ce son »

export type SoundTarget = { sound: SoundRef; origin?: Post };

export function SoundPage({ target, onClose }: { target: SoundTarget | null; onClose: () => void }) {
  return (
    <Modal visible={!!target} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>{target && <Body target={target} onClose={onClose} />}</SafeAreaProvider>
    </Modal>
  );
}

function Body({ target, onClose }: { target: SoundTarget; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { sound, origin } = target;
  const { posts, ready } = useSoundPosts(sound, origin);
  const track = trackOf(sound.trackId);
  const player = useAudioPlayer(track?.file ?? (sound.url ? { uri: sound.url } : null));
  const status = useAudioPlayerStatus(player);
  const [viewer, setViewer] = useState<number | null>(null);
  const [mode, setMode] = useState<RecordMode | null>(null);
  const cell = (width - 2) / 3;
  const cover = sound.cover ?? (posts[0] ? thumbOf(posts[0]) : undefined);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    return () => player.pause();
  }, [player]);

  const toggle = () => {
    if (status.playing) player.pause();
    else {
      if (!status.currentTime && sound.start) player.seekTo(sound.start).catch(() => {});
      player.play();
    }
  };

  const use = () => {
    player.pause();
    setMode({ kind: 'sound', sound });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Pressable onPress={toggle} style={styles.disc}>
            {cover ? (
              <Image source={cover} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <LinearGradient colors={goldGradient} style={StyleSheet.absoluteFill} />
            )}
            <View style={styles.discPlay}>
              <Ionicons name={status.playing ? 'pause' : 'play'} size={28} color="#fff" />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {sound.title}
            </Text>
            {!!sound.pseudo && <Text style={styles.by}>@{sound.pseudo}</Text>}
            {track && <Text style={styles.by}>Musique Zembo · {track.mood}</Text>}
            <Text style={styles.count}>
              {formatCount(posts.length)} vidéo{posts.length > 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {!ready && posts.length === 0 && <ActivityIndicator color={colors.gold} style={{ marginTop: 30 }} />}
        {ready && posts.length === 0 && <Text style={styles.empty}>Sois la première personne à utiliser ce son.</Text>}
        <View style={styles.grid}>
          {posts.map((p, i) => (
            <Pressable key={p.id} onPress={() => setViewer(i)} style={{ width: cell, height: cell * 1.33 }}>
              <Image source={thumbOf(p)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
              {i === 0 && sound.postId === p.id && (
                <LinearGradient colors={goldGradient} style={styles.original}>
                  <Text style={styles.originalText}>Original</Text>
                </LinearGradient>
              )}
              <Text style={styles.cellUser} numberOfLines={1}>
                @{p.user.handle}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable onPress={use} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
            <Ionicons name="videocam" size={20} color={colors.bg} />
            <Text style={styles.ctaText}>Utiliser ce son</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <VideoViewer posts={posts} start={viewer} onClose={() => setViewer(null)} />
      <CreateFlow mode={mode} onClose={() => setMode(null)} />
    </View>
  );
}

/** Filmer (avec un son ou en Duo) puis publier */
export function CreateFlow({ mode, onClose }: { mode: RecordMode | null; onClose: () => void }) {
  const [recorded, setRecorded] = useState<Recorded | null>(null);
  const [current, setCurrent] = useState<RecordMode | null>(null);
  // nouvelle demande : on repart de la caméra
  useEffect(() => {
    if (mode) {
      setCurrent(mode);
      setRecorded(null);
    }
  }, [mode]);

  const sound = current?.sound ?? null;
  const preset =
    recorded && current
      ? {
          picked: { uri: recorded.uri, width: recorded.width, height: recorded.height, duration: recorded.duration },
          // micro coupé : on entend seulement le son choisi ; micro ouvert : ta voix en plus
          edit: {
            volume: recorded.mic ? 1 : 0,
            ...(sound?.trackId ? { music: { id: sound.trackId, volume: 1 } } : {}),
          },
          soundRef: sound ?? undefined,
          duo: current.kind === 'duo' ? { ...current.duo, layout: recorded.layout ?? 'lr' } : undefined,
        }
      : undefined;

  const done = () => {
    setRecorded(null);
    setCurrent(null);
    onClose();
  };

  return (
    <>
      <RecordScreen
        mode={mode && !recorded ? current : null}
        onClose={done}
        onRecorded={(r) => {
          // la caméra se ferme, puis la publication s'ouvre
          setTimeout(() => setRecorded(r), 50);
        }}
      />
      <PublishScreen kind={preset ? 'video' : null} preset={preset} onClose={done} onPublished={done} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { height: 48, justifyContent: 'center', paddingHorizontal: 10 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 18 },
  disc: { width: 96, height: 96, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.gold },
  discPlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  by: { color: colors.gold, fontSize: 14, fontWeight: '800', marginTop: 4 },
  count: { color: colors.textDim, fontSize: 13.5, marginTop: 6 },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 30, fontSize: 14, paddingHorizontal: 30 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  original: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 8, height: 20, borderRadius: 10, justifyContent: 'center' },
  originalText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
  cellUser: { position: 'absolute', left: 6, right: 6, bottom: 5, color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '700' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: 'rgba(10,8,6,0.92)' },
  cta: { height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: colors.bg, fontSize: 17, fontWeight: '900' },
});
