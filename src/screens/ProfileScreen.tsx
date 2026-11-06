import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { thumbOf, type Post } from '../data/feed';
import { LIKED, ME, MY_POSTS, SAVED } from '../data/social';
import { formatCount } from '../utils/format';
import { VideoViewer } from '../components/VideoViewer';
import { Sheet } from '../table/TableSheets';
import { useSession } from '../lib/session';
import { deletePost, useUserPosts } from '../post/posts';
import { useMyLikedPosts, useMySavedPosts, useStats } from '../post/social';

type Tab = 'posts' | 'private' | 'saved' | 'liked';
const TABS: { key: Tab; icon: keyof typeof Ionicons.glyphMap; on: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'posts', icon: 'grid-outline', on: 'grid' },
  { key: 'private', icon: 'lock-closed-outline', on: 'lock-closed' },
  { key: 'saved', icon: 'bookmark-outline', on: 'bookmark' },
  { key: 'liked', icon: 'heart-outline', on: 'heart' },
];
const LISTS: Record<Tab, Post[]> = { posts: MY_POSTS, private: [], saved: SAVED, liked: LIKED };
const EMPTY: Partial<Record<Tab, { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }>> = {
  posts: { icon: 'videocam-outline', title: 'Publie ta première vidéo', sub: 'Tes vidéos et tes photos apparaîtront ici et sur l’accueil.' },
  private: { icon: 'lock-closed-outline', title: 'Tes vidéos privées', sub: 'Les vidéos que tu publies en privé apparaîtront ici, visibles par toi seule.' },
  saved: { icon: 'bookmark-outline', title: 'Rien d’enregistré', sub: 'Touche le signet sur une publication pour la retrouver ici.' },
  liked: { icon: 'heart-outline', title: 'Aucun j’aime', sub: 'Les publications que tu aimes apparaîtront ici.' },
};

// Onglet Profil de l'utilisatrice connectée
export function ProfileScreen({ onStartTable, onPublish }: { onStartTable: () => void; onPublish: () => void }) {
  const { user, profile, guest } = useSession();
  // pas connecté : invitation à se connecter (comme TikTok)
  if (!user && !guest) return <SignedOut />;
  return (
    <ProfileView
      onStartTable={onStartTable}
      onPublish={onPublish}
      uid={user?.uid ?? null}
      name={profile?.prenom || ME.name}
      handle={profile?.pseudo || ME.handle}
    />
  );
}

