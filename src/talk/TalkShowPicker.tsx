import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { tap } from './SlamSheets';

export type TalkFormat = 'open-mic' | 'slam';

const GOLD = '#F3C24A';

// Les formats du Talk Show
const FORMATS: { id: TalkFormat; first: string; second: string; accent: string; tags: string; desc: string; image: number }[] = [
  {
    id: 'slam',
    first: 'Mic d’Or',
    second: 'Thérapie',
    accent: '#E0457B',
    tags: 'Talk • Réflexion • Émotions',
    desc: 'Prends le mic sur une mélodie Zembo : ton texte, ta poésie, ta voix. Fais vibrer la communauté.',
    image: require('../../assets/talk/picker/micdor.jpg'),
  },
  {
    id: 'open-mic',
    first: 'Micro',
    second: 'Ouvert',
    accent: '#22C7B0',
    tags: 'Anime • Partage • Échange',
    desc: 'Masterclass, concept, coachings, discussions en direct avec ta communauté.',
    image: require('../../assets/talk/picker/microouvert.jpg'),
  },
];

export function TalkShowPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (f: TalkFormat) => void }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <Body onClose={onClose} onPick={onPick} />
      </SafeAreaProvider>
    </Modal>
  );
}

function Body({ onClose, onPick }: { onClose: () => void; onPick: (f: TalkFormat) => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const imgW = Math.round((width - 32) * 0.36);
  return (
    <View style={styles.root}>
      {/* lumière dorée en haut, halo violet et bleu en bas */}
      <LinearGradient colors={['rgba(150,96,22,0.55)', 'rgba(60,34,8,0.25)', 'transparent']} style={styles.topGlow} />
      <LinearGradient colors={['transparent', 'rgba(88,40,140,0.28)', 'rgba(20,60,120,0.3)']} style={styles.bottomGlow} />

      <View style={[styles.head, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={GOLD} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Ionicons name="radio-outline" size={34} color={GOLD} />
          <Text style={styles.title}>Talk Show</Text>
          <Text style={styles.sub}>Exprime-toi. Inspire. Écoute. Échange.</Text>
          <LinearGradient colors={['transparent', GOLD, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.underline} />
        </View>
      </View>

      <View style={styles.sep}>
        <LinearGradient colors={['transparent', 'rgba(243,194,74,0.6)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.line} />
        <View style={styles.sepPill}>
          <Text style={styles.sepText}>✦ CHOISIS TON FORMAT ✦</Text>
        </View>
        <LinearGradient colors={['rgba(243,194,74,0.6)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.line} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 30 }}>
        {FORMATS.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => {
              tap();
              onPick(f.id);
            }}
            style={({ pressed }) => [styles.card, { borderColor: f.accent, shadowColor: f.accent }, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            <LinearGradient colors={[`${f.accent}38`, '#0D0A14']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Image source={f.image} style={{ width: imgW, alignSelf: 'stretch' }} contentFit="cover" />
            <LinearGradient
              colors={['transparent', '#0E0B16']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ position: 'absolute', left: imgW - 40, width: 40, top: 0, bottom: 0 }}
            />
            <View style={styles.text}>
              <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {f.first} <Text style={{ color: GOLD }}>{f.second}</Text>
              </Text>
              <View style={[styles.tags, { backgroundColor: `${f.accent}44` }]}>
                <Text style={styles.tagsText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {f.tags}
                </Text>
              </View>
              <Text style={styles.desc}>{f.desc}</Text>
            </View>
            <View style={[styles.go, { backgroundColor: f.accent }]}>
              <Ionicons name="chevron-forward" size={18} color={colors.white} />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07060C' },
  topGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 340 },
  bottomGlow: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 360 },
  head: { alignItems: 'center', paddingHorizontal: 16 },
  back: {
    position: 'absolute',
    left: 16,
    bottom: 64,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: { color: '#fff', fontSize: 34, fontWeight: '900', marginTop: 2 },
  sub: { color: '#fff', fontSize: 15.5, fontWeight: '600', marginTop: 4 },
  underline: { width: 180, height: 2.5, borderRadius: 2, marginTop: 10 },
  sep: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 22 },
  line: { flex: 1, height: 1.5 },
  sepPill: {
    paddingHorizontal: 18,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(243,194,74,0.55)',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sepText: { color: GOLD, fontSize: 13.5, fontWeight: '900', letterSpacing: 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 150,
    borderRadius: 22,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: '#0D0A14',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  text: { flex: 1, paddingVertical: 14, paddingLeft: 10, paddingRight: 4 },
  cardTitle: { color: '#fff', fontSize: 21, fontWeight: '900' },
  tags: { alignSelf: 'flex-start', paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center', marginTop: 8 },
  tagsText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  desc: { color: 'rgba(255,255,255,0.88)', fontSize: 12.5, lineHeight: 17, marginTop: 8 },
  go: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
});
