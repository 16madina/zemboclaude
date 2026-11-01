import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { CAPACITIES, DEFAULT_TITLE, type TableConfig } from './data';

type Props = { visible: boolean; onClose: () => void; onStart: (c: TableConfig) => void };

// Avant de lancer : titre du jour + nombre de places autour de la table
export function TableSetupSheet({ visible, onClose, onStart }: Props) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [capacity, setCapacity] = useState<TableConfig['capacity']>(6);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Ta Zembo Table</Text>
          <Text style={styles.sub}>Un live autour d'une table, jusqu'à 8 personnes.</Text>

          <Text style={styles.label}>TITRE DU JOUR</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="De quoi parle-t-on ce soir ?"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            multiline
            maxLength={90}
          />
          <Text style={styles.counter}>{title.length}/90 · affiché au milieu de la table</Text>

          <Text style={styles.label}>NOMBRE DE PLACES</Text>
          <View style={styles.row}>
            <View style={styles.choices}>
              {CAPACITIES.map((c) => {
                const active = c === capacity;
                return (
                  <Pressable key={c} onPress={() => setCapacity(c)} style={[styles.choice, active && styles.choiceActive]}>
                    {active && <LinearGradient colors={goldGradient} style={StyleSheet.absoluteFill} />}
                    <Text style={[styles.choiceNum, active && { color: colors.bg }]}>{c}</Text>
                    <Text style={[styles.choiceTxt, active && { color: colors.bg }]}>places</Text>
                  </Pressable>
                );
              })}
            </View>
            <MiniTable capacity={capacity} />
          </View>

          <Pressable disabled={!title.trim()} onPress={() => onStart({ title: title.trim(), capacity })} style={{ opacity: title.trim() ? 1 : 0.4 }}>
            <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
              <Ionicons name="radio" size={18} color={colors.bg} />
              <Text style={styles.ctaText}>Lancer le live</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Aperçu : table ovale vue de dessus avec les places
function MiniTable({ capacity }: { capacity: number }) {
  const W = 84;
  const H = 118;
  const seats = miniSeats(capacity, W, H);
  return (
    <View style={{ width: W + 30, height: H + 30, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.miniTable, { width: W, height: H, borderRadius: W / 2 }]}>
        <View style={[styles.miniFelt, { borderRadius: (W - 14) / 2 }]} />
      </View>
      {seats.map((p, i) => (
        <View key={i} style={[styles.miniSeat, { left: p.x + 15 - 7, top: p.y + 15 - 7 }, i === 0 && styles.miniSeatHost]} />
      ))}
    </View>
  );
}

function miniSeats(c: number, W: number, H: number) {
  const top = { x: W / 2, y: -9 };
  const bottom = { x: W / 2, y: H + 9 };
  const side = (s: 1 | -1, f: number) => ({ x: s > 0 ? W + 10 : -10, y: H / 2 + f * H * 0.3 });
  if (c === 2) return [side(1, 0), side(-1, 0)];
  if (c === 4) return [top, side(1, 0), bottom, side(-1, 0)];
  if (c === 6) return [top, side(1, -0.55), side(1, 0.55), bottom, side(-1, 0.55), side(-1, -0.55)];
  return [top, side(1, -1), side(1, 0), side(1, 1), bottom, side(-1, 1), side(-1, 0), side(-1, -1)];
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textFaint, marginTop: 8 },
  title: { color: colors.text, fontSize: 19, fontWeight: '900', marginTop: 14 },
  sub: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  label: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginTop: 18, marginBottom: 8 },
  input: {
    minHeight: 64,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: colors.surface2,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  counter: { color: colors.textFaint, fontSize: 11, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: 200 },
  choice: {
    width: 92,
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  choiceActive: { borderColor: colors.goldLight },
  choiceNum: { color: colors.goldLight, fontSize: 20, fontWeight: '900' },
  choiceTxt: { color: colors.textDim, fontSize: 10.5, fontWeight: '700', marginTop: -2 },
  miniTable: { backgroundColor: '#4a2c16', borderWidth: 2, borderColor: '#2a180c', alignItems: 'center', justifyContent: 'center' },
  miniFelt: { position: 'absolute', top: 6, bottom: 6, left: 6, right: 6, backgroundColor: '#14110c', borderWidth: 1, borderColor: 'rgba(212,175,55,0.7)' },
  miniSeat: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.gold },
  miniSeatHost: { backgroundColor: colors.gold },
  cta: { marginTop: 22, height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: colors.bg, fontSize: 16, fontWeight: '900' },
});
