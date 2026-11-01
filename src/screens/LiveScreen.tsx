import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  GestureResponderEvent,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient, textShadow } from '../theme';
import { formatCount } from '../utils/format';
import { avatar, type Post } from '../data/feed';

type Msg = { id: string; user: string; avatar: string; text: string; kind: 'chat' | 'join' | 'gift' | 'system' };

const CHAT_USERS = ['fatou.k', 'jules_92', 'mariam.b', 'ibra.officiel', 'chloe.lsr', 'oumar.dk', 'nadia_m', 'binta.art', 'leo.trn', 'aicha_d'];
const CHAT_LINES = [
  'Salut tout le monde 👋🏾',
  "Trop contente d'être là 💛",
  "D'où tu nous parles ?",
  'Ton énergie est incroyable 🔥',
  'Dis bonjour à Abidjan !',
  'Tu peux refaire le son de tout à l’heure ?',
  'Premier live que je vois en entier 😂',
  'On t’aime ✨',
  'Quelle heure il est chez toi ?',
];

const GIFTS = [
  { id: 'rose', emoji: '🌹', name: 'Rose', price: 1 },
  { id: 'heart', emoji: '💛', name: 'Cœur d’or', price: 5 },
  { id: 'star', emoji: '⭐', name: 'Étoile', price: 10 },
  { id: 'crown', emoji: '👑', name: 'Couronne', price: 99 },
  { id: 'lion', emoji: '🦁', name: 'Lion', price: 299 },
  { id: 'diamond', emoji: '💎', name: 'Diamant', price: 499 },
  { id: 'rocket', emoji: '🚀', name: 'Fusée', price: 999 },
  { id: 'planet', emoji: '🌍', name: 'Planète', price: 2999 },
];

const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

// Écran LIVE plein écran
export function LiveScreen({ post, onClose }: { post: Post | null; onClose: () => void }) {
  return (
    <Modal visible={!!post} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>{post && <LiveContent post={post} onClose={onClose} />}</SafeAreaProvider>
    </Modal>
  );
}

