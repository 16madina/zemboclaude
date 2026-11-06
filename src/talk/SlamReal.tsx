import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { SLAM_STAGE, TINTS, fmtDur, moodOf, type Slot } from './slamData';
import { LyricsPanel } from './LyricsPanel';
import { melodyFile } from './melodies';
import { QueueDrawer, RequestSheet, SlamActionSheet, tap, type SlamRequest, type SlamSheetKind } from './SlamSheets';
import { Action, BottomCard, COUNTDOWN, CountNumber, FadeIn, GiftFly, TimerRing, slamStyles as styles } from './SlamTherapie';
import { useSession } from '../lib/session';
import { auth } from '../lib/firebase';
import { CameraFeed, useLiveMedia } from '../live/media';
import { Initial } from '../live/LiveViewer';
import { roomOf, sendLiveMessage, useHostOnAir, useLiveChatFeed, useOnAirLive, useWatching, type OnAirLive } from '../live/onair';
import { useStage, type Perf, type QueueSlot } from '../live/stage';

// Mic d'Or Thérapie en vrai : une scène ouverte où chacun passe à son tour, devant tout le monde.
// L'hôte accepte les demandes et lance les passages ; le décompte, le chrono, la mélodie et les paroles
// sont les mêmes pour tous (calculés depuis l'heure de début du passage).

type Heart = { id: number; x: number; y: number; v: Animated.Value };

/** Numéro stable pour l'affichage (les panneaux de la file utilisent des numéros) */
const idOf = (uid: string) => {
  let h = 7;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
};

/** Entrer comme spectateur dans le Mic d'Or Thérapie d'un autre membre (depuis l'accueil) */
export function SlamViewer({ live, onClose }: { live: OnAirLive | null; onClose: () => void }) {
  return (
    <Modal visible={!!live} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#000' }}>{live && <SlamReal key={live.room} hostRoom={live.room} start={live} onClose={onClose} />}</View>
      </SafeAreaProvider>
    </Modal>
  );
}

