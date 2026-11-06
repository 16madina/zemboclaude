import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { trackOf } from './edit';
import type { DuoRef, SoundRef } from './sounds';
import { DUO_LAYOUTS, DuoFrame, type DuoLayout } from './duo';

// Caméra Zembo : filmer avec un son (« Utiliser ce son ») ou en Duo (la vidéo d'origine joue à côté).
// La caméra n'existe que dans les versions récentes de l'app : on la charge à la demande.

type CameraModule = typeof import('expo-camera');
let Cam: CameraModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Cam = require('expo-camera') as CameraModule;
} catch {
  Cam = null;
}

export type Recorded = { uri: string; width: number; height: number; duration: number; layout?: DuoLayout; mic: boolean };
export type RecordMode = { kind: 'sound'; sound: SoundRef } | { kind: 'duo'; duo: DuoRef; sound: SoundRef | null };

const MAX = 60;

export function RecordScreen({ mode, onClose, onRecorded }: { mode: RecordMode | null; onClose: () => void; onRecorded: (r: Recorded) => void }) {
  return (
    <Modal visible={!!mode} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>{mode && <Body mode={mode} onClose={onClose} onRecorded={onRecorded} />}</SafeAreaProvider>
    </Modal>
  );
}

function Body({ mode, onClose, onRecorded }: { mode: RecordMode; onClose: () => void; onRecorded: (r: Recorded) => void }) {
  const insets = useSafeAreaInsets();
  if (!Cam) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="videocam-off" size={48} color={colors.gold} />
        <Text style={styles.msgTitle}>Mets Zembo à jour</Text>
        <Text style={styles.msg}>La caméra Zembo arrive avec la nouvelle version de l’app.</Text>
        <Pressable onPress={onClose} style={styles.msgBtn}>
          <Text style={styles.msgBtnText}>Fermer</Text>
        </Pressable>
      </View>
    );
  }
  return <Recorder cam={Cam} mode={mode} onClose={onClose} onRecorded={onRecorded} />;
}

