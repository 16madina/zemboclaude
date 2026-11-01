import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

// Écran temporaire pour les onglets pas encore construits
export function PlaceholderScreen({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Text style={styles.header}>{title}</Text>
      <View style={styles.center}>
        <View style={styles.iconRing}>
          <Ionicons name={icon} size={44} color={colors.gold} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>Bientôt disponible sur Zembo</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center', paddingVertical: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 18 },
  sub: { color: colors.textDim, fontSize: 14, marginTop: 6 },
});