export function SlamReal({ onClose, hostRoom, start }: { onClose: () => void; hostRoom?: string; start?: OnAirLive }) {
  const insets = useSafeAreaInsets();
  const T = insets.top;
  const { profile } = useSession();
  const me = auth.currentUser?.uid ?? '';
  const pseudo = profile?.pseudo ?? '';
  const isHost = !hostRoom;
  const room = hostRoom ?? (me ? roomOf('slam', me) : null);

  const stage = useStage(room, { host: isHost, slots: 1, pseudo, capacity: 2 });
  const hostAir = useHostOnAir('slam', { active: isHost, title: 'Des mots pour guérir', pseudo, name: [profile?.prenom, profile?.nom].filter(Boolean).join(' ') });
  useWatching(isHost ? null : room);
  const air = useOnAirLive(room);
  const ended = !isHost && air === null;
  const hostName = stage.names[stage.hostUid] || air?.pseudo || start?.pseudo || 'Hôte';

  // ── le passage en cours, calculé depuis son heure de début ──
  const perf = stage.perf;
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const total = perf ? perf.duration * 60 : 0;
  const counting = !!perf && nowMs < perf.startAt;
  const count = counting ? Math.ceil((perf!.startAt - nowMs) / 1000) : null;
  const elapsed = perf && !counting ? Math.floor((nowMs - perf.startAt) / 1000) : 0;
  const left = perf ? Math.max(0, total - elapsed) : 0;
  const running = !!perf && !counting && left > 0;
  const imOnStage = !!perf && perf.uid === me;

  // ── merci à la fin d'un passage, puis (côté hôte) le suivant de la file ──
  const [thanks, setThanks] = useState<Perf | null>(null);
  const prevPerf = useRef<Perf | null>(null);
  useEffect(() => {
    const prev = prevPerf.current;
    prevPerf.current = perf;
    if (prev && (!perf || perf.uid !== prev.uid || perf.startAt !== prev.startAt) && !perf) {
      setThanks(prev);
      const t = setTimeout(() => {
        setThanks(null);
        if (isHost && stage.queue.length) stage.startPerf(stage.queue[0], COUNTDOWN).catch(() => {});
      }, 2600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perf]);

  // l'hôte clôt le passage quand le chrono est fini ou que la personne est redescendue
  const ending = useRef<number>(0);
  useEffect(() => {
    if (!isHost || !perf || counting) return;
    const gone = stage.stage[0] !== perf.uid;
    if ((left === 0 || gone) && ending.current !== perf.startAt) {
      ending.current = perf.startAt;
      stage.endPerf().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, perf, counting, left, stage.stage]);

  // ── caméras et micros : la personne au mic, et l'hôte ──
  const [myCam, setMyCam] = useState(true);
  const [myMic, setMyMic] = useState(true);
  const publishing = isHost || imOnStage;
  // pendant un passage, le micro de l'hôte se coupe ; celui de la personne s'ouvre au top départ
  const micOpen = myMic && (isHost ? !running : running);
  const media = useLiveMedia(room, { publish: publishing, camera: myCam, mic: micOpen, name: pseudo });
  const performerCam = perf ? (imOnStage ? media.cameraOf('me') : media.cameraOf(perf.uid)) : null;
  const hostCam = isHost ? media.cameraOf('me') : media.cameraOf(stage.hostUid);
  const bigCam = perf ? performerCam : hostCam;

  // ── mélodie du passage, jouée chez chacun ──
  const stageFile = perf ? melodyFile(perf.melody, perf.duration as 1 | 3) : undefined;
  const [musicOn, setMusicOn] = useState(true);
  const player = useAudioPlayer(null);
  const fileRef = useRef<number | undefined>(undefined);
  const [flow, setFlow] = useState<'request' | 'confirm' | 'notice' | null>(null);
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);
  useEffect(() => {
    const shouldPlay = !!stageFile && musicOn && running && !thanks && flow !== 'request';
    try {
      if (fileRef.current !== stageFile) {
        fileRef.current = stageFile;
        if (stageFile) {
          player.replace(stageFile);
          player.loop = true;
          player.volume = 0.55;
        }
      }
      if (shouldPlay) player.play();
      else player.pause();
    } catch {}
  }, [player, stageFile, musicOn, running, thanks, flow]);

  // ── chat réel ──
  const feed = useLiveChatFeed(room, 20);
  const msgs = useMemo(
    () => feed.map((m, i) => ({ id: m.id, user: m.pseudo, text: m.text, tint: m.uid === me ? colors.gold : TINTS[(i + 1) % TINTS.length], me: m.uid === me })),
    [feed, me],
  );
  const [draft, setDraft] = useState('');
  const say = (t: string) => {
    if (room && pseudo) sendLiveMessage(room, pseudo, t).catch(() => {});
  };
  const send = () => {
    const t = draft.trim();
    if (!t) return;
    tap();
    say(t);
    setDraft('');
  };

  // ── file d'attente et demandes, en « places » pour les panneaux ──
  const toSlot = (q: QueueSlot | Perf | (QueueSlot & { pseudo: string }), uid: string): Slot => ({
    id: idOf(uid),
    name: q.pseudo || 'Invité',
    title: q.title,
    mood: q.mood ?? 'piano',
    sound: ('sound' in q ? q.sound : (q as Perf).melody) ?? null,
    duration: (q.duration === 1 ? 1 : 3) as 1 | 3,
    me: uid === me,
    real: true,
    lyrics: q.lyrics ?? undefined,
  });
  const queueSlots = stage.queue.map((q) => toSlot(q, q.uid));
  const requestSlots = stage.requests.filter((r) => r.slot).map((r) => toSlot({ uid: r.uid, pseudo: r.pseudo, ...r.slot! }, r.uid));
  const idleSlot: Slot = { id: 0, name: hostName, title: 'Scène ouverte', mood: 'piano', sound: null, duration: 3, real: true };
  const perfSlot = perf ? toSlot(perf, perf.uid) : idleSlot;
  const byId = (s: Slot) => stage.queue.find((q) => idOf(q.uid) === s.id);
  const mineIdx = stage.queue.findIndex((q) => q.uid === me);
  const mine = mineIdx >= 0 ? queueSlots[mineIdx] : null;
  const myPos = mineIdx + 1;
  const etaMin = mine ? Math.max(1, Math.round(left / 60) + stage.queue.slice(0, mineIdx).reduce((a, q) => a + q.duration, 0)) : 0;
  const requested = stage.role === 'requested';

  // ma demande vient d'être acceptée → « tu es dans la file » ; je suis le prochain → prévenir
  const wasQueued = useRef(false);
  useEffect(() => {
    if (mine && !wasQueued.current) setFlow('confirm');
    wasQueued.current = !!mine;
  }, [mine]);
  const noticed = useRef(false);
  useEffect(() => {
    if (myPos === 1 && perf && !noticed.current) {
      noticed.current = true;
      setFlow((f) => f ?? 'notice');
    }
    if (myPos !== 1) noticed.current = false;
  }, [myPos, perf]);

  // ── petites choses du live ──
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState<SlamSheetKind>(null);
  const [giftFly, setGiftFly] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const showToast = (t: string) => {
    setToast(t);
    setTimeout(() => setToast((x) => (x === t ? null : x)), 2000);
  };
  const run = (p: Promise<unknown>) => void p.catch(() => showToast('Action impossible pour le moment'));
  const onSceneTap = (e: GestureResponderEvent) => {
    tap();
    const h: Heart = { id: Date.now() + Math.random(), x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, v: new Animated.Value(0) };
    setHearts((hs) => [...hs.slice(-12), h]);
    Animated.timing(h.v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() =>
      setHearts((hs) => hs.filter((k) => k.id !== h.id)),
    );
  };

  const submitRequest = (r: SlamRequest) => {
    setFlow(null);
    run(stage.request(pseudo, { title: r.title, mood: r.mood, sound: r.sound?.name ?? null, duration: r.duration, lyrics: r.lyrics ?? null }));
    showToast("Demande envoyée à l'hôte…");
  };
  const startNow = (s: Slot) => {
    const q = byId(s);
    if (!q) return;
    tap();
    run(stage.startPerf(q, COUNTDOWN));
  };

  const ratio = total ? left / total : 1;
  const urgent = running && left <= 10;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');
  const perfName = perf?.pseudo || hostName;

  return (
    <View style={{ flex: 1 }}>
      {/* plein écran : la personne au mic (ou l'hôte entre deux passages) */}
      {bigCam ? (
        <CameraFeed trackRef={bigCam} mirror={(perf ? imOnStage : isHost) && media.facing === 'user'} style={StyleSheet.absoluteFill} />
      ) : (
        <>
          <Image source={SLAM_STAGE} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" blurRadius={perf ? 0 : 18} />
          {!perf && (
            <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
              <Initial name={hostName} size={92} />
            </View>
          )}
        </>
      )}
      <LinearGradient colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0.05)']} style={[styles.shade, { top: 0, height: 260 }]} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']} style={[styles.shade, { bottom: 0, height: 420 }]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onSceneTap} />
      {hearts.map((h) => (
        <Animated.Text
          key={h.id}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: h.x - 18,
            top: h.y - 18,
            fontSize: 36,
            opacity: h.v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: h.v.interpolate({ inputRange: [0, 1], outputRange: [0, -110] }) },
              { scale: h.v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.2, 1] }) },
            ],
          }}
        >
          ❤️
        </Animated.Text>
      ))}

      {/* en-tête */}
      <View style={[styles.header, { top: T + 4 }]} pointerEvents="box-none">
        <LinearGradient colors={goldGradient} style={styles.zIcon}>
          <Text style={styles.zText}>Z</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            Mic d'Or Thérapie
          </Text>
          <Text style={styles.tagline}>DES MOTS POUR GUÉRIR</Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
        <View style={styles.pill}>
          <Ionicons name="people" size={11} color={colors.text} />
          <Text style={styles.pillText}>{isHost ? hostAir.viewers : (air?.viewers ?? 0)}</Text>
        </View>
        <Pressable onPress={() => setSheet('menu')} hitSlop={8} style={styles.round}>
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.text} />
        </Pressable>
        <Pressable onPress={onClose} hitSlop={8} style={styles.round}>
          <Ionicons name="close" size={17} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.row2, { top: T + 52 }]} pointerEvents="box-none">
        <Pressable
          onPress={() => {
            tap();
            setDrawer(true);
          }}
          style={styles.queueChip}
        >
          <Ionicons name="list" size={12} color={colors.gold} />
          <Text style={styles.queueText}>File d'attente ({stage.queue.length})</Text>
          {isHost && requestSlots.length > 0 && (
            <View style={styles.reqBadge}>
              <Text style={styles.reqBadgeText}>{requestSlots.length}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* sur scène + chrono */}
      <View style={[styles.stageRow, { top: T + 92 }]} pointerEvents="box-none">
        <View style={{ flex: 1 }}>
          <View style={styles.onStage}>
            <Text style={styles.onStageText}>{perf ? '🎤 SUR SCÈNE' : '✨ SCÈNE OUVERTE'}</Text>
          </View>
          <Text style={styles.perfName}>{perfName}</Text>
          <Text style={styles.perfTitle} numberOfLines={2}>
            {perf ? perf.title : isHost ? 'Accepte une demande pour lancer le premier passage' : 'Demande le mic pour passer sur scène'}
          </Text>
          {perf && (
            <Pressable
              onPress={() => {
                tap();
                if (!perf.melody) return showToast('Sans musique — a cappella');
                if (!stageFile) return showToast(`🎵 ${perf.melody} — morceau bientôt disponible`);
                setMusicOn((m) => !m);
                showToast(musicOn ? 'Musique coupée pour toi 🔇' : `🎵 ${perf.melody}`);
              }}
              style={styles.music}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="musical-notes" size={12} color={colors.gold} />
                <Text style={styles.musicText} numberOfLines={1}>
                  {perf.melody ?? 'Sans musique'}
                </Text>
                <Ionicons name={!stageFile ? 'time-outline' : musicOn ? 'volume-high' : 'volume-mute'} size={11} color={colors.text} />
              </View>
              {!!perf.melody && (
                <View style={styles.musicBar}>
                  <View style={[styles.musicFill, { width: `${(1 - ratio) * 100}%` }]} />
                </View>
              )}
            </Pressable>
          )}
        </View>
        {perf && <TimerRing ratio={ratio} urgent={urgent} label={`${mm}:${ss}`} sub={`/ ${fmtDur(perf.duration === 1 ? 1 : 3)}`} />}
      </View>

      {/* vignette de l'hôte pendant un passage */}
      {perf && (
        <View style={[styles.pip, { top: T + 196, overflow: 'hidden' }]} pointerEvents="none">
          {hostCam ? (
            <View style={[styles.pipImg, { overflow: 'hidden' }]}>
              <CameraFeed trackRef={hostCam} mirror={isHost} style={StyleSheet.absoluteFill} />
            </View>
          ) : (
            <Initial name={hostName} size={54} />
          )}
          <View style={styles.cam}>
            <View style={styles.camDot} />
            <Text style={styles.camText}>CAM</Text>
          </View>
          <Text style={styles.pipName} numberOfLines={1}>
            👑 {hostName}
          </Text>
          <Text style={styles.pipRole}>Hôte</Text>
        </View>
      )}

      {/* paroles préparées, façon karaoké, pour tout le monde */}
      {perf && running && !thanks && !!perf.lyrics && (
        <View style={[styles.lyrics, { top: T + 318 }]} pointerEvents="box-none">
          <LyricsPanel lyrics={perf.lyrics} elapsed={total - left} total={total} running={running} slotKey={idOf(perf.uid) + perf.startAt} />
        </View>
      )}

      {/* colonne d'actions */}
      <View style={[styles.actions, { bottom: insets.bottom + 76 }]}>
        <Action icon="arrow-redo" label="Partager" onPress={() => setSheet('share')} />
        {isHost ? (
          <Action
            icon={myMic ? 'mic' : 'mic-off'}
            accent
            label={running ? 'Micro coupé' : myMic ? 'Mon micro' : 'Micro coupé'}
            onPress={() => {
              if (running) return showToast('Ton micro se rallume à la fin du passage');
              setMyMic((m) => !m);
              showToast(myMic ? 'Micro coupé' : 'Micro ouvert');
            }}
          />
        ) : (
          <Action
            icon="mic"
            accent
            label={imOnStage ? 'Sur scène' : mine ? `#${myPos} file` : requested ? 'En attente' : 'Le mic'}
            onPress={() => {
              if (imOnStage) showToast('Tu es sur scène 🎤');
              else if (mine) setFlow('confirm');
              else if (requested) showToast("Ta demande est en attente de l'hôte…");
              else setFlow('request');
            }}
          />
        )}
        {(isHost || imOnStage) && (
          <Action icon={myCam ? 'videocam' : 'videocam-off'} label="Caméra" onPress={() => setMyCam((c) => !c)} />
        )}
        <Action icon="gift" label="Cadeau" color={colors.gold} onPress={() => setSheet('gift')} />
        <Pressable
          onPress={() => {
            tap();
            setSheet('zems');
          }}
          style={styles.actionItem}
        >
          <LinearGradient colors={goldGradient} style={styles.zemsBtn}>
            <Text style={styles.zemsZ}>Z</Text>
          </LinearGradient>
          <Text style={styles.actionLabel}>Zems</Text>
        </Pressable>
      </View>

      {/* chat + saisie */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.bottom} pointerEvents="box-none">
        <View style={styles.chat} pointerEvents="none">
          {msgs.slice(-4).map((m, i, arr) => (
            <View key={m.id} style={[styles.msg, { opacity: Math.max(0.25, 1 - (arr.length - 1 - i) * 0.13) }]}>
              <View style={styles.msgAv}>
                <Initial name={m.user} size={(styles.msgAv as { width: number }).width} />
              </View>
              <Text style={styles.msgText}>
                <Text style={{ color: m.tint, fontWeight: '800' }}>{m.user} </Text>
                {m.text}
              </Text>
            </View>
          ))}
        </View>
        {/* la personne au mic peut finir plus tôt ; l'hôte peut arrêter un passage */}
        {perf && !counting && (imOnStage || isHost) && (
          <Pressable
            onPress={() => {
              tap();
              run(imOnStage ? stage.leave() : stage.endPerf());
            }}
            style={{ alignSelf: 'center', marginBottom: 8 }}
          >
            <LinearGradient colors={goldGradient} style={styles.doneBtn}>
              <Text style={styles.doneText}>{imOnStage ? "🎤 J'ai terminé" : '⏹ Terminer le passage'}</Text>
            </LinearGradient>
          </Pressable>
        )}
        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.input}>
            <TextInput
              ref={input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Écris un message…"
              placeholderTextColor="rgba(255,255,255,0.55)"
              style={styles.inputText}
              onSubmitEditing={send}
              returnKeyType="send"
              selectionColor={colors.gold}
              maxLength={200}
            />
            <Pressable onPress={() => setDraft((d) => d + '😊')} hitSlop={6}>
              <Ionicons name="happy-outline" size={19} color="rgba(255,255,255,0.75)" />
            </Pressable>
          </View>
          <Pressable onPress={send}>
            <LinearGradient colors={goldGradient} style={styles.send}>
              <Ionicons name="send" size={15} color="#1D1405" />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {giftFly && <GiftFly key={giftFly} emoji={giftFly} />}

      {/* fin de passage */}
      {thanks && (
        <FadeIn style={styles.centerOverlay}>
          <View style={styles.thanksCard}>
            <Text style={styles.thanksTitle}>👏 MERCI {thanks.pseudo.toUpperCase()}</Text>
            <Text style={styles.thanksSub}>{thanks.uid === me ? 'Ta performance est terminée.' : 'La performance est terminée.'}</Text>
            <Text style={styles.thanksMeta}>La musique s'estompe · {thanks.uid === me ? 'retour en spectateur' : 'place au suivant'}</Text>
          </View>
        </FadeIn>
      )}

      {/* prochain sur scène + décompte, pour tout le monde */}
      {perf && count !== null && (
        <FadeIn style={[styles.centerOverlay, { backgroundColor: 'rgba(0,0,0,0.82)' }]}>
          <Text style={styles.nextLabel}>{imOnStage ? 'TU PASSES SUR SCÈNE' : 'PROCHAIN SUR SCÈNE'}</Text>
          <Text style={styles.nextName}>{perf.pseudo.toUpperCase()}</Text>
          <Text style={styles.nextTitle}>{perf.title}</Text>
          <Text style={styles.nextMeta}>
            {moodOf(perf.mood ?? 'piano').emoji} {perf.melody ? `${perf.melody} · ` : ''}
            {perf.duration} min
          </Text>
          <CountNumber key={count} value={String(count)} />
          {imOnStage && (
            <View style={styles.countTips}>
              <Text style={styles.countTip}>🎧 Mets tes écouteurs : le micro n'entendra que ta voix</Text>
              <Text style={styles.countTip}>🎤 À zéro, ton micro s'ouvre et tout le monde te voit</Text>
            </View>
          )}
        </FadeIn>
      )}

      {/* tu passes bientôt */}
      {flow === 'notice' && (
        <FadeIn style={[styles.notice, { top: T + 8 }]}>
          <Text style={styles.noticeTitle}>🎤 Tu passes bientôt</Text>
          <Text style={styles.thanksSub}>Tu es le prochain : prépare-toi, l'hôte va te faire monter.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable onPress={() => setFlow(null)} style={{ flex: 1 }}>
              <LinearGradient colors={goldGradient} style={styles.smallCta}>
                <Text style={styles.smallCtaText}>Je suis prêt</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </FadeIn>
      )}

      {/* demande acceptée */}
      {flow === 'confirm' && mine && (
        <BottomCard onClose={() => setFlow(null)}>
          <Text style={styles.cardTitle}>Ta demande a été acceptée 🎉</Text>
          <Text style={styles.cardSub}>
            Tu es <Text style={{ color: colors.gold, fontWeight: '900' }}>#{myPos}</Text> dans la file d'attente.
          </Text>
          <Text style={styles.cardSub}>Passage estimé dans ~{etaMin} min.</Text>
          <View style={styles.mineCard}>
            <Text style={styles.mineTitle}>{mine.title}</Text>
            <Text style={styles.cardSub}>
              ⏱ {mine.duration} min • {moodOf(mine.mood).emoji} {mine.sound ?? moodOf(mine.mood).label}
            </Text>
          </View>
          <Pressable onPress={() => setFlow(null)}>
            <LinearGradient colors={goldGradient} style={styles.bigCta}>
              <Text style={styles.bigCtaText}>Super, je patiente</Text>
            </LinearGradient>
          </Pressable>
        </BottomCard>
      )}

      {toast && (
        <FadeIn style={[styles.toast, { top: T + 96 }]} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </FadeIn>
      )}

      <RequestSheet visible={flow === 'request'} onClose={() => setFlow(null)} onSubmit={submitRequest} />
      <QueueDrawer
        visible={drawer}
        onClose={() => setDrawer(false)}
        hostMode={isHost}
        perf={perfSlot}
        queue={queueSlots}
        requests={isHost ? requestSlots : []}
        mine={mine}
        myPos={myPos}
        etaMin={etaMin}
        onAccept={(s) => {
          const r = stage.requests.find((x) => idOf(x.uid) === s.id);
          if (r) {
            tap();
            run(stage.enqueue(r));
            showToast(`${s.name} entre dans la file 🎉`);
          }
        }}
        onRefuse={(s) => {
          const r = stage.requests.find((x) => idOf(x.uid) === s.id);
          if (r) run(stage.decline(r.uid));
          showToast(`Demande de ${s.name} refusée`);
        }}
        onMove={(i, dir) => {
          const j = i + dir;
          if (j < 0 || j >= stage.queue.length) return;
          const n = [...stage.queue];
          [n[i], n[j]] = [n[j], n[i]];
          run(stage.setQueue(n));
        }}
        onRemove={(s) => {
          run(stage.setQueue(stage.queue.filter((q) => idOf(q.uid) !== s.id)));
          showToast(`${s.name} retiré de la file`);
        }}
        onStartNow={(s) => {
          setDrawer(false);
          startNow(s);
        }}
        onRequest={() => {
          setDrawer(false);
          if (isHost) return showToast('Tu es l’hôte : accepte les demandes des spectateurs');
          setTimeout(() => setFlow('request'), 250);
        }}
        onPrepare={() => {
          setDrawer(false);
          showToast("Tu es prêt ✓ — l'hôte va te faire monter");
        }}
        onSeeAll={() => showToast(`File complète : ${stage.queue.length + requestSlots.length} personnes`)}
      />
      <SlamActionSheet
        kind={sheet}
        onClose={() => setSheet(null)}
        performer={perfName}
        onToast={showToast}
        onQuit={onClose}
        onGift={(g) => {
          tap();
          setSheet(null);
          setGiftFly(g.emoji);
          setTimeout(() => setGiftFly(null), 1800);
          say(`a envoyé ${g.emoji} ${g.name}`);
        }}
        onZems={(a) => {
          tap();
          setSheet(null);
          say(`a envoyé ${a} Zems ✨`);
        }}
      />

      {ended && (
        <View style={endStyles.wrap}>
          <View style={endStyles.card}>
            <Initial name={hostName} size={60} />
            <Text style={endStyles.title}>Le live est terminé</Text>
            <Text style={endStyles.text}>Merci d’être passé·e au Mic d’Or Thérapie de {hostName} !</Text>
            <Pressable onPress={onClose} style={{ alignSelf: 'stretch' }}>
              <LinearGradient colors={goldGradient} style={endStyles.btn}>
                <Text style={endStyles.btnText}>Fermer</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const endStyles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  card: { alignSelf: 'stretch', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  text: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginBottom: 8 },
  btn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.bg, fontWeight: '800', fontSize: 15 },
});
