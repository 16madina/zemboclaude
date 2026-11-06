import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

export type LoungeKind = 'talk' | 'table' | 'world' | 'game' | 'motdor';

type Option = { id: LoungeKind; title: string; desc: string; image: number };

// 3 cartes en haut, 2 plus grandes en bas
const TOP: Option[] = [
  { id: 'table', title: 'Zembo Table', desc: 'Un live autour d’une table de 2 à 8 personnes.', image: require('../../assets/create/table.jpg') },
  { id: 'talk', title: 'Talk Show', desc: 'Mic d’Or Thérapie ou Micro Ouvert.', image: require('../../assets/create/talk.jpg') },
  { id: 'game', title: 'Lettres d’Or', desc: 'Le jeu des lettres et des chiffres en live, 4 joueurs sur scène.', image: require('../../assets/create/lettres.jpg') },
];
const BOTTOM: Option[] = [
  { id: 'motdor', title: 'Mot d’Or', desc: 'Trouve le mot caché en 6 essais, de 4 à 9 lettres. Le champion reste sur scène.', image: require('../../assets/create/motdor.jpg') },
  { id: 'world', title: 'World Room', desc: 'Rencontre des gens du monde entier. Le monde est à un Hello.', image: require('../../assets/create/world.jpg') },
];

// Menu du bouton « + » : choisir le type de live à lancer
export function CreateSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (k: LoungeKind) => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const inner = width - 32;
  const smallW = (inner - 2 * 10) / 3;
  const bigW = (inner - 10) / 2;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.grabber} />
        <Text style={styles.title}>
          Créer sur <Text style={{ color: colors.goldLight }}>Zembo</Text>
        </Text>
        <Text style={styles.sub}>Choisis ton type de live</Text>
        <View style={styles.row}>
          {TOP.map((o) => (
            <Card key={o.id} o={o} w={smallW} imageH={smallW * 0.82} small onPress={() => onPick(o.id)} />
          ))}
        </View>
        <View style={[styles.row, { marginTop: 10 }]}>
          {BOTTOM.map((o) => (
            <Card key={o.id} o={o} w={bigW} imageH={bigW * 0.62} onPress={() => onPick(o.id)} />
          ))}
        </View>
      </View>
    </Modal>
  );
}

function Card({ o, w, imageH, small, onPress }: { o: Option; w: number; imageH: number; small?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { width: w }, pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 }]}>
      <View style={{ height: imageH }}>
        <Image source={o.image} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={['transparent', 'rgba(22,20,30,0.95)']} locations={[0.55, 1]} style={StyleSheet.absoluteFill} />
      </View>
      <View style={[styles.text, small && { paddingHorizontal: 6 }]}>
        <Text style={[styles.cardTitle, small && { fontSize: 15 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {o.title}
        </Text>
        <Text style={[styles.cardDesc, small && { fontSize: 11 }]} numberOfLines={small ? 4 : 3}>
          {o.desc}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#1E1D24',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    paddingHorizontal: 16,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', marginTop: 8 },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 14 },
  sub: { color: colors.textDim, fontSize: 14, marginTop: 2, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(233,185,73,0.85)',
    backgroundColor: '#16141E',
    shadowColor: '#E9B949',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  text: { alignItems: 'center', paddingHorizontal: 10, paddingBottom: 12, marginTop: -6 },
  cardTitle: { color: '#fff', fontSize: 19, fontWeight: '900', textAlign: 'center' },
  cardDesc: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5, textAlign: 'center', marginTop: 4, lineHeight: 16 },
});
