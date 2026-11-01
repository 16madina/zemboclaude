import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { DEENA_PHOTO } from '../table/data';
import { INTENTIONS, ageNumber, thumbOf } from './data';
import { tap, useWorld } from './store';
import { worldBg } from './ui';

// « Mon profil World » : présenté comme une vraie fiche de rencontre (photo plein cadre,
// cartes de réponses entre les photos, essentiels en étiquettes), avec les réglages en bas.

const GENDER: Record<string, string> = { femme: 'Femme', homme: 'Homme', autre: 'Autre' };
const RULES = ['Tout le monde', 'Selon mes critères'] as const;
const VISIBILITY = ['Visible', 'En pause'] as const;

export function WorldMyProfile({ onEdit, onMessages, onQuit }: { onEdit: (step: number) => void; onMessages: () => void; onQuit: () => void }) {
  const w = useWorld();
  const d = w.profile;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [rule, setRule] = useState<(typeof RULES)[number]>('Tout le monde');
  const [visible, setVisible] = useState<(typeof VISIBILITY)[number]>('Visible');

  const photos: (string | number)[] = d.photos.length ? d.photos : [DEENA_PHOTO];
  const heroH = Math.round(width * 1.28);
  const age = ageNumber(d.age);
  const intents = INTENTIONS.filter((i) => d.intentions.includes(i.key));
  const prompts = [
    { q: 'Mon dimanche parfait…', a: d.answerSunday, step: 3 },
    { q: 'Mon plus gros red flag…', a: d.answerRedFlag, step: 3 },
    { q: 'Si je pouvais partir demain…', a: d.answerEscape, step: 3 },
  ].filter((p) => p.a.trim());

  // complétude du profil
  const checks = [
    d.photos.length >= 2,
    d.photos.length >= 4,
    !!d.bio.trim(),
    prompts.length === 3,
    !!d.orientation,
    d.languages.length > 0,
    d.intentions.length > 0,
  ];
  const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const tip = d.photos.length < 4 ? { text: 'Ajoute des photos : les profils avec 4 photos ou plus reçoivent bien plus de Hellos.', step: 2 } : !d.bio.trim() ? { text: 'Ajoute une petite bio qui te ressemble.', step: 3 } : d.languages.length === 0 ? { text: 'Indique les langues que tu parles.', step: 5 } : null;

  const essentials = [
    age !== null && d.showAge ? { icon: 'gift-outline' as const, label: `${age} ans` } : null,
    d.gender ? { icon: 'person-outline' as const, label: GENDER[d.gender] } : null,
    d.orientation ? { icon: 'heart-outline' as const, label: d.orientation } : null,
    d.city ? { icon: 'location-outline' as const, label: [d.city, d.country].filter(Boolean).join(', ') } : null,
    ...d.languages.map((l) => ({ icon: 'chatbubbles-outline' as const, label: l })),
  ].filter(Boolean) as { icon: keyof typeof Ionicons.glyphMap; label: string }[];

  const extraPhotos = photos.slice(1);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* ── Photo plein cadre ── */}
        <View style={{ height: heroH }}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
            {photos.map((p, i) => (
              <Image key={i} source={p} style={{ width, height: heroH }} contentFit="cover" transition={200} />
            ))}
          </ScrollView>
          <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={[styles.shade, { top: 0, height: 140 }]} pointerEvents="none" />
          <LinearGradient colors={['transparent', 'rgba(11,8,5,0.6)', worldBg]} locations={[0, 0.55, 1]} style={[styles.shade, { bottom: 0, height: heroH * 0.45 }]} pointerEvents="none" />
          {photos.length > 1 && (
            <View style={[styles.pager, { top: insets.top + 6 }]} pointerEvents="none">
              {photos.map((_, i) => (
                <View key={i} style={[styles.pagerBar, i === page && styles.pagerOn]} />
              ))}
            </View>
          )}
          <View style={[styles.topRow, { top: insets.top + 16 }]} pointerEvents="box-none">
            <View style={styles.previewPill}>
              <Ionicons name="eye-outline" size={13} color={colors.text} />
              <Text style={styles.previewText}>Ce que les autres voient</Text>
            </View>
          </View>
          <View style={styles.heroInfo} pointerEvents="box-none">
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {d.username || 'ton_pseudo'}
                {d.showAge && age !== null ? <Text style={styles.age}>, {age}</Text> : null}
              </Text>
              <Ionicons name="checkmark-circle" size={22} color={colors.gold} />
            </View>
            <View style={styles.metaRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.meta}>En ligne · 📍 {[d.city, d.country].filter(Boolean).join(', ') || 'Ta ville'}</Text>
            </View>
            {intents.length > 0 && (
              <View style={styles.intentRow}>
                {intents.map((i) => (
                  <View key={i.key} style={styles.intent}>
                    <Text style={styles.intentText}>
                      {i.icon} {i.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <Pressable
            onPress={() => {
              tap();
              onEdit(2);
            }}
            style={styles.cameraBtn}
          >
            <Ionicons name="camera" size={18} color="#1D1405" />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {/* ── Complétude ── */}
          <View style={styles.progressCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.progressTitle}>Profil complété à {pct} %</Text>
              <Pressable
                onPress={() => {
                  tap();
                  onEdit(1);
                }}
                style={styles.editPill}
              >
                <Ionicons name="pencil" size={12} color="#1D1405" />
                <Text style={styles.editPillText}>Modifier</Text>
              </Pressable>
            </View>
            <View style={styles.track}>
              <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${pct}%` }]} />
            </View>
            {tip && (
              <Pressable onPress={() => onEdit(tip.step)} style={{ marginTop: 10 }}>
                <Text style={styles.tip}>
                  💡 {tip.text} <Text style={{ color: colors.gold, fontWeight: '800' }}>Ajouter ›</Text>
                </Text>
              </Pressable>
            )}
          </View>

          {/* ── Bio ── */}
          <Section title="À propos de moi" onEdit={() => onEdit(3)} />
          <View style={styles.card}>
            <Text style={styles.bio}>{d.bio.trim() || 'Ajoute une petite phrase qui te ressemble…'}</Text>
          </View>

          {/* ── Les essentiels ── */}
          {essentials.length > 0 && (
            <>
              <Section title="Les essentiels" onEdit={() => onEdit(4)} />
              <View style={styles.chips}>
                {essentials.map((e) => (
                  <View key={e.label} style={styles.chip}>
                    <Ionicons name={e.icon} size={14} color={colors.gold} />
                    <Text style={styles.chipText}>{e.label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── Réponses World Card, entre les photos ── */}
          <Section title="Ma World Card" onEdit={() => onEdit(3)} />
          {prompts.length === 0 && (
            <Pressable onPress={() => onEdit(3)} style={[styles.card, styles.empty]}>
              <Text style={styles.tip}>Réponds aux 3 questions de ta World Card ›</Text>
            </Pressable>
          )}
          {prompts.map((p, i) => (
            <View key={p.q}>
              <View style={styles.prompt}>
                <Text style={styles.promptQ}>{p.q}</Text>
                <Text style={styles.promptA}>{p.a}</Text>
                <View style={styles.promptHeart}>
                  <Ionicons name="heart" size={16} color={colors.gold} />
                </View>
              </View>
              {extraPhotos[i] !== undefined && (
                <Image source={extraPhotos[i]} style={[styles.inlinePhoto, { height: (width - 32) * 1.15 }]} contentFit="cover" transition={200} />
              )}
            </View>
          ))}
          {extraPhotos.slice(prompts.length).map((p, i) => (
            <Image key={`x${i}`} source={p} style={[styles.inlinePhoto, { height: (width - 32) * 1.15 }]} contentFit="cover" />
          ))}

          {/* ── Activité ── */}
          <Section title="Mon activité World" />
          <View style={styles.stats}>
            <Stat n={w.pending.length} label="Hellos reçus" icon="👋" />
            <Stat n={w.connections.length} label="Connexions" icon="❤️" onPress={onMessages} />
            <Stat n={w.sent.length} label="Hellos envoyés" icon="✈️" />
          </View>
          {w.connections.length > 0 && (
            <Pressable onPress={onMessages} style={styles.connRow}>
              <View style={{ flexDirection: 'row' }}>
                {w.connections.slice(0, 5).map((c, i) => (
                  <Image key={c.id} source={thumbOf(c)} style={[styles.connAv, { marginLeft: i ? -12 : 0 }]} />
                ))}
              </View>
              <Text style={styles.connText}>Voir mes connexions</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.gold} />
            </Pressable>
          )}

          {/* ── Réglages ── */}
          <Section title="Réglages World Room" />
          <View style={styles.card}>
            <Text style={styles.settingLabel}>👋 Qui peut m'envoyer un Hello</Text>
            <Toggle options={RULES} value={rule} onChange={(v) => (setRule(v), w.showToast(`Hellos : ${v.toLowerCase()}`))} />
            <Text style={[styles.settingLabel, { marginTop: 16 }]}>👁 Visibilité de mon profil</Text>
            <Toggle options={VISIBILITY} value={visible} onChange={(v) => (setVisible(v), w.showToast(v === 'Visible' ? 'Profil visible' : 'Profil en pause'))} />
          </View>
          <Pressable
            onPress={() => {
              tap();
              onQuit();
            }}
            style={styles.quit}
          >
            <Ionicons name="log-out-outline" size={16} color="#F07167" />
            <Text style={styles.quitText}>Quitter World Room</Text>
          </Pressable>
          <Text style={styles.footer}>Ton profil World Room est lié à ton compte Zembo.</Text>
        </View>
      </ScrollView>
      {/* bande sombre derrière l'heure quand on fait défiler */}
      <LinearGradient colors={[worldBg, 'rgba(11,8,5,0)']} style={[styles.shade, { top: 0, height: insets.top + 14 }]} pointerEvents="none" />
    </View>
  );
}

function Section({ title, onEdit }: { title: string; onEdit?: () => void }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onEdit && (
        <Pressable
          onPress={() => {
            tap();
            onEdit();
          }}
          hitSlop={10}
        >
          <Text style={styles.sectionEdit}>Modifier</Text>
        </Pressable>
      )}
    </View>
  );
}

function Stat({ n, label, icon, onPress }: { n: number; label: string; icon: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.stat} disabled={!onPress}>
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

function Toggle<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.toggle}>
      {options.map((o) => (
        <Pressable
          key={o}
          style={{ flex: 1 }}
          onPress={() => {
            tap();
            onChange(o);
          }}
        >
          {o === value ? (
            <LinearGradient colors={goldGradient} style={styles.toggleItem}>
              <Text style={styles.toggleOn}>{o}</Text>
            </LinearGradient>
          ) : (
            <View style={styles.toggleItem}>
              <Text style={styles.toggleOff}>{o}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: worldBg },
  shade: { position: 'absolute', left: 0, right: 0 },
  pager: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', gap: 4 },
  pagerBar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  pagerOn: { backgroundColor: colors.white },
  topRow: { position: 'absolute', left: 14, right: 60, flexDirection: 'row' },
  previewPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)' },
  previewText: { color: colors.text, fontSize: 11.5, fontWeight: '700' },
  heroInfo: { position: 'absolute', left: 18, right: 70, bottom: 18 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.white, fontSize: 34, fontWeight: '900', flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 8 },
  age: { fontWeight: '400' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3CCB6C' },
  meta: { color: 'rgba(247,241,225,0.92)', fontSize: 14, fontWeight: '600' },
  intentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  intent: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(212,175,55,0.2)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.55)' },
  intentText: { color: colors.goldLight, fontSize: 12, fontWeight: '800' },
  cameraBtn: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.gold,
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  progressCard: { marginTop: 6, padding: 16, borderRadius: 20, backgroundColor: '#16110B', borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)' },
  progressTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '900' },
  editPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.gold },
  editPillText: { color: '#1D1405', fontSize: 12, fontWeight: '900' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 12, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  tip: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 10 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  sectionEdit: { color: colors.gold, fontSize: 13, fontWeight: '800' },
  card: { padding: 16, borderRadius: 20, backgroundColor: '#16110B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  empty: { alignItems: 'center', borderStyle: 'dashed', borderColor: 'rgba(212,175,55,0.4)' },
  bio: { color: colors.text, fontSize: 16, lineHeight: 23 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: '#16110B', borderWidth: 1, borderColor: 'rgba(212,175,55,0.25)' },
  chipText: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  prompt: { padding: 20, paddingBottom: 22, borderRadius: 22, backgroundColor: '#16110B', borderWidth: 1, borderColor: 'rgba(212,175,55,0.22)', marginBottom: 12 },
  promptQ: { color: colors.gold, fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  promptA: { color: colors.white, fontSize: 24, fontWeight: '900', lineHeight: 30, marginTop: 8, marginRight: 30 },
  promptHeart: { position: 'absolute', right: 14, bottom: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(212,175,55,0.12)', alignItems: 'center', justifyContent: 'center' },
  inlinePhoto: { width: '100%', borderRadius: 22, marginBottom: 12, backgroundColor: '#16110B' },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 18, backgroundColor: '#16110B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  statN: { color: colors.goldLight, fontSize: 22, fontWeight: '900', marginTop: 4 },
  statLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 2 },
  connRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, padding: 12, borderRadius: 18, backgroundColor: '#16110B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  connAv: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#16110B' },
  connText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  settingLabel: { color: colors.textDim, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  toggle: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)' },
  toggleItem: { height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggleOn: { color: '#1D1405', fontSize: 12.5, fontWeight: '900' },
  toggleOff: { color: colors.textDim, fontSize: 12.5, fontWeight: '700' },
  quit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 20, height: 46, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(240,113,103,0.4)' },
  quitText: { color: '#F07167', fontSize: 14, fontWeight: '800' },
  footer: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 14 },
});
