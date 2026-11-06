import { memo, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurMask, Canvas, LinearGradient as SkLinear, Path, Skia, vec } from '@shopify/react-native-skia';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { TEST_MODE, authError, normalizePseudo, useSession } from '../lib/session';

// Écran Connexion / Inscription du compte Zembo (repris de zembolounge : login.tsx et signup.tsx)

const COUNTRIES = [
  { name: 'Canada', flag: '🇨🇦', dial: '+1' },
  { name: 'France', flag: '🇫🇷', dial: '+33' },
  { name: 'Sénégal', flag: '🇸🇳', dial: '+221' },
  { name: "Côte d'Ivoire", flag: '🇨🇮', dial: '+225' },
  { name: 'Cameroun', flag: '🇨🇲', dial: '+237' },
  { name: 'Mali', flag: '🇲🇱', dial: '+223' },
  { name: 'Guinée', flag: '🇬🇳', dial: '+224' },
  { name: 'Maroc', flag: '🇲🇦', dial: '+212' },
  { name: 'Belgique', flag: '🇧🇪', dial: '+32' },
  { name: 'Suisse', flag: '🇨🇭', dial: '+41' },
  { name: 'États-Unis', flag: '🇺🇸', dial: '+1' },
];

const tap = () => void Haptics.selectionAsync().catch(() => {});
const LOGO = require('../../assets/brand/zembo-logo.png');

// ── Motifs dorés dans les coins (arcs à triangles, dessinés pour Zembo) ──
const GoldCorners = memo(function GoldCorners() {
  const { width: W, height: H } = useWindowDimensions();
  const parts = useMemo(() => {
    // un arc de cercle qui passe par 3 points : le long du bord du haut, près du coin, le long du bord de gauche
    const band = (p1: [number, number], p2: [number, number], p3: [number, number], thick: number) => {
      const [ax, ay] = p1;
      const [bx, by] = p2;
      const [cx3, cy3] = p3;
      const d = 2 * (ax * (by - cy3) + bx * (cy3 - ay) + cx3 * (ay - by));
      const ux = ((ax * ax + ay * ay) * (by - cy3) + (bx * bx + by * by) * (cy3 - ay) + (cx3 * cx3 + cy3 * cy3) * (ay - by)) / d;
      const uy = ((ax * ax + ay * ay) * (cx3 - bx) + (bx * bx + by * by) * (ax - cx3) + (cx3 * cx3 + cy3 * cy3) * (bx - ax)) / d;
      const R = Math.hypot(ax - ux, ay - uy);
      let a0 = Math.atan2(ay - uy, ax - ux);
      let a1 = Math.atan2(cy3 - uy, cx3 - ux);
      const am = Math.atan2(by - uy, bx - ux);
      // on va de a0 à a1 en passant par le point du coin
      const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (norm(am - a0) > norm(a1 - a0)) [a0, a1] = [a1, a0];
      if (a1 < a0) a1 += 2 * Math.PI;
      a0 -= 0.12;
      a1 += 0.12;
      const pt = (r: number, a: number) => `${ux + r * Math.cos(a)} ${uy + r * Math.sin(a)}`;
      const N = 60;
      const at = (k: number) => a0 + ((a1 - a0) * k) / N;
      const r1 = R - thick;
      let ring = `M ${pt(R, a0)} `;
      for (let k = 1; k <= N; k++) ring += `L ${pt(R, at(k))} `;
      for (let k = N; k >= 0; k--) ring += `L ${pt(r1, at(k))} `;
      let edge = `M ${pt(r1, a0)} `;
      for (let k = 1; k <= N; k++) edge += `L ${pt(r1, at(k))} `;
      const steps = 30;
      let tri = '';
      for (let i = 0; i < steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        const da = (a1 - a0) / steps;
        const lo = r1 + 4;
        const hi = R - 4;
        tri += i % 2 ? `M ${pt(hi, a)} L ${pt(lo, a + da / 2)} L ${pt(hi, a + da)} Z ` : `M ${pt(lo, a)} L ${pt(hi, a + da / 2)} L ${pt(lo, a + da)} Z `;
      }
      return {
        ring: Skia.Path.MakeFromSVGString(ring + 'Z')!,
        edge: Skia.Path.MakeFromSVGString(edge)!,
        tri: Skia.Path.MakeFromSVGString(tri)!,
      };
    };
    const t = 26;
    return [
      band([W * 0.62, -2], [W * 0.1, H * 0.045], [-2, H * 0.2], t),
      band([W * 0.38, H + 2], [W * 0.9, H * 0.955], [W + 2, H * 0.8], t),
    ];
  }, [W, H]);
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {parts.map((p, i) => (
        <Path key={`g${i}`} path={p.edge} style="stroke" strokeWidth={6} color="rgba(255,190,70,0.55)">
          <BlurMask blur={10} style="normal" />
        </Path>
      ))}
      {parts.map((p, i) => (
        <Path key={`r${i}`} path={p.ring}>
          <SkLinear start={vec(0, 0)} end={vec(W, H)} colors={['#FFE29A', '#D9A43A', '#9A6A14', '#E9B949']} />
        </Path>
      ))}
      {parts.map((p, i) => (
        <Path key={`t${i}`} path={p.tri} color="rgba(70,42,6,0.55)" />
      ))}
    </Canvas>
  );
});

