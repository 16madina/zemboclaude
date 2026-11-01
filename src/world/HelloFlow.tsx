import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { DECOR, HELLO_AGES, ageNumber, findPerson, randomIcebreaker, type WorldPerson } from './data';
import { tap, useWorld } from './store';
import { DEENA_PHOTO } from '../table/data';
import { Chip, Confetti, GoldButton, OutlineButton, PersonBackdrop, WorldTitle, worldBg } from './ui';

// Hello mutuel → rencontre vidéo de 60 secondes → décision des deux côtés → connexion
export type HelloStep = 'card' | 'celebration' | 'meet' | 'decision' | 'connected' | 'over';

type Persona = { name: string; age: number | null; flag: string; city: string; photo: number | string };

export function HelloFlow({
  personId,
  initial,
  onClose,
  onOpenThread,
}: {
  personId: string;
  initial: HelloStep;
  onClose: () => void;
  onOpenThread: (id: string) => void;
}) {
  const w = useWorld();
  const person = findPerson(personId)!;
  const [step, setStep] = useState<HelloStep>(initial);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [step, fade]);
  useEffect(() => {
    if (initial === 'celebration') w.acceptHello(personId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const me: Persona = {
    name: w.profile.username || 'Toi',
    age: ageNumber(w.profile.age),
    flag: '🌍',
    city: w.profile.city || 'Ta ville',
    photo: w.profile.photos[0] ?? DEENA_PHOTO,
  };
  const other: Persona = { name: person.name, age: person.age, flag: person.flag, city: person.city, photo: person.photo };

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: worldBg, opacity: fade }]}>
      {step === 'card' && (
        <HelloCard
          p={person}
          onBack={onClose}
          onAccept={() => {
            w.acceptHello(person.id);
            setStep('celebration');
          }}
          onIgnore={() => {
            w.ignoreHello(person.id);
            w.showToast('Hello ignoré');
            onClose();
          }}
        />
      )}
      {step === 'celebration' && <Celebration me={me} other={other} onMeet={() => setStep('meet')} onLater={onClose} />}
      {step === 'meet' && <MeetRoom me={me} other={other} onEnd={() => setStep('decision')} />}
      {step === 'decision' && (
        <Decision
          other={other}
          onConnect={() => {
            w.addConnection(person.id);
            setStep('connected');
          }}
          onOver={() => {
            w.endMeeting(person.id);
            setStep('over');
          }}
        />
      )}
      {step === 'connected' && <Connected me={me} other={other} onThread={() => onOpenThread(person.id)} onDiscover={onClose} />}
      {step === 'over' && <Over onDiscover={onClose} />}
    </Animated.View>
  );
}