function LiveContent({ post, onClose }: { post: Post; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(post.video, (p) => {
    p.loop = true;
    p.play();
  });

  const [viewers, setViewers] = useState(post.viewers ?? 1200);
  const [likes, setLikes] = useState(post.likes);
  const [following, setFollowing] = useState(false);
  const [text, setText] = useState('');
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [coins, setCoins] = useState(1250);
  const [bigGift, setBigGift] = useState<{ key: number; emoji: string } | null>(null);
  const [floaters, setFloaters] = useState<{ id: number; color: string; drift: number }[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: 'sys',
      user: 'Zembo',
      avatar: '',
      text: 'Bienvenue sur le LIVE ! Reste bienveillant·e et respecte les règles de la communauté.',
      kind: 'system',
    },
  ]);
  const listRef = useRef<FlatList<Msg>>(null);

  const push = (m: Omit<Msg, 'id'>) =>
    setMsgs((all) => [...all.slice(-40), { ...m, id: `${Date.now()}-${Math.random()}` }]);

  const addFloater = () => {
    const id = Date.now() + Math.random();
    const color = rnd([colors.gold, colors.goldLight, '#FFB347', '#FFF3C4']);
    setFloaters((f) => [...f.slice(-25), { id, color, drift: Math.random() * 50 - 25 }]);
  };

  // Simulation : messages, arrivées, cœurs et spectateurs
  useEffect(() => {
    const chat = setInterval(() => {
      const user = rnd(CHAT_USERS);
      const join = Math.random() < 0.3;
      push({ user, avatar: avatar(Math.floor(Math.random() * 60) + 1), text: join ? 'a rejoint' : rnd(CHAT_LINES), kind: join ? 'join' : 'chat' });
    }, 1600);
    const hearts = setInterval(() => {
      if (Math.random() < 0.7) addFloater();
      setLikes((l) => l + Math.floor(Math.random() * 6));
    }, 700);
    const v = setInterval(() => setViewers((n) => Math.max(10, n + Math.floor(Math.random() * 41) - 15)), 2500);
    return () => {
      clearInterval(chat);
      clearInterval(hearts);
      clearInterval(v);
    };
  }, []);

  const tapLike = (_e: GestureResponderEvent) => {
    addFloater();
    setLikes((l) => l + 1);
    Haptics.selectionAsync();
  };

  const send = () => {
    const t = text.trim();
    if (!t) return;
    push({ user: 'toi', avatar: avatar(32), text: t, kind: 'chat' });
    setText('');
  };

  const sendGift = (g: (typeof GIFTS)[number]) => {
    if (coins < g.price) return;
    setCoins((c) => c - g.price);
    push({ user: 'toi', avatar: avatar(32), text: `a envoyé ${g.name} ${g.emoji}`, kind: 'gift' });
    setBigGift({ key: Date.now(), emoji: g.emoji });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={styles.root}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <LinearGradient colors={['rgba(0,0,0,0.5)', 'transparent']} style={styles.topShade} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.bottomShade} pointerEvents="none" />
      <Pressable style={StyleSheet.absoluteFill} onPress={tapLike} />

      {/* En-tête : créateur, spectateurs, fermer */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <View style={styles.hostPill}>
          <Image source={post.user.avatar} style={styles.hostAvatar} />
          <View style={{ marginHorizontal: 8, maxWidth: 120 }}>
            <Text style={styles.hostName} numberOfLines={1}>
              {post.user.name}
            </Text>
            <Text style={styles.hostLikes}>
              <Ionicons name="heart" size={10} color={colors.goldLight} /> {formatCount(likes)}
            </Text>
          </View>
          {!following ? (
            <Pressable onPress={() => setFollowing(true)}>
              <LinearGradient colors={goldGradient} style={styles.followBtn}>
                <Text style={styles.followText}>Suivre</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <View style={styles.followed}>
              <Ionicons name="checkmark" size={16} color={colors.gold} />
            </View>
          )}
        </View>

        <View style={styles.headerRight}>
          <View style={styles.viewerStack}>
            {[21, 36, 49].map((n, i) => (
              <Image key={n} source={avatar(n)} style={[styles.viewerAvatar, { marginLeft: i ? -8 : 0 }]} />
            ))}
          </View>
          <View style={styles.viewerCount}>
            <Text style={styles.viewerCountText}>{formatCount(viewers)}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={{ marginLeft: 8 }}>
            <Ionicons name="close" size={28} color={colors.white} style={textShadow} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.chips, { top: insets.top + 60 }]} pointerEvents="box-none">
        <View style={styles.chip}>
          <Text style={styles.chipText}>🏆 Classement horaire</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>✨ Explorer</Text>
        </View>
      </View>

      {/* Cœurs qui montent */}
      <View style={[styles.floatZone, { bottom: insets.bottom + 70 }]} pointerEvents="none">
        {floaters.map((f) => (
          <FloatingHeart key={f.id} color={f.color} drift={f.drift} onDone={() => setFloaters((all) => all.filter((x) => x.id !== f.id))} />
        ))}
      </View>

      {bigGift && <GiftBurst key={bigGift.key} emoji={bigGift.emoji} onDone={() => setBigGift(null)} />}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.bottom} pointerEvents="box-none">
        {/* Discussion */}
        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(m) => m.id}
          style={styles.chat}
          contentContainerStyle={{ paddingVertical: 6 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => <ChatLine m={item} />}
        />

        {/* Barre du bas */}
        <View style={[styles.bar, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.inputBox}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ajouter un commentaire..."
              placeholderTextColor="rgba(255,255,255,0.7)"
              style={styles.input}
              onSubmitEditing={send}
              returnKeyType="send"
            />
          </View>
          <Pressable style={styles.barBtn} onPress={() => sendGift(GIFTS[0])}>
            <Text style={{ fontSize: 22 }}>🌹</Text>
          </Pressable>
          <Pressable onPress={() => setGiftsOpen(true)}>
            <LinearGradient colors={goldGradient} style={styles.giftBtn}>
              <Ionicons name="gift" size={22} color={colors.bg} />
            </LinearGradient>
          </Pressable>
          <Pressable style={styles.barBtn}>
            <Ionicons name="arrow-redo" size={22} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <GiftSheet visible={giftsOpen} coins={coins} onClose={() => setGiftsOpen(false)} onSend={sendGift} />
    </View>
  );
}

function ChatLine({ m }: { m: Msg }) {
  if (m.kind === 'system') {
    return (
      <View style={[styles.msg, styles.msgSystem]}>
        <Text style={styles.systemText}>{m.text}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.msg, m.kind === 'gift' && styles.msgGift]}>
      <Image source={m.avatar} style={styles.msgAvatar} />
      <Text style={styles.msgText}>
        <Text style={styles.msgUser}>{m.user} </Text>
        <Text style={m.kind === 'join' ? styles.joinText : undefined}>{m.text}</Text>
      </Text>
    </View>
  );
}

function FloatingHeart({ color, drift, onDone }: { color: string; drift: number; onDone: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(onDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [0, -260] });
  const translateX = a.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: [0, drift, -drift / 2, drift] });
  const opacity = a.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
  const scale = a.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.4, 1.1, 0.9] });
  return (
    <Animated.View style={{ position: 'absolute', bottom: 0, opacity, transform: [{ translateY }, { translateX }, { scale }] }}>
      <Ionicons name="heart" size={30} color={color} />
    </Animated.View>
  );
}