function SignedOut() {
  const insets = useSafeAreaInsets();
  const { requireAuth } = useSession();
  return (
    <View style={[styles.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }]}>
      <View style={styles.outIcon}>
        <Ionicons name="person-outline" size={46} color={colors.gold} />
      </View>
      <Text style={styles.outTitle}>Ton profil Zembo</Text>
      <Text style={styles.outSub}>Inscris-toi pour publier, lancer tes lives et retrouver tes abonnés.</Text>
      <Pressable onPress={() => requireAuth('')} style={{ alignSelf: 'stretch', marginTop: 24 }}>
        <LinearGradient colors={goldGradient} style={styles.outBtn}>
          <Text style={styles.outBtnText}>Se connecter ou s'inscrire</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function ProfileView({
  onStartTable,
  onPublish,
  uid,
  name,
  handle,
}: {
  onStartTable: () => void;
  onPublish: () => void;
  /** null en mode test : on montre les exemples */
  uid: string | null;
  name: string;
  handle: string;
}) {
  const { signOut, deleteAccount } = useSession();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('posts');
  const [viewer, setViewer] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const mine = useUserPosts(uid);
  const liked = useMyLikedPosts(uid);
  const saved = useMySavedPosts(uid);
  const stats = useStats(uid);
  // compte réel : seulement mes vraies données ; mode test : exemples
  const real: Partial<Record<Tab, Post[]>> = { posts: mine, saved, liked };
  const list = uid ? (real[tab] ?? LISTS[tab]) : LISTS[tab];
  const cell = (width - 2) / 3;
  const askDelete = (p: Post) =>
    Alert.alert('Supprimer cette publication ?', 'Elle disparaîtra de l’accueil et de ton profil.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => deletePost(p).then(() => flash('Publication supprimée'), () => flash('Suppression impossible, réessaie')),
      },
    ]);
  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 1600);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* barre du haut */}
      <View style={styles.top}>
        <Ionicons name="person-add-outline" size={23} color={colors.text} />
        <View style={styles.topName}>
          <Text style={styles.topNameText}>{name}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.text} />
        </View>
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <Ionicons name="footsteps-outline" size={23} color={colors.text} />
          <Pressable onPress={() => setMenu(true)} hitSlop={8}>
            <Ionicons name="menu" size={26} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView stickyHeaderIndices={[1]} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {/* en-tête du profil */}
        <View style={styles.head}>
          <View>
            <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarRing}>
              <Image source={ME.avatar} style={styles.avatar} />
            </LinearGradient>
            <LinearGradient colors={goldGradient} style={styles.avatarPlus}>
              <Ionicons name="add" size={16} color={colors.bg} />
            </LinearGradient>
          </View>
          <View style={styles.handleRow}>
            <Text style={styles.handle}>@{handle}</Text>
            <Ionicons name="checkmark-circle" size={16} color={colors.gold} />
          </View>

          <View style={styles.stats}>
            <Stat n={uid ? stats.following : ME.following} label="Abonnements" />
            <View style={styles.statSep} />
            <Stat n={uid ? stats.followers : ME.followers} label="Abonnés" />
            <View style={styles.statSep} />
            <Stat n={uid ? stats.likes : ME.likes} label="J’aime" />
          </View>

          <View style={styles.buttons}>
            <Pressable style={styles.btn} onPress={() => flash('Modification du profil bientôt disponible')}>
              <Text style={styles.btnText}>Modifier le profil</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={() => flash('Lien du profil copié')}>
              <Text style={styles.btnText}>Partager le profil</Text>
            </Pressable>
            <Pressable style={styles.btnIcon} onPress={() => flash('Ajoute des amis depuis Découvrir')}>
              <Ionicons name="person-add-outline" size={18} color={colors.text} />
            </Pressable>
          </View>

          <Text style={styles.bio}>{ME.bio}</Text>

          {/* raccourcis Zembo */}
          <View style={styles.shortcuts}>
            <Pressable onPress={onStartTable} style={{ flex: 1 }}>
              <LinearGradient colors={['rgba(212,175,55,0.22)', 'rgba(212,175,55,0.08)']} style={styles.shortcut}>
                <Ionicons name="radio" size={18} color={colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.shortcutTitle}>Zembo Table</Text>
                  <Text style={styles.shortcutSub}>Lancer un live</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.gold} />
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => flash('Recharge de Zems bientôt disponible')} style={{ flex: 1 }}>
              <View style={[styles.shortcut, { backgroundColor: colors.surface }]}>
                <Text style={{ fontSize: 17 }}>🪙</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shortcutTitle}>850 Zems</Text>
                  <Text style={styles.shortcutSub}>Mon portefeuille</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* onglets (restent collés en haut au défilement) */}
        <View style={styles.tabsWrap}>
        <View style={styles.tabs}>
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={styles.tab}>
                <Ionicons name={on ? t.on : t.icon} size={21} color={on ? colors.text : colors.textFaint} />
                {on && <View style={styles.tabLine} />}
              </Pressable>
            );
          })}
        </View>
        </View>

        {/* grille de vidéos */}
        {list.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name={(EMPTY[tab] ?? EMPTY.private)!.icon} size={40} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>{(EMPTY[tab] ?? EMPTY.private)!.title}</Text>
            <Text style={styles.emptySub}>{(EMPTY[tab] ?? EMPTY.private)!.sub}</Text>
            {tab === 'posts' && (
              <Pressable onPress={onPublish} style={{ marginTop: 18 }}>
                <LinearGradient colors={goldGradient} style={styles.emptyBtn}>
                  <Ionicons name="add" size={18} color={colors.bg} />
                  <Text style={styles.emptyBtnText}>Publier</Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.grid}>
            {list.map((p, i) => (
              <Pressable
                key={`${tab}-${p.id}`}
                onPress={() => setViewer(i)}
                onLongPress={p.uid && p.uid === uid ? () => askDelete(p) : undefined}
                style={{ width: cell, height: cell * 1.33 }}
              >
                <Image source={thumbOf(p)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.cellShade} />
                {p.pinned && tab === 'posts' && (
                  <LinearGradient colors={goldGradient} style={styles.pinned}>
                    <Text style={styles.pinnedText}>Épinglé</Text>
                  </LinearGradient>
                )}
                <View style={styles.cellViews}>
                  <Ionicons name={p.uid ? 'heart' : p.kind === 'photo' ? 'image-outline' : 'play-outline'} size={13} color={colors.white} />
                  <Text style={styles.cellViewsText}>{formatCount(p.uid ? p.likes : (p.views ?? p.likes * 9))}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <VideoViewer posts={list} start={viewer} onClose={() => setViewer(null)} />
      <Sheet visible={menu} onClose={() => setMenu(false)} title="PARAMÈTRES">
        {[
          ['person-circle-outline', 'Compte'],
          ['lock-closed-outline', 'Confidentialité'],
          ['wallet-outline', 'Solde de Zems'],
          ['qr-code-outline', 'Mon code QR'],
          ['notifications-outline', 'Notifications'],
          ['help-circle-outline', 'Aide'],
        ].map(([icon, label]) => (
          <Pressable key={label} style={styles.menuRow} onPress={() => setMenu(false)}>
            <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={22} color={colors.text} />
            <Text style={styles.menuText}>{label}</Text>
          </Pressable>
        ))}
        <Pressable
          style={styles.menuRow}
          onPress={() => {
            setMenu(false);
            signOut();
          }}
        >
          <Ionicons name="log-out-outline" size={22} color={colors.text} />
          <Text style={styles.menuText}>Se déconnecter</Text>
        </Pressable>
        <Pressable
          style={styles.menuRow}
          onPress={() => {
            setMenu(false);
            // suppression du compte depuis l'app : exigée par l'App Store
            Alert.alert('Supprimer mon compte', 'Ton compte Zembo, ton profil Zembo Meet et tes données seront supprimés définitivement.', [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Supprimer',
                style: 'destructive',
                onPress: () =>
                  deleteAccount().catch((e) => {
                    const code = (e as { code?: string })?.code;
                    Alert.alert(
                      'Suppression impossible',
                      code === 'auth/requires-recent-login'
                        ? 'Pour des raisons de sécurité, déconnecte-toi, reconnecte-toi, puis réessaie.'
                        : 'Une erreur est survenue. Réessaie.',
                    );
                  }),
              },
            ]);
          }}
        >
          <Ionicons name="trash-outline" size={22} color="#F07167" />
          <Text style={[styles.menuText, { color: '#F07167' }]}>Supprimer mon compte</Text>
        </Pressable>
      </Sheet>
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{formatCount(n)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  topName: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 40 },
  topNameText: { color: colors.text, fontSize: 17, fontWeight: '800' },
  head: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 6 },
  avatarRing: { width: 100, height: 100, borderRadius: 50, padding: 3 },
  avatar: { flex: 1, borderRadius: 47, borderWidth: 2, borderColor: colors.bg },
  avatarPlus: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.bg,
  },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  handle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  stat: { alignItems: 'center', paddingHorizontal: 18 },
  statN: { color: colors.text, fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.textDim, fontSize: 12.5, marginTop: 2 },
  statSep: { width: StyleSheet.hairlineWidth, height: 14, backgroundColor: colors.textFaint },
  buttons: { flexDirection: 'row', gap: 6, marginTop: 16 },
  btn: { paddingHorizontal: 18, height: 40, borderRadius: 6, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  btnIcon: { width: 42, height: 40, borderRadius: 6, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  bio: { color: colors.text, fontSize: 13.5, lineHeight: 19, textAlign: 'center', marginTop: 14 },
  shortcuts: { flexDirection: 'row', gap: 8, marginTop: 14, alignSelf: 'stretch' },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shortcutTitle: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
  shortcutSub: { color: colors.textDim, fontSize: 11.5, marginTop: 1 },
  tabsWrap: { backgroundColor: colors.bg, paddingTop: 16 },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 11 },
  tabLine: { position: 'absolute', bottom: 0, width: 44, height: 2.5, borderRadius: 2, backgroundColor: colors.gold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  cellShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 50 },
  pinned: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  pinnedText: { color: colors.bg, fontSize: 10.5, fontWeight: '900' },
  cellViews: { position: 'absolute', left: 6, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  cellViewsText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 50, paddingHorizontal: 40 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 26, height: 44, borderRadius: 22 },
  emptyBtnText: { color: colors.bg, fontSize: 15.5, fontWeight: '900' },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 12 },
  emptySub: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 30,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(30,24,16,0.96)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  toastText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  outIcon: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  outTitle: { color: colors.text, fontSize: 21, fontWeight: '900', marginTop: 18 },
  outSub: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  outBtn: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  outBtnText: { color: '#1D1405', fontSize: 15.5, fontWeight: '900' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  menuText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