// Le Hello reçu, avec la World Card de la personne
function HelloCard({ p, onBack, onAccept, onIgnore }: { p: WorldPerson; onBack: () => void; onAccept: () => void; onIgnore: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <PersonBackdrop photo={p.photo} />
      <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(8,6,3,0.85)', worldBg]} locations={[0, 0.25, 0.55, 0.8]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 230, paddingHorizontal: 18, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <View style={styles.helloBanner}>
          <Text style={styles.helloBannerText}>
            👋 {p.name} t'a envoyé un Hello depuis {p.country}
          </Text>
        </View>
        <View style={styles.nameRow}>
          <Text style={styles.name}>
            {p.name}, {p.age}
          </Text>
          <Ionicons name="checkmark-circle" size={20} color={colors.gold} />
        </View>
        <Text style={styles.place}>
          📍 {p.flag} {p.city}, {p.country} · {HELLO_AGES[p.id] ?? "à l'instant"}
        </Text>
        <Text style={styles.intent}>{p.intent}</Text>
        <Text style={styles.quote}>« {p.quote} »</Text>
        <View style={styles.chips}>
          {p.interests.map((it) => (
            <Chip key={it} label={it} />
          ))}
        </View>
        {[
          { icon: '✈️', label: 'Mon dimanche parfait ?', value: p.sunday },
          { icon: '🧡', label: 'Mon red flag ?', value: p.redFlag },
          { icon: '🌐', label: 'Partir demain ?', value: p.travel },
        ].map((a) => (
          <View key={a.label} style={styles.answer}>
            <Text style={styles.answerLabel}>
              {a.icon} {a.label}
            </Text>
            <Text style={styles.answerValue}>{a.value}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <GoldButton label="👋 Répondre Hello" onPress={onAccept} big />
        <OutlineButton label="Ignorer" onPress={onIgnore} style={{ marginTop: 8, height: 46 }} />
      </View>
      <Pressable onPress={onBack} hitSlop={10} style={[styles.back, { top: insets.top + 8 }]}>
        <Ionicons name="chevron-back" size={22} color={colors.white} />
      </Pressable>
    </View>
  );
}

function Pop({ delay, from = 0, children }: { delay: number; from?: number; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, delay, useNativeDriver: true, speed: 8, bounciness: 12 }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }, { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function Beat({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1.14, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, [v]);
  return <Animated.View style={{ transform: [{ scale: v }] }}>{children}</Animated.View>;
}

function Circle({ p, size = 112 }: { p: Persona; size?: number }) {
  return (
    <View style={{ alignItems: 'center', width: size + 30 }}>
      <LinearGradient colors={goldGradient} style={{ padding: 3, borderRadius: size }}>
        <Image source={p.photo} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: worldBg }} />
      </LinearGradient>
      <Text style={styles.circleName} numberOfLines={1}>
        {p.name}
        {p.age ? `, ${p.age}` : ''}
      </Text>
      <Text style={styles.circleCity} numberOfLines={1}>
        {p.flag} {p.city}
      </Text>
    </View>
  );
}

// « Vous vous êtes dit HELLO ! »
export function Celebration({ me, other, onMeet, onLater }: { me: Persona; other: Persona; onMeet: () => void; onLater: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10, paddingHorizontal: 20 }}>
      <Image source={DECOR} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={['rgba(8,6,3,0.2)', 'rgba(8,6,3,0.75)', worldBg]} locations={[0, 0.45, 0.8]} style={StyleSheet.absoluteFill} />
      <Confetti />
      <WorldTitle size={22} />
      <Pop delay={100}>
        <Text style={styles.said}>Vous vous êtes dit</Text>
      </Pop>
      <Pop delay={220}>
        <Text style={styles.hello}>HELLO !</Text>
      </Pop>
      <Text style={styles.sub}>Une belle connexion commence{'\n'}peut-être ici…</Text>
      <View style={styles.pair}>
        <Pop delay={300} from={-120}>
          <Circle p={me} />
        </Pop>
        <Pop delay={420} from={120}>
          <Circle p={other} />
        </Pop>
        <View style={styles.heart} pointerEvents="none">
          <Pop delay={650}>
            <Beat>
              <Text style={{ fontSize: 34 }}>❤️</Text>
            </Beat>
          </Pop>
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <View style={styles.steps}>
        {[
          { icon: 'chatbubble-ellipses' as const, text: 'Découvrez une nouvelle personne' },
          { icon: 'videocam' as const, text: 'Une rencontre vidéo de 60 secondes' },
          { icon: 'sparkles' as const, text: 'Et laissez la conversation suivre son cours…' },
        ].map((s) => (
          <View key={s.text} style={styles.stepRow}>
            <View style={styles.stepIcon}>
              <Ionicons name={s.icon} size={17} color={colors.gold} />
            </View>
            <Text style={styles.stepText}>{s.text}</Text>
          </View>
        ))}
      </View>
      <GoldButton label="📸 Lancer la rencontre 60 secondes" onPress={onMeet} big style={{ marginTop: 16 }} />
      <OutlineButton label="Plus tard" onPress={onLater} style={{ marginTop: 8, height: 46 }} />
    </View>
  );
}

