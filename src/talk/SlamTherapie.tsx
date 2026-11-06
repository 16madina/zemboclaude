import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { AUTO, CHAT0, QUEUE0, REQUESTS0, SLAM_STAGE, STAGE0, TINTS, avatarOf, fmtDur, moodOf, type SlamMsg, type Slot } from './slamData';
import { LyricsPanel } from './LyricsPanel';
import { useSession } from '../lib/session';
import { SlamReal } from './SlamReal';
import { melodyFile } from './melodies';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { MAGENTA, QueueDrawer, RequestSheet, SlamActionSheet, tap, type SlamRequest, type SlamSheetKind } from './SlamSheets';

// Mic d'Or Thérapie (ex-Slam Thérapie) : la scène ouverte en direct (reprise de zembolounge)
export function SlamTherapie({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const y = useRef(new Animated.Value(height)).current;
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(y, {
      toValue: open ? 0 : height,
      duration: open ? 380 : 280,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => finished && !open && setMounted(false));
  }, [open, height, y]);
  const { user } = useSession();
  if (!mounted) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 55, backgroundColor: '#000', transform: [{ translateY: y }] }]}>
      {/* live réel dès qu'on est connecté ; sinon (mode test sans compte) la démonstration */}
      {user ? <SlamReal onClose={onClose} /> : <SlamLive onClose={onClose} />}
    </Animated.View>
  );
}

// décompte avant chaque passage : à 0, chrono + mélodie + micro + paroles démarrent ensemble
export const COUNTDOWN = 10;

type Heart = { id: number; x: number; y: number; v: Animated.Value };

