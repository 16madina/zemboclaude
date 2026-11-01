import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { thumbOf, type Post } from '../data/feed';
import { REPLIES, type ChatItem, type Conversation } from '../data/social';
import { VideoViewer } from '../components/VideoViewer';

// Conversation privée avec un ami
export function ChatScreen({ convo, onChange, onClose }: { convo: Conversation | null; onChange: (c: Conversation) => void; onClose: () => void }) {
  return (
    <Modal visible={!!convo} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>{convo && <Chat convo={convo} onChange={onChange} onClose={onClose} />}</SafeAreaProvider>
    </Modal>
  );
}

const clock = () => {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function Chat({ convo, onChange, onClose }: { convo: Conversation; onChange: (c: Conversation) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [video, setVideo] = useState<Post | null>(null);
  const latest = useRef(convo);
  latest.current = convo;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const push = (m: ChatItem) => {
    const c = latest.current;
    const next = { ...c, messages: [...c.messages, m], time: 'maintenant' };
    latest.current = next;
    onChange(next);
  };

  const send = (value = text) => {
    const v = value.trim();
    if (!v) return;
    push({ id: String(Date.now()), mine: true, text: v, time: clock() });
    setText('');
    // petite réponse simulée
    if (timer.current) clearTimeout(timer.current);
    setTimeout(() => setTyping(true), 500);
    timer.current = setTimeout(() => {
      setTyping(false);
      push({ id: String(Date.now() + 1), mine: false, text: REPLIES[Math.floor(Math.random() * REPLIES.length)], time: clock() });
    }, 2000);
  };

  const data = [...convo.messages].reverse();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Image source={convo.avatar} style={styles.headerAvatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{convo.name}</Text>
          <Text style={styles.headerSub}>{typing ? 'écrit…' : convo.online ? 'En ligne' : 'Actif·ve récemment'}</Text>
        </View>
        <Ionicons name="flag-outline" size={21} color={colors.textDim} />
        <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} style={{ marginLeft: 16 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          inverted
          data={data}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 6 }}
          keyboardDismissMode="interactive"
          ListHeaderComponent={
            typing ? (
              <View style={[styles.row, { marginTop: 6 }]}>
                <Image source={convo.avatar} style={styles.msgAvatar} />
                <View style={[styles.bubble, styles.theirs]}>
                  <Text style={styles.theirsText}>•••</Text>
                </View>
              </View>
            ) : undefined
          }
          renderItem={({ item, index }) => {
            const older = data[index + 1];
            const showAvatar = !item.mine && (index === 0 || data[index - 1]?.mine !== false);
            const showTime = !older || older.time !== item.time;
            return (
              <View>
                {showTime && <Text style={styles.time}>{item.time}</Text>}
                <View style={[styles.row, item.mine && { justifyContent: 'flex-end' }]}>
                  {!item.mine && (showAvatar ? <Image source={convo.avatar} style={styles.msgAvatar} /> : <View style={styles.msgAvatar} />)}
                  {item.post ? (
                    <Pressable onPress={() => setVideo(item.post!)} style={styles.shared}>
                      <Image source={thumbOf(item.post)} style={styles.sharedThumb} contentFit="cover" />
                      <View style={styles.sharedPlay}>
                        <Ionicons name="play" size={22} color={colors.white} />
                      </View>
                      <View style={styles.sharedFoot}>
                        <Image source={item.post.user.avatar} style={styles.sharedAvatar} />
                        <Text style={styles.sharedUser} numberOfLines={1}>
                          {item.post.user.handle}
                        </Text>
                      </View>
                    </Pressable>
                  ) : item.mine ? (
                    <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, styles.mine]}>
                      <Text style={styles.mineText}>{item.text}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.bubble, styles.theirs]}>
                      <Text style={styles.theirsText}>{item.text}</Text>
                    </View>
                  )}
                </View>
                {item.post && !!item.text && (
                  <View style={styles.row}>
                    <View style={styles.msgAvatar} />
                    <View style={[styles.bubble, styles.theirs, { marginTop: 6 }]}>
                      <Text style={styles.theirsText}>{item.text}</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          }}
        />

        {/* réponses rapides */}
        <View style={styles.quick}>
          {['💛', '😂', '🔥', 'On se voit à la table ?'].map((q) => (
            <Pressable key={q} onPress={() => send(q)} style={styles.quickChip}>
              <Text style={styles.quickText}>{q}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.input}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Écris un message…"
              placeholderTextColor={colors.textFaint}
              style={styles.inputText}
              selectionColor={colors.gold}
              onSubmitEditing={() => send()}
              returnKeyType="send"
            />
            {!text && <Ionicons name="happy-outline" size={22} color={colors.textDim} />}
          </View>
          {text ? (
            <Pressable onPress={() => send()}>
              <LinearGradient colors={goldGradient} style={styles.send}>
                <Ionicons name="arrow-up" size={20} color={colors.bg} />
              </LinearGradient>
            </Pressable>
          ) : (
            <Ionicons name="image-outline" size={25} color={colors.text} />
          )}
        </View>
      </KeyboardAvoidingView>

      <VideoViewer posts={video ? [video] : []} start={video ? 0 : null} onClose={() => setVideo(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  headerSub: { color: colors.textDim, fontSize: 12 },
  time: { color: colors.textFaint, fontSize: 11.5, textAlign: 'center', marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  bubble: { maxWidth: '74%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18 },
  mine: { borderBottomRightRadius: 5 },
  theirs: { backgroundColor: colors.surface2, borderBottomLeftRadius: 5 },
  mineText: { color: colors.bg, fontSize: 15, fontWeight: '600' },
  theirsText: { color: colors.text, fontSize: 15 },
  shared: { width: 150, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2 },
  sharedThumb: { width: 150, height: 210 },
  sharedPlay: { position: 'absolute', top: 88, left: 59, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  sharedFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  sharedAvatar: { width: 18, height: 18, borderRadius: 9 },
  sharedUser: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' },
  quick: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  quickChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  quickText: { color: colors.text, fontSize: 13 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 42, borderRadius: 21, paddingHorizontal: 16, backgroundColor: colors.surface2 },
  inputText: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
