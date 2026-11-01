import { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import {
  COUNTRIES,
  GLOBE,
  INTENTIONS,
  LANGUAGES,
  ORIENTATIONS,
  ageNumber,
  checkUsername,
  findPerson,
  intentionLabels,
  normalizeUsername,
  type WorldProfile,
} from './data';
import { tap, useWorld } from './store';
import { Chip, GoldButton, OutlineButton, WorldTitle, worldBg } from './ui';

// Écran d'accueil World Room (avant la création du profil)
export function WorldIntro({ onBack, onStart }: { onBack: () => void; onStart: () => void }) {
  const insets = useSafeAreaInsets();
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(spin, { toValue: 1, duration: 3200, useNativeDriver: true }),
        Animated.timing(spin, { toValue: 0, duration: 3200, useNativeDriver: true }),
      ]),
    ).start();
  }, [spin]);
  const ARGS = [
    { icon: 'earth' as const, title: 'Fais de nouvelles rencontres', sub: 'aux quatre coins du monde' },
    { icon: 'heart' as const, title: 'Des échanges authentiques', sub: 'et bienveillants' },
    { icon: 'people' as const, title: 'Amitié, discussion ou plus…', sub: "C'est toi qui choisis" },
  ];
  return (
    <View style={[styles.root, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 12 }]}>
      <LinearGradient colors={['rgba(120,86,24,0.38)', 'transparent']} style={styles.halo} />
      <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
        <Ionicons name="chevron-back" size={28} color={colors.gold} />
      </Pressable>
      <WorldTitle size={30} />
      <View style={styles.globeWrap}>
        <View style={styles.globeGlow} />
        <Animated.View
          style={{
            transform: [
              { translateY: spin.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
              { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] }) },
            ],
          }}
        >
          <Image source={GLOBE} style={styles.globe} contentFit="contain" />
        </Animated.View>
        {/* avatars en orbite autour du globe */}
        {[
          { id: 'chloe', x: -118, y: -60 },
          { id: 'moussa', x: 112, y: -82 },
          { id: 'awa', x: 126, y: 70 },
          { id: 'kenji', x: -124, y: 84 },
        ].map((a) => (
          <View key={a.id} style={[styles.orbit, { transform: [{ translateX: a.x }, { translateY: a.y }] }]}>
            <Image source={findPerson(a.id)?.photo} style={styles.orbitImg} contentPosition="top" />
          </View>
        ))}
      </View>
      <View style={{ gap: 14, marginTop: 4 }}>
        {ARGS.map((a) => (
          <View key={a.title} style={styles.arg}>
            <View style={styles.argIcon}>
              <Ionicons name={a.icon} size={19} color={colors.gold} />
            </View>
            <View>
              <Text style={styles.argTitle}>{a.title}</Text>
              <Text style={styles.argSub}>{a.sub}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <GoldButton label="Créer mon profil  ›" onPress={onStart} big />
    </View>
  );
}

// Les 7 étapes de création du profil World Room
export function WorldOnboarding({ start = 1, onExit, onDone }: { start?: number; onExit: () => void; onDone: () => void }) {
  const { profile, setProfile, showToast } = useWorld();
  const [step, setStep] = useState(start);
  const [d, setD] = useState<WorldProfile>(profile);
  const set = (patch: Partial<WorldProfile>) => setD((x) => ({ ...x, ...patch }));

  const next = () => {
    setProfile(d);
    if (step < 7) setStep(step + 1);
  };
  const back = () => (step === 1 ? onExit() : setStep(step - 1));

  const user = checkUsername(d.username);
  const age = ageNumber(d.age);

  if (step === 1)
    return (
      <Step step={1} title="Choisis ton pseudo" subtitle="C'est ton identifiant public dans World Room." onBack={back} ctaDisabled={user !== 'ok'} onCta={next}>
        <Label text="Pseudo" required />
        <View style={styles.inputRow}>
          <Text style={styles.at}>@</Text>
          <TextInput
            value={d.username}
            onChangeText={(v) => set({ username: normalizeUsername(v) })}
            placeholder="deena"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            autoFocus
            style={[styles.inputText, { flex: 1 }]}
            selectionColor={colors.gold}
          />
        </View>
        {user === 'ok' && <Text style={styles.ok}>✓ Pseudo disponible</Text>}
        {user === 'taken' && <Text style={styles.bad}>✗ Ce pseudo est déjà pris</Text>}
        {user === 'short' && <Text style={styles.hint}>Au moins 3 caractères.</Text>}
        {user === 'empty' && <Text style={styles.hint}>Ton identifiant public, visible sur ta World Card.</Text>}
        <Text style={styles.note}>
          ✨ Ton nom, ta date de naissance et ton email restent dans ton compte Zembo. World Room ne te demande que tes infos de découverte.
        </Text>
      </Step>
    );

  if (step === 2) {
    const pick = async () => {
      if (d.photos.length >= 6) return;
      try {
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.8 });
        if (!res.canceled && res.assets[0]) set({ photos: [...d.photos, res.assets[0].uri] });
      } catch (e) {
        console.warn('[world] galerie indisponible', e);
        showToast('Galerie indisponible');
      }
    };
    const remove = (i: number) => set({ photos: d.photos.filter((_, k) => k !== i) });
    const Slot = ({ i, style, main }: { i: number; style: object; main?: boolean }) =>
      d.photos[i] ? (
        <View style={[styles.slot, style]}>
          <Image source={d.photos[i]} style={StyleSheet.absoluteFill} contentFit="cover" />
          {main && (
            <LinearGradient colors={goldGradient} style={styles.mainTag}>
              <Text style={styles.mainTagText}>Photo principale</Text>
            </LinearGradient>
          )}
          <Pressable onPress={() => remove(i)} style={styles.slotX} hitSlop={6}>
            <Ionicons name="close" size={13} color={colors.white} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            tap();
            pick();
          }}
          style={[styles.slot, styles.slotEmpty, style]}
        >
          <Ionicons name={main ? 'camera' : 'add'} size={main ? 28 : 22} color={colors.gold} />
          {main && <Text style={styles.slotText}>Ajouter une photo principale</Text>}
        </Pressable>
      );
    return (
      <Step step={2} title="Ajoute tes photos" subtitle="Montre ta vraie personnalité !" onBack={back} ctaDisabled={d.photos.length < 2} onCta={next}>
        <View style={{ flexDirection: 'row', gap: 8, height: 300 }}>
          <Slot i={0} main style={{ flex: 2 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Slot i={1} style={{ flex: 1 }} />
            <Slot i={2} style={{ flex: 1 }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, height: 120, marginTop: 8 }}>
          <Slot i={3} style={{ flex: 1 }} />
          <Slot i={4} style={{ flex: 1 }} />
          <Slot i={5} style={{ flex: 1 }} />
        </View>
        <Text style={[styles.hint, { marginTop: 12 }]}>Ajoute au moins 2 photos. Tu peux en ajouter jusqu'à 6. ({d.photos.length}/6)</Text>
      </Step>
    );
  }

  if (step === 3) {
    const ANSWERS = [
      { key: 'answerSunday' as const, label: 'Mon dimanche parfait', ph: 'Ex. : brunch et longue marche' },
      { key: 'answerRedFlag' as const, label: 'Mon plus gros red flag', ph: 'Ex. : ne jamais répondre' },
      { key: 'answerEscape' as const, label: 'Si je pouvais partir demain', ph: 'Ex. : direction Lisbonne' },
    ];
    const valid = age !== null && ANSWERS.every((a) => d[a.key].trim().length >= 2);
    return (
      <Step step={3} title="Ton âge et ta World Card" subtitle="Trois réponses valent mille photos." onBack={back} ctaDisabled={!valid} onCta={next}>
        <Label text="Âge" required />
        <Field value={d.age} onChange={(v) => set({ age: v.replace(/\D/g, '').slice(0, 2) })} placeholder="Ex. : 27" numeric />
        <Text style={styles.hint}>Entre 18 et 99 ans.</Text>
        <Label text="Bio (facultatif)" />
        <Field value={d.bio} onChange={(v) => set({ bio: v.slice(0, 120) })} placeholder="Deux phrases sur toi…" multiline />
        <Text style={[styles.hint, { textAlign: 'right' }]}>{d.bio.length}/120</Text>
        {ANSWERS.map((a) => (
          <View key={a.key}>
            <Label text={a.label} required />
            <Field value={d[a.key]} onChange={(v) => set({ [a.key]: v.slice(0, 90) })} placeholder={a.ph} />
          </View>
        ))}
      </Step>
    );
  }

  if (step === 4) {
    const GENDERS = [
      { key: 'femme' as const, icon: '♀', label: 'Femme' },
      { key: 'homme' as const, icon: '♂', label: 'Homme' },
      { key: 'autre' as const, icon: '⚧\uFE0E', label: 'Autre' },
    ];
    return (
      <Step step={4} title="Quelques infos sur toi" subtitle="Aide les autres à mieux te connaître." onBack={back} ctaDisabled={!d.gender} onCta={next}>
        <Label text="Genre" required />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {GENDERS.map((g) => {
            const on = d.gender === g.key;
            return (
              <Pressable
                key={g.key}
                onPress={() => {
                  tap();
                  set({ gender: g.key });
                }}
                style={[styles.gender, on && styles.cardOn]}
              >
                <Text style={[styles.genderIcon, on && { color: colors.gold }]}>{g.icon}</Text>
                <Text style={styles.genderLabel}>{g.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Label text="Orientation" />
        <View style={styles.wrap}>
          {ORIENTATIONS.map((o) => (
            <Chip key={o} label={o} on={d.orientation === o} onPress={() => set({ orientation: d.orientation === o ? '' : o })} />
          ))}
        </View>
        <View style={[styles.card, { marginTop: 18 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[styles.cardTitle, { flex: 1 }]}>Âge visible</Text>
            <Switch value={d.showAge} onValueChange={(v) => set({ showAge: v })} trackColor={{ true: colors.gold, false: 'rgba(255,255,255,0.15)' }} />
          </View>
          <Text style={styles.hint}>Ton âge sera visible sur ton profil.</Text>
        </View>
      </Step>
    );
  }

  if (step === 5)
    return (
      <Step step={5} title="Où es-tu ?" subtitle="Dis-nous d'où tu viens." onBack={back} ctaDisabled={!d.country || d.city.trim().length < 2} onCta={next}>
        <Label text="Pays" required />
        <View style={styles.wrap}>
          {COUNTRIES.map((c) => (
            <Chip key={c} label={c} on={d.country === c} onPress={() => set({ country: c })} />
          ))}
        </View>
        <Label text="Ville" required />
        <Field value={d.city} onChange={(v) => set({ city: v.slice(0, 40) })} placeholder="Ex. : Montréal" icon="location" />
        <Label text="Langues que tu parles" />
        <View style={styles.wrap}>
          {LANGUAGES.map((l) => {
            const on = d.languages.includes(l);
            return <Chip key={l} label={on ? `✓ ${l}` : l} on={on} onPress={() => set({ languages: on ? d.languages.filter((x) => x !== l) : [...d.languages, l] })} />;
          })}
        </View>
      </Step>
    );

  if (step === 6)
    return (
      <Step step={6} title="Tes intentions" subtitle="Qu'est-ce que tu recherches sur World Room ?" onBack={back} ctaDisabled={d.intentions.length === 0} onCta={next}>
        <View style={{ gap: 10 }}>
          {INTENTIONS.map((it) => {
            const on = d.intentions.includes(it.key);
            return (
              <Pressable
                key={it.key}
                onPress={() => {
                  tap();
                  set({ intentions: on ? d.intentions.filter((x) => x !== it.key) : [...d.intentions, it.key] });
                }}
                style={[styles.intent, on && styles.cardOn]}
              >
                <Text style={{ fontSize: 20 }}>{it.icon}</Text>
                <Text style={styles.intentLabel}>{it.label}</Text>
                <Check on={on} />
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.note}>✨ Sois honnête, ça aide à faire des rencontres plus authentiques.</Text>
      </Step>
    );

  // étape 7 : récapitulatif
  const labels = intentionLabels(d.intentions);
  return (
    <Step
      step={7}
      title="Ton profil est prêt !"
      subtitle="Voici un aperçu de ce que les autres verront."
      onBack={back}
      cta="Entrer dans World Room"
      onCta={() => {
        setProfile({ ...d, completed: true });
        showToast('Profil World Room enregistré');
        onDone();
      }}
      secondary="Modifier"
      onSecondary={() => setStep(1)}
    >
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          {d.photos[0] ? (
            <Image source={d.photos[0]} style={styles.recapPhoto} />
          ) : (
            <View style={[styles.recapPhoto, styles.slotEmpty]}>
              <Ionicons name="person" size={22} color={colors.gold} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.recapName}>
              @{d.username}
              {d.showAge && age !== null ? `, ${age}` : ''}
            </Text>
            {!!d.bio && <Text style={styles.recapBio}>{d.bio}</Text>}
            <Text style={styles.recapMeta}>
              📍 {[d.city, d.country].filter(Boolean).join(', ')}
            </Text>
            {d.languages.length > 0 && <Text style={styles.recapMeta}>{d.languages.join(' · ')}</Text>}
          </View>
        </View>
        <Text style={[styles.label, { marginTop: 16 }]}>INTENTIONS</Text>
        <View style={styles.wrap}>
          {labels.map((l) => (
            <Chip key={l} label={l} on />
          ))}
        </View>
        {d.photos.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
            {d.photos.slice(1).map((p, i) => (
              <Image key={i} source={p} style={styles.recapThumb} />
            ))}
          </View>
        )}
      </View>
      <Text style={styles.note}>Ton profil World Room est séparé de ton compte Zembo. Tu pourras le modifier à tout moment.</Text>
    </Step>
  );
}

function Step({
  step,
  title,
  subtitle,
  onBack,
  cta = 'Continuer',
  ctaDisabled,
  onCta,
  secondary,
  onSecondary,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  onBack: () => void;
  cta?: string;
  ctaDisabled?: boolean;
  onCta: () => void;
  secondary?: string;
  onSecondary?: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top + 6 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.stepHead}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Ionicons name="arrow-back" size={23} color={colors.gold} />
        </Pressable>
        <Text style={styles.stepCount}>ÉTAPE {step}/7</Text>
      </View>
      <View style={styles.progress}>
        {Array.from({ length: 7 }, (_, i) =>
          i < step ? (
            <LinearGradient key={i} colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bar} />
          ) : (
            <View key={i} style={[styles.bar, { backgroundColor: 'rgba(255,255,255,0.1)' }]} />
          ),
        )}
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepSub}>{subtitle}</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 18, paddingBottom: 20 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <GoldButton label={`${cta}  ›`} onPress={onCta} disabled={ctaDisabled} />
        {secondary && onSecondary && <OutlineButton label={secondary} onPress={onSecondary} style={{ marginTop: 8, height: 46 }} />}
      </View>
    </KeyboardAvoidingView>
  );
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {text.toUpperCase()} {required && <Text style={{ color: colors.gold }}>*</Text>}
    </Text>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  numeric,
  multiline,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  numeric?: boolean;
  multiline?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[styles.inputRow, multiline && { height: 84, alignItems: 'flex-start', paddingTop: 12 }]}>
      {icon && <Ionicons name={icon} size={16} color={colors.gold} style={{ marginRight: 8 }} />}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType={numeric ? 'number-pad' : 'default'}
        multiline={multiline}
        style={[styles.inputText, { flex: 1 }, multiline && { height: 64, textAlignVertical: 'top' }]}
        selectionColor={colors.gold}
      />
    </View>
  );
}

function Check({ on }: { on: boolean }) {
  return on ? (
    <LinearGradient colors={goldGradient} style={styles.check}>
      <Ionicons name="checkmark" size={14} color="#1D1405" />
    </LinearGradient>
  ) : (
    <View style={[styles.check, { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }]} />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: worldBg, paddingHorizontal: 20 },
  halo: { position: 'absolute', left: 0, right: 0, top: 0, height: 520 },
  back: { alignSelf: 'flex-start', marginLeft: -6, marginBottom: 2 },
  globeWrap: { height: 300, alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  globeGlow: { position: 'absolute', width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(212,175,55,0.16)', shadowColor: colors.gold, shadowOpacity: 0.9, shadowRadius: 50 },
  globe: { width: 250, height: 250 },
  orbit: { position: 'absolute', padding: 2, borderRadius: 26, backgroundColor: colors.gold },
  orbitImg: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: worldBg },
  arg: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  argIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.3)',
    backgroundColor: 'rgba(212,175,55,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  argTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  argSub: { color: colors.textDim, fontSize: 12.5, marginTop: 1 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepCount: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  progress: { flexDirection: 'row', gap: 6, marginTop: 12 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  stepTitle: { color: colors.text, fontSize: 23, fontWeight: '900', marginTop: 20 },
  stepSub: { color: colors.textDim, fontSize: 13.5, marginTop: 5 },
  footer: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.08)', marginHorizontal: -20, paddingHorizontal: 20 },
  label: { color: colors.textDim, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.22)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  at: { color: colors.gold, fontSize: 17, fontWeight: '800', marginRight: 4 },
  inputText: { color: colors.text, fontSize: 15.5, paddingVertical: 0 },
  ok: { color: '#58D68D', fontSize: 12.5, fontWeight: '700', marginTop: 8 },
  bad: { color: '#F07167', fontSize: 12.5, fontWeight: '700', marginTop: 8 },
  hint: { color: colors.textFaint, fontSize: 12, marginTop: 6 },
  note: {
    color: colors.textDim,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 22,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(212,175,55,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.15)',
  },
  slot: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface2 },
  slotEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(212,175,55,0.4)',
    backgroundColor: 'rgba(212,175,55,0.05)',
    gap: 6,
  },
  slotText: { color: colors.gold, fontSize: 12.5, fontWeight: '700', textAlign: 'center', paddingHorizontal: 20 },
  slotX: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  mainTag: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  mainTagText: { color: '#1D1405', fontSize: 10.5, fontWeight: '900' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gender: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  cardOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.1)' },
  genderIcon: { color: colors.textDim, fontSize: 26, fontWeight: '700' },
  genderLabel: { color: colors.text, fontSize: 13.5, fontWeight: '700' },
  card: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)', backgroundColor: 'rgba(255,255,255,0.03)' },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  intent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  intentLabel: { flex: 1, color: colors.text, fontSize: 14.5, fontWeight: '700' },
  check: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  recapPhoto: { width: 76, height: 96, borderRadius: 14 },
  recapName: { color: colors.text, fontSize: 18, fontWeight: '900' },
  recapBio: { color: colors.textDim, fontSize: 13, marginTop: 3 },
  recapMeta: { color: colors.textDim, fontSize: 12.5, marginTop: 4 },
  recapThumb: { width: 50, height: 64, borderRadius: 10 },
});