export function SlamLive({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const T = insets.top;

  // ── scène & file ──
  const [perf, setPerf] = useState<Slot>(STAGE0);
  const [left, setLeft] = useState(167);
  const [running, setRunning] = useState(true);
  const [queue, setQueue] = useState<Slot[]>(QUEUE0);
  const [requests, setRequests] = useState<Slot[]>(REQUESTS0);
  const [thanks, setThanks] = useState<Slot | null>(null);
  const [nextUp, setNextUp] = useState<Slot | null>(null);
  const [count, setCount] = useState<number | null>(null);
  // ── mon parcours ──
  const [flow, setFlow] = useState<'request' | 'confirm' | 'notice' | 'backstage' | null>(null);
  const [mine, setMine] = useState<Slot | null>(null);
  const [noticed, setNoticed] = useState(false);
  const [hostMode, setHostMode] = useState(true);
  // ── live ──
  const [msgs, setMsgs] = useState<SlamMsg[]>(CHAT0);
  const [draft, setDraft] = useState('');
  const [hearts, setHearts] = useState<Heart[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState<SlamSheetKind>(null);
  const [giftFly, setGiftFly] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const seq = useRef(100);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const perfRef = useRef(perf);
  perfRef.current = perf;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const showToast = (t: string) => {
    setToast(t);
    later(() => setToast((x) => (x === t ? null : x)), 2000);
  };
  const push = (user: string, text: string, me = false) => {
    seq.current += 1;
    const id = seq.current;
    setMsgs((m) => [...m.slice(-20), { id, user, text, tint: me ? colors.gold : TINTS[id % TINTS.length], me }]);
  };

  // commentaires automatiques des spectateurs
  useEffect(() => {
    let last = -1;
    const t = setInterval(() => {
      // jamais deux fois le même commentaire d'affilée
      let k = Math.floor(Math.random() * (AUTO.length - 1));
      if (k >= last) k += 1;
      last = k;
      const [u, txt] = AUTO[k];
      push(u, txt);
    }, 3400);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // chrono de la performance
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);

  // fin de performance : merci → prochain passage
  const finish = () => {
    setThanks(perfRef.current);
    later(() => {
      setThanks(null);
      const q = queueRef.current;
      if (q.length) {
        setQueue(q.slice(1));
        setNextUp(q[0]);
        setCount(COUNTDOWN);
      } else {
        setPerf(STAGE0);
        setLeft(STAGE0.duration * 60);
        setRunning(true);
      }
    }, 2600);
  };
  useEffect(() => {
    if (running && left === 0) {
      setRunning(false);
      finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, running]);

  // décompte 3 · 2 · 1 puis démarrage du chrono et de la musique
  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      const s = nextUp;
      const t = setTimeout(() => {
        if (s) {
          setPerf(s);
          setLeft(s.duration * 60);
          setRunning(true);
          if (s.me) {
            setMine(null);
            setNoticed(false);
          }
        }
        setNextUp(null);
        setCount(null);
      }, 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [count, nextUp]);

  const myPos = mine ? queue.findIndex((q) => q.id === mine.id) + 1 : 0;
  const etaMin = mine ? Math.max(1, Math.round(left / 60) + queue.slice(0, Math.max(0, myPos - 1)).reduce((a, q) => a + q.duration, 0)) : 0;

  // « Tu passes bientôt » quand je suis le prochain
  useEffect(() => {
    if (mine && myPos === 1 && !noticed && flow === null && !nextUp) {
      setNoticed(true);
      setFlow('notice');
    }
  }, [mine, myPos, noticed, flow, nextUp]);

  const startNow = (s: Slot) => {
    tap();
    setRunning(false);
    setQueue((q) => q.filter((x) => x.id !== s.id));
    setNextUp(s);
    setCount(COUNTDOWN);
  };
  const accept = (s: Slot) => {
    tap();
    setRequests((r) => r.filter((x) => x.id !== s.id));
    setQueue((q) => [...q, s]);
    showToast(`${s.name} entre dans la file 🎉`);
  };
  const refuse = (s: Slot) => {
    tap();
    setRequests((r) => r.filter((x) => x.id !== s.id));
    showToast(`Demande de ${s.name} refusée`);
  };
  const move = (i: number, dir: -1 | 1) => {
    setQueue((q) => {
      const j = i + dir;
      if (j < 0 || j >= q.length) return q;
      const n = [...q];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };
  const remove = (s: Slot) => {
    setQueue((q) => q.filter((x) => x.id !== s.id));
    if (s.me) setMine(null);
    showToast(`${s.name} retiré de la file`);
  };
  const submitRequest = (r: SlamRequest) => {
    seq.current += 1;
    const slot: Slot = { id: 900 + seq.current, name: 'Deena', title: r.title, mood: r.mood, sound: r.sound?.name ?? null, duration: r.duration, me: true, lyrics: r.lyrics };
    setRequests((q) => [slot, ...q]);
    setFlow(null);
    showToast("Demande envoyée à l'hôte…");
    // démo : l'hôte accepte après un court délai
    later(() => {
      setRequests((q) => q.filter((x) => x.id !== slot.id));
      setQueue((q) => [...q, slot]);
      setMine(slot);
      setFlow('confirm');
    }, 1800);
  };

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    tap();
    push('Deena', t, true);
    setDraft('');
  };

  // toucher la scène = j'aime (cœurs qui s'envolent)
  const likeAt = (x: number, y: number) => {
    const h: Heart = { id: Date.now() + Math.random(), x, y, v: new Animated.Value(0) };
    setHearts((hs) => [...hs.slice(-12), h]);
    Animated.timing(h.v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() =>
      setHearts((hs) => hs.filter((k) => k.id !== h.id)),
    );
  };
  const onSceneTap = (e: GestureResponderEvent) => {
    tap();
    likeAt(e.nativeEvent.locationX, e.nativeEvent.locationY);
  };

  // mélodie du passage en cours (jouée en boucle pendant que la personne est au mic)
  const stageFile = melodyFile(perf.sound, perf.duration);
  const [musicOn, setMusicOn] = useState(true);
  const stage = useAudioPlayer(null);
  const stageFileRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);
  useEffect(() => {
    // pas de musique pendant le « merci », le décompte ou quand on écoute un aperçu
    const shouldPlay = !!stageFile && musicOn && running && !thanks && !nextUp && flow !== 'request';
    try {
      if (stageFileRef.current !== stageFile) {
        stageFileRef.current = stageFile;
        if (stageFile) {
          stage.replace(stageFile);
          stage.loop = true;
          stage.volume = 0.55;
        }
      }
      if (shouldPlay) stage.play();
      else stage.pause();
    } catch {}
  }, [stage, stageFile, musicOn, running, thanks, nextUp, flow]);

  const total = perf.duration * 60;
  const ratio = left / total;
  const urgent = left <= 10;
  const imOnStage = perf.me === true;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');

  return (
    <View style={{ flex: 1 }}>
      {/* décor plein écran */}
      <Image source={SLAM_STAGE} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" />
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
          <Text style={styles.pillText}>1.2K</Text>
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
          <Text style={styles.queueText}>File d'attente ({queue.length})</Text>
          {hostMode && requests.length > 0 && (
            <View style={styles.reqBadge}>
              <Text style={styles.reqBadgeText}>{requests.length}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* sur scène + chrono */}
      <View style={[styles.stageRow, { top: T + 92 }]} pointerEvents="box-none">
        <View style={{ flex: 1 }}>
          <View style={styles.onStage}>
            <Text style={styles.onStageText}>🎤 SUR SCÈNE</Text>
          </View>
          <Text style={styles.perfName}>{perf.name}</Text>
          <Text style={styles.perfTitle} numberOfLines={1}>
            {perf.title}
          </Text>
          <Pressable
            onPress={() => {
              tap();
              if (!perf.sound) return showToast('Sans musique — a cappella');
              if (!stageFile) return showToast(`🎵 ${perf.sound} — morceau bientôt disponible`);
              setMusicOn((m) => !m);
              showToast(musicOn ? 'Musique coupée pour toi 🔇' : `🎵 ${perf.sound}`);
            }}
            style={styles.music}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="musical-notes" size={12} color={colors.gold} />
              <Text style={styles.musicText} numberOfLines={1}>
                {perf.sound ?? 'Sans musique'}
              </Text>
              <Ionicons name={!stageFile ? 'time-outline' : musicOn ? 'volume-high' : 'volume-mute'} size={11} color={colors.text} />
            </View>
            {perf.sound && (
              <View style={styles.musicBar}>
                <View style={[styles.musicFill, { width: `${(1 - ratio) * 100}%` }]} />
              </View>
            )}
          </Pressable>
        </View>
        <TimerRing ratio={ratio} urgent={urgent} label={`${mm}:${ss}`} sub={`/ ${fmtDur(perf.duration)}`} />
      </View>

      {/* vignette de l'hôte (caméra) */}
      <View style={[styles.pip, { top: T + 196 }]} pointerEvents="none">
        <Image source={avatarOf('Deena', 160)} style={styles.pipImg} />
        <View style={styles.cam}>
          <View style={styles.camDot} />
          <Text style={styles.camText}>CAM</Text>
        </View>
        <Text style={styles.pipName}>👑 Deena</Text>
        <Text style={styles.pipRole}>Hôte</Text>
      </View>

      {/* Mode Paroles : le texte de la personne au mic, à l'écran, façon karaoké */}
      {!thanks && !nextUp && (
        <View style={[styles.lyrics, { top: T + 318 }]} pointerEvents="box-none">
          <LyricsPanel lyrics={perf.lyrics} elapsed={total - left} total={total} running={running} slotKey={perf.id} />
        </View>
      )}

      {/* colonne d'actions */}
      <View style={[styles.actions, { bottom: insets.bottom + 76 }]}>
        <Action icon="arrow-redo" label="Partager" onPress={() => setSheet('share')} />
        {/* demander le mic directement, sans passer par la file */}
        <Action
          icon="mic"
          accent
          label={imOnStage ? 'Sur scène' : mine ? `#${myPos || 1} file` : requests.some((r) => r.me) ? 'En attente' : 'Le mic'}
          onPress={() => {
            if (imOnStage) showToast('Tu es sur scène 🎤');
            else if (mine) setFlow('confirm');
            else if (requests.some((r) => r.me)) showToast("Ta demande est en attente de l'hôte…");
            else setFlow('request');
          }}
        />
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
              <Image source={avatarOf(m.user, 60)} style={[styles.msgAv, m.me && { borderColor: colors.gold, borderWidth: 1.5 }]} />
              <Text style={styles.msgText}>
                <Text style={{ color: m.tint, fontWeight: '800' }}>{m.user} </Text>
                {m.text}
              </Text>
            </View>
          ))}
        </View>
        {imOnStage && running && (
          <Pressable
            onPress={() => {
              tap();
              setRunning(false);
              finish();
            }}
            style={{ alignSelf: 'center', marginBottom: 8 }}
          >
            <LinearGradient colors={goldGradient} style={styles.doneBtn}>
              <Text style={styles.doneText}>🎤 J'ai terminé</Text>
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

      {/* cadeau qui s'envole */}
      {giftFly && <GiftFly key={giftFly + seq.current} emoji={giftFly} />}

      {/* fin de performance */}
      {thanks && (
        <FadeIn style={styles.centerOverlay}>
          <View style={styles.thanksCard}>
            <Text style={styles.thanksTitle}>👏 MERCI {thanks.name.toUpperCase()}</Text>
            <Text style={styles.thanksSub}>Ta performance est terminée.</Text>
            <Text style={styles.thanksMeta}>La musique s'estompe · retour en spectateur</Text>
          </View>
        </FadeIn>
      )}

      {/* prochain sur scène + décompte */}
      {nextUp && count !== null && (
        <FadeIn style={[styles.centerOverlay, { backgroundColor: 'rgba(0,0,0,0.82)' }]}>
          <Text style={styles.nextLabel}>PROCHAIN SUR SCÈNE</Text>
          <Text style={styles.nextName}>{nextUp.name.toUpperCase()}</Text>
          <Text style={styles.nextTitle}>{nextUp.title}</Text>
          <Text style={styles.nextMeta}>
            {moodOf(nextUp.mood).emoji} {nextUp.sound ? `${nextUp.sound} · ` : ''}
            {nextUp.duration} min
          </Text>
          <CountNumber key={count} value={count === 0 ? '🎤' : String(count)} />
          {count > 0 ? (
            <View style={styles.countTips}>
              <Text style={styles.countTip}>🎧 Mets tes écouteurs : le micro n'entendra que ta voix</Text>
              <Text style={styles.countTip}>📝 À zéro, tes paroles s'écrivent à l'écran</Text>
            </View>
          ) : (
            <Text style={styles.nextMeta}>Chrono · mélodie · micro · paroles lancés ✓</Text>
          )}
        </FadeIn>
      )}

      {/* tu passes bientôt */}
      {flow === 'notice' && (
        <FadeIn style={[styles.notice, { top: T + 8 }]}>
          <Text style={styles.noticeTitle}>🎤 Tu passes bientôt</Text>
          <Text style={styles.thanksSub}>Ta performance commence dans ~1 minute.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable onPress={() => setFlow('backstage')} style={{ flex: 1 }}>
              <LinearGradient colors={goldGradient} style={styles.smallCta}>
                <Text style={styles.smallCtaText}>Préparer ma performance</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => setFlow(null)} style={[styles.smallCta, styles.ghost]}>
              <Text style={styles.ghostText}>Plus tard</Text>
            </Pressable>
          </View>
        </FadeIn>
      )}

      {/* backstage privé */}
      {flow === 'backstage' && (
        <BottomCard onClose={() => setFlow(null)}>
          <Text style={styles.backLabel}>BACKSTAGE PRIVÉ</Text>
          <Text style={styles.cardTitle}>Tu es le prochain !</Text>
          <Text style={styles.cardSub}>
            Passage dans <Text style={{ color: colors.gold, fontWeight: '900' }}>00:30</Text> — personne ne te voit ni ne t'entend pour l'instant.
          </Text>
          {[
            { icon: 'mic' as const, label: 'Micro prêt' },
            { icon: 'videocam' as const, label: 'Caméra prête' },
            { icon: 'musical-notes' as const, label: mine?.sound ? `${mine.sound} — ${moodOf(mine.mood).label}` : 'Sans musique' },
          ].map((c) => (
            <View key={c.label} style={styles.checkRow}>
              <Ionicons name={c.icon} size={15} color={colors.gold} />
              <Text style={styles.checkText}>{c.label}</Text>
              <Ionicons name="checkmark-circle" size={17} color="#58D68D" />
            </View>
          ))}
          <Text style={styles.cardNote}>Ta caméra ne s'allumera qu'après ta confirmation. Sans confirmation, l'hôte passe au suivant.</Text>
          <Pressable
            onPress={() => {
              setFlow(null);
              showToast("Tu es prêt ✓ — l'hôte va te faire monter");
              if (mine) startNow(mine);
            }}
          >
            <LinearGradient colors={goldGradient} style={styles.bigCta}>
              <Text style={styles.bigCtaText}>JE SUIS PRÊT</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => setFlow(null)} style={styles.closeLink}>
            <Text style={styles.ghostText}>Fermer</Text>
          </Pressable>
        </BottomCard>
      )}

      {/* demande acceptée */}
      {flow === 'confirm' && mine && (
        <BottomCard onClose={() => setFlow(null)}>
          <Text style={styles.cardTitle}>Ta demande a été acceptée 🎉</Text>
          <Text style={styles.cardSub}>
            Tu es <Text style={{ color: colors.gold, fontWeight: '900' }}>#{myPos || 1}</Text> dans la file d'attente.
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
          <Pressable onPress={() => setFlow('backstage')} style={styles.closeLink}>
            <Text style={[styles.ghostText, { color: colors.gold }]}>Préparer ma performance</Text>
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
        hostMode={hostMode}
        onToggleHost={() => setHostMode((h) => !h)}
        perf={perf}
        queue={queue}
        requests={requests}
        mine={mine}
        myPos={myPos}
        etaMin={etaMin}
        onAccept={accept}
        onRefuse={refuse}
        onMove={move}
        onRemove={remove}
        onStartNow={(s) => {
          setDrawer(false);
          startNow(s);
        }}
        onRequest={() => {
          setDrawer(false);
          // attendre que le tiroir soit fermé : iOS n'ouvre pas une fenêtre pendant qu'une autre se ferme
          setTimeout(() => setFlow('request'), 250);
        }}
        onPrepare={() => {
          setDrawer(false);
          setFlow('backstage');
        }}
        onSeeAll={() => showToast(`File complète : ${queue.length + requests.length} personnes`)}
      />
      <SlamActionSheet
        kind={sheet}
        onClose={() => setSheet(null)}
        performer={perf.name}
        onToast={showToast}
        onQuit={onClose}
        onGift={(g) => {
          tap();
          setSheet(null);
          setGiftFly(g.emoji);
          later(() => setGiftFly(null), 1800);
          push('Deena', `a envoyé ${g.emoji} ${g.name}`, true);
          showToast(`${g.name} envoyé · ${g.cost} Zems`);
        }}
        onZems={(a) => {
          tap();
          setSheet(null);
          push('Deena', `a envoyé ${a} Zems ✨`, true);
          showToast(`${a} Zems envoyés à ${perf.name} ✨`);
        }}
      />
    </View>
  );
}

// Chrono circulaire (dessiné en natif)
export function TimerRing({ ratio, urgent, label, sub }: { ratio: number; urgent: boolean; label: string; sub: string }) {
  const size = 84;
  const circle = useMemo(() => {
    // cercle qui part du haut, dans le sens des aiguilles d'une montre
    const c = size / 2;
    const r = 36;
    return Skia.Path.MakeFromSVGString(`M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r} Z`)!;
  }, []);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={circle} color="rgba(0,0,0,0.55)" />
        <Path path={circle} style="stroke" strokeWidth={6} color="rgba(255,255,255,0.16)" />
        <Path path={circle} style="stroke" strokeWidth={6} strokeCap="round" color={urgent ? '#E5533D' : '#F3D27A'} start={0} end={Math.max(0.001, ratio)} />
      </Canvas>
      <Text style={[styles.timer, urgent && { color: '#FF7A6B', fontSize: 19 }]}>{label}</Text>
      <Text style={styles.timerSub}>{sub}</Text>
    </View>
  );
}

export function Action({
  icon,
  label,
  onPress,
  color = colors.white,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color?: string;
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={styles.actionItem}
    >
      <View style={[styles.actionBtn, accent && styles.actionAccent]}>
        <Ionicons name={icon} size={21} color={accent ? colors.white : color} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

export function FadeIn({ style, children, pointerEvents }: { style: object; children: React.ReactNode; pointerEvents?: 'none' | 'auto' }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
      {children}
    </Animated.View>
  );
}

export function CountNumber({ value }: { value: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start();
  }, [v]);
  return (
    <Animated.Text style={[styles.count, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [2, 1] }) }] }]}>{value}</Animated.Text>
  );
}

