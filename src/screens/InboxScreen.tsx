import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { avatar } from '../data/feed';
import { ACTIVITY, CONVERSATIONS, ME, STORIES, type Conversation } from '../data/social';
import { ChatScreen } from './ChatScreen';

// Onglet Messages : amis en ligne, activité et conversations
export function InboxScreen({ onUnread }: { onUnread: (n: number) => void }) {
  const insets = useSafeAreaInsets();
  const [convos, setConvos] = useState(CONVERSATIONS);
  const [activity, setActivity] = useState(ACTIVITY);
  const [openId, setOpenId] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState<(typeof ACTIVITY)[number] | null>(null);

  const unread = convos.reduce((a, c) => a + c.unread, 0) + activity.reduce((a, c) => a + c.badge, 0);
  useEffect(() => onUnread(unread), [unread, onUnread]);

  const openChat = (id: string) => {
    setConvos((cs) => cs.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    setOpenId(id);
  };
  const openByName = (name: string) => {
    const c = convos.find((x) => x.name === name);
    if (c) openChat(c.id);
  };
  const update = (c: Conversation) => setConvos((cs) => [c, ...cs.filter((x) => x.id !== c.id)]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Ionicons name="person-add-outline" size={23} color={colors.text} />
        <Text style={styles.headerTitle}>Boîte de réception</Text>
        <Ionicons name="create-outline" size={24} color={colors.text} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {/* amis, comme les stories */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stories}>
          <View style={styles.story}>
            <View>
              <Image source={ME.avatar} style={styles.storyAvatar} />
              <LinearGradient colors={goldGradient} style={styles.storyPlus}>
                <Ionicons name="add" size={14} color={colors.bg} />
              </LinearGradient>
            </View>
            <Text style={styles.storyName}>Créer</Text>
          </View>
          {STORIES.map((s) => (
            <Pressable key={s.name} style={styles.story} onPress={() => openByName(s.name)}>
              <View>
                <Image source={s.avatar} style={styles.storyAvatar} />
                {s.online && <View style={styles.online} />}
              </View>
              <Text style={styles.storyName} numberOfLines={1}>
                {s.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* activité */}
        {activity.map((a) => (
          <Pressable
            key={a.id}
            style={styles.row}
            onPress={() => {
              setActivity((xs) => xs.map((x) => (x.id === a.id ? { ...x, badge: 0 } : x)));
              setActivityOpen(a);
            }}
          >
            <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actIcon}>
              <Ionicons name={a.icon} size={24} color={colors.bg} />
            </LinearGradient>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{a.title}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {a.sub}
              </Text>
            </View>
            {a.badge > 0 ? <Badge n={a.badge} /> : <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
          </Pressable>
        ))}

        <Text style={styles.sectionTitle}>Messages</Text>
        {convos.map((c) => {
          const last = c.messages[c.messages.length - 1];
          const preview = last ? `${last.mine ? 'Toi : ' : ''}${last.post ? 'a partagé une vidéo' : last.text}` : '';
          return (
            <Pressable key={c.id} style={styles.row} onPress={() => openChat(c.id)}>
              <View>
                <Image source={c.avatar} style={styles.avatar} />
                {c.online && <View style={[styles.online, { right: 1, bottom: 1 }]} />}
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, c.unread > 0 && { color: colors.white }]}>{c.name}</Text>
                <Text style={[styles.rowSub, c.unread > 0 && styles.rowSubUnread]} numberOfLines={1}>
                  {preview} · {c.time}
                </Text>
              </View>
              {c.unread > 0 ? <Badge n={c.unread} /> : <Ionicons name="camera-outline" size={22} color={colors.textFaint} />}
            </Pressable>
          );
        })}
      </ScrollView>

      <ChatScreen convo={convos.find((c) => c.id === openId) ?? null} onChange={update} onClose={() => setOpenId(null)} />
      <ActivityScreen item={activityOpen} onClose={() => setActivityOpen(null)} />
    </View>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{n}</Text>
    </View>
  );
}

// Liste d'activité ouverte depuis une des trois lignes du haut
const ACT_ITEMS: Record<string, { who: string; img: number; text: string; time: string }[]> = {
  followers: [
    { who: 'binta.art', img: 41, text: 'a commencé à te suivre', time: '5 min' },
    { who: 'leo.trn', img: 60, text: 'a commencé à te suivre', time: '1 h' },
    { who: 'sofia.rose', img: 31, text: 'a commencé à te suivre', time: '3 h' },
    { who: 'oumar.dk', img: 52, text: 'a commencé à te suivre', time: 'hier' },
  ],
  activity: [
    { who: 'kofi_beats', img: 12, text: 'a aimé ta vidéo', time: '2 min' },
    { who: 'fatou.k', img: 9, text: 'a commenté : « Trop drôle 😂 »', time: '10 min' },
    { who: 'mariam.b', img: 20, text: 'a demandé à monter à ta Zembo Table', time: '1 h' },
    { who: 'jules_92', img: 11, text: 'a partagé ta vidéo', time: '2 h' },
    { who: 'nadia_m', img: 38, text: 't’a envoyé une Rose 🌹 pendant le live', time: 'hier' },
  ],
  system: [
    { who: 'Zembo', img: 0, text: 'Ta Zembo Table d’hier a réuni 2 340 spectateurs, un record 🎉', time: 'hier' },
    { who: 'Zembo', img: 0, text: 'Nouveau : choisis 2, 4, 6 ou 8 places pour ta table', time: '3 j' },
  ],
};

function ActivityScreen({ item, onClose }: { item: (typeof ACTIVITY)[number] | null; onClose: () => void }) {
  return (
    <Modal visible={!!item} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={[styles.root, { paddingTop: 8 }]}>
          <View style={styles.header}>
            <View style={{ width: 24 }} />
            <Text style={styles.headerTitle}>{item?.title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView>
            {(item ? ACT_ITEMS[item.id] : []).map((x, i) => (
              <View key={i} style={styles.row}>
                {x.img ? (
                  <Image source={avatar(x.img)} style={styles.avatar} />
                ) : (
                  <LinearGradient colors={goldGradient} style={[styles.avatar, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: colors.bg, fontWeight: '900', fontSize: 22 }}>Z</Text>
                  </LinearGradient>
                )}
                <Text style={[styles.rowSub, { flex: 1, color: colors.text, fontSize: 14 }]}>
                  <Text style={{ fontWeight: '800' }}>{x.who} </Text>
                  {x.text} <Text style={{ color: colors.textFaint }}>· {x.time}</Text>
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  stories: { paddingHorizontal: 14, gap: 16, paddingVertical: 10 },
  story: { width: 64, alignItems: 'center' },
  storyAvatar: { width: 62, height: 62, borderRadius: 31, borderWidth: 1.5, borderColor: colors.border },
  storyPlus: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  storyName: { color: colors.textDim, fontSize: 12, marginTop: 5 },
  online: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3CCB6C',
    borderWidth: 2.5,
    borderColor: colors.bg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 9 },
  actIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowSub: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  rowSubUnread: { color: colors.text, fontWeight: '600' },
  sectionTitle: { color: colors.textDim, fontSize: 13, fontWeight: '700', paddingHorizontal: 14, marginTop: 14, marginBottom: 2 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.bg, fontSize: 11, fontWeight: '900' },
});