function Recorder({ cam, mode, onClose, onRecorded }: { cam: CameraModule; mode: RecordMode; onClose: () => void; onRecorded: (r: Recorded) => void }) {
  const insets = useSafeAreaInsets();
  const { CameraView, useCameraPermissions, useMicrophonePermissions } = cam;
  const [camPerm, askCam] = useCameraPermissions();
  const [micPerm, askMic] = useMicrophonePermissions();
  const ref = useRef<InstanceType<typeof CameraView>>(null);
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [count, setCount] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const isDuo = mode.kind === 'duo';
  const sound = mode.sound;
  const track = trackOf(sound?.trackId);
  const { width: sw, height: sh } = useWindowDimensions();
  // micro : en Duo il est ouvert (ta voix), avec un son il est coupé (tu mimes) — on peut changer
  const [mic, setMic] = useState(isDuo);
  const [layout, setLayout] = useState<DuoLayout>('lr');
  const [tip, setTip] = useState<string | null>(null);
  const mute = !mic;

  // le son doit sortir même si l'iPhone est en mode silencieux, et par le haut-parleur
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: mic, shouldRouteThroughEarpiece: false }).catch(() => {});
  }, [mic]);
  // en partant : retour au son normal (haut-parleur, pas d'enregistrement)
  useEffect(() => () => void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {}), []);
  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(null), 1600);
    return () => clearTimeout(t);
  }, [tip]);

  // le son ou la vidéo d'origine, joués pendant qu'on filme
  const audio = useAudioPlayer(!isDuo ? (track?.file ?? (sound?.url ? { uri: sound.url } : null)) : null);
  const duoPlayer = useVideoPlayer(isDuo ? mode.duo.url : null, (p) => {
    p.loop = false;
  });
  const startAt = isDuo ? (mode.duo.start ?? 0) : (sound?.start ?? 0);

  useEffect(() => {
    if (!camPerm?.granted) askCam();
    if (!micPerm?.granted) askMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // aperçu de la vidéo d'origine, sur pause au début
  useEffect(() => {
    if (!isDuo) return;
    try {
      duoPlayer.currentTime = startAt;
    } catch {}
    duoPlayer.pause();
  }, [isDuo, duoPlayer, startAt]);

  // chrono
  useEffect(() => {
    if (!recording) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [recording]);

  const playSource = () => {
    if (isDuo) {
      try {
        duoPlayer.currentTime = startAt;
      } catch {}
      duoPlayer.play();
    } else {
      audio.seekTo(startAt).catch(() => {});
      audio.play();
    }
  };
  const stopSource = () => {
    if (isDuo) duoPlayer.pause();
    else audio.pause();
  };

  const begin = async () => {
    if (!ref.current || !ready) return;
    setRecording(true);
    setElapsed(0);
    playSource();
    try {
      const res = await ref.current.recordAsync({ maxDuration: MAX });
      stopSource();
      setRecording(false);
      if (res?.uri) {
        const dur = Math.max(1, Math.min(MAX, (Date.now() - startedAt.current) / 1000));
        onRecorded({ uri: res.uri, width: 720, height: 1280, duration: dur, layout: isDuo ? layout : undefined, mic });
      }
    } catch {
      stopSource();
      setRecording(false);
    }
  };
  const startedAt = useRef(0);

  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (recording) {
      ref.current?.stopRecording();
      return;
    }
    if (count !== null) return;
    // compte à rebours 3, 2, 1
    setCount(3);
    let n = 3;
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(id);
        setCount(null);
        startedAt.current = Date.now();
        begin();
      } else {
        setCount(n);
        Haptics.selectionAsync().catch(() => {});
      }
    }, 800);
  };

  const close = () => {
    if (recording) ref.current?.stopRecording();
    stopSource();
    onClose();
  };

  if (camPerm && !camPerm.granted && !camPerm.canAskAgain) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="camera-outline" size={48} color={colors.gold} />
        <Text style={styles.msgTitle}>Caméra non autorisée</Text>
        <Text style={styles.msg}>Autorise la caméra pour Zembo dans les Réglages de ton téléphone.</Text>
        <Pressable onPress={() => Linking.openSettings()} style={styles.msgBtn}>
          <Text style={styles.msgBtnText}>Ouvrir les Réglages</Text>
        </Pressable>
        <Pressable onPress={close} style={{ marginTop: 14 }}>
          <Text style={styles.msg}>Fermer</Text>
        </Pressable>
      </View>
    );
  }

  const camera = camPerm?.granted ? (
    <CameraView
      ref={ref}
      style={StyleSheet.absoluteFill}
      facing={facing}
      mode="video"
      mute={mute}
      videoQuality="720p"
      onCameraReady={() => setReady(true)}
    />
  ) : (
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <Text style={styles.msg}>Autorise la caméra pour filmer.</Text>
    </View>
  );

  const pct = Math.min(1, elapsed / MAX);

  return (
    <View style={styles.root}>
      {isDuo ? (
        // Duo : deux cases (zone entre la barre du haut et le bouton)
        <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 70, height: sh - insets.top - insets.bottom - 70 - 170 }}>
          <DuoFrame
            layout={layout}
            width={sw}
            height={sh - insets.top - insets.bottom - 70 - 170}
            pseudo={mode.duo.pseudo}
            original={<VideoView player={duoPlayer} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />}
            me={camera}
          />
        </View>
      ) : (
        camera
      )}

      {/* barre de progression */}
      <View style={[styles.track, { top: insets.top + 6 }]}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>

      {/* haut : fermer, son */}
      <View style={[styles.top, { top: insets.top + 18 }]}>
        <Pressable onPress={close} hitSlop={10} style={styles.round}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <View style={styles.soundPill}>
          <Ionicons name={isDuo ? 'copy' : 'musical-notes'} size={14} color={colors.bg} />
          <Text style={styles.soundText} numberOfLines={1}>
            {isDuo ? `Duo avec @${mode.duo.pseudo}` : (sound?.title ?? 'Son')}
          </Text>
        </View>
        <Pressable onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))} hitSlop={10} style={styles.round} disabled={recording}>
          <Ionicons name="camera-reverse" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* côté droit : micro, disposition du Duo */}
      <View style={[styles.side, { top: insets.top + 80 }]}>
        <Pressable
          onPress={() => {
            setMic((m) => !m);
            setTip(mic ? 'Micro coupé : on entend seulement le son' : isDuo ? 'Micro ouvert : ta voix est enregistrée' : 'Micro ouvert : ta voix s’ajoute au son');
          }}
          disabled={recording}
          style={styles.sideBtn}
        >
          <Ionicons name={mic ? 'mic' : 'mic-off'} size={24} color={mic ? colors.gold : '#fff'} />
          <Text style={styles.sideText}>{mic ? 'Micro' : 'Muet'}</Text>
        </Pressable>
        {isDuo && (
          <Pressable
            onPress={() => {
              const i = DUO_LAYOUTS.findIndex((l) => l.id === layout);
              const next = DUO_LAYOUTS[(i + 1) % DUO_LAYOUTS.length];
              setLayout(next.id);
              setTip(next.label);
            }}
            disabled={recording}
            style={styles.sideBtn}
          >
            <Ionicons name={DUO_LAYOUTS.find((l) => l.id === layout)!.icon} size={24} color="#fff" />
            <Text style={styles.sideText}>Disposition</Text>
          </Pressable>
        )}
      </View>
      {tip && (
        <View style={[styles.tip, { top: insets.top + 70 }]} pointerEvents="none">
          <Text style={styles.tipText}>{tip}</Text>
        </View>
      )}

      {count !== null && (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Text style={styles.count}>{count}</Text>
        </View>
      )}

      {/* bas : bouton d'enregistrement */}
      <View style={[styles.bottom, { bottom: insets.bottom + 26 }]}>
        <Text style={styles.hint}>
          {recording ? `${Math.floor(elapsed)} s · touche pour arrêter` : isDuo ? 'Touche pour filmer ton Duo' : 'Touche pour filmer avec ce son'}
        </Text>
        <Pressable onPress={press} disabled={!ready} style={({ pressed }) => [styles.recOuter, pressed && { transform: [{ scale: 0.95 }] }, !ready && { opacity: 0.5 }]}>
          {recording ? (
            <View style={styles.recStop} />
          ) : (
            <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.recInner} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  msgTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 14, textAlign: 'center' },
  msg: { color: colors.textDim, fontSize: 14.5, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  msgBtn: { marginTop: 20, paddingHorizontal: 24, height: 44, borderRadius: 22, backgroundColor: colors.gold, justifyContent: 'center' },
  msgBtnText: { color: colors.bg, fontSize: 15, fontWeight: '900' },
  track: { position: 'absolute', left: 12, right: 12, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.gold },
  top: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  soundPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '60%',
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gold,
  },
  soundText: { color: colors.bg, fontSize: 13, fontWeight: '900', flexShrink: 1 },
  count: { color: '#fff', fontSize: 120, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 12 },
  bottom: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  side: { position: 'absolute', right: 10, gap: 18, alignItems: 'center' },
  sideBtn: { alignItems: 'center', width: 64, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)' },
  sideText: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 3 },
  tip: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center' },
  tipText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  hint: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 14, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  recOuter: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  recInner: { width: 64, height: 64, borderRadius: 32 },
  recStop: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F04E4E' },
});
