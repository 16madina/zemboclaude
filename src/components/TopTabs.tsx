import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient, textShadow } from '../theme';

export type FeedTab = 'explore' | 'following' | 'foryou';

const TABS: { key: FeedTab; label: string; dot?: boolean }[] = [
  { key: 'explore', label: 'Explorer' },
  { key: 'following', label: 'Suivis', dot: true },
  { key: 'foryou', label: 'Pour toi' },
];

// Barre du haut posée sur la vidéo : LIVE · onglets · recherche
export function TopTabs({ value, onChange, onLive }: { value: FeedTab; onChange: (t: FeedTab) => void; onLive: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
      <Pressable onPress={onLive} style={styles.side} hitSlop={10}>
        <Ionicons name="tv-outline" size={26} color={colors.white} style={textShadow} />
        <LinearGradient colors={goldGradient} style={styles.liveTag}>
          <Text style={styles.liveTagText}>LIVE</Text>
        </LinearGradient>
      </Pressable>

      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = t.key === value;
          return (
            <Pressable key={t.key} onPress={() => onChange(t.key)} style={styles.tab} hitSlop={6}>
              <View>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                {t.dot && !active && <View style={styles.dot} />}
              </View>
              <View style={[styles.underline, !active && { opacity: 0 }]} />
            </Pressable>
          );
        })}
      </View>

      <Pressable style={[styles.side, { alignItems: 'flex-end' }]} hitSlop={10}>
        <Ionicons name="search" size={26} color={colors.white} style={textShadow} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  side: { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
  liveTag: {
    position: 'absolute',
    bottom: -4,
    left: 3,
    paddingHorizontal: 3,
    borderRadius: 3,
  },
  liveTagText: { color: colors.bg, fontSize: 8, fontWeight: '900', letterSpacing: 0.4 },
  tabs: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 18 },
  tab: { alignItems: 'center', paddingTop: 4 },
  tabText: { color: 'rgba(255,255,255,0.65)', fontSize: 17, fontWeight: '600', ...textShadow },
  tabTextActive: { color: colors.white, fontWeight: '800' },
  dot: {
    position: 'absolute',
    top: 2,
    right: -8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gold,
  },
  underline: { marginTop: 6, width: 28, height: 3, borderRadius: 2, backgroundColor: colors.gold },
});
