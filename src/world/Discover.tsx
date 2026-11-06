import { memo, useRef, useState } from 'react';
import { Animated, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { MUTUAL_IDS, PEOPLE, thumbOf, type WorldPerson } from './data';
import { tap, useWorld } from './store';
import { Chip, GoldButton, PersonBackdrop, WorldTitle, worldBg } from './ui';

// Découverte : une personne à la fois, plein écran. Glisser vers le haut = profil suivant.
const LOOP = Array.from({ length: 40 }, (_, i) => PEOPLE[i % PEOPLE.length]);

export function WorldDiscover({ onMatch, onResetProfile }: { onMatch: (p: WorldPerson) => void; onResetProfile: () => void }) {
  const insets = useSafeAreaInsets();
  const { sendHello, showToast } = useWorld();
  const [height, setHeight] = useState(0);
  const [index, setIndex] = useState(0);
  const [details, setDetails] = useState<WorldPerson | null>(null);
  const [full, setFull] = useState<WorldPerson | null>(null);
  const [filters, setFilters] = useState(false);
  const list = useRef<FlatList<WorldPerson>>(null);

  const next = () => {
    setDetails(null);
    list.current?.scrollToIndex({ index: Math.min(index + 1, LOOP.length - 1), animated: true });
  };
  const hello = (p: WorldPerson) => {
    if (MUTUAL_IDS.includes(p.id)) onMatch(p);
    else {
      sendHello(p.id);
      showToast(`👋 Hello envoyé à ${p.name}`);
      next();
    }
  };
  const connect = () => {
    showToast('✨ Demande de connexion envoyée');
    next();
  };

  return (
    <View style={styles.root} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
      {height > 0 && (
        <FlatList
          ref={list}
          data={LOOP}
          keyExtractor={(p, i) => `${p.id}-${i}`}
          renderItem={({ item }) => (
            <Card
              p={item}
              h={height}
              top={insets.top}
              dot={PEOPLE.indexOf(item)}
              onDetails={() => setDetails(item)}
              onFull={() => setFull(item)}
              onPass={next}
              onHello={() => hello(item)}
              onConnect={connect}
            />
          )}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          onMomentumScrollEnd={(e) => {
            setIndex(Math.round(e.nativeEvent.contentOffset.y / height));
            setDetails(null);
          }}
          windowSize={3}
          initialNumToRender={2}
        />
      )}

      {/* en-tête */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
        <RoundIcon icon="options" label="Filtres" onPress={() => setFilters(true)} />
        <WorldTitle size={19} />
        <RoundIcon icon="globe-outline" label="Carte" onPress={() => showToast('Bientôt : la carte du monde')} />
      </View>

      <DetailsPanel p={details} onClose={() => setDetails(null)} />

      <FullProfile
        p={full}
        onClose={() => setFull(null)}
        onPass={() => {
          setFull(null);
          next();
        }}
        onHello={(p) => {
          setFull(null);
          hello(p);
        }}
        onConnect={() => {
          setFull(null);
          connect();
        }}
      />

      <FiltersSheet
        visible={filters}
        onClose={() => setFilters(false)}
        onApply={() => {
          setFilters(false);
          showToast('Filtres appliqués');
        }}
        onReset={() => {
          setFilters(false);
          onResetProfile();
        }}
      />
    </View>
  );
}

const Card = memo(function Card({
  p,
  h,
  top,
  dot,
  onDetails,
  onFull,
  onPass,
  onHello,
  onConnect,
}: {
  p: WorldPerson;
  h: number;
  top: number;
  dot: number;
  onDetails: () => void;
  onFull: () => void;
  onPass: () => void;
  onHello: () => void;
  onConnect: () => void;
}) {
  return (
    <View style={{ height: h, backgroundColor: worldBg }}>
      <PersonBackdrop photo={p.photo} />
      <LinearGradient colors={['rgba(0,0,0,0.65)', 'transparent']} style={[styles.shade, { top: 0, height: 200 }]} />
      <LinearGradient colors={['transparent', 'rgba(8,6,3,0.55)', 'rgba(8,6,3,0.96)']} style={[styles.shade, { bottom: 0, height: h * 0.5 }]} />

      {/* vignette « Voir le profil » */}
      <Pressable
        onPress={() => {
          tap();
          onFull();
        }}
        style={[styles.thumbWrap, { top: top + 74 }]}
      >
        <View style={styles.thumbRing}>
          <Image source={thumbOf(p)} style={styles.thumb} />
          <View style={styles.thumbEye}>
            <Ionicons name="eye" size={16} color={colors.white} />
          </View>
        </View>
        <Text style={styles.thumbText}>Voir le profil</Text>
      </Pressable>

      {/* points de progression */}
      <View style={[styles.dots, { top: h * 0.36 }]}>
        {PEOPLE.map((x, i) =>
          i === dot ? (
            <LinearGradient key={x.id} colors={goldGradient} style={styles.dotOn} />
          ) : (
            <View key={x.id} style={styles.dot} />
          ),
        )}
      </View>

      {/* distance */}
      <View style={[styles.distance, { top: top + 112 }]}>
        <Ionicons name="airplane" size={13} color={colors.gold} />
        <Text style={styles.distanceText}>
          {p.flag} À {p.distanceKm} km
        </Text>
      </View>

      {/* l'essentiel */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>
            {p.name}, {p.age}
          </Text>
          <Ionicons name="checkmark-circle" size={20} color={colors.gold} />
        </View>
        <Text style={styles.place}>
          📍 {p.flag} {p.city}, {p.country}
        </Text>
        <View style={styles.tags}>
          <View style={styles.intent}>
            <Text style={styles.intentText}>{p.intent}</Text>
          </View>
          <View style={styles.online}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>En ligne</Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            tap();
            onDetails();
          }}
          style={styles.more}
          hitSlop={8}
        >
          <Text style={styles.moreText}>Voir plus</Text>
          <Ionicons name="chevron-down" size={14} color={colors.gold} />
        </Pressable>
        <Actions onPass={onPass} onHello={onHello} onConnect={onConnect} />
      </View>
    </View>
  );
});

const CONNECT_ICON = require('../../assets/world/connect.png');

function Actions({ onPass, onHello, onConnect }: { onPass: () => void; onHello: () => void; onConnect: () => void }) {
  return (
    <View style={styles.actions}>
      <Action label="Passer" hint="Au prochain profil" onPress={onPass}>
        <View style={[styles.action, styles.actionDim]}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </View>
      </Action>
      <Action label="Dire Hello" hint="Lance la conversation" onPress={onHello} gold>
        <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.action, styles.actionBig]}>
          <Text style={{ fontSize: 28 }}>👋</Text>
        </LinearGradient>
      </Action>
      <Action label="Connecter" hint="Si le feeling est là" onPress={onConnect}>
        <View style={[styles.action, styles.actionGold]}>
          <Image source={CONNECT_ICON} style={{ width: 46, height: 46 }} contentFit="contain" />
        </View>
      </Action>
    </View>
  );
}