// La rencontre vidéo de 60 secondes
function MeetRoom({ me, other, onEnd }: { me: Persona; other: Persona; onEnd: () => void }) {
  const insets = useSafeAreaInsets();
  const [left, setLeft] = useState(60);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [question, setQuestion] = useState(() => randomIcebreaker());
  const ended = useRef(false);
  const end = () => {
    if (ended.current) return;
    ended.current = true;
    onEnd();
  };

  useEffect(() => {
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    const q = setTimeout(() => setQuestion((x) => randomIcebreaker(x)), 30000);
    return () => {
      clearInterval(t);
      clearTimeout(q);
    };
  }, []);
  useEffect(() => {
    if (left === 0) end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  const urgent = left <= 10;
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 6, paddingBottom: insets.bottom + 10, paddingHorizontal: 14 }}>
      <View style={styles.meetHead}>
        <Text style={styles.meetTag}>🌍 WORLD HELLO</Text>
        <View style={[styles.timer, urgent && styles.timerUrgent]}>
          <Text style={[styles.timerText, urgent && { color: '#FF8A7A' }]}>00:{String(left).padStart(2, '0')}</Text>
        </View>
      </View>
      {/* barre du temps restant */}
      <View style={styles.timeTrack}>
        <LinearGradient colors={urgent ? ['#FF8A7A', '#E5533D'] : goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.timeFill, { width: `${(left / 60) * 100}%` }]} />
      </View>
      <View style={styles.tiles}>
        {[
          { p: other, tag: `${other.flag} ${other.name}`, off: false },
          { p: me, tag: 'Toi', off: camOff },
        ].map((v) => (
          <View key={v.tag} style={styles.tile}>
            {v.off ? (
              <View style={styles.tileOff}>
                <Ionicons name="videocam-off" size={26} color={colors.textDim} />
              </View>
            ) : (
              <Image source={v.p.photo} style={StyleSheet.absoluteFill} contentFit="cover" />
            )}
            <View style={styles.tileTag}>
              <Text style={styles.tileTagText}>{v.tag}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.ice}>
        <Text style={styles.iceLabel}>BRISE-GLACE</Text>
        <Text style={styles.iceText}>{question}</Text>
      </View>
      <View style={styles.controls}>
        <Control icon={muted ? 'mic-off' : 'mic'} off={muted} onPress={() => setMuted((m) => !m)} />
        <Control icon={camOff ? 'videocam-off' : 'videocam'} off={camOff} onPress={() => setCamOff((c) => !c)} />
        <Control icon="sparkles" onPress={() => setQuestion((x) => randomIcebreaker(x))} />
      </View>
      <Pressable
        onPress={() => {
          tap();
          end();
        }}
        style={styles.endBtn}
      >
        <Text style={styles.endText}>Terminer la rencontre</Text>
      </Pressable>
    </View>
  );
}

function Control({ icon, off, onPress }: { icon: keyof typeof Ionicons.glyphMap; off?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={[styles.control, off && styles.controlOff]}
    >
      <Ionicons name={icon} size={21} color={off ? colors.textDim : colors.gold} />
    </Pressable>
  );
}

// Chacun choisit de son côté ; la conversation s'ouvre seulement si les deux disent Connecter
function Decision({ other, onConnect, onOver }: { other: Persona; onConnect: () => void; onOver: () => void }) {
  const insets = useSafeAreaInsets();
  const [waiting, setWaiting] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const cb = useRef({ onConnect, onOver });
  cb.current = { onConnect, onOver };
  useEffect(() => {
    if (!waiting) return;
    Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true })).start();
    // démo : la réponse de l'autre arrive après un court instant
    const t = setTimeout(() => (Math.random() < 0.75 ? cb.current.onConnect() : cb.current.onOver()), 1800);
    return () => clearTimeout(t);
  }, [waiting, pulse]);
  return (
    <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
      <LinearGradient colors={goldGradient} style={{ padding: 3, borderRadius: 80 }}>
        <Image source={other.photo} style={styles.bigPhoto} />
      </LinearGradient>
      <Text style={styles.title}>Envie de continuer ?</Text>
      <Text style={styles.sub}>
        Vous répondez chacun de votre côté. La conversation ne s'ouvre que si vous choisissez tous les deux Connecter.
      </Text>
      {waiting ? (
        <View style={{ alignItems: 'center', marginTop: 30 }}>
          <Animated.Text style={{ fontSize: 34, opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 1, 0.5] }) }}>⏳</Animated.Text>
          <Text style={[styles.sub, { marginTop: 10 }]}>En attente de la réponse de {other.name}…</Text>
        </View>
      ) : (
        <View style={{ alignSelf: 'stretch', marginTop: 30, gap: 10 }}>
          <GoldButton label="❤️ CONNECTER" onPress={() => setWaiting(true)} big />
          <OutlineButton label="👋 MERCI, AU SUIVANT" onPress={onOver} />
        </View>
      )}
    </View>
  );
}