/** Monté une seule fois dans l'app : s'ouvre quand une action demande un compte */
export function AuthGate() {
  const { authPrompt, closeAuth, user } = useSession();
  // fermeture automatique dès que la connexion réussit
  useEffect(() => {
    if (authPrompt && user) closeAuth(true);
  }, [authPrompt, user, closeAuth]);
  return (
    <Modal visible={!!authPrompt} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => closeAuth(false)}>
      <SafeAreaProvider>{authPrompt && <AuthBody reason={authPrompt.reason} onClose={() => closeAuth(false)} />}</SafeAreaProvider>
    </Modal>
  );
}

function AuthBody({ onClose }: { reason: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const s = useSession();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const switchMode = (m: 'login' | 'signup') => {
    tap();
    setMode(m);
    setError(null);
    setInfo(null);
  };

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (mode === 'login') {
      if (!email.trim() || !password) return setError('Renseigne ton email et ton mot de passe.');
    } else {
      if (!prenom.trim() || !nom.trim() || !pseudo.trim() || !email.trim()) return setError('Remplis ton nom, prénom, pseudo et email.');
      if (normalizePseudo(pseudo).length < 3) return setError('Ton pseudo doit avoir au moins 3 caractères.');
      if (password.length < 6) return setError('Le mot de passe doit contenir au moins 6 caractères.');
    }
    tap();
    setBusy(true);
    try {
      if (mode === 'login') await s.signIn(email, password);
      else
        await s.signUp({
          nom,
          prenom,
          pseudo,
          email,
          pays: country.name,
          telephone: phone.trim() ? `${country.dial} ${phone.trim()}` : '',
          password,
        });
      // l'écran se ferme tout seul quand la session est ouverte
    } catch (e) {
      setError(authError(e));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError(null);
    if (!email.trim()) return setError('Écris ton email, puis touche « Mot de passe oublié ? ».');
    try {
      await s.resetPassword(email);
      setInfo(`Un email pour choisir un nouveau mot de passe a été envoyé à ${email.trim()}.`);
    } catch (e) {
      setError(authError(e));
    }
  };

  const pseudoOk = normalizePseudo(pseudo).length > 2;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={['rgba(120,86,24,0.35)', 'transparent']} style={styles.halo} />
      <GoldCorners />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 30, paddingHorizontal: 22 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>

        <Image source={LOGO} style={styles.logo} contentFit="contain" accessibilityLabel="Zembo" />
        <Text style={styles.title}>{mode === 'login' ? 'Bon retour sur Zembo' : 'Crée ton compte Zembo'}</Text>
        <Text style={styles.sub}>
          {mode === 'login' ? 'Retrouve tes lives, tables, messages et rencontres.' : 'Rejoins la communauté en quelques secondes.'}
        </Text>

        {/* Connexion / Inscription */}
        <View style={styles.seg}>
          {(
            [
              ['login', 'Connexion'],
              ['signup', 'Inscription'],
            ] as const
          ).map(([m, l]) => (
            <Pressable key={m} onPress={() => switchMode(m)} style={{ flex: 1 }}>
              {mode === m ? (
                <LinearGradient colors={goldGradient} style={styles.segItem}>
                  <Text style={styles.segOn}>{l}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.segItem}>
                  <Text style={styles.segOff}>{l}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {mode === 'signup' && (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field
                style={{ flex: 1 }}
                label="Prénom"
                icon="person-outline"
                value={prenom}
                onChange={setPrenom}
                placeholder="Deena"
                autoComplete="given-name"
              />
              <Field style={{ flex: 1 }} label="Nom" icon="person-outline" value={nom} onChange={setNom} placeholder="Diallo" autoComplete="family-name" />
            </View>
            <Field
              label="Pseudo"
              icon="at"
              value={pseudo}
              onChange={(v) => setPseudo(normalizePseudo(v))}
              placeholder="deena"
              noCaps
              hint={pseudo ? (pseudoOk ? '✓ Ton identifiant public sur Zembo' : 'Au moins 3 caractères') : undefined}
              hintOk={pseudoOk}
            />
          </>
        )}

        <Field
          label="Email"
          icon="mail-outline"
          value={email}
          onChange={setEmail}
          placeholder="deena@email.com"
          keyboard="email-address"
          noCaps
          autoComplete="email"
        />

        {mode === 'signup' && (
          <>
            <Text style={styles.label}>PAYS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {COUNTRIES.map((c) => {
                const on = c.name === country.name;
                return (
                  <Pressable
                    key={c.name + c.dial}
                    onPress={() => {
                      tap();
                      setCountry(c);
                    }}
                    style={[styles.country, on && styles.countryOn]}
                  >
                    <Text style={{ fontSize: 16 }}>{c.flag}</Text>
                    <Text style={[styles.countryText, on && { color: colors.gold }]}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Field
              label="Téléphone (facultatif)"
              icon="call-outline"
              prefix={country.dial}
              value={phone}
              onChange={setPhone}
              placeholder="(514) 123-4567"
              keyboard="phone-pad"
              autoComplete="tel"
            />
          </>
        )}

        <Field
          label="Mot de passe"
          icon="lock-closed-outline"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          secure={!show}
          noCaps
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          right={
            <Pressable onPress={() => setShow((v) => !v)} hitSlop={10}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.textDim} />
            </Pressable>
          }
          hint={mode === 'signup' ? '6 caractères minimum' : undefined}
        />

        {mode === 'login' && (
          <Pressable onPress={forgot} style={{ alignSelf: 'flex-end', marginTop: 8 }} hitSlop={8}>
            <Text style={styles.forgot}>Mot de passe oublié ?</Text>
          </Pressable>
        )}

        {error && (
          <View style={styles.error}>
            <Ionicons name="alert-circle" size={16} color="#F07167" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {info && (
          <View style={[styles.error, styles.info]}>
            <Ionicons name="mail" size={16} color="#58D68D" />
            <Text style={[styles.errorText, { color: '#9BE7B8' }]}>{info}</Text>
          </View>
        )}

        <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [{ marginTop: 20, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
          <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta}>
            {busy ? (
              <ActivityIndicator color="#1D1405" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.ctaText}>{mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</Text>
                <Ionicons name="arrow-forward" size={19} color="#1D1405" />
              </View>
            )}
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')} style={{ alignSelf: 'center', marginTop: 18 }} hitSlop={8}>
          <Text style={styles.switch}>
            {mode === 'login' ? 'Pas encore de compte ? ' : 'Déjà un compte ? '}
            <Text style={{ color: colors.gold, fontWeight: '900' }}>{mode === 'login' ? "S'inscrire" : 'Se connecter'}</Text>
          </Text>
        </Pressable>

        {TEST_MODE && (
          <Pressable onPress={() => s.enterGuest()} style={styles.guest} hitSlop={6}>
            <Ionicons name="flask-outline" size={16} color={colors.gold} />
            <Text style={styles.guestText}>Entrer sans compte (mode test)</Text>
          </Pressable>
        )}

        {mode === 'signup' && (
          <Text style={styles.legal}>En créant un compte, tu acceptes les règles de la communauté Zembo : respect, bienveillance et zéro harcèlement.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  icon,
  value,
  onChange,
  placeholder,
  keyboard,
  secure,
  noCaps,
  right,
  prefix,
  hint,
  hintOk,
  autoComplete,
  style,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboard?: 'email-address' | 'phone-pad';
  secure?: boolean;
  noCaps?: boolean;
  right?: React.ReactNode;
  prefix?: string;
  hint?: string;
  hintOk?: boolean;
  autoComplete?: 'email' | 'tel' | 'given-name' | 'family-name' | 'current-password' | 'new-password';
  style?: object;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={style}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={[styles.field, focus && styles.fieldFocus]}>
        <Ionicons name={icon} size={17} color={focus ? colors.gold : colors.textDim} />
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType={keyboard ?? 'default'}
          secureTextEntry={secure}
          autoCapitalize={noCaps ? 'none' : 'words'}
          autoCorrect={false}
          autoComplete={autoComplete}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={styles.input}
          selectionColor={colors.gold}
        />
        {right}
      </View>
      {hint && <Text style={[styles.hint, hintOk && { color: '#58D68D' }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0805' },
  halo: { position: 'absolute', left: 0, right: 0, top: 0, height: 420 },
  close: {
    alignSelf: 'flex-end',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  logo: { alignSelf: 'center', width: 280, height: 86, marginTop: 6 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900', textAlign: 'center', marginTop: 10 },
  sub: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginTop: 5 },
  reason: { marginTop: 16, padding: 12, borderRadius: 14, backgroundColor: 'rgba(212,175,55,0.1)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)' },
  reasonText: { color: colors.goldLight, fontSize: 13.5, fontWeight: '700', textAlign: 'center' },
  seg: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    marginTop: 20,
    borderRadius: 16,
    backgroundColor: '#17120B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  segItem: { height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segOn: { color: '#1D1405', fontSize: 14, fontWeight: '900' },
  segOff: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  label: { color: colors.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 0.9, marginTop: 16, marginBottom: 7 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.2)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  fieldFocus: { borderColor: 'rgba(212,175,55,0.7)', backgroundColor: 'rgba(212,175,55,0.06)' },
  prefix: { color: colors.gold, fontSize: 15, fontWeight: '800' },
  input: { flex: 1, color: colors.text, fontSize: 15.5, paddingVertical: 0 },
  hint: { color: colors.textFaint, fontSize: 11.5, marginTop: 6 },
  country: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  countryOn: { borderColor: colors.gold, backgroundColor: 'rgba(212,175,55,0.12)' },
  countryText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  forgot: { color: colors.gold, fontSize: 13, fontWeight: '700' },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(240,113,103,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(240,113,103,0.35)',
  },
  info: { backgroundColor: 'rgba(88,214,141,0.08)', borderColor: 'rgba(88,214,141,0.35)' },
  errorText: { flex: 1, color: '#F7A49B', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  cta: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', shadowColor: colors.gold, shadowOpacity: 0.45, shadowRadius: 14 },
  ctaText: { color: '#1D1405', fontSize: 16, fontWeight: '900' },
  switch: { color: colors.textDim, fontSize: 14 },
  guest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.55)',
  },
  guestText: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
  legal: { color: colors.textFaint, fontSize: 11.5, textAlign: 'center', marginTop: 18, lineHeight: 16 },
});