function Action({ label, hint, onPress, gold, children }: { label: string; hint: string; onPress: () => void; gold?: boolean; children: React.ReactNode }) {
  const s = useRef(new Animated.Value(1)).current;
  const bounce = (to: number) => Animated.spring(s, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 10 }).start();
  return (
    <Pressable
      onPressIn={() => bounce(0.88)}
      onPressOut={() => bounce(1)}
      onPress={() => {
        tap();
        onPress();
      }}
      style={styles.actionWrap}
    >
      <Animated.View style={{ transform: [{ scale: s }] }}>{children}</Animated.View>
      <Text style={[styles.actionLabel, gold && { color: colors.gold }]}>{label}</Text>
      <Text style={styles.actionHint}>{hint}</Text>
    </Pressable>
  );
}

function RoundIcon({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={{ alignItems: 'center', width: 56 }}
    >
      <View style={styles.round}>
        <Ionicons name={icon} size={18} color={colors.gold} />
      </View>
      <Text style={styles.roundLabel}>{label}</Text>
    </Pressable>
  );
}

function AnswerCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.answer}>
      <Text style={styles.answerLabel}>
        {icon} {label}
      </Text>
      <Text style={styles.answerValue}>{value}</Text>
    </View>
  );
}

function Answers({ p }: { p: WorldPerson }) {
  return (
    <View style={{ gap: 8 }}>
      <AnswerCard icon="✈️" label="Mon dimanche parfait ?" value={p.sunday} />
      <AnswerCard icon="🧡" label="Mon plus gros red flag ?" value={p.redFlag} />
      <AnswerCard icon="🌐" label="Si je pouvais partir demain ?" value={p.travel} />
    </View>
  );
}

