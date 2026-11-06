import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { FEED, thumbOf, type Post } from '../data/feed';
import { DISCOVER_POSTS, LIVE_NOW, SUGGESTED, TRENDING_TAGS } from '../data/social';
import { formatCount } from '../utils/format';
import { VideoViewer } from '../components/VideoViewer';
import { LiveScreen } from './LiveScreen';
import { HashtagPage } from '../post/HashtagPage';
import { useTagSuggestions } from '../post/hashtags';

// Onglet Découvrir : recherche, lives en cours, tendances et suggestions
export function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [viewer, setViewer] = useState<{ posts: Post[]; start: number } | null>(null);
  const [live, setLive] = useState<Post | null>(null);
  const [tagPage, setTagPage] = useState<string | null>(null);
  // tendances : vrais hashtags les plus utilisés, puis les exemples
  const trending = useTagSuggestions('');
  const tagList = useMemo(() => [...new Set([...trending.map((t) => t.tag), ...TRENDING_TAGS])].slice(0, 14), [trending]);

  const q = query.trim().toLowerCase().replace(/^#/, '');
  const posts = useMemo(() => {
    const filter = q || tag;
    if (!filter) return DISCOVER_POSTS;
    return DISCOVER_POSTS.filter((p) =>
      [p.caption, p.user.handle, p.user.name, ...p.hashtags].some((s) => s.toLowerCase().includes(filter)),
    );
  }, [q, tag]);
  const people = useMemo(
    () => (q ? SUGGESTED.filter((s) => s.handle.includes(q) || s.name.toLowerCase().includes(q)) : []),
    [q],
  );

  const colW = (width - 12 * 2 - 8) / 2;
  const left = posts.filter((_, i) => i % 2 === 0);
  const right = posts.filter((_, i) => i % 2 === 1);
  const open = (p: Post) => setViewer({ posts, start: posts.indexOf(p) });
  const searching = focused || !!q;

  const openLive = (l: (typeof LIVE_NOW)[number]) => {
    const base = FEED.find((p) => p.kind === 'live')!;
    setLive({ ...base, user: { handle: l.name.toLowerCase().replace(/\s/g, '.'), name: l.name, avatar: l.avatar }, liveTitle: l.title, viewers: l.viewers });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      {/* barre de recherche */}
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.textDim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Rechercher sur Zembo"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
            selectionColor={colors.gold}
          />
          {!!query && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textDim} />
            </Pressable>
          )}
        </View>
        {searching ? (
          <Pressable
            onPress={() => {
              setQuery('');
              setFocused(false);
            }}
          >
            <Text style={styles.cancel}>Annuler</Text>
          </Pressable>
        ) : (
          <Ionicons name="scan-outline" size={24} color={colors.text} />
        )}
      </View>

      <ScrollView keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        {!q && (
          <>
            {/* lives en cours */}
            <SectionTitle title="En direct maintenant" icon="radio" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.liveRow}>
              {LIVE_NOW.map((l) => (
                <Pressable key={l.name} onPress={() => openLive(l)} style={styles.liveItem}>
                  <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.liveRing}>
                    <View style={styles.liveInner}>
                      <Image source={l.avatar} style={styles.liveAvatar} />
                    </View>
                  </LinearGradient>
                  <LinearGradient colors={goldGradient} style={styles.liveTag}>
                    <Text style={styles.liveTagText}>{l.table ? 'TABLE' : 'LIVE'}</Text>
                  </LinearGradient>
                  <Text style={styles.liveName} numberOfLines={1}>
                    {l.name}
                  </Text>
                  <Text style={styles.liveViewers}>{formatCount(l.viewers)} 👁</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* hashtags tendance */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tags}>
              {tagList.map((t) => {
                const on = tag === t;
                return (
                  <Pressable key={t} onPress={() => setTagPage(t)} style={[styles.tag, on && styles.tagOn]}>
                    <Text style={[styles.tagText, on && styles.tagTextOn]}>#{t}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* suggestions de comptes */}
            {!tag && (
              <>
                <SectionTitle title="Suggestions pour toi" icon="sparkles" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestRow}>
                  {SUGGESTED.map((s) => (
                    <UserCard key={s.handle} user={s} followed={!!followed[s.handle]} onFollow={() => setFollowed((f) => ({ ...f, [s.handle]: !f[s.handle] }))} />
                  ))}
                </ScrollView>
              </>
            )}
          </>
        )}

        {/* comptes trouvés */}
        {people.length > 0 && (
          <>
            <SectionTitle title="Comptes" icon="person" />
            {people.map((s) => (
              <View key={s.handle} style={styles.personRow}>
                <Image source={s.avatar} style={styles.personAvatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName}>{s.name}</Text>
                  <Text style={styles.personHandle}>@{s.handle}</Text>
                </View>
                <FollowButton on={!!followed[s.handle]} onPress={() => setFollowed((f) => ({ ...f, [s.handle]: !f[s.handle] }))} />
              </View>
            ))}
          </>
        )}

        <SectionTitle title={q ? 'Vidéos' : tag ? `#${tag}` : 'Tendances'} icon={q ? 'play' : 'flame'} />
        {posts.length === 0 ? (
          <Text style={styles.empty}>Aucun résultat pour « {query} »</Text>
        ) : (
          <View style={styles.grid}>
            <View style={{ width: colW, gap: 8 }}>
              {left.map((p, i) => (
                <VideoCard key={p.id} post={p} w={colW} tall={i % 2 === 0} onPress={() => open(p)} />
              ))}
            </View>
            <View style={{ width: colW, gap: 8 }}>
              {right.map((p, i) => (
                <VideoCard key={p.id} post={p} w={colW} tall={i % 2 === 1} onPress={() => open(p)} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <VideoViewer posts={viewer?.posts ?? []} start={viewer?.start ?? null} onClose={() => setViewer(null)} />
      <LiveScreen post={live} onClose={() => setLive(null)} />
      <HashtagPage tag={tagPage} onClose={() => setTagPage(null)} />
    </View>
  );
}

function SectionTitle({ title, icon }: { title: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.section}>
      <Ionicons name={icon} size={15} color={colors.gold} />
      <Text style={styles.sectionText}>{title}</Text>
    </View>
  );
}

function VideoCard({ post, w, tall, onPress }: { post: Post; w: number; tall: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View>
        <Image source={thumbOf(post)} style={{ width: w, height: w * (tall ? 1.55 : 1.25) }} contentFit="cover" transition={200} />
        <View style={styles.cardViews}>
          <Ionicons name="play" size={11} color={colors.white} />
          <Text style={styles.cardViewsText}>{formatCount(post.views ?? post.likes * 9)}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardCaption} numberOfLines={2}>
          {post.caption}
        </Text>
        <View style={styles.cardFoot}>
          <Image source={post.user.avatar} style={styles.cardAvatar} />
          <Text style={styles.cardUser} numberOfLines={1}>
            {post.user.handle}
          </Text>
          <Ionicons name="heart-outline" size={13} color={colors.textDim} />
          <Text style={styles.cardLikes}>{formatCount(post.likes)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function UserCard({ user, followed, onFollow }: { user: (typeof SUGGESTED)[number]; followed: boolean; onFollow: () => void }) {
  return (
    <View style={styles.userCard}>
      <Image source={user.avatar} style={styles.userAvatar} />
      <View style={styles.userNameRow}>
        <Text style={styles.userName} numberOfLines={1}>
          {user.name}
        </Text>
        {user.verified && <Ionicons name="checkmark-circle" size={13} color={colors.gold} />}
      </View>
      <Text style={styles.userReason} numberOfLines={1}>
        {user.reason}
      </Text>
      <FollowButton on={followed} onPress={onFollow} wide />
    </View>
  );
}

function FollowButton({ on, onPress, wide }: { on: boolean; onPress: () => void; wide?: boolean }) {
  if (on) {
    return (
      <Pressable onPress={onPress} style={[styles.followOff, wide && { alignSelf: 'stretch' }]}>
        <Text style={styles.followOffText}>Suivi·e</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} style={wide ? { alignSelf: 'stretch' } : undefined}>
      <LinearGradient colors={goldGradient} style={styles.follow}>
        <Text style={styles.followText}>Suivre</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingBottom: 8 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  cancel: { color: colors.gold, fontSize: 15, fontWeight: '700' },
  section: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, marginTop: 16, marginBottom: 10 },
  sectionText: { color: colors.text, fontSize: 16, fontWeight: '800' },
  liveRow: { paddingHorizontal: 12, gap: 14 },
  liveItem: { width: 72, alignItems: 'center' },
  liveRing: { width: 68, height: 68, borderRadius: 34, padding: 2.5 },
  liveInner: { flex: 1, borderRadius: 32, padding: 2, backgroundColor: colors.bg },
  liveAvatar: { flex: 1, borderRadius: 30 },
  liveTag: { marginTop: -9, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4, borderWidth: 1.5, borderColor: colors.bg },
  liveTagText: { color: colors.bg, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.5 },
  liveName: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 4 },
  liveViewers: { color: colors.textDim, fontSize: 10.5, marginTop: 1 },
  tags: { paddingHorizontal: 12, gap: 8, marginTop: 16 },
  tag: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  tagOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  tagText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  tagTextOn: { color: colors.bg },
  suggestRow: { paddingHorizontal: 12, gap: 10 },
  userCard: {
    width: 128,
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userAvatar: { width: 64, height: 64, borderRadius: 32 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 },
  userName: { color: colors.text, fontSize: 13.5, fontWeight: '800', maxWidth: 88 },
  userReason: { color: colors.textDim, fontSize: 11, marginTop: 2, marginBottom: 10 },
  follow: { borderRadius: 6, paddingHorizontal: 16, paddingVertical: 7, alignItems: 'center' },
  followText: { color: colors.bg, fontWeight: '900', fontSize: 13 },
  followOff: { borderRadius: 6, paddingHorizontal: 14, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(247,241,225,0.25)' },
  followOffText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8 },
  personAvatar: { width: 48, height: 48, borderRadius: 24 },
  personName: { color: colors.text, fontSize: 15, fontWeight: '800' },
  personHandle: { color: colors.textDim, fontSize: 12.5, marginTop: 1 },
  grid: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12 },
  card: { borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface },
  cardViews: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardViewsText: { color: colors.white, fontSize: 11.5, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  cardBody: { padding: 8, gap: 7 },
  cardCaption: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '600' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardAvatar: { width: 18, height: 18, borderRadius: 9 },
  cardUser: { flex: 1, color: colors.textDim, fontSize: 11.5 },
  cardLikes: { color: colors.textDim, fontSize: 11.5 },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 30, fontSize: 14 },
});
