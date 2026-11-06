import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { GiftGrid, Sheet, type Gift } from '../talk/LiveKit';

// Fiche d'un joueur sur scène (Lettres d'Or, Mot d'Or) : on touche sa case pour
// lui envoyer un cadeau, l'applaudir ou voir son profil.

const GOLD = '#F3D27A';

export type SheetPlayer = { name: string; photo: number | string; me?: boolean };

export function PlayerSheet({
  player,
  stats,
  about,
  gifts,
  actions = true,
  onClose,
  onGift,
  onApplaud,
}: {
  player: SheetPlayer | null;
  stats: string[];
  about?: string;
  gifts: Gift[];
  /** false : seulement le profil (ex. entraînement) */
  actions?: boolean;
  onClose: () => void;
  onGift: (g: Gift) => void;
  onApplaud: () => void;
}) {
  const [view, setView] = useState<'menu' | 'gift' | 'profile'>('menu');
  useEffect(() => {
    if (player) setView(player.me || !actions ? 'profile' : 'menu');
  }, [player, actions]);
  const name = player?.me ? 'Toi' : (player?.name ?? '');
  return (
    <Sheet
      open={!!player}
      onClose={onClose}
      title={view === 'gift' ? `Un cadeau pour ${name}` : name}
      subtitle={view === 'gift' ? 'Il s’affiche en direct pour tout le live' : player?.me ? 'Ton profil' : 'Joueur sur scène'}
    >
      {player && view === 'menu' && (
        <>
          <View style={styles.head}>
            <Image source={player.photo} style={styles.av} />
            <View style={{ flex: 1 }}>
              {stats.slice(0, 2).map((s) => (
                <Text key={s} style={styles.stat}>
                  {s}
                </Text>
              ))}
            </View>
          </View>
          <View style={styles.row}>
            <Action icon="gift" label="Cadeau" onPress={() => setView('gift')} />
            <Action
              icon="hand-left"
              label="Applaudir"
              onPress={() => {
                onApplaud();
                onClose();
              }}
            />
            <Action icon="person-circle" label="Profil" onPress={() => setView('profile')} />
          </View>
        </>
      )}
      {player && view === 'gift' && (
        <GiftGrid
          gifts={gifts}
          onPick={(g) => {
            onGift(g);
            onClose();
          }}
        />
      )}
      {player && view === 'profile' && (
        <View style={{ alignItems: 'center' }}>
          <Image source={player.photo} style={styles.big} />
          <Text style={styles.name}>{name}</Text>
          {!!about && <Text style={styles.about}>{about}</Text>}
          <View style={styles.statsBox}>
            {stats.map((s) => (
              <Text key={s} style={styles.statLine}>
                {s}
              </Text>
            ))}
          </View>
          {!player.me && actions && (
            <Pressable onPress={() => setView('menu')} style={{ padding: 8 }}>
              <Text style={styles.back}>Retour</Text>
            </Pressable>
          )}
        </View>
      )}
    </Sheet>
  );
}

function Action({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={24} color={GOLD} />
      </View>
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  av: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: GOLD },
  stat: { color: '#fff', fontSize: 14, fontWeight: '800', marginVertical: 1 },
  row: { flexDirection: 'row', gap: 10 },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(243,210,122,0.35)',
  },
  actionIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243,210,122,0.12)' },
  actionText: { color: '#fff', fontSize: 13.5, fontWeight: '900', marginTop: 6 },
  big: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: GOLD },
  name: { color: GOLD, fontSize: 22, fontWeight: '900', marginTop: 8, fontFamily: 'Georgia' },
  about: { color: 'rgba(255,255,255,0.8)', fontSize: 13.5, marginTop: 4, textAlign: 'center' },
  statsBox: { alignSelf: 'stretch', marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', gap: 6 },
  statLine: { color: '#fff', fontSize: 14, fontWeight: '700' },
  back: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '800', marginTop: 4 },
});
