import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient, textShadow } from '../theme';
import { formatCount } from '../utils/format';
import { useSession } from '../lib/session';
import { setFollow, useFollows } from '../post/social';
import { CameraFeed, mediaAvailable, useLiveMedia } from './media';
import {
  FORMAT_LABEL,
  sendLiveMessage,
  useLiveChatFeed,
  useOnAirLive,
  useWatching,
  type LiveChatMsg,
  type OnAirLive,
} from './onair';

// Regarder le live d'un autre membre : sa caméra (et celles des personnes sur scène),
// le chat en temps réel et le nombre de spectateurs.

export function LiveViewer({ live, onClose }: { live: OnAirLive | null; onClose: () => void }) {
  return (
    <Modal visible={!!live} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>{live && <Viewer key={live.room} start={live} onClose={onClose} />}</SafeAreaProvider>
    </Modal>
  );
}

/** Initiale du pseudo dans un rond doré (les membres n'ont pas encore de photo) */
export function Initial({ name, size }: { name: string; size: number }) {
  return (
    <LinearGradient colors={goldGradient} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.bg, fontWeight: '900', fontSize: size * 0.45 }}>{(name || '?').charAt(0).toUpperCase()}</Text>
    </LinearGradient>
  );
}

function Viewer({ start, onClose }: { start: OnAirLive; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { user, profile } = useSession();
  const now = useOnAirLive(start.room);
  const live = now ?? start;
  const ended = now === null;
  const media = useLiveMedia(ended ? null : start.room, { publish: false, mic: false, name: profile?.pseudo });
  useWatching(ended ? null : start.room);
  const msgs = useLiveChatFeed(start.room);
  const following = useFollows(user?.uid, live.uid);

  const cams = media.cameras();
  const main = cams.find((c) => c.id === live.uid) ?? cams[0] ?? null;
  const others = cams.filter((c) => c !== main).slice(0, 4);

  const [text, setText] = useState('');
  const [floaters, setFloaters] = useState<{ id: number; drift: number; color: string }[]>([]);
  const listRef = useRef<FlatList<LiveChatMsg>>(null);

  const heart = () => {
    Haptics.selectionAsync().catch(() => {});
    const id = Date.now() + Math.random();
    const color = [colors.gold, colors.goldLight, '#FFB347', '#FFF3C4'][Math.floor(Math.random() * 4)];
    setFloaters((f) => [...f.slice(-20), { id, drift: Math.random() * 50 - 25, color }]);
  };
  const send = () => {
    const t = text.trim();
    if (!t || !profile) return;
    setText('');
    sendLiveMessage(start.room, profile.pseudo, t).catch(() => {});
  };

  const status = !mediaAvailable
    ? 'La vidéo du live s’affiche dans l’app Zembo installée.'
    : media.status === 'error'
      ? 'Connexion à la vidéo impossible pour le moment.'
      : media.status !== 'on'
        ? 'Connexion au live…'
        : `${live.pseudo || live.name} n’a pas encore allumé sa caméra.`;

  return (
    <View style={styles.root}>
      {/* Image principale : la caméra de l'hôte, sinon un fond doré avec son initiale */}
      {main ? (
        <CameraFeed trackRef={main.track} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.empty]}>
          <LinearGradient colors={['#2A2010', '#0A0806']} style={StyleSheet.absoluteFill} />
          <Initial name={live.pseudo || live.name} size={110} />
          <Text style={styles.emptyName}>{live.pseudo || live.name}</Text>
          <View style={styles.emptyRow}>
            {mediaAvailable && media.status !== 'on' && media.status !== 'error' && <ActivityIndicator color={colors.gold} />}
            <Text style={styles.emptyText}>{status}</Text>
          </View>
        </View>
      )}
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={styles.topShade} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.bottomShade} pointerEvents="none" />
      <Pressable style={StyleSheet.absoluteFill} onPress={heart} />

      {/* En-tête : hôte, s'abonner, spectateurs, fermer */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <View style={styles.hostPill}>
          <Initial name={live.pseudo || live.name} size={36} />
          <View style={{ marginHorizontal: 8, maxWidth: 130 }}>
            <Text style={styles.hostName} numberOfLines={1}>
              {live.name || live.pseudo}
            </Text>
            <Text style={styles.hostSub} numberOfLines={1}>
              @{live.pseudo}
            </Text>
          </View>
          {user && user.uid !== live.uid && (
            following ? (
              <Pressable onPress={() => setFollow(user.uid, live.uid, false).catch(() => {})} style={styles.followed}>
                <Ionicons name="checkmark" size={16} color={colors.gold} />
              </Pressable>
            ) : (
              <Pressable onPress={() => setFollow(user.uid, live.uid, true).catch(() => {})}>
                <LinearGradient colors={goldGradient} style={styles.followBtn}>
                  <Text style={styles.followText}>Suivre</Text>
                </LinearGradient>
              </Pressable>
            )
          )}
        </View>
        <View style={styles.headerRight}>
          <View style={styles.viewers}>
            <Ionicons name="eye" size={13} color={colors.goldLight} />
            <Text style={styles.viewersText}>{formatCount(live.viewers)}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={{ marginLeft: 10 }}>
            <Ionicons name="close" size={28} color={colors.white} style={textShadow} />
          </Pressable>
        </View>
      </View>

      {/* Format et titre du live */}
      <View style={[styles.titleBox, { top: insets.top + 58 }]} pointerEvents="none">
        <View style={styles.liveRow}>
          <LinearGradient colors={goldGradient} style={styles.liveTag}>
            <Text style={styles.liveTagText}>LIVE</Text>
          </LinearGradient>
          <Text style={styles.format}>{FORMAT_LABEL[live.format]}</Text>
        </View>
        {!!live.title && live.title !== FORMAT_LABEL[live.format] && (
          <Text style={styles.title} numberOfLines={2}>
            {live.title}
          </Text>
        )}
      </View>

      {/* Les autres personnes sur scène */}
      {others.length > 0 && (
        <View style={[styles.tiles, { top: insets.top + 120 }]} pointerEvents="none">
          {others.map((c) => (
            <View key={c.id} style={styles.tile}>
              <CameraFeed trackRef={c.track} style={StyleSheet.absoluteFill} />
              {!!c.name && (
                <Text style={styles.tileName} numberOfLines={1}>
                  {c.name}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Cœurs */}
      <View style={[styles.floatZone, { bottom: insets.bottom + 70 }]} pointerEvents="none">
        {floaters.map((f) => (
          <FloatingHeart key={f.id} color={f.color} drift={f.drift} onDone={() => setFloaters((a) => a.filter((x) => x.id !== f.id))} />
        ))}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.bottom} pointerEvents="box-none">
        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(m) => m.id}
          style={styles.chat}
          contentContainerStyle={{ paddingVertical: 6 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListHeaderComponent={
            <View style={[styles.msg, styles.msgSystem]}>
              <Text style={styles.systemText}>Bienvenue sur le LIVE ! Reste bienveillant·e et respecte les règles de la communauté.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.msg, item.uid === live.uid && styles.msgHost]}>
              <Initial name={item.pseudo} size={22} />
              <Text style={styles.msgText}>
                <Text style={[styles.msgUser, item.uid === live.uid && { color: colors.goldLight }]}>
                  {item.uid === live.uid ? '👑 ' : ''}
                  {item.pseudo}{' '}
                </Text>
                {item.text}
              </Text>
            </View>
          )}
        />
        <View style={[styles.bar, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.inputBox}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={user ? 'Ajouter un commentaire...' : 'Connecte-toi pour écrire'}
              editable={!!user && !ended}
              placeholderTextColor="rgba(255,255,255,0.7)"
              style={styles.input}
              onSubmitEditing={send}
              returnKeyType="send"
              maxLength={200}
            />
          </View>
          <Pressable style={styles.barBtn} onPress={heart}>
            <Ionicons name="heart" size={22} color={colors.gold} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {ended && (
        <View style={styles.endWrap}>
          <View style={styles.endCard}>
            <Initial name={live.pseudo || live.name} size={64} />
            <Text style={styles.endTitle}>Le live est terminé</Text>
            <Text style={styles.endText}>Merci d’être passé·e voir {live.pseudo || live.name} !</Text>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyName: { color: colors.text, fontSize: 20, fontWeight: '800' },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 40 },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
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
  hostPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.38)', borderRadius: 22, padding: 3, paddingRight: 4 },
  hostName: { color: colors.white, fontWeight: '700', fontSize: 13 },
  hostSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  followBtn: { paddingHorizontal: 12, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  followText: { color: colors.bg, fontWeight: '800', fontSize: 13 },
  followed: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(212,175,55,0.2)' },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  viewers: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.38)', borderRadius: 14, paddingHorizontal: 10, height: 28 },
  viewersText: { color: colors.white, fontWeight: '700', fontSize: 12 },
  titleBox: { position: 'absolute', left: 12, right: 12 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveTag: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  liveTagText: { color: colors.bg, fontWeight: '900', fontSize: 11, letterSpacing: 0.5 },
  format: { color: colors.goldLight, fontWeight: '800', fontSize: 13, ...textShadow },
  title: { color: colors.white, fontWeight: '700', fontSize: 15, marginTop: 6, ...textShadow },
  tiles: { position: 'absolute', right: 10, gap: 8 },
  tile: { width: 92, height: 124, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: colors.gold, backgroundColor: '#111' },
  tileName: { position: 'absolute', left: 6, right: 6, bottom: 4, color: colors.white, fontSize: 11, fontWeight: '700', ...textShadow },
  floatZone: { position: 'absolute', right: 26, width: 40, height: 1, alignItems: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  chat: { maxHeight: 270, width: '80%', paddingHorizontal: 10 },
  msg: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginVertical: 3,
    maxWidth: '100%',
  },
  msgHost: { backgroundColor: 'rgba(212,175,55,0.28)', borderWidth: 1, borderColor: colors.gold },
  msgSystem: { backgroundColor: 'rgba(0,0,0,0.35)' },
  systemText: { color: colors.goldLight, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  msgText: { color: colors.white, fontSize: 14, lineHeight: 19, flexShrink: 1 },
  msgUser: { color: 'rgba(255,255,255,0.7)', fontWeight: '700' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 8, gap: 8 },
  inputBox: { flex: 1, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 14, justifyContent: 'center' },
  input: { color: colors.white, fontSize: 14 },
  barBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  endWrap: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  endCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
  },
  endTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 4 },
  endText: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginBottom: 8 },
  endBtn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  endBtnText: { color: colors.bg, fontWeight: '800', fontSize: 15 },
});