function Connected({ me, other, onThread, onDiscover }: { me: Persona; other: Persona; onThread: () => void; onDiscover: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
      <Confetti count={28} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pop delay={100} from={-60}>
          <Image source={me.photo} style={styles.midPhoto} />
        </Pop>
        <Beat>
          <Ionicons name="heart" size={30} color={colors.gold} />
        </Beat>
        <Pop delay={200} from={60}>
          <Image source={other.photo} style={styles.midPhoto} />
        </Pop>
      </View>
      <Text style={[styles.title, { color: colors.goldLight }]}>🎉 CONNEXION MUTUELLE</Text>
      <Text style={styles.sub}>{other.name} est maintenant dans tes connexions World Room.</Text>
      <View style={{ alignSelf: 'stretch', marginTop: 30, gap: 10 }}>
        <GoldButton label="Ouvrir la conversation" onPress={onThread} big />
        <OutlineButton label="Continuer à découvrir" onPress={onDiscover} />
      </View>
    </View>
  );
}

function Over({ onDiscover }: { onDiscover: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={{ fontSize: 54 }}>🌍</Text>
      <Text style={styles.title}>La rencontre est terminée.</Text>
      <Text style={styles.sub}>Le monde est grand : une autre belle connexion t'attend peut-être.</Text>
      <GoldButton label="Découvrir d'autres profils" onPress={onDiscover} style={{ alignSelf: 'stretch', marginTop: 30 }} />
    </View>
  );
}


const styles = StyleSheet.create({
  back: { position: 'absolute', left: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  helloBanner: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: 'rgba(212,175,55,0.2)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.55)', marginBottom: 12 },
  helloBannerText: { color: colors.goldLight, fontSize: 13, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: colors.white, fontSize: 30, fontWeight: '900' },
  place: { color: colors.textDim, fontSize: 13.5, fontWeight: '600', marginTop: 3 },
  intent: { color: colors.goldLight, fontSize: 13, fontWeight: '800', marginTop: 8 },
  quote: { color: colors.text, fontSize: 15, fontStyle: 'italic', lineHeight: 21, marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 12 },
  answer: { padding: 13, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.18)', marginBottom: 8 },
  answerLabel: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  answerValue: { color: colors.text, fontSize: 14, marginTop: 4 },
  bottom: { paddingHorizontal: 18, paddingTop: 10, backgroundColor: worldBg },
  said: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center', marginTop: 26 },
  hello: {
    color: colors.goldLight,
    fontSize: 54,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 2,
    textShadowColor: 'rgba(212,175,55,0.7)',
    textShadowRadius: 18,
  },
  sub: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  pair: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 26 },
  heart: { position: 'absolute', alignSelf: 'center', top: 40 },
  circleName: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 8 },
  circleCity: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  steps: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(212,175,55,0.12)', alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.text, fontSize: 13.5, fontWeight: '600', flex: 1 },
  meetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meetTag: { color: colors.gold, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  timer: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(212,175,55,0.45)', backgroundColor: 'rgba(0,0,0,0.5)' },
  timerUrgent: { borderColor: 'rgba(229,83,61,0.6)', backgroundColor: 'rgba(229,83,61,0.15)' },
  timerText: { color: colors.gold, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  timeTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 10, overflow: 'hidden' },
  timeFill: { height: 3 },
  tiles: { flex: 1, flexDirection: 'row', gap: 8, marginTop: 12 },
  tile: { flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface2, borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)' },
  tileOff: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tileTag: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)' },
  tileTagText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  ice: { marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: 'rgba(212,175,55,0.1)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)' },
  iceLabel: { color: colors.gold, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  iceText: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 5 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 14 },
  control: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(212,175,55,0.4)', backgroundColor: 'rgba(0,0,0,0.5)' },
  controlOff: { borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.1)' },
  endBtn: { marginTop: 14, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(229,83,61,0.16)', borderWidth: 1, borderColor: 'rgba(229,83,61,0.5)' },
  endText: { color: '#FF8A7A', fontSize: 14.5, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  bigPhoto: { width: 150, height: 150, borderRadius: 75, borderWidth: 3, borderColor: worldBg },
  midPhoto: { width: 96, height: 96, borderRadius: 48, borderWidth: 2.5, borderColor: colors.gold },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 22 },
});
