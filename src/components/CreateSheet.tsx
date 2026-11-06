import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';

// Play & Fun : gardé pour plus tard
export type LoungeKind = 'talk' | 'table' | 'world' | 'game' | 'motdor';

const OPTIONS: { id: LoungeKind; title: string; desc: string; icon: keyof typeof Ionicons.glyphMap; ready?: boolean }[] = [
  { id: 'table', title: 'Zembo Table', desc: "Un live autour d'une table de 2 à 8 personnes.", icon: 'people-circle', ready: true },
  { id: 'talk', title: 'Talk Show', desc: "Mic d'Or Thérapie ou Micro Ouvert.", icon: 'mic', ready: true },
  { id: 'game', title: "Lettres d'Or", desc: 'Le jeu des lettres et des chiffres en live, 4 joueurs sur scène.', icon: 'text', ready: true },
  { id: 'motdor', title: "Mot d'Or", desc: 'Trouve le mot caché en 6 essais, de 4 à 9 lettres. Le champion reste sur scène.', icon: 'grid', ready: true },
  { id: 'world', title: 'World Room', desc: 'Rencontre des gens du monde entier. Le monde est à un Hello.', icon: 'earth', ready: true },
];

// Menu du bouton « + » : choisir le type de lounge à lancer
export function CreateSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (k: LoungeKind) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.grabber} />
        <Text style={styles.title}>Créer sur Zembo</Text>
        <Text style={styles.sub}>Choisis ton type de live</Text>
        {OPTIONS.map((o) => (
          <Pressable key={o.id} onPress={() => o.ready && onPick(o.id)} style={[styles.row, o.ready && styles.rowReady]}>
            {o.ready ? (
              <LinearGradient colors={goldGradient} style={styles.icon}>
                <Ionicons name={o.icon} size={24} color={colors.bg} />
              </LinearGradient>
            ) : (
              <View style={[styles.icon, styles.iconDim]}>
                <Ionicons name={o.icon} size={22} color={colors.gold} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{o.title}</Text>
              <Text style={styles.rowDesc}>{o.desc}</Text>
            </View>
            {o.ready ? (
              <Ionicons name="chevron-forward" size={18} color={colors.gold} />
            ) : (
              <Text style={styles.soon}>Bientôt</Text>
            )}
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textFaint, marginTop: 8 },
  title: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 14 },
  sub: { color: colors.textDim, fontSize: 13, marginTop: 2, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(247,241,225,0.08)',
    backgroundColor: colors.surface2,
    marginBottom: 8,
  },
  rowReady: { borderColor: 'rgba(212,175,55,0.55)' },
  icon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconDim: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  rowDesc: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  soon: { color: colors.textFaint, fontSize: 11, fontWeight: '700' },
});
