import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { GIFTS, photoUrl } from './data';
import type { TableLive } from './useTableLive';
import { Initial } from '../live/LiveViewer';

// Panneaux qui montent du bas : spectateurs, demandes, cadeaux, menu d'un invité

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>{title}</Text>
        {children}
      </View>
    </Modal>
  );
}

export function SpectatorsSheet({ live, visible, onClose }: { live: TableLive; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={`SPECTATEURS · ${live.viewers}`}>
      {!live.spectators && (
        <Text style={styles.hint}>
          {live.viewers > 0
            ? `${live.viewers} personne${live.viewers > 1 ? 's' : ''} regarde${live.viewers > 1 ? 'nt' : ''} ta table en ce moment.`
            : 'Personne ne regarde encore. Ta table est visible sur l’accueil de Zembo.'}
        </Text>
      )}
      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={styles.grid}>
        {(live.spectators ?? []).map((s) => (
          <View key={s} style={styles.spec}>
            <Image source={photoUrl(s, 96)} style={styles.specAvatar} />
            <Text style={styles.specName} numberOfLines={1}>
              {s}
            </Text>
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
}

export function QueueSheet({ live, visible, onClose }: { live: TableLive; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={`EN ATTENTE · ${live.queue.length}`}>
      <Text style={styles.hint}>
        {live.freeSeats > 0
          ? `${live.freeSeats} place${live.freeSeats > 1 ? 's' : ''} libre${live.freeSeats > 1 ? 's' : ''} : accepte une demande pour faire monter quelqu'un.`
          : 'La table est complète. Fais descendre quelqu’un pour libérer une place.'}
      </Text>
      <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
        {live.queue.map((q) => (
          <View key={q.id} style={styles.queueRow}>
            {q.real ? (
              <View style={styles.queueAvatar}>
                <Initial name={q.name} size={40} />
              </View>
            ) : (
              <Image source={photoUrl(q.name)} style={styles.queueAvatar} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.queueName}>{q.name}</Text>
              <Text style={styles.queueSub}>veut monter à la table</Text>
            </View>
            <Pressable onPress={() => live.decline(q.id)} style={styles.declineBtn} hitSlop={6}>
              <Ionicons name="close" size={16} color={colors.textDim} />
            </Pressable>
            <Pressable onPress={() => live.accept(q.id)} disabled={live.freeSeats === 0} style={{ opacity: live.freeSeats ? 1 : 0.4 }}>
              <LinearGradient colors={goldGradient} style={styles.smallCta}>
                <Text style={styles.smallCtaText}>Accepter</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ))}
        {live.queue.length === 0 && <Text style={styles.hint}>Aucune demande pour le moment.</Text>}
      </ScrollView>
    </Sheet>
  );
}

export function GiftSheet({ live, visible, onClose, onGift }: { live: TableLive; visible: boolean; onClose: () => void; onGift: (e: string) => void }) {
  const [zems, setZems] = useState(850);
  return (
    <Sheet visible={visible} onClose={onClose} title="CADEAUX">
      <Text style={styles.hint}>
        Offre un cadeau à la table · Solde : <Text style={{ color: colors.goldLight, fontWeight: '800' }}>{zems} Zems</Text>
      </Text>
      <View style={styles.giftGrid}>
        {GIFTS.map((gift) => {
          const ok = zems >= gift.cost;
          return (
            <Pressable
              key={gift.name}
              disabled={!ok}
              onPress={() => {
                setZems((z) => z - gift.cost);
                live.say(`a offert ${gift.name} ${gift.emoji} à la table`, true);
                onGift(gift.emoji);
                onClose();
              }}
              style={[styles.gift, !ok && { opacity: 0.4 }]}
            >
              <Text style={{ fontSize: 30 }}>{gift.emoji}</Text>
              <Text style={styles.giftName}>{gift.name}</Text>
              <Text style={styles.giftCost}>{gift.cost} Zems</Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

export function SeatMenuSheet({ live, seatN, onClose, onQuit }: { live: TableLive; seatN: number | null; onClose: () => void; onQuit: () => void }) {
  const seat = live.seats.find((s) => s.n === seatN);
  const host = live.role === 'host' || live.role === 'demo';
  const run = (fn?: () => void) => () => {
    fn?.();
    onClose();
  };
  const mine = !!seat?.you;
  return (
    <Sheet visible={!!seat} onClose={onClose} title={seat?.name ? `${seat.name}${seat.host ? ' — ★ HÔTE' : ''}` : ''}>
      {/* ma place : caméra, micro */}
      {mine && live.real && (
        <>
          <MenuRow label={live.isMuted(seat!) ? 'Rallumer mon micro' : 'Couper mon micro'} onPress={run(() => live.toggleMute(seat!.n))} />
          <MenuRow label={live.myCam ? 'Couper ma caméra' : 'Rallumer ma caméra'} onPress={run(live.toggleCam)} />
          <MenuRow label="Retourner la caméra" onPress={run(live.flip)} />
        </>
      )}
      {!mine && <MenuRow label="Voir le profil" onPress={onClose} />}
      {/* l'hôte gère les invités */}
      {host && seat && (!mine || !live.real) && (
        <MenuRow label={live.isMuted(seat) ? 'Réactiver le micro' : 'Couper le micro'} onPress={run(() => live.toggleMute(seat.n))} />
      )}
      {host && seat && !seat.host && (
        <MenuRow label="Faire descendre de la table" onPress={run(() => live.removeFromTable(seat.n))} />
      )}
      {!mine && <MenuRow label="Signaler" danger onPress={onClose} />}
      {mine && live.role === 'stage' && <MenuRow label="Descendre de la table" dim onPress={run(live.leave)} />}
      {mine && host && <MenuRow label="Quitter la table" dim onPress={onQuit} />}
    </Sheet>
  );
}

function MenuRow({ label, onPress, danger, dim }: { label: string; onPress: () => void; danger?: boolean; dim?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.menuRow}>
      <Text style={[styles.menuText, danger && { color: '#E5533D' }, dim && { color: colors.textDim }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textFaint, marginTop: 8 },
  sheetTitle: { color: colors.gold, fontSize: 15, fontWeight: '900', letterSpacing: 1, marginTop: 12, marginBottom: 8 },
  hint: { color: colors.textDim, fontSize: 12.5, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 6 },
  spec: { width: '20%', alignItems: 'center', marginBottom: 14 },
  specAvatar: { width: 46, height: 46, borderRadius: 23 },
  specName: { color: colors.textDim, fontSize: 10.5, marginTop: 4 },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(247,241,225,0.1)',
    backgroundColor: colors.surface2,
  },
  queueAvatar: { width: 38, height: 38, borderRadius: 19 },
  queueName: { color: colors.white, fontWeight: '800', fontSize: 13.5 },
  queueSub: { color: colors.textDim, fontSize: 11.5, marginTop: 1 },
  declineBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(247,241,225,0.15)', alignItems: 'center', justifyContent: 'center' },
  smallCta: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  smallCtaText: { color: colors.bg, fontWeight: '900', fontSize: 12 },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 12, rowGap: 10 },
  gift: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
    backgroundColor: colors.surface2,
    gap: 3,
  },
  giftName: { color: colors.white, fontWeight: '800', fontSize: 12 },
  giftCost: { color: 'rgba(243,210,122,0.85)', fontWeight: '700', fontSize: 11 },
  menuRow: { paddingVertical: 13 },
  menuText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
