import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { MOODS, SLAM_GIFTS, ZEM_AMOUNTS, avatarOf, fmtDur, moodOf, soundsFor, type SlamDuration, type Slot, type Sound } from './slamData';

export const tap = () => void Haptics.selectionAsync().catch(() => {});
const MAGENTA = '#E0457B';

// Feuille qui monte du bas, propre à Mic d'Or Thérapie
function BottomSheet({ visible, onClose, children, tall }: { visible: boolean; onClose: () => void; children: React.ReactNode; tall?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }, tall && { maxHeight: '88%' }]}>
          <View style={styles.grabber} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Demander le mic : titre, durée 1 ou 3 min, ambiance, mélodie ──
export type SlamRequest = { title: string; duration: SlamDuration; mood: string; sound: Sound | null; lyrics?: string };

export function RequestSheet({ visible, onClose, onSubmit }: { visible: boolean; onClose: () => void; onSubmit: (r: SlamRequest) => void }) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState<SlamDuration | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [sound, setSound] = useState<Sound | null>(null);
  const [lyrics, setLyrics] = useState('');
  const [preview, setPreview] = useState<{ id: string; elapsed: number; playing: boolean } | null>(null);

  // aperçu simulé (pas encore de vraies pistes audio)
  useEffect(() => {
    if (!preview?.playing) return;
    const t = setInterval(() => setPreview((p) => (p ? { ...p, elapsed: p.elapsed + 1 } : p)), 1000);
    return () => clearInterval(t);
  }, [preview?.playing]);
  useEffect(() => {
    if (!visible) {
      setPreview(null);
      return;
    }
    setTitle('');
    setLyrics('');
    setDuration(null);
    setMood(null);
    setSound(null);
  }, [visible]);

  const tracks = soundsFor(mood, duration);
  const noMusic = mood === 'aucune';
  const ready = title.trim().length > 1 && duration !== null && mood !== null;

  return (
    <BottomSheet visible={visible} onClose={onClose} tall>
      <View style={styles.headRow}>
        <Text style={styles.sheetTitle}>Demander le mic</Text>
        <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
          <Ionicons name="close" size={16} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.label}>TITRE DE TON PASSAGE</Text>
        <TextInput
          value={title}
          onChangeText={(v) => setTitle(v.slice(0, 48))}
          placeholder="Ex. : J'ai appris à me choisir"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          selectionColor={colors.gold}
        />
        <Text style={styles.counter}>{title.length}/48</Text>

        <Text style={styles.label}>TON TEXTE (FACULTATIF)</Text>
        <TextInput
          value={lyrics}
          onChangeText={(v) => setLyrics(v.slice(0, 1500))}
          placeholder={'Colle ou écris ton texte ici, une ligne par vers…'}
          placeholderTextColor={colors.textFaint}
          multiline
          style={[styles.input, styles.lyricsInput]}
          selectionColor={colors.gold}
        />
        <Text style={styles.hint}>
          {lyrics.trim()
            ? `📝 ${lyrics.trim().split('\n').filter((l) => l.trim()).length} lignes · ton texte s'affichera en grand pendant ton passage, façon karaoké.`
            : '🎙 Sans texte, tes paroles seront sous-titrées en direct à l’écran.'}
        </Text>

        <Text style={styles.label}>DURÉE</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {([1, 3] as SlamDuration[]).map((d) => {
            const on = duration === d;
            return (
              <Pressable
                key={d}
                onPress={() => {
                  tap();
                  setDuration(d);
                  setSound(null);
                  setPreview(null);
                }}
                style={[styles.durBtn, on && styles.durOn]}
              >
                <Text style={[styles.durText, on && { color: '#1D1405' }]}>{d} MIN</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>Uniquement 1 ou 3 minutes — c'est la règle de la scène.</Text>

        <Text style={styles.label}>AMBIANCE MUSICALE</Text>
        <View style={styles.wrap}>
          {MOODS.map((m) => {
            const on = mood === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() => {
                  tap();
                  setMood(m.id);
                  setSound(null);
                  setPreview(null);
                }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && { color: '#1D1405' }]}>
                  {m.emoji} {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {!noMusic && tracks.length > 0 && (
          <>
            <Text style={styles.label}>
              INSTRUMENTALES {moodOf(mood!).label.toUpperCase()} · {duration} MIN
            </Text>
            <Text style={[styles.hint, { marginTop: -2, marginBottom: 8 }]}>Écoute les aperçus, puis touche un morceau pour le choisir.</Text>
            <View style={{ gap: 8 }}>
              {tracks.map((s) => {
                const on = sound?.id === s.id;
                const cur = preview?.id === s.id;
                const total = s.duration * 60;
                return (
                  <View key={s.id} style={[styles.track, on && styles.trackOn]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Pressable
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                        onPress={() => {
                          tap();
                          setSound(on ? null : s);
                        }}
                      >
                        <View style={[styles.check, on && { backgroundColor: colors.gold, borderColor: colors.gold }]}>
                          {on && <Ionicons name="checkmark" size={12} color="#1D1405" />}
                        </View>
                        <View>
                          <Text style={styles.trackName}>{s.name}</Text>
                          <Text style={styles.trackSub}>
                            {moodOf(s.mood).emoji} {moodOf(s.mood).label} · {s.duration === 1 ? '1:00' : '3:00'}
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          tap();
                          setPreview((p) => (p?.id === s.id ? { ...p, playing: !p.playing } : { id: s.id, elapsed: 0, playing: true }));
                        }}
                        style={[styles.previewBtn, cur && { backgroundColor: colors.gold }]}
                      >
                        <Ionicons name={cur && preview?.playing ? 'pause' : 'play'} size={12} color={cur ? '#1D1405' : colors.text} />
                        <Text style={[styles.previewText, cur && { color: '#1D1405' }]}>
                          {cur && preview?.playing ? 'lecture…' : cur ? 'reprendre' : 'Aperçu'}
                        </Text>
                      </Pressable>
                    </View>
                    {cur && preview && (
                      <View style={{ marginTop: 8 }}>
                        <View style={styles.bar}>
                          <View style={[styles.barFill, { width: `${Math.min(1, preview.elapsed / total) * 100}%` }]} />
                        </View>
                        <Text style={styles.trackSub}>
                          00:{String(preview.elapsed % 60).padStart(2, '0')} / {fmtDur(s.duration)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}
        {noMusic && <Text style={[styles.hint, { marginTop: 10 }]}>Tu passeras a cappella — aucune mélodie ne sera lancée.</Text>}

        <Pressable
          disabled={!ready}
          onPress={() => {
            tap();
            setPreview(null);
            onSubmit({ title: title.trim(), duration: duration!, mood: mood!, sound, lyrics: lyrics.trim() || undefined });
          }}
          style={{ marginTop: 18 }}
        >
          {ready ? (
            <LinearGradient colors={goldGradient} style={styles.cta}>
              <Ionicons name="mic" size={16} color="#1D1405" />
              <Text style={styles.ctaText}>Envoyer ma demande</Text>
            </LinearGradient>
          ) : (
            <View style={[styles.cta, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <Ionicons name="mic" size={16} color={colors.textFaint} />
              <Text style={[styles.ctaText, { color: colors.textFaint }]}>Envoyer ma demande</Text>
            </View>
          )}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

// ── Tiroir « Scène ouverte » : demandes, sur scène, file d'attente ──
export function QueueDrawer({
  visible,
  onClose,
  hostMode,
  onToggleHost,
  perf,
  queue,
  requests,
  mine,
  myPos,
  etaMin,
  onAccept,
  onRefuse,
  onMove,
  onRemove,
  onStartNow,
  onRequest,
  onPrepare,
  onSeeAll,
}: {
  visible: boolean;
  onClose: () => void;
  hostMode: boolean;
  onToggleHost: () => void;
  perf: Slot;
  queue: Slot[];
  requests: Slot[];
  mine: Slot | null;
  myPos: number;
  etaMin: number;
  onAccept: (s: Slot) => void;
  onRefuse: (s: Slot) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onRemove: (s: Slot) => void;
  onStartNow: (s: Slot) => void;
  onRequest: () => void;
  onPrepare: () => void;
  onSeeAll: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelW = Math.min(360, width * 0.88);
  const x = useRef(new Animated.Value(panelW)).current;
  const [shown, setShown] = useState(visible);
  // calque dans le live (pas une fenêtre séparée) pour pouvoir ouvrir une feuille juste après

  useEffect(() => {
    if (visible) setShown(true);
    Animated.timing(x, { toValue: visible ? 0 : panelW, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => finished && !visible && setShown(false),
    );
  }, [visible, panelW, x]);

  if (!shown) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: x.interpolate({ inputRange: [0, panelW], outputRange: [1, 0] }) }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.drawer, { width: panelW, paddingTop: insets.top + 8, transform: [{ translateX: x }] }]}>
        <View style={styles.headRow}>
          <Ionicons name="mic" size={16} color={colors.gold} />
          <Text style={[styles.sheetTitle, { flex: 1, fontSize: 15 }]}>Mic d'Or Thérapie — Scène ouverte</Text>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={16} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={() => {
              tap();
              onToggleHost();
            }}
            style={styles.hostToggle}
          >
            <Ionicons name="ribbon" size={13} color={colors.gold} />
            <Text style={styles.hostText}>{hostMode ? 'Vue Hôte (modération active)' : 'Vue Spectateur'}</Text>
            <Text style={styles.change}>changer</Text>
          </Pressable>

          {hostMode && requests.length > 0 && (
            <>
              <Text style={styles.section}>DEMANDES DE PASSAGE ({requests.length})</Text>
              {requests.map((r) => (
                <View key={r.id} style={styles.reqCard}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    <Image source={avatarOf(r.name)} style={styles.av32} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{r.name}</Text>
                      <Text style={styles.sub} numberOfLines={1}>
                        {r.title}
                      </Text>
                      <Text style={styles.meta}>
                        ⏱ {r.duration} min • {moodOf(r.mood).emoji} {moodOf(r.mood).label}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable onPress={() => onRefuse(r)} style={[styles.smallBtn, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
                      <Text style={styles.smallDim}>Refuser</Text>
                    </Pressable>
                    <Pressable onPress={() => onAccept(r)} style={{ flex: 1 }}>
                      <LinearGradient colors={goldGradient} style={styles.smallBtn}>
                        <Text style={styles.smallGold}>Accepter</Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                </View>
              ))}
              <Text style={styles.metaNote}>On n'entre dans la file officielle qu'après acceptation.</Text>
            </>
          )}

          <Text style={styles.section}>SUR SCÈNE</Text>
          <View style={[styles.reqCard, { borderColor: 'rgba(212,175,55,0.5)', flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <Image source={avatarOf(perf.name)} style={[styles.av38, { borderColor: colors.gold, borderWidth: 2 }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{perf.name}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {perf.title}
              </Text>
              <Text style={styles.meta}>
                {moodOf(perf.mood).emoji} {moodOf(perf.mood).label}
              </Text>
            </View>
            <Text style={styles.dur}>{fmtDur(perf.duration)}</Text>
          </View>

          <Text style={styles.section}>À SUIVRE ({queue.length})</Text>
          {queue.map((q, i) => (
            <View key={q.id} style={[styles.reqCard, q.me && { borderColor: 'rgba(212,175,55,0.55)', backgroundColor: 'rgba(212,175,55,0.1)' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {hostMode && <Ionicons name="reorder-three" size={16} color={colors.textFaint} />}
                <Text style={styles.pos}>{i + 1}</Text>
                <Image source={avatarOf(q.name)} style={styles.av30} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {q.name}
                    {q.me ? ' (toi)' : ''}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {q.title}
                  </Text>
                  <Text style={styles.meta}>
                    {moodOf(q.mood).emoji} {moodOf(q.mood).label}
                  </Text>
                </View>
                <Text style={styles.dur}>{fmtDur(q.duration)}</Text>
              </View>
              {hostMode && (
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                  <IconBtn icon="chevron-up" onPress={() => onMove(i, -1)} />
                  <IconBtn icon="chevron-down" onPress={() => onMove(i, 1)} />
                  <IconBtn icon="trash-outline" onPress={() => onRemove(q)} danger />
                  <Pressable
                    onPress={() => {
                      tap();
                      onStartNow(q);
                    }}
                    style={{ flex: 1 }}
                  >
                    <LinearGradient colors={goldGradient} style={[styles.smallBtn, { flexDirection: 'row', gap: 4 }]}>
                      <Ionicons name="play-skip-forward" size={12} color="#1D1405" />
                      <Text style={styles.smallGold}>Passer maintenant</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
          {queue.length === 0 && <Text style={styles.metaNote}>La file est vide — la scène est à toi.</Text>}
          <Pressable onPress={onSeeAll} style={styles.seeAll}>
            <Text style={styles.seeAllText}>Voir toute la file ({queue.length + requests.length})</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.gold} />
          </Pressable>

          <View style={styles.cta2}>
            <Text style={styles.cta2Title}>Envie de prendre le mic ?</Text>
            <Text style={styles.sub}>Partage ton texte avec la communauté.</Text>
            {mine ? (
              <>
                <Text style={[styles.meta, { color: colors.gold, marginTop: 8 }]}>
                  Tu es déjà dans la file (#{myPos || 1}) — ~{etaMin} min
                </Text>
                <Pressable onPress={onPrepare} style={{ marginTop: 10 }}>
                  <LinearGradient colors={goldGradient} style={styles.cta}>
                    <Ionicons name="mic" size={15} color="#1D1405" />
                    <Text style={styles.ctaText}>Préparer ma performance</Text>
                  </LinearGradient>
                </Pressable>
              </>
            ) : (
              <Pressable onPress={onRequest} style={{ marginTop: 10 }}>
                <LinearGradient colors={goldGradient} style={styles.cta}>
                  <Ionicons name="mic" size={15} color="#1D1405" />
                  <Text style={styles.ctaText}>Demander le mic</Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>

          <View style={styles.rules}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="shield-checkmark" size={14} color={colors.gold} />
              <Text style={styles.name}>Règles de la scène</Text>
            </View>
            {['Respect', 'Zéro jugement', '1 ou 3 minutes uniquement', 'Des mots pour guérir ✨'].map((r) => (
              <Text key={r} style={[styles.sub, { marginTop: 4 }]}>
                ✓ {r}
              </Text>
            ))}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function IconBtn({ icon, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={styles.iconBtn}
    >
      <Ionicons name={icon} size={14} color={danger ? '#F07167' : colors.text} />
    </Pressable>
  );
}

// ── Feuilles : partager, cadeaux, Zems, menu ──
export type SlamSheetKind = 'share' | 'gift' | 'zems' | 'menu' | null;

export function SlamActionSheet({
  kind,
  onClose,
  performer,
  onToast,
  onGift,
  onZems,
  onQuit,
}: {
  kind: SlamSheetKind;
  onQuit: () => void;
  onClose: () => void;
  performer: string;
  onToast: (t: string) => void;
  onGift: (g: (typeof SLAM_GIFTS)[number]) => void;
  onZems: (n: number) => void;
}) {
  const [last, setLast] = useState<SlamSheetKind>(kind);
  useEffect(() => {
    if (kind) setLast(kind);
  }, [kind]);
  const k = kind ?? last;
  const row = (icon: string, label: string, t: string) => (
    <Pressable
      key={label}
      onPress={() => {
        tap();
        onClose();
        onToast(t);
      }}
      style={styles.menuRow}
    >
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={styles.menuText}>{label}</Text>
    </Pressable>
  );
  return (
    <BottomSheet visible={!!kind} onClose={onClose}>
      {k === 'share' && (
        <>
          <Text style={styles.sheetTitle}>Partager le live</Text>
          {row('🔗', 'Copier le lien', 'Lien du live copié')}
          {row('💬', 'Envoyer en message', 'Partagé en message')}
          {row('📲', 'Partager sur WhatsApp', 'Partagé sur WhatsApp')}
          {row('📸', 'Ajouter à ma story', 'Ajouté à ta story')}
        </>
      )}
      {k === 'gift' && (
        <>
          <View style={styles.headRow}>
            <Text style={[styles.sheetTitle, { flex: 1 }]}>Offrir un cadeau</Text>
            <Text style={styles.balance}>Solde : 3 250 Z</Text>
          </View>
          <View style={styles.giftGrid}>
            {SLAM_GIFTS.map((g) => (
              <Pressable key={g.name} onPress={() => onGift(g)} style={styles.gift}>
                <Text style={{ fontSize: 30 }}>{g.emoji}</Text>
                <Text style={styles.giftName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.giftCost}>{g.cost} Z</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {k === 'zems' && (
        <>
          <Text style={styles.sheetTitle}>Envoyer des Zems à {performer}</Text>
          <Text style={[styles.sub, { marginBottom: 12 }]}>Soutiens sa performance — Solde : 3 250 Z</Text>
          <View style={styles.giftGrid}>
            {ZEM_AMOUNTS.map((a) => (
              <Pressable key={a} onPress={() => onZems(a)} style={[styles.gift, { paddingVertical: 16 }]}>
                <Text style={styles.zemAmount}>{a} Z</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {k === 'menu' && (
        <>
          {row('🛡️', 'Règles de la scène', 'Règles : respect, zéro jugement, 1 ou 3 minutes')}
          {row('🚩', 'Signaler', 'Signalement envoyé à la modération')}
          <Pressable
            onPress={() => {
              tap();
              onClose();
              onToast('À bientôt sur Zembo 🤍');
              setTimeout(onQuit, 500);
            }}
            style={styles.menuRow}
          >
            <Text style={{ fontSize: 18 }}>🚪</Text>
            <Text style={[styles.menuText, { color: '#F07167' }]}>Quitter le live</Text>
          </Pressable>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#15100B',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    paddingHorizontal: 18,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textFaint, marginTop: 8, marginBottom: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginBottom: 6 },
  closeBtn: { marginLeft: 'auto', width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  input: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.25)',
  },
  lyricsInput: { height: 120, paddingTop: 12, textAlignVertical: 'top', fontSize: 14.5, lineHeight: 20 },
  counter: { color: colors.textFaint, fontSize: 11, textAlign: 'right', marginTop: 4 },
  durBtn: { flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  durOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  durText: { color: colors.text, fontSize: 16, fontWeight: '900' },
  hint: { color: colors.textFaint, fontSize: 11.5, marginTop: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  track: { padding: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  trackOn: { backgroundColor: 'rgba(212,175,55,0.15)', borderColor: 'rgba(212,175,55,0.6)' },
  check: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  trackName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  trackSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  previewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  previewText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  bar: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: colors.gold },
  cta: { height: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: '#1D1405', fontSize: 14.5, fontWeight: '900' },
  drawer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#120E09',
    borderLeftWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    paddingHorizontal: 14,
  },
  hostToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    marginTop: 6,
  },
  hostText: { flex: 1, color: colors.goldLight, fontSize: 12.5, fontWeight: '800' },
  change: { color: colors.textDim, fontSize: 11, textDecorationLine: 'underline' },
  section: { color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  reqCard: { padding: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 8 },
  av30: { width: 30, height: 30, borderRadius: 15 },
  av32: { width: 34, height: 34, borderRadius: 17 },
  av38: { width: 40, height: 40, borderRadius: 20 },
  name: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 12 },
  meta: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  metaNote: { color: colors.textFaint, fontSize: 11, textAlign: 'center', marginTop: 2 },
  dur: { color: colors.gold, fontSize: 12, fontWeight: '900' },
  pos: { color: colors.gold, fontSize: 13, fontWeight: '900', width: 14, textAlign: 'center' },
  smallBtn: { height: 34, borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  smallGold: { color: '#1D1405', fontSize: 12, fontWeight: '900' },
  smallDim: { color: colors.textDim, fontSize: 12, fontWeight: '800' },
  iconBtn: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  seeAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10 },
  seeAllText: { color: colors.gold, fontSize: 12.5, fontWeight: '800' },
  cta2: { padding: 14, borderRadius: 18, backgroundColor: 'rgba(224,69,123,0.1)', borderWidth: 1, borderColor: 'rgba(224,69,123,0.35)', marginTop: 6 },
  cta2Title: { color: colors.text, fontSize: 15, fontWeight: '900', marginBottom: 2 },
  rules: { padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', marginTop: 12 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  menuText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  balance: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, marginTop: 6 },
  gift: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.22)',
    gap: 2,
  },
  giftName: { color: colors.text, fontSize: 11.5, fontWeight: '800' },
  giftCost: { color: colors.gold, fontSize: 11, fontWeight: '700' },
  zemAmount: { color: colors.goldLight, fontSize: 17, fontWeight: '900' },
});

export { MAGENTA };
