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
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { EMOJIS, REACTIONS, photoUrl, type ChatMsg, type TableConfig } from './data';
import { seatPoints, tableGeom } from './layout';
import { TableCanvas } from './TableCanvas';
import { SeatBubble } from './SeatBubble';
import { useTableLive, type TableLive } from './useTableLive';
import { useRealTable } from './useRealTable';
import { GiftSheet, QueueSheet, SeatMenuSheet, SpectatorsSheet } from './TableSheets';
import { useSession } from '../lib/session';
import type { OnAirLive } from '../live/onair';
import { Initial } from '../live/LiveViewer';

// Affiché par-dessus l'app, avec une glissade depuis le bas
export function TableScreen({ config, onClose }: { config: TableConfig | null; onClose: () => void }) {
  const slide = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState<TableConfig | null>(config);
  const { height } = useWindowDimensions();

  useEffect(() => {
    if (config) {
      setShown(config);
      Animated.timing(slide, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (shown) {
      Animated.timing(slide, { toValue: 1, duration: 260, useNativeDriver: true }).start(() => setShown(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  if (!shown) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 50, transform: [{ translateY: Animated.multiply(slide, height) }] }]}>
      <TableRoom config={shown} onClose={onClose} />
    </Animated.View>
  );
}

const BUBBLE: Record<number, number> = { 2: 84, 4: 78, 6: 70, 8: 62 };
const INPUT_H = 50;

export function TableRoom({ config, onClose, hostRoom }: { config: TableConfig; onClose: () => void; hostRoom?: string }) {
  const { user } = useSession();
  // live réel dès qu'on est connecté ; sinon (mode test sans compte) la table de démonstration
  return user ? <RealTableRoom config={config} onClose={onClose} hostRoom={hostRoom} /> : <DemoTableRoom config={config} onClose={onClose} />;
}

/** `feed` : aperçu dans le fil d'accueil (seulement la table et ses invités) */
export function DemoTableRoom({
  config,
  onClose,
  host,
  feed,
}: {
  config: TableConfig;
  onClose: () => void;
  host?: { name: string; photo?: string | number };
  feed?: boolean;
}) {
  const live = useTableLive(config, host);
  return <TableView live={live} onClose={onClose} feed={feed} />;
}

function RealTableRoom({ config, onClose, hostRoom }: { config: TableConfig; onClose: () => void; hostRoom?: string }) {
  const live = useRealTable(config, hostRoom);
  return <TableView live={live} onClose={onClose} />;
}

/** Entrer comme spectateur dans la table d'un autre membre (depuis l'accueil) */
export function TableViewer({ live, onClose }: { live: OnAirLive | null; onClose: () => void }) {
  return (
    <Modal visible={!!live} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        {live && <TableRoom key={live.room} config={{ title: live.title, capacity: 6 }} hostRoom={live.room} onClose={onClose} />}
      </SafeAreaProvider>
    </Modal>
  );
}

function TableView({ live, onClose, feed }: { live: TableLive; onClose: () => void; feed?: boolean }) {
  const config = live.config;
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const g = useMemo(() => tableGeom(W, H, insets.top, insets.bottom), [W, H, insets.top, insets.bottom]);
  const points = useMemo(() => seatPoints(g, config.capacity), [g, config.capacity]);

  const [menuSeat, setMenuSeat] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'spectators' | 'queue' | 'gift' | null>(null);
  const [burst, setBurst] = useState<{ key: number; emoji: string } | null>(null);
  const host = live.role === 'host' || live.role === 'demo';

  // place libre : l'hôte ouvre les demandes ; un spectateur demande à s'asseoir
  const onEmptySeat = () => {
    if (host) return setSheet('queue');
    if (live.role === 'viewer') live.request?.();
    else if (live.role === 'requested') live.post({ name: 'Zembo', text: 'Ta demande est en attente de l’hôte…', system: true });
  };
  // bouton main levée
  const onHand = () => {
    if (host) return setSheet('queue');
    if (live.role === 'viewer') live.request?.();
    else if (live.role === 'requested') live.cancelRequest?.();
    else {
      const mine = live.seats.find((x) => x.you);
      if (mine) setMenuSeat(mine.n);
    }
  };
  const handLabel = live.role === 'viewer' ? 'Monter' : live.role === 'requested' ? 'Annuler' : live.role === 'stage' ? 'Ma place' : null;

  return (
    <View style={styles.root}>
      {/* la table, dessinée en natif, prend tout l'écran */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <TableCanvas W={W} H={H} g={g} seats={points.map((p, i) => ({ ...p, occupied: !!live.seats[i]?.name }))} />
      </View>

      {/* titre du jour imprimé sur le feutre, sous le logo */}
      <View pointerEvents="none" style={[styles.feltText, { left: g.cx - g.w * 0.3, width: g.w * 0.6, top: g.cy - g.h * 0.16 + 38 }]}>
        <Text style={styles.wordmark}>Z E M B O</Text>
        <View style={styles.feltRule} />
        <Text style={styles.feltLabel}>TITRE DU JOUR</Text>
        <Text style={styles.feltTitle} numberOfLines={4}>
          {config.title}
        </Text>
        {/* la règle de la table, imprimée sur le feutre plutôt que dans le chat */}
        <Text style={styles.feltRules} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Respect · bienveillance · chacun son tour</Text>
      </View>

      {/* invités autour de la table */}
      {points.map((p, i) => {
        const s = live.seats[i];
        if (!s) return null;
        return (
          <SeatBubble
            key={s.n}
            seat={s}
            p={{ x: p.x, y: p.y, scale: 1, depth: 0 }}
            base={BUBBLE[config.capacity] ?? 70}
            speaking={live.speaking === i && !live.isMuted(s)}
            muted={live.isMuted(s)}
            camera={live.camera?.(s) ?? null}
            onPress={() => (s.name ? setMenuSeat(s.n) : onEmptySeat())}
            onMic={() => (host || s.you ? live.toggleMute(s.n) : setMenuSeat(s.n))}
          />
        );
      })}

      {/* en-tête (masqué dans l'aperçu du fil d'accueil) */}
      {!feed && (
      <LinearGradient colors={['rgba(5,3,2,0.9)', 'rgba(5,3,2,0)']} style={[styles.header, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
        <Pressable onPress={onClose} style={styles.quit} hitSlop={8}>
          <Ionicons name="chevron-down" size={18} color={colors.goldLight} />
          <Text style={styles.quitText}>Quitter</Text>
        </Pressable>
        <View style={styles.titleBox} pointerEvents="none">
          <Text style={styles.title}>ZEMBO TABLE</Text>
          <View style={styles.countRow}>
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Ionicons name="people" size={12} color={colors.gold} />
            <Text style={styles.count}>
              {live.occupied}/{config.capacity}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => setSheet('spectators')} style={styles.headBtn} hitSlop={6}>
          <Ionicons name="eye" size={15} color={colors.goldLight} />
          <Text style={styles.headBtnText}>{live.viewers}</Text>
        </Pressable>
        <Pressable onPress={onHand} style={[styles.headBtn, !handLabel && styles.headBtnRound, live.role === 'requested' && styles.headBtnOn]} hitSlop={6}>
          <Ionicons name={live.role === 'stage' ? 'person' : 'hand-left'} size={16} color={live.role === 'requested' ? colors.bg : colors.goldLight} />
          {!!handLabel && <Text style={[styles.headBtnText, live.role === 'requested' && { color: colors.bg }]}>{handLabel}</Text>}
          {host && live.queue.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{live.queue.length}</Text>
            </View>
          )}
        </Pressable>
      </LinearGradient>
      )}

      {!!live.status && (
        <View style={[styles.statusPill, { top: g.cy + g.h * 0.24 }]} pointerEvents="none">
          <Text style={styles.statusText}>{live.status}</Text>
        </View>
      )}

      {burst && <GiftBurst key={burst.key} emoji={burst.emoji} x={g.cx} y={g.cy} onDone={() => setBurst(null)} />}

      {/* commentaires + saisie, par-dessus le bas de la table */}
      {!feed && <LiveFooter live={live} onGift={() => setSheet('gift')} />}

      <SpectatorsSheet live={live} visible={sheet === 'spectators'} onClose={() => setSheet(null)} />
      <QueueSheet live={live} visible={sheet === 'queue'} onClose={() => setSheet(null)} />
      <GiftSheet live={live} visible={sheet === 'gift'} onClose={() => setSheet(null)} onGift={(emoji) => setBurst({ key: Date.now(), emoji })} />
      <SeatMenuSheet live={live} seatN={menuSeat} onClose={() => setMenuSeat(null)} onQuit={onClose} />

      {live.ended && (
        <View style={styles.endWrap}>
          <View style={styles.endCard}>
            <Text style={styles.endTitle}>La table est terminée</Text>
            <Text style={styles.endText}>L’hôte a fermé sa Zembo Table. Merci d’être passé·e !</Text>
            <Pressable onPress={onClose} style={{ alignSelf: 'stretch' }}>
              <LinearGradient colors={goldGradient} style={styles.endBtn}>
                <Text style={styles.endBtnText}>Fermer</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Bas de l'écran : commentaires qui défilent + barre de saisie ─────────
function LiveFooter({ live, onGift }: { live: TableLive; onGift: () => void }) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [floats, setFloats] = useState<{ id: number; e: string; x: number }[]>([]);
  const recent = useMemo(() => [...live.chat].reverse().slice(0, 30), [live.chat]);

  const send = () => {
    const t = draft.trim();
    if (!t) return;
    live.say(t);
    setDraft('');
    setEmojiOpen(false);
  };
  const react = () => {
    const id = Date.now() + Math.random();
    const e = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
    setFloats((f) => [...f.slice(-12), { id, e, x: Math.random() * 40 - 20 }]);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.footer} pointerEvents="box-none">
      {/* commentaires : les plus récents en bas, les anciens s'effacent vers le haut */}
      <View style={styles.chatBox} pointerEvents="box-none">
        {/* les derniers messages, empilés vers le bas : le plus récent juste au-dessus du champ */}
        {[...recent.slice(0, 8)].reverse().map((m, i, arr) => (
          <ChatLine key={m.id} m={m} fade={Math.max(0.2, 1 - (arr.length - 1 - i) * 0.2)} />
        ))}
      </View>

      {/* réactions qui montent à droite */}
      <View pointerEvents="none" style={styles.floatZone}>
        {floats.map((f) => (
          <FloatEmoji key={f.id} e={f.e} x={f.x} onDone={() => setFloats((all) => all.filter((x) => x.id !== f.id))} />
        ))}
      </View>

      {emojiOpen && (
        <View style={styles.emojiBox}>
          {EMOJIS.map((e) => (
            <Pressable key={e} onPress={() => setDraft((d) => d + e)} style={{ padding: 5 }}>
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 6 }]}>
        <View style={styles.inputBox}>
          <Pressable onPress={() => setEmojiOpen((v) => !v)} hitSlop={6} style={styles.inputIcon}>
            <Ionicons name="happy-outline" size={20} color="rgba(255,255,255,0.75)" />
          </Pressable>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Écris ton message…"
            placeholderTextColor="rgba(255,255,255,0.55)"
            style={styles.input}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          {draft.trim() ? (
            <Pressable onPress={send}>
              <LinearGradient colors={goldGradient} style={styles.sendBtn}>
                <Ionicons name="send" size={14} color={colors.bg} />
              </LinearGradient>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={onGift} style={styles.roundBtn}>
          <LinearGradient colors={goldGradient} style={styles.roundFill}>
            <Ionicons name="gift" size={20} color={colors.bg} />
          </LinearGradient>
        </Pressable>
        <Pressable onPress={react} style={styles.roundBtn}>
          <View style={[styles.roundFill, styles.roundDark]}>
            <Ionicons name="heart" size={20} color={colors.gold} />
          </View>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function ChatLine({ m, fade }: { m: ChatMsg; fade: number }) {
  if (m.system) {
    return (
      <View style={[styles.sysLine, { opacity: fade }]}>
        <Text style={styles.sysText}>
          {m.name !== 'Zembo' && <Text style={{ fontWeight: '800' }}>{m.name} </Text>}
          {m.text}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.line, m.gift && styles.lineGift, { opacity: fade }]}>
      {m.real ? (
        <View style={styles.lineAvatar}>
          <Initial name={m.name} size={22} />
        </View>
      ) : (
        <Image source={photoUrl(m.name, 64)} style={styles.lineAvatar} />
      )}
      <Text style={styles.lineText}>
        <Text style={[styles.lineName, !m.real && m.name === 'Deena' && { color: colors.goldLight }]}>{m.name} </Text>
        {m.text}
      </Text>
    </View>
  );
}

function FloatEmoji({ e, x, onDone }: { e: string; x: number; onDone: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(onDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.Text
      style={{
        position: 'absolute',
        bottom: 0,
        fontSize: 26,
        opacity: a.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
        transform: [
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, -260] }) },
          { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
          { scale: a.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.5, 1.15, 1.25] }) },
        ],
      }}
    >
      {e}
    </Animated.Text>
  );
}

// Cadeau qui apparaît en grand au-dessus de la table
function GiftBurst({ emoji, x, y, onDone }: { emoji: string; x: number; y: number; onDone: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(a, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.delay(700),
      Animated.timing(a, { toValue: 2, duration: 450, useNativeDriver: true }),
    ]).start(onDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.Text
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - 70,
        top: y - 80,
        width: 140,
        textAlign: 'center',
        fontSize: 110,
        textShadowColor: '#D4AF37',
        textShadowRadius: 26,
        opacity: a.interpolate({ inputRange: [0, 0.2, 1, 2], outputRange: [0, 1, 1, 0] }),
        transform: [
          { scale: a.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.5] }) },
          { translateY: a.interpolate({ inputRange: [0, 1, 2], outputRange: [20, 0, -40] }) },
        ],
      }}
    >
      {emoji}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  headBtnOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  statusPill: { position: 'absolute', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5 },
  statusText: { color: colors.goldLight, fontSize: 12, fontWeight: '700' },
  endWrap: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 30, zIndex: 20 },
  endCard: { alignSelf: 'stretch', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24 },
  endTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  endText: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginBottom: 8 },
  endBtn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  endBtnText: { color: colors.bg, fontWeight: '800', fontSize: 15 },
  root: { flex: 1, backgroundColor: '#050302' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 16, gap: 8 },
  quit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.55)',
    borderRadius: 16,
    paddingHorizontal: 9,
    height: 32,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  quitText: { color: colors.goldLight, fontSize: 12, fontWeight: '700' },
  titleBox: { flex: 1, alignItems: 'center' },
  title: { color: colors.white, fontSize: 15, fontWeight: '900', letterSpacing: 1.5 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  liveBadge: { backgroundColor: '#E5533D', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginRight: 4 },
  liveText: { color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  count: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  headBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.55)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  headBtnRound: { width: 32, paddingHorizontal: 0, justifyContent: 'center' },
  headBtnText: { color: colors.goldLight, fontSize: 12, fontWeight: '800' },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 3,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#050302',
  },
  badgeText: { color: colors.bg, fontSize: 9.5, fontWeight: '900' },
  feltText: { position: 'absolute', alignItems: 'center' },
  wordmark: { color: '#f0c95a', fontSize: 15, fontWeight: '900', letterSpacing: 2 },
  feltRule: { width: 46, height: 1, backgroundColor: 'rgba(212,175,55,0.6)', marginVertical: 7 },
  feltLabel: { color: 'rgba(212,175,55,0.8)', fontSize: 8.5, fontWeight: '800', letterSpacing: 2.2, marginBottom: 4 },
  feltRules: { color: 'rgba(212,175,55,0.75)', fontSize: 9.5, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  feltTitle: { color: 'rgba(247,236,205,0.95)', fontSize: 16, fontWeight: '800', textAlign: 'center', lineHeight: 21 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  // les messages s'arrêtent net au-dessus du champ (rien ne passe dessous)
  chatBox: { height: 150, width: '78%', paddingLeft: 10, marginBottom: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    gap: 6,
    maxWidth: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 10,
    marginTop: 4,
  },
  lineGift: { backgroundColor: 'rgba(212,175,55,0.3)', borderWidth: 1, borderColor: 'rgba(243,210,122,0.7)' },
  lineAvatar: { width: 22, height: 22, borderRadius: 11, marginTop: 1 },
  lineName: { color: 'rgba(243,210,122,0.95)', fontWeight: '800' },
  lineText: { color: colors.white, fontSize: 13.5, lineHeight: 18, flexShrink: 1 },
  sysLine: { alignSelf: 'flex-start', backgroundColor: 'rgba(212,175,55,0.16)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, marginTop: 4 },
  sysText: { color: colors.goldLight, fontSize: 12.5, lineHeight: 17 },
  floatZone: { position: 'absolute', right: 30, bottom: INPUT_H + 60, width: 30, height: 1 },
  emojiBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 10,
    marginTop: 6,
    padding: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(20,16,10,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingTop: 8, backgroundColor: 'rgba(5,3,2,0.92)' },
  inputBox: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 4,
  },
  inputIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, color: colors.white, fontSize: 14 },
  sendBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  roundBtn: { width: 44, height: 44 },
  roundFill: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  roundDark: { backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.45)' },
});
