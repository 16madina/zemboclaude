import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';

export type MainTab = 'home' | 'discover' | 'create' | 'inbox' | 'profile';

const ITEMS: { key: MainTab; label: string; on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap; badge?: number }[] = [
  { key: 'home', label: 'Accueil', on: 'home', off: 'home-outline' },
  { key: 'discover', label: 'Découvrir', on: 'compass', off: 'compass-outline' },
  { key: 'create', label: '', on: 'add', off: 'add' },
  { key: 'inbox', label: 'Messages', on: 'chatbox-ellipses', off: 'chatbox-ellipses-outline' },
  { key: 'profile', label: 'Profil', on: 'person', off: 'person-outline' },
];

// Barre de navigation du bas
export function BottomNav({ value, onChange, inboxBadge = 0 }: { value: MainTab; onChange: (t: MainTab) => void; inboxBadge?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom - 6, 6) }]}>
      {ITEMS.map((it) => {
        if (it.key === 'create') {
          return (
            <Pressable key={it.key} onPress={() => onChange('create')} style={styles.item}>
              <View style={styles.createOuter}>
                <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.create}>
                  <Ionicons name="add" size={26} color={colors.bg} />
                </LinearGradient>
              </View>
            </Pressable>
          );
        }
        const active = value === it.key;
        const badge = it.key === 'inbox' ? inboxBadge : it.badge;
        return (
          <Pressable key={it.key} onPress={() => onChange(it.key)} style={styles.item}>
            <View>
              <Ionicons name={active ? it.on : it.off} size={25} color={active ? colors.gold : colors.text} />
              {!!badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 7,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.textDim, fontSize: 10.5, fontWeight: '600', marginTop: 2 },
  labelActive: { color: colors.gold },
  createOuter: {
    borderRadius: 10,
    shadowColor: colors.gold,
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  create: { width: 48, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  badgeText: { color: colors.bg, fontSize: 10, fontWeight: '800' },
});
