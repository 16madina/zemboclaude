import { forwardRef, useEffect, useRef, useState } from 'react';
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
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { DEENA_PHOTO } from '../table/data';

// Briques communes aux lives du Talk Show (Micro Ouvert)

export const tap = () => void Haptics.selectionAsync().catch(() => {});
export const TINTS = ['#E9C46A', '#C9A0F0', '#7FD8A8', '#8DB8F2', '#F28DB2'];

// Photos des personnes (homme/femme cohérent avec le prénom)
const FACES: Record<string, number> = {
  Sarah: 9, Lina: 20, Aïssatou: 47, Fatou: 41, Nadia: 38, Leïla: 31, QueenVee: 23, Emma: 25, Sophie: 44, Noura: 29,
  Mariam: 45, Awa: 49, Chloé: 26, Bintou: 32,
  Kevin: 11, Yann: 12, Momo: 52, Ben: 14, Kader: 59, Moussa: 60, Malik: 53, Jordan: 15, Djamal: 13, Alex: 33,
  Karim: 57, Idriss: 51, Samir: 68, Tom: 7, Elias: 3, Deena: 0,
};
export const faceOf = (name: string, size = 120): string | number => {
  if (name === 'Deena') return DEENA_PHOTO;
  const n = FACES[name];
  return n ? `https://i.pravatar.cc/${size}?img=${n}` : `https://i.pravatar.cc/${size}?u=zembo-${encodeURIComponent(name)}`;
};

// ── Chat en direct ──
export type LiveMsg = { id: number; user: string; text: string; tint: string; me?: boolean };

