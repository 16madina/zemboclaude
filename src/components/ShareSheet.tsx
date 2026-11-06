import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { CONTACTS, type Post } from '../data/feed';
import { usePostActions } from '../post/sounds';

type Icon = keyof typeof Ionicons.glyphMap;

const APPS: { label: string; icon: Icon; bg: string }[] = [
  { label: 'Copier le lien', icon: 'link', bg: colors.gold },
  { label: 'WhatsApp', icon: 'logo-whatsapp', bg: '#25D366' },
  { label: 'SMS', icon: 'chatbubble', bg: '#34C759' },
  { label: 'Facebook', icon: 'logo-facebook', bg: '#1877F2' },
  { label: 'Instagram', icon: 'logo-instagram', bg: '#C13584' },
  { label: 'Snapchat', icon: 'logo-snapchat', bg: '#FFFC00' },
  { label: 'E-mail', icon: 'mail', bg: '#5E5CE6' },
];

const ACTIONS: { label: string; icon: Icon; id?: 'duo' | 'sound' }[] = [
  { label: 'Duo', icon: 'copy-outline', id: 'duo' },
  { label: 'Utiliser ce son', icon: 'musical-notes-outline', id: 'sound' },
  { label: 'Signaler', icon: 'flag-outline' },
  { label: 'Pas intéressé', icon: 'heart-dislike-outline' },
  { label: 'Enregistrer la vidéo', icon: 'download-outline' },
  { label: 'Collage', icon: 'cut-outline' },
  { label: 'Favoris', icon: 'bookmark-outline' },
  { label: 'Fond d\'écran', icon: 'phone-portrait-outline' },
];

// Panneau « Partager »
export function ShareSheet({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { startDuo, openSound } = usePostActions();
  const isVideo = post?.kind === 'video';
  // le panneau se ferme d'abord, puis la caméra (Duo) ou la page du son s'ouvre
  const act = (id?: 'duo' | 'sound') => {
    if (!post || !id) return;
    const p = post;
    onClose();
    setTimeout(() => (id === 'duo' ? startDuo(p) : openSound(p)), 450);
  };
  return (
    <Modal visible={!!post} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 6 }]}>
        <View style={styles.grabber} />
        <Text style={styles.title}>Envoyer à</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {CONTACTS.map((c) => (
            <Pressable key={c.name} style={styles.cell}>
              <Image source={c.avatar} style={styles.contact} />
              <Text style={styles.cellLabel} numberOfLines={1}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sep} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {APPS.map((a) => (
            <Pressable key={a.label} style={styles.cell}>
              <View style={[styles.circle, { backgroundColor: a.bg }]}>
                <Ionicons name={a.icon} size={26} color={a.bg === '#FFFC00' || a.bg === colors.gold ? colors.bg : '#fff'} />
              </View>
              <Text style={styles.cellLabel} numberOfLines={2}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {ACTIONS.filter((a) => isVideo || !a.id).map((a) => (
            <Pressable key={a.label} style={styles.cell} onPress={() => act(a.id)}>
              <View style={[styles.circle, styles.actionCircle, a.id && styles.actionGold]}>
                <Ionicons name={a.icon} size={24} color={colors.goldLight} />
              </View>
              <Text style={styles.cellLabel} numberOfLines={2}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable onPress={onClose} style={styles.cancel}>
          <Text style={styles.cancelText}>Annuler</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textFaint, marginTop: 8 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700', textAlign: 'center', marginVertical: 12 },
  row: { paddingHorizontal: 10, paddingVertical: 8 },
  cell: { width: 76, alignItems: 'center' },
  contact: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface2 },
  circle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  actionCircle: { backgroundColor: colors.surface2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  actionGold: { borderWidth: 1.5, borderColor: colors.gold },
  cellLabel: { color: colors.textDim, fontSize: 11.5, marginTop: 6, textAlign: 'center' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 14, marginVertical: 4 },
  cancel: {
    marginTop: 8,
    marginHorizontal: 14,
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