// Panneau « World Card » qui monte depuis le bas
function DetailsPanel({ p, onClose }: { p: WorldPerson | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!p} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      {p && (
        <View style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>{p.name} · sa World Card</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
              <Ionicons name="close" size={16} color={colors.text} />
            </Pressable>
          </View>
          <Text style={styles.quote}>« {p.quote} »</Text>
          <View style={styles.chips}>
            {p.interests.map((it) => (
              <Chip key={it} label={it} />
            ))}
          </View>
          <Answers p={p} />
        </View>
      )}
    </Modal>
  );
}

// Profil complet (galerie + réponses + actions)
function FullProfile({
  p,
  onClose,
  onPass,
  onHello,
  onConnect,
}: {
  p: WorldPerson | null;
  onClose: () => void;
  onPass: () => void;
  onHello: (p: WorldPerson) => void;
  onConnect: () => void;
}) {
  return (
    <Modal visible={!!p} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>{p && <FullProfileBody p={p} onClose={onClose} onPass={onPass} onHello={onHello} onConnect={onConnect} />}</SafeAreaProvider>
    </Modal>
  );
}

function FullProfileBody({
  p,
  onClose,
  onPass,
  onHello,
  onConnect,
}: {
  p: WorldPerson;
  onClose: () => void;
  onPass: () => void;
  onHello: (p: WorldPerson) => void;
  onConnect: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const photos = [p.photo, ...p.moments];
  return (
    <View style={{ flex: 1, backgroundColor: worldBg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {photos.map((src, i) => (
              <Image key={i} source={src} style={{ width, height: width * 1.25 }} contentFit="cover" />
            ))}
          </ScrollView>
          <View style={[styles.pager, { top: insets.top + 10 }]}>
            {photos.map((_, i) => (
              <View key={i} style={[styles.pagerBar, i === page && { backgroundColor: colors.gold }]} />
            ))}
          </View>
          <LinearGradient colors={['transparent', worldBg]} style={[styles.shade, { bottom: 0, height: 120 }]} />
        </View>
        <View style={{ paddingHorizontal: 18, marginTop: -30 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>
              {p.name}, {p.age}
            </Text>
            <Ionicons name="checkmark-circle" size={20} color={colors.gold} />
          </View>
          <Text style={styles.place}>
            📍 {p.flag} {p.city}, {p.country} · à {p.distanceKm} km
          </Text>
          <View style={styles.tags}>
            <View style={styles.intent}>
              <Text style={styles.intentText}>{p.intent}</Text>
            </View>
            <View style={styles.online}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>En ligne</Text>
            </View>
          </View>
          <Text style={[styles.quote, { marginTop: 18 }]}>« {p.quote} »</Text>
          <Text style={styles.section}>CENTRES D'INTÉRÊT</Text>
          <View style={styles.chips}>
            {p.interests.map((it) => (
              <Chip key={it} label={it} />
            ))}
          </View>
          <Text style={styles.section}>SES RÉPONSES WORLD CARD</Text>
          <Answers p={p} />
        </View>
      </ScrollView>
      <View style={[styles.fullActions, { paddingBottom: insets.bottom + 6 }]}>
        <Actions onPass={onPass} onHello={() => onHello(p)} onConnect={onConnect} />
      </View>
      <Pressable onPress={onClose} hitSlop={10} style={[styles.fullBack, { top: insets.top + 24 }]}>
        <Ionicons name="chevron-back" size={22} color={colors.white} />
      </Pressable>
    </View>
  );
}

const FILTERS = [
  { label: 'Je veux voir', options: ['Tous', 'Hommes', 'Femmes', 'LGBT+'] },
  { label: 'Âge', options: ['18–24', '25–35', '36–45', '46+'] },
  { label: 'Zone', options: ['Monde entier', 'Mon pays', 'Afrique', 'Europe', 'Asie'] },
  { label: 'Langue', options: ['FR', 'EN'] },
  { label: 'Intention', options: ['Peu importe', 'Amitié', 'Discussion', 'Rencontre sérieuse'] },
];

function FiltersSheet({ visible, onClose, onApply, onReset }: { visible: boolean; onClose: () => void; onApply: () => void; onReset: () => void }) {
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<Record<string, string>>({
    'Je veux voir': 'Tous',
    Âge: '25–35',
    Zone: 'Monde entier',
    Langue: 'FR',
    Intention: 'Peu importe',
  });
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
      <View style={[styles.panel, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />
        <Text style={[styles.panelTitle, { marginBottom: 4 }]}>Filtres du voyage</Text>
        {FILTERS.map((row) => (
          <View key={row.label}>
            <Text style={styles.section}>{row.label.toUpperCase()}</Text>
            <View style={styles.chips}>
              {row.options.map((o) => (
                <Chip key={o} label={o} on={values[row.label] === o} onPress={() => setValues((v) => ({ ...v, [row.label]: o }))} />
              ))}
            </View>
          </View>
        ))}
        <GoldButton label="Voir les profils" onPress={onApply} style={{ marginTop: 18 }} />
        <Pressable onPress={onReset} style={{ alignSelf: 'center', marginTop: 12 }} hitSlop={8}>
          <Text style={{ color: colors.textFaint, fontSize: 12.5 }}>Recommencer la création du profil (démo)</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: worldBg },
  shade: { position: 'absolute', left: 0, right: 0 },
  header: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 12 },
  round: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.4)',
  },
  roundLabel: { color: colors.text, fontSize: 10.5, fontWeight: '700', marginTop: 3, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3 },
  thumbWrap: { position: 'absolute', right: 14, alignItems: 'center' },
  thumbRing: { padding: 2, borderRadius: 16, backgroundColor: colors.gold },
  thumb: { width: 62, height: 80, borderRadius: 14 },
  thumbEye: { position: 'absolute', alignSelf: 'center', top: 30, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  thumbText: { color: colors.text, fontSize: 10.5, fontWeight: '800', marginTop: 5, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.55)' },
  dots: { position: 'absolute', right: 10, gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotOn: { width: 6, height: 16, borderRadius: 3 },
  distance: {
    position: 'absolute',
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
  },
  distanceText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  info: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingBottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.white, fontSize: 30, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 6 },
  place: { color: 'rgba(247,241,225,0.9)', fontSize: 13.5, fontWeight: '600', marginTop: 3 },
  tags: { flexDirection: 'row', gap: 8, marginTop: 10 },
  intent: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(212,175,55,0.18)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.5)' },
  intentText: { color: colors.goldLight, fontSize: 12.5, fontWeight: '800' },
  online: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)' },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#3CCB6C' },
  onlineText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 10, alignSelf: 'flex-start' },
  moreText: { color: colors.gold, fontSize: 13, fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', marginTop: 14 },
  actionWrap: { alignItems: 'center', width: 110 },
  action: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  actionBig: { width: 70, height: 70, borderRadius: 35, shadowColor: colors.gold, shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  actionDim: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  actionGold: { backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1.5, borderColor: colors.gold },
  actionLabel: { color: colors.text, fontSize: 12.5, fontWeight: '800', marginTop: 6 },
  actionHint: { color: colors.textFaint, fontSize: 10.5, marginTop: 1 },
  panel: {
    backgroundColor: '#14100A',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
    paddingHorizontal: 18,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textFaint, marginTop: 8, marginBottom: 10 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { color: colors.gold, fontSize: 16, fontWeight: '900' },
  close: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  quote: { color: colors.text, fontSize: 15, fontStyle: 'italic', lineHeight: 21, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 12 },
  answer: { padding: 13, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.18)' },
  answerLabel: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  answerValue: { color: colors.text, fontSize: 14, marginTop: 4 },
  section: { color: colors.textDim, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, marginTop: 18 },
  pager: { position: 'absolute', left: 50, right: 14, flexDirection: 'row', gap: 4 },
  pagerBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' },
  fullActions: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(212,175,55,0.25)', backgroundColor: worldBg, paddingBottom: 6 },
  fullBack: { position: 'absolute', left: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});