export function useLiveChat(initial: [string, string][], auto: [string, string][], every = 3200) {
  const seq = useRef(100);
  const [msgs, setMsgs] = useState<LiveMsg[]>(() => initial.map(([user, text], i) => ({ id: i + 1, user, text, tint: TINTS[(i + 1) % TINTS.length] })));
  const push = (user: string, text: string, me = false) => {
    seq.current += 1;
    const id = seq.current;
    setMsgs((m) => [...m.slice(-24), { id, user, text, tint: me ? colors.gold : TINTS[id % TINTS.length], me }]);
  };
  useEffect(() => {
    let last = -1;
    const t = setInterval(() => {
      let k = Math.floor(Math.random() * (auto.length - 1));
      if (k >= last) k += 1; // jamais deux fois le même d'affilée
      last = k;
      push(auto[k][0], auto[k][1]);
    }, every);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { msgs, push };
}

export function LiveChat({ msgs, max = 7, style }: { msgs: LiveMsg[]; max?: number; style?: StyleProp<ViewStyle> }) {
  const shown = msgs.slice(-max);
  return (
    <View style={[styles.chat, style]} pointerEvents="none">
      {shown.map((m, i) => (
        <View key={m.id} style={[styles.msg, { opacity: Math.max(0.25, 1 - (shown.length - 1 - i) * 0.13) }]}>
          <Image source={faceOf(m.user, 60)} style={[styles.msgAv, m.me && { borderColor: colors.gold, borderWidth: 1.5 }]} />
          <Text style={styles.msgText}>
            <Text style={{ color: m.tint, fontWeight: '800' }}>{m.user} </Text>
            {m.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const EMOJI_TRAY = ['❤️', '🔥', '👏', '😂', '🙏', '✨', '💯', '🎤', '😮', '👑'];

export const ChatInput = forwardRef<React.ComponentRef<typeof TextInput>, { onSend: (t: string) => void; placeholder?: string; right?: React.ReactNode }>(
  function ChatInput({ onSend, placeholder = 'Écris un message…', right }, ref) {
    const insets = useSafeAreaInsets();
    const [draft, setDraft] = useState('');
    const [tray, setTray] = useState(false);
    const send = () => {
      const t = draft.trim();
      if (!t) return;
      tap();
      onSend(t);
      setDraft('');
      setTray(false);
    };
    return (
      <View style={{ paddingBottom: Math.max(insets.bottom, 10) }}>
        {tray && (
          <View style={styles.tray}>
            {EMOJI_TRAY.map((e) => (
              <Pressable key={e} onPress={() => setDraft((d) => d + e)} hitSlop={4}>
                <Text style={{ fontSize: 24 }}>{e}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.inputRow}>
          <View style={styles.input}>
            <Pressable onPress={() => setTray((o) => !o)} hitSlop={6}>
              <Ionicons name="happy-outline" size={19} color="rgba(255,255,255,0.8)" />
            </Pressable>
            <TextInput
              ref={ref}
              value={draft}
              onChangeText={setDraft}
              placeholder={placeholder}
              placeholderTextColor="rgba(255,255,255,0.55)"
              style={styles.inputText}
              onSubmitEditing={send}
              returnKeyType="send"
              selectionColor={colors.gold}
            />
          </View>
          {right}
          <Pressable onPress={send}>
            <LinearGradient colors={goldGradient} style={styles.send}>
              <Ionicons name="send" size={15} color="#1D1405" />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  },
);

// ── Cœurs au toucher + emojis qui s'envolent ──
type Floater = { id: number; x: number; y: number; emoji: string; v: Animated.Value; big?: boolean };

export function useFloaters() {
  const { width, height } = useWindowDimensions();
  const [items, setItems] = useState<Floater[]>([]);
  const add = (emoji: string, x?: number, y?: number, big = false) => {
    const f: Floater = {
      id: Date.now() + Math.random(),
      x: x ?? width - 70 - Math.random() * 30,
      y: y ?? height * 0.62,
      emoji,
      big,
      v: new Animated.Value(0),
    };
    setItems((xs) => [...xs.slice(-14), f]);
    Animated.timing(f.v, { toValue: 1, duration: big ? 1800 : 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() =>
      setItems((xs) => xs.filter((k) => k.id !== f.id)),
    );
  };
  const layer = (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map((f) => (
        <Animated.Text
          key={f.id}
          style={{
            position: 'absolute',
            left: f.big ? width / 2 - 45 : f.x - 18,
            top: f.big ? height * 0.42 : f.y - 18,
            fontSize: f.big ? 90 : 34,
            opacity: f.v.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: f.v.interpolate({ inputRange: [0, 1], outputRange: [0, f.big ? -180 : -130] }) },
              { scale: f.v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1.25, 1] }) },
            ],
          }}
        >
          {f.emoji}
        </Animated.Text>
      ))}
    </View>
  );
  return { add, layer };
}

// ── Message éphémère ──
export function useToast() {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const show = (t: string) => {
    if (timer.current) clearTimeout(timer.current);
    setText(t);
    timer.current = setTimeout(() => setText(null), 2200);
  };
  return { show, text };
}

export function Toast({ text, top }: { text: string | null; top: number }) {
  if (!text) return null;
  return (
    <FadeIn style={[styles.toast, { top }]} pointerEvents="none">
      <Text style={styles.toastText}>{text}</Text>
    </FadeIn>
  );
}

export function FadeIn({ style, children, pointerEvents }: { style?: StyleProp<ViewStyle>; children: React.ReactNode; pointerEvents?: 'none' | 'auto' | 'box-none' }) {
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

// ── Feuille qui monte du bas, dans l'écran (pas une fenêtre séparée) ──
export function Sheet({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title?: string; subtitle?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) setShown(true);
    Animated.timing(v, { toValue: open ? 1 : 0, duration: open ? 280 : 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => finished && !open && setShown(false),
    );
  }, [open, v]);
  if (!shown) return null;
  return (
    <KeyboardAvoidingView style={[StyleSheet.absoluteFill, { zIndex: 40 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: v }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <View style={{ flex: 1 }} pointerEvents="none" />
      <Animated.View
        style={[styles.sheet, { paddingBottom: insets.bottom + 14, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }] }]}
      >
        <View style={styles.grabber} />
        {(title || subtitle) && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              {title && <Text style={styles.sheetTitle}>{title}</Text>}
              {subtitle && <Text style={styles.sheetSub}>{subtitle}</Text>}
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={16} color={colors.text} />
            </Pressable>
          </View>
        )}
        {children}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

export type Gift = { emoji: string; name: string; cost: number };

export function GiftGrid({ gifts, onPick }: { gifts: Gift[]; onPick: (g: Gift) => void }) {
  return (
    <View style={styles.grid}>
      {gifts.map((g) => (
        <Pressable
          key={g.name}
          onPress={() => {
            tap();
            onPick(g);
          }}
          style={({ pressed }) => [styles.gift, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <Text style={{ fontSize: 30 }}>{g.emoji}</Text>
          <Text style={styles.giftName} numberOfLines={1}>
            {g.name}
          </Text>
          <Text style={styles.giftCost}>{g.cost} Zems</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function OptionRow({ emoji, title, sub, badge, onPress, danger }: { emoji: string; title: string; sub?: string; badge?: number; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.option, pressed && { backgroundColor: 'rgba(255,255,255,0.07)' }]}
    >
      <Text style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.optionTitle, danger && { color: '#F07167' }]}>{title}</Text>
          {!!badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        {sub && <Text style={styles.optionSub}>{sub}</Text>}
      </View>
    </Pressable>
  );
}

export function ShareRow({ onPick }: { onPick: (label: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {[
        ['🔗', 'Copier'],
        ['💬', 'Message'],
        ['📲', 'WhatsApp'],
        ['📸', 'Story'],
      ].map(([e, l]) => (
        <Pressable
          key={l}
          onPress={() => {
            tap();
            onPick(l);
          }}
          style={styles.share}
        >
          <View style={styles.shareIcon}>
            <Text style={{ fontSize: 24 }}>{e}</Text>
          </View>
          <Text style={styles.shareLabel}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Bouton rond de la colonne de droite
export function SideAction({ icon, label, onPress, color = colors.white, gold }: { icon: keyof typeof Ionicons.glyphMap | 'Z'; label: string; onPress: () => void; color?: string; gold?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={styles.side}
    >
      {gold ? (
        <LinearGradient colors={goldGradient} style={styles.sideBtn}>
          {icon === 'Z' ? <Text style={styles.zemsZ}>Z</Text> : <Ionicons name={icon} size={21} color="#1D1405" />}
        </LinearGradient>
      ) : (
        <View style={[styles.sideBtn, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
          {icon === 'Z' ? <Text style={styles.zemsZ}>Z</Text> : <Ionicons name={icon} size={21} color={color} />}
        </View>
      )}
      <Text style={styles.sideLabel}>{label}</Text>
    </Pressable>
  );
}

// Petit badge LIVE rouge qui pulse
export function LiveBadge() {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, [v]);
  return (
    <View style={styles.live}>
      <Animated.View style={[styles.liveDot, { opacity: v }]} />
      <Text style={styles.liveText}>LIVE</Text>
    </View>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return <View style={styles.pill}>{children}</View>;
}

// Conteneur qui glisse depuis le bas pour ouvrir un live
export function LiveSlide({ open, children }: { open: boolean; children: React.ReactNode }) {
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
  if (!mounted) return null;
  return <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 55, backgroundColor: '#000', transform: [{ translateY: y }] }]}>{children}</Animated.View>;
}

export const liveStyles = StyleSheet.create({
  pillText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  round: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  followOn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  followOff: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.gold },
  followTextOn: { color: colors.text, fontSize: 11, fontWeight: '800' },
  followTextOff: { color: '#1D1405', fontSize: 11, fontWeight: '900' },
  shade: { position: 'absolute', left: 0, right: 0 },
  smallBtn: { height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  smallGoldText: { color: '#1D1405', fontSize: 12.5, fontWeight: '900' },
  smallDimText: { color: colors.textDim, fontSize: 12.5, fontWeight: '800' },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 8 },
  av36: { width: 38, height: 38, borderRadius: 19 },
  name: { color: colors.text, fontSize: 14, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
});

const styles = StyleSheet.create({
  chat: { width: '76%', paddingLeft: 12, gap: 6, marginBottom: 10 },
  msg: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  msgAv: { width: 22, height: 22, borderRadius: 11 },
  msgText: { flex: 1, color: colors.white, fontSize: 13, lineHeight: 18, textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 3 },
  tray: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(15,11,7,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  input: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  inputText: { flex: 1, color: colors.white, fontSize: 14.5, paddingVertical: 0 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 50,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(15,11,7,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
  },
  toastText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  sheet: {
    backgroundColor: '#15100B',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    paddingHorizontal: 18,
    maxHeight: '85%',
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textFaint, marginTop: 8, marginBottom: 12 },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  sheetSub: { color: colors.textDim, fontSize: 12.5, marginTop: 3 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  gift: { width: '31%', alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.22)', gap: 2 },
  giftName: { color: colors.text, fontSize: 11.5, fontWeight: '800' },
  giftCost: { color: colors.gold, fontSize: 11, fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 6, borderRadius: 12 },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  optionSub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#1D1405', fontSize: 10, fontWeight: '900' },
  share: { alignItems: 'center', width: 72 },
  shareIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  shareLabel: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 6 },
  side: { alignItems: 'center' },
  sideBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sideLabel: { color: colors.white, fontSize: 10.5, fontWeight: '800', marginTop: 3, textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 3 },
  zemsZ: { color: '#1D1405', fontSize: 20, fontWeight: '900' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: '#E5334B' },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.white },
  liveText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)' },
});
