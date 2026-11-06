import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { formatCount } from '../utils/format';
import { thumbOf } from '../data/feed';
import { VideoViewer } from '../components/VideoViewer';
import { useTagCount, useTagPosts } from './hashtags';
import { PublishScreen } from './PublishScreen';

// Page d'un hashtag : toutes les vidéos qui l'utilisent + « Participer » (c'est la base des challenges)

export function HashtagPage({ tag, onClose }: { tag: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!tag} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>{tag && <Body tag={tag} onClose={onClose} />}</SafeAreaProvider>
    </Modal>
  );
}

function Body({ tag, onClose }: { tag: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { posts, ready } = useTagPosts(tag);
  const count = useTagCount(tag);
  const [viewer, setViewer] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const cell = (width - 2) / 3;
  const total = Math.max(count, posts.length);

  // la publication s'ouvre par-dessus cette page ; une fois publiée, la vidéo apparaît ici
  const join = () => setPublishing(true);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
            <Text style={styles.badgeText}>#</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              #{tag}
            </Text>
            <Text style={styles.sub}>
              {formatCount(total)} vidéo{total > 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {!ready && <ActivityIndicator color={colors.gold} style={{ marginTop: 30 }} />}
        {ready && posts.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Personne n’a encore utilisé #{tag}</Text>
            <Text style={styles.emptySub}>Lance le mouvement : publie la première vidéo.</Text>
          </View>
        )}
        <View style={styles.grid}>
          {posts.map((p, i) => (
            <Pressable key={p.id} onPress={() => setViewer(i)} style={{ width: cell, height: cell * 1.33 }}>
              <Image source={thumbOf(p)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.cellShade} />
              <View style={styles.cellViews}>
                <Ionicons name="heart" size={12} color={colors.white} />
                <Text style={styles.cellViewsText}>{formatCount(p.likes)}</Text>
              </View>
              <Text style={styles.cellUser} numberOfLines={1}>
                @{p.user.handle}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable onPress={join} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
            <Ionicons name="videocam" size={20} color={colors.bg} />
            <Text style={styles.ctaText}>Participer avec #{tag}</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <VideoViewer posts={posts} start={viewer} onClose={() => setViewer(null)} />
      <PublishScreen
        kind={publishing ? 'video' : null}
        initialTags={[tag]}
        onClose={() => setPublishing(false)}
        onPublished={() => setPublishing(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { height: 48, justifyContent: 'center', paddingHorizontal: 10 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 18 },
  badge: { width: 76, height: 76, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.bg, fontSize: 44, fontWeight: '900' },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  sub: { color: colors.textDim, fontSize: 14, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 30 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptySub: { color: colors.textDim, fontSize: 14, marginTop: 6, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  cellShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 50 },
  cellViews: { position: 'absolute', left: 6, bottom: 20, flexDirection: 'row', alignItems: 'center', gap: 3 },
  cellViewsText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  cellUser: { position: 'absolute', left: 6, right: 6, bottom: 4, color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: 'rgba(10,8,6,0.92)' },
  cta: { height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: colors.bg, fontSize: 17, fontWeight: '900' },
});