export function GiftFly({ emoji }: { emoji: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 1700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.Text
      pointerEvents="none"
      style={{
        position: 'absolute',
        alignSelf: 'center',
        top: '45%',
        fontSize: 90,
        opacity: v.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [80, -160] }) },
          { scale: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.3, 1] }) },
        ],
      }}
    >
      {emoji}
    </Animated.Text>
  );
}

export function BottomCard({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', opacity: v }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.bottomCard,
          { paddingBottom: insets.bottom + 14, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }) }] },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export const slamStyles = StyleSheet.create({
  shade: { position: 'absolute', left: 0, right: 0 },
  lyrics: { position: 'absolute', left: 12, right: 84 },
  header: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  zIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  zText: { color: '#1D1405', fontSize: 17, fontWeight: '900' },
  brand: { color: colors.white, fontSize: 16, fontWeight: '900' },
  tagline: { color: '#FF7BA6', fontSize: 8.5, fontWeight: '900', letterSpacing: 1.4 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: '#E5334B' },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.white },
  liveText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)' },
  pillText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  round: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  row2: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  queueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  queueText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  reqBadge: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: MAGENTA, alignItems: 'center', justifyContent: 'center' },
  reqBadgeText: { color: colors.white, fontSize: 9.5, fontWeight: '900' },
  stageRow: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  onStage: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: MAGENTA },
  onStageText: { color: colors.white, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  perfName: { color: colors.white, fontSize: 26, fontWeight: '900', marginTop: 4, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  perfTitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13.5, fontWeight: '600', fontStyle: 'italic' },
  music: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', maxWidth: 220 },
  musicText: { color: colors.text, fontSize: 12, fontWeight: '700', maxWidth: 150 },
  musicBar: { height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 6, overflow: 'hidden' },
  musicFill: { height: 2.5, backgroundColor: colors.gold },
  timer: { color: colors.white, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  timerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 9.5, fontWeight: '700', marginTop: 1 },
  pip: {
    position: 'absolute',
    right: 12,
    width: 84,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  pipImg: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: colors.gold },
  cam: { position: 'absolute', top: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  camDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E5334B' },
  camText: { color: colors.white, fontSize: 8, fontWeight: '900' },
  pipName: { color: colors.goldLight, fontSize: 11, fontWeight: '900', marginTop: 4 },
  pipRole: { color: colors.textDim, fontSize: 9.5 },
  actions: { position: 'absolute', right: 10, alignItems: 'center', gap: 12 },
  actionItem: { alignItems: 'center' },
  actionBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  actionAccent: { backgroundColor: MAGENTA, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)', shadowColor: MAGENTA, shadowOpacity: 0.7, shadowRadius: 10 },
  actionLabel: { color: colors.white, fontSize: 10.5, fontWeight: '800', marginTop: 3, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3 },
  zemsBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  zemsZ: { color: '#1D1405', fontSize: 20, fontWeight: '900' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  chat: { width: '74%', paddingLeft: 12, gap: 6, marginBottom: 10 },
  msg: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  msgAv: { width: 22, height: 22, borderRadius: 11 },
  msgText: { flex: 1, color: colors.white, fontSize: 13, lineHeight: 18, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  doneBtn: { paddingHorizontal: 22, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#1D1405', fontSize: 15, fontWeight: '900' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  input: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  inputText: { flex: 1, color: colors.white, fontSize: 14.5, paddingVertical: 0 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  centerOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  thanksCard: {
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingVertical: 22,
    borderRadius: 22,
    backgroundColor: 'rgba(15,11,7,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.5)',
  },
  thanksTitle: { color: colors.goldLight, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  thanksSub: { color: colors.text, fontSize: 14, marginTop: 6, textAlign: 'center' },
  thanksMeta: { color: colors.textDim, fontSize: 12, marginTop: 4 },
  nextLabel: { color: '#FF7BA6', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  nextName: { color: colors.white, fontSize: 38, fontWeight: '900', marginTop: 6 },
  nextTitle: { color: colors.text, fontSize: 16, fontStyle: 'italic', marginTop: 2, textAlign: 'center' },
  nextMeta: { color: colors.textDim, fontSize: 13, marginTop: 6 },
  countTips: { marginTop: 14, gap: 8, alignItems: 'center', maxWidth: 290 },
  countTip: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  count: { color: colors.goldLight, fontSize: 96, fontWeight: '900', marginTop: 10, textShadowColor: 'rgba(212,175,55,0.7)', textShadowRadius: 20 },
  notice: {
    position: 'absolute',
    left: 12,
    right: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(15,11,7,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(224,69,123,0.6)',
  },
  noticeTitle: { color: colors.white, fontSize: 16, fontWeight: '900' },
  smallCta: { height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  smallCtaText: { color: '#1D1405', fontSize: 13, fontWeight: '900' },
  ghost: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  ghostText: { color: colors.textDim, fontSize: 13.5, fontWeight: '800' },
  bottomCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#15100B',
    borderTopWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  backLabel: { color: '#FF7BA6', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  cardTitle: { color: colors.white, fontSize: 21, fontWeight: '900', marginTop: 4 },
  cardSub: { color: colors.textDim, fontSize: 13.5, marginTop: 4, lineHeight: 19 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', marginTop: 8 },
  checkText: { flex: 1, color: colors.text, fontSize: 13.5, fontWeight: '700' },
  cardNote: { color: colors.textFaint, fontSize: 11.5, marginTop: 12, marginBottom: 14, lineHeight: 16 },
  bigCta: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  bigCtaText: { color: '#1D1405', fontSize: 15.5, fontWeight: '900' },
  closeLink: { alignItems: 'center', paddingVertical: 12 },
  mineCard: { padding: 12, borderRadius: 14, backgroundColor: 'rgba(212,175,55,0.1)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)', marginTop: 12, marginBottom: 14 },
  mineTitle: { color: colors.white, fontSize: 15, fontWeight: '900' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(15,11,7,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  toastText: { color: colors.text, fontSize: 13, fontWeight: '700' },
});
const styles = slamStyles;