function GiftBurst({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(a, { toValue: 1, friction: 4, useNativeDriver: true }),
      Animated.delay(700),
      Animated.timing(a, { toValue: 2, duration: 400, useNativeDriver: true }),
    ]).start(onDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scale = a.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.6] });
  const opacity = a.interpolate({ inputRange: [0, 0.2, 1, 2], outputRange: [0, 1, 1, 0] });
  return (
    <View style={styles.burstWrap} pointerEvents="none">
      <Animated.View style={[styles.burstGlow, { opacity, transform: [{ scale }] }]}>
        <Text style={{ fontSize: 110 }}>{emoji}</Text>
      </Animated.View>
    </View>
  );
}

function GiftSheet({
  visible,
  coins,
  onClose,
  onSend,
}: {
  visible: boolean;
  coins: number;
  onClose: () => void;
  onSend: (g: (typeof GIFTS)[number]) => void;
}) {
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState(GIFTS[1].id);
  const gift = GIFTS.find((g) => g.id === sel)!;
  const tooExpensive = coins < gift.price;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={[styles.giftSheet, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.giftHeader}>
          <Text style={styles.giftTitle}>Cadeaux</Text>
          <View style={styles.coins}>
            <Text style={styles.coinIcon}>🪙</Text>
            <Text style={styles.coinText}>{coins.toLocaleString('fr-FR')}</Text>
            <Text style={styles.recharge}>Recharger</Text>
          </View>
        </View>
        <View style={styles.giftGrid}>
          {GIFTS.map((g) => {
            const active = g.id === sel;
            return (
              <Pressable key={g.id} onPress={() => setSel(g.id)} style={[styles.giftCell, active && styles.giftCellActive]}>
                <Text style={styles.giftEmoji}>{g.emoji}</Text>
                <Text style={styles.giftName}>{g.name}</Text>
                <Text style={styles.giftPrice}>🪙 {g.price}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable disabled={tooExpensive} onPress={() => onSend(gift)} style={{ marginHorizontal: 16, opacity: tooExpensive ? 0.4 : 1 }}>
          <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sendGift}>
            <Text style={styles.sendGiftText}>
              {tooExpensive ? 'Pièces insuffisantes' : `Envoyer ${gift.name} ${gift.emoji}`}
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  bottomShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 380 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hostPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderRadius: 22,
    padding: 3,
    paddingRight: 4,
  },
  hostAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: colors.gold },
  hostName: { color: colors.white, fontWeight: '700', fontSize: 13 },
  hostLikes: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  followBtn: { paddingHorizontal: 12, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  followText: { color: colors.bg, fontWeight: '800', fontSize: 13 },
  followed: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,175,55,0.2)',
  },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  viewerStack: { flexDirection: 'row', marginRight: 6 },
  viewerAvatar: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.gold },
  viewerCount: { backgroundColor: 'rgba(0,0,0,0.38)', borderRadius: 14, paddingHorizontal: 9, height: 28, justifyContent: 'center' },
  viewerCountText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  chips: { position: 'absolute', left: 10, flexDirection: 'row', gap: 6 },
  chip: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { color: colors.goldLight, fontSize: 12, fontWeight: '600' },
  floatZone: { position: 'absolute', right: 26, width: 40, height: 1, alignItems: 'center' },
  burstWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  burstGlow: {
    shadowColor: colors.gold,
    shadowOpacity: 0.9,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  chat: { maxHeight: 270, width: '78%', paddingHorizontal: 10 },
  msg: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginVertical: 3,
    maxWidth: '100%',
  },
  msgGift: { backgroundColor: 'rgba(212,175,55,0.35)', borderWidth: 1, borderColor: colors.gold },
  msgSystem: { backgroundColor: 'rgba(0,0,0,0.35)' },
  systemText: { color: colors.goldLight, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  msgAvatar: { width: 22, height: 22, borderRadius: 11, marginRight: 6, marginTop: 1 },
  msgText: { color: colors.white, fontSize: 14, lineHeight: 19, flexShrink: 1 },
  msgUser: { color: 'rgba(255,255,255,0.7)', fontWeight: '700' },
  joinText: { color: 'rgba(255,255,255,0.7)' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 8, gap: 8 },
  inputBox: { flex: 1, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 14, justifyContent: 'center' },
  input: { color: colors.white, fontSize: 14 },
  barBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  giftSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  giftHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  giftTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  coins: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  coinIcon: { fontSize: 16 },
  coinText: { color: colors.goldLight, fontWeight: '800', fontSize: 15 },
  recharge: { color: colors.gold, fontWeight: '700', fontSize: 13, marginLeft: 8 },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  giftCell: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  giftCellActive: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  giftEmoji: { fontSize: 36 },
  giftName: { color: colors.text, fontSize: 12, marginTop: 4 },
  giftPrice: { color: colors.goldLight, fontSize: 11, marginTop: 2, fontWeight: '700' },
  sendGift: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  sendGiftText: { color: colors.bg, fontWeight: '800', fontSize: 15 },
});
