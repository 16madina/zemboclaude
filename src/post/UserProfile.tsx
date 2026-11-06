import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { formatCount } from '../utils/format';
import { thumbOf } from '../data/feed';
import { useSession } from '../lib/session';
import { VideoViewer } from '../components/VideoViewer';
import { useUserPosts } from './posts';
import { setFollow, useFollows, useStats } from './social';

// Profil public d'un membre, ouvert en touchant sa photo sur une publication

export type ProfileTarget = { uid: string; pseudo: string; name: string };

const AVATAR = require('../../assets/icon.png');

export function UserProfile({ target, onClose }: { target: ProfileTarget | null; onClose: () => void }) {
  return (
    <Modal visible={!!target} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>{target && <Body target={target} onClose={onClose} />}</SafeAreaProvider>
    </Modal>
  );
}

function Body({ target, onClose }: { target: ProfileTarget; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, guest, requireAuth } = useSession();
  const me = user?.uid ?? null;
  const posts = useUserPosts(target.uid);
  const stats = useStats(target.uid);
  const follows = useFollows(me, target.uid);
  const [viewer, setViewer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const isMe = me === target.uid;
  const cell = (width - 2) / 3;

  const toggle = async () => {
    if (!me) {
      if (guest) Alert.alert('Crée ton compte', 'En mode test sans compte, tu ne peux pas t’abonner.');
      else requireAuth('Connecte-toi pour t’abonner.');
      return;
    }
    if (busy) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await setFollow(me, target.uid, !follows).catch(() => {});
    setBusy(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.topName} numberOfLines={1}>
          {target.name || target.pseudo}
        </Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
            <Image source={AVATAR} style={styles.avatar} />
          </LinearGradient>
          <Text style={styles.handle}>@{target.pseudo}</Text>

          <View style={styles.stats}>
            <Stat n={stats.following} label="Abonnements" />
            <View style={styles.sep} />
            <Stat n={stats.followers} label="Abonnés" />
            <View style={styles.sep} />
            <Stat n={stats.likes} label="J’aime" />
          </View>

          {!isMe && (
            <Pressable onPress={toggle} disabled={busy} style={({ pressed }) => [{ marginTop: 16 }, pressed && { opacity: 0.85 }]}>
              {follows ? (
                <View style={[styles.followBtn, styles.followingBtn]}>
                  <Ionicons name="checkmark" size={18} color={colors.text} />
                  <Text style={[styles.followText, { color: colors.text }]}>Abonné·e</Text>
                </View>
              ) : (
                <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.followBtn}>
                  <Ionicons name="person-add" size={16} color={colors.bg} />
                  <Text style={styles.followText}>S’abonner</Text>
                </LinearGradient>
              )}
            </Pressable>
          )}
        </View>

        <View style={styles.gridHead}>
          <Ionicons name="grid" size={20} color={colors.text} />
          <Text style={styles.gridHeadText}>{posts.length} publication{posts.length > 1 ? 's' : ''}</Text>
        </View>

        {posts.length === 0 ? (
          <Text style={styles.empty}>Pas encore de publication.</Text>
        ) : (
          <View style={styles.grid}>
            {posts.map((p, i) => (
              <Pressable key={p.id} onPress={() => setViewer(i)} style={{ width: cell, height: cell * 1.33 }}>
                <Image source={thumbOf(p)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                <View style={styles.cellViews}>
                  <Ionicons name="heart" size={12} color={colors.white} />
                  <Text style={styles.cellViewsText}>{formatCount(p.likes)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <VideoViewer posts={posts} start={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 80 }}>
      <Text style={styles.statN}>{formatCount(n)}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, height: 48 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  topName: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '800' },
  head: { alignItems: 'center', paddingTop: 10, paddingBottom: 18 },
  ring: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.surface },
  handle: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 10 },
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  sep: { width: StyleSheet.hairlineWidth, height: 26, backgroundColor: colors.border },
  statN: { color: colors.text, fontSize: 18, fontWeight: '900' },
  statL: { color: colors.textDim, fontSize: 12.5, marginTop: 2 },
  followBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, width: 200, height: 44, borderRadius: 10 },
  followingBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  followText: { color: colors.bg, fontSize: 15.5, fontWeight: '900' },
  gridHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  gridHeadText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  cellViews: { position: 'absolute', left: 6, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  cellViewsText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 40, fontSize: 14 },
});
