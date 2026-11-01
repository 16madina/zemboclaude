import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { tap } from './SlamSheets';

export type TalkFormat = 'open-mic' | 'slam';

// Les formats du Talk Show gardés dans l'app (Storytime et Stand-Up retirés)
const FORMATS: { id: TalkFormat; title: string; accent: string; accroche: string; desc: string; icon: keyof typeof Ionicons.glyphMap; ready?: boolean }[] = [
  {
    id: 'slam',
    title: 'Slam Thérapie',
    accent: '#E0457B',
    accroche: 'Tes mots. Ta voix. Ta scène.',
    desc: 'Déclame ton slam, ta poésie ou ton texte et fais vibrer la communauté.',
    icon: 'mic',
    ready: true,
  },
  {
    id: 'open-mic',
    title: 'Micro Ouvert',
    accent: '#2EC4A6',
    accroche: 'Anime. Partage. Échange.',
    desc: 'Masterclass, concept, coachings, discussions en direct avec ta communauté.',
    icon: 'mic-circle',
    ready: true,
  },
];

export function TalkShowPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (f: TalkFormat) => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <Body onClose={onClose} onPick={onPick} />
      </SafeAreaProvider>
    </Modal>
  );
}

function Body({ onClose, onPick }: { onClose: () => void; onPick: (f: TalkFormat) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="chevron-down" size={26} color={colors.gold} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title}>Talk Show</Text>
          <Text style={styles.sub}>Exprime-toi. Inspire. Écoute. Échange.</Text>
        </View>
        <View style={{ width: 26 }} />
      </View>
      <View style={styles.sep}>
        <View style={styles.line} />
        <Text style={styles.sepText}>✦ CHOISIS TON FORMAT ✦</Text>
        <View style={styles.line} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 20 }}>
        {FORMATS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => {
              tap();
              if (f.ready) onPick(f.id);
            }}
            style={({ pressed }) => [styles.card, { borderColor: f.ready ? f.accent : 'rgba(255,255,255,0.08)', opacity: pressed ? 0.85 : 1 }]}
          >
            <LinearGradient colors={[`${f.accent}33`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={[styles.iconBox, { borderColor: `${f.accent}88` }]}>
              <Ionicons name={f.icon} size={34} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{f.title}</Text>
              <Text style={[styles.accroche, { color: f.accent }]}>{f.accroche}</Text>
              <Text style={styles.desc}>{f.desc}</Text>
            </View>
            {f.ready ? (
              <View style={[styles.go, { backgroundColor: f.accent }]}>
                <Ionicons name="chevron-forward" size={16} color={colors.white} />
              </View>
            ) : (
              <Text style={styles.soon}>Bientôt</Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0805' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 16 },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  sub: { color: colors.gold, fontSize: 12.5, fontWeight: '600', marginTop: 3 },
  sep: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginTop: 18 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(212,175,55,0.35)' },
  sepText: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, borderWidth: 1, overflow: 'hidden', backgroundColor: '#14100A' },
  iconBox: { width: 64, height: 64, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  cardTitle: { color: colors.white, fontSize: 17, fontWeight: '900' },
  accroche: { fontSize: 12.5, fontWeight: '800', marginTop: 2 },
  desc: { color: colors.textDim, fontSize: 12, marginTop: 4, lineHeight: 16 },
  go: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  soon: { color: colors.textFaint, fontSize: 11, fontWeight: '800' },
});
