import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { formatCount } from '../utils/format';
import { avatar, commentsFor, type Comment, type Post } from '../data/feed';
import { useSession } from '../lib/session';
import { addComment, ago, deleteComment, useComments } from '../post/social';

const ME_AVATAR = require('../../assets/icon.png');

const EMOJIS = ['😍', '😂', '🔥', '👏🏾', '🥰', '😮', '🙏🏾', '💛'];

// Panneau des commentaires qui monte depuis le bas
export function CommentsSheet({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Comment[]>([]);
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const { user, profile, guest, requireAuth } = useSession();
  const real = !!post?.uid;
  const live = useComments(post);

  useEffect(() => {
    if (post) {
      setItems(post.uid ? [] : commentsFor(post));
      setLikedIds({});
      setText('');
    }
  }, [post]);

  // vrais commentaires (publications des membres) au même format que les exemples
  const shown: (Comment & { uid?: string })[] = real
    ? live.items.map((c) => ({
        id: c.id,
        uid: c.uid,
        user: c.pseudo,
        avatar: ME_AVATAR,
        text: c.text,
        time: ago(c.createdAt),
        likes: 0,
        replies: 0,
      }))
    : items;

  const send = async () => {
    const t = text.trim();
    if (!t || !post || sending) return;
    if (!real) {
      setItems((c) => [
        { id: `me-${Date.now()}`, user: 'toi', avatar: avatar(32), text: t, time: "à l'instant", likes: 0, replies: 0 },
        ...c,
      ]);
      setText('');
      return;
    }
    if (!user) {
      if (guest) Alert.alert('Crée ton compte', 'En mode test sans compte, tu ne peux pas commenter.');
      else requireAuth('Connecte-toi pour commenter.');
      return;
    }
    setSending(true);
    try {
      await addComment(
        post.id,
        { uid: user.uid, pseudo: profile?.pseudo || 'membre', name: [profile?.prenom, profile?.nom].filter(Boolean).join(' ') },
        t,
      );
      setText('');
    } catch {
      Alert.alert('Oups', 'Ton commentaire n’est pas parti. Réessaie.');
    } finally {
      setSending(false);
    }
  };

  // appui long : supprimer son commentaire (ou un commentaire sur sa propre publication)
  const askDelete = (c: { id: string; uid?: string }) => {
    if (!post || !real || !user) return;
    if (c.uid !== user.uid && post.uid !== user.uid) return;
    Alert.alert('Supprimer ce commentaire ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => deleteComment(post.id, c.id).catch(() => {}) },
    ]);
  };

  const total = real ? Math.max(post?.comments ?? 0, live.items.length) : (post?.comments ?? 0) + items.filter((i) => i.user === 'toi').length;

  return (
    <Modal visible={!!post} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={styles.fill} onPress={onClose} />
        <View style={[styles.sheet, { height: height * 0.68 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{formatCount(total)} commentaires</Text>
            <Pressable onPress={onClose} style={styles.close} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          {real && !live.ready && <ActivityIndicator color={colors.gold} style={{ marginTop: 30 }} />}
          {real && live.ready && shown.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Pas encore de commentaire</Text>
              <Text style={styles.emptySub}>Sois la première personne à réagir 💛</Text>
            </View>
          )}
          <FlatList
            data={shown}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const liked = !!likedIds[item.id];
              return (
                <Pressable style={styles.row} onLongPress={() => askDelete(item)} delayLongPress={350}>
                  <Image source={item.avatar} style={styles.avatar} />
                  <View style={styles.body}>
                    <Text style={styles.user}>
                      {item.user}
                      {item.user === post?.user.handle && <Text style={styles.creator}> · Créateur</Text>}
                    </Text>
                    <Text style={styles.text}>{item.text}</Text>
                    <View style={styles.meta}>
                      <Text style={styles.metaText}>{item.time}</Text>
                      {!real && <Text style={[styles.metaText, styles.reply]}>Répondre</Text>}
                    </View>
                    {item.replies > 0 && (
                      <Text style={styles.moreReplies}>
                        Voir {item.replies} réponses <Ionicons name="chevron-down" size={12} color={colors.textDim} />
                      </Text>
                    )}
                  </View>
                  {!real && (
                    <Pressable
                      style={styles.likeCol}
                      hitSlop={8}
                      onPress={() => setLikedIds((l) => ({ ...l, [item.id]: !l[item.id] }))}
                    >
                      <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? colors.gold : colors.textDim} />
                      <Text style={styles.likeCount}>{formatCount(item.likes + (liked ? 1 : 0))}</Text>
                    </Pressable>
                  )}
                </Pressable>
              );
            }}
          />

          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={styles.emojis}>
              {EMOJIS.map((e) => (
                <Pressable key={e} onPress={() => setText((t) => t + e)} hitSlop={4}>
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.inputRow}>
              <Image source={real ? ME_AVATAR : avatar(32)} style={styles.meAvatar} />
              <View style={styles.inputBox}>
                <TextInput
                  value={text}
                  onChangeText={(t) => setText(t.slice(0, 500))}
                  placeholder="Ajouter un commentaire..."
                  placeholderTextColor={colors.textFaint}
                  style={styles.input}
                  onSubmitEditing={send}
                  returnKeyType="send"
                />
                {text.trim() ? (
                  <Pressable onPress={send} style={[styles.sendBtn, sending && { opacity: 0.5 }]} disabled={sending}>
                    {sending ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="arrow-up" size={18} color={colors.bg} />}
                  </Pressable>
                ) : (
                  <View style={styles.inputIcons}>
                    <Ionicons name="at" size={22} color={colors.textDim} />
                    <Ionicons name="happy-outline" size={22} color={colors.textDim} />
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  header: { height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  close: { position: 'absolute', right: 14, top: 12 },
  row: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2 },
  body: { flex: 1, marginLeft: 10 },
  user: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  creator: { color: colors.gold },
  text: { color: colors.text, fontSize: 15, marginTop: 3, lineHeight: 20 },
  meta: { flexDirection: 'row', marginTop: 6, gap: 16 },
  metaText: { color: colors.textFaint, fontSize: 13 },
  reply: { fontWeight: '700', color: colors.textDim },
  moreReplies: { color: colors.textDim, fontSize: 13, fontWeight: '600', marginTop: 10 },
  likeCol: { alignItems: 'center', width: 40, paddingTop: 14 },
  likeCount: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  emptyBox: { alignItems: 'center', paddingTop: 40 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  emptySub: { color: colors.textDim, fontSize: 14, marginTop: 6 },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: colors.surface,
  },
  emojis: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  emoji: { fontSize: 24 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  meAvatar: { width: 34, height: 34, borderRadius: 17, marginRight: 10 },
  inputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: 22,
    paddingLeft: 14,
    paddingRight: 6,
    height: 42,
  },
  input: { flex: 1, color: colors.text, fontSize: 15 },
  inputIcons: { flexDirection: 'row', gap: 12, paddingRight: 6 },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
