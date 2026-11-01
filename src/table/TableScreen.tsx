import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { EMOJIS, REACTIONS, photoUrl, type ChatMsg, type TableConfig } from './data';
import { seatPoints, tableGeom } from './layout';
import { TableCanvas } from './TableCanvas';
import { SeatBubble } from './SeatBubble';
import { useTableLive, type TableLive } from './useTableLive';
import { GiftSheet, QueueSheet, SeatMenuSheet, SpectatorsSheet } from './TableSheets';

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

function TableRoom({ config, onClose }: { config: TableConfig; onClose: () => void }) {
  const live = useTableLive(config);
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const g = useMemo(() => tableGeom(W, H, insets.top, insets.bottom), [W, H, insets.top, insets.bottom]);
  const points = useMemo(() => seatPoints(g, config.capacity), [g, config.capacity]);

  const [menuSeat, setMenuSeat] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'spectators' | 'queue' | 'gift' | null>(null);
  const [burst, setBurst] = useState<{ key: number; emoji: string } | null>(null);

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
            base={BUBBLE[config.capacity]}
            speaking={live.speaking === i && !live.isMuted(s)}
            muted={live.isMuted(s)}
            onPress={() => (s.name ? setMenuSeat(s.n) : setSheet('queue'))}
            onMic={() => live.toggleMute(s.n)}
          />
        );
      })}

      {/* en-tête */}
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
        <Pressable onPress={() => setSheet('queue')} style={[styles.headBtn, styles.headBtnRound]} hitSlop={6}>
          <Ionicons name="hand-left" size={16} color={colors.goldLight} />
          {live.queue.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{live.queue.length}</Text>
            </View>
          )}
        </Pressable>
      </LinearGradient>

      {burst && <GiftBurst key={burst.key} emoji={burst.emoji} x={g.cx} y={g.cy} onDone={() => setBurst(null)} />}

      {/* commentaires + saisie, par-dessus le bas de la table */}
      <LiveFooter live={live} onGift={() => setSheet('gift')} />

      <SpectatorsSheet live={live} visible={sheet === 'spectators'} onClose={() => setSheet(null)} />
      <QueueSheet live={live} visible={sheet === 'queue'} onClose={() => setSheet(null)} />
      <GiftSheet live={live} visible={sheet === 'gift'} onClose={() => setSheet(null)} onGift={(emoji) => setBurst({ key: Date.now(), emoji })} />
      <SeatMenuSheet live={live} seatN={menuSeat} onClose={() => setMenuSeat(null)} onQuit={onClose} />
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
        <FlatList
          inverted
          data={recent}
          keyExtractor={(m) => m.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 4 }}
          renderItem={({ item, index }) => <ChatLine m={item} fade={Math.max(0.2, 1 - index * 0.2)} />}
        />
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
      <Image source={photoUrl(m.name, 64)} style={styles.lineAvatar} />
      <Text style={styles.lineText}>
        <Text style={[styles.lineName, m.name === 'Deena' && { color: colors.goldLight }]}>{m.name} </Text>
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
  feltTitle: { color: 'rgba(247,236,205,0.95)', fontSize: 16, fontWeight: '800', textAlign: 'center', lineHeight: 21 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  chatBox: { height: 150, width: '78%', paddingLeft: 10 },
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
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingTop: 8 },
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
