import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurMask, Canvas, Circle, LinearGradient as SkLinear, Oval, Path, RadialGradient, Rect, Skia, vec } from '@shopify/react-native-skia';
import { goldGradient } from '../theme';
import { GiftGrid, LiveSlide, Sheet, Toast, faceOf, tap, useFloaters, useLiveChat, useToast, type Gift } from '../talk/LiveKit';
import { DEENA_PHOTO } from '../table/data';
import { findPerson } from '../world/data';
import { useSession } from '../lib/session';
import { OPS, applyOp, botCount, botWord, drawLetters, drawNumbers, isWord, rand, solveLetters, solveNumbers, type BotLevel, type Op } from './engine';

// « Lettres d'Or Zembo » (nom provisoire) : le jeu des lettres et des chiffres en live.
// 4 joueurs sur scène (caméra obligatoire), réponses cachées, chrono qui s'arrête quand
// tout le monde a répondu, puis révélation. Manches : Lettres, Lettres, Chiffres.
// Ici : toi contre 3 joueurs simulés.

const GOLD = '#F3D27A';
const GOLD2 = '#E9B949';
const INK = '#1D1405';
const NAVY = 'rgba(14,16,52,0.88)';
const PURPLE = '#8B5CF6';
const BLUE = '#5B7CFF';
const ROUNDS = ['L', 'L', 'C'] as const;
const DURATION = { L: 30, C: 40 };
const TICK = 250;

type Player = {
  id: string;
  name: string;
  photo: number | string;
  me?: boolean;
  level?: BotLevel;
  score: number;
};
type Answer = { at: number; word?: string; value?: number; steps?: string[] };
type RoundData =
  | { kind: 'L'; letters: string[]; sol: ReturnType<typeof solveLetters> }
  | {
      kind: 'C';
      plaques: number[];
      target: number;
      best: number;
      bestSteps: string[];
      reach: Map<number, string[]>;
    };
type Result = {
  id: string;
  answer: Answer | null;
  valid: boolean;
  points: number;
  dist?: number;
  note: string;
};
type Phase = 'intro' | 'draw' | 'play' | 'reveal' | 'final';

const BOTS: { id: string; level: BotLevel }[] = [
  { id: 'moussa', level: { exact: 0.5, slack: [0, 1, 1, 2] } },
  { id: 'awa', level: { exact: 0.35, slack: [0, 1, 2, 2, 3] } },
  { id: 'kenji', level: { exact: 0.6, slack: [0, 0, 1, 2] } },
];
const CHALLENGERS = ['chloe', 'elena', 'moussa', 'awa', 'kenji'];

const botPlayer = (id: string, level?: BotLevel): Player => {
  const p = findPerson(id);
  return {
    id,
    name: p?.name ?? id,
    photo: p?.photo ?? '',
    level: level ?? { exact: 0.45, slack: [0, 1, 2] },
    score: 0,
  };
};

const CHAT0: [string, string][] = [
  ['Fatou', '🔥 Ce jeu est trop bien !'],
  ['Yann', 'Allez Moussa ! 💪'],
  ['Emma', 'Quel mot vous trouvez ? 🤔'],
  ['Nadia', 'Hâte de voir les réponses !'],
];
const AUTO: [string, string][] = [
  ['Karim', 'Moi je vois un 8 lettres 😏'],
  ['Sophie', 'Lettres d’Or Zembo, j’adore ! 👑'],
  ['Momo', 'Le compte est bon ?!'],
  ['Lina', 'Awa est trop forte 💯'],
  ['Djamal', 'Je veux monter sur scène 🙋'],
  ['Alex', 'Chrono arrêté, révélation !! 👏'],
  ['Yann', 'Les réponses cachées, ça met la pression 😅'],
  ['Fatou', 'Kenji calcule trop vite 🤯'],
];
const GIFTS: Gift[] = [
  { name: 'Rose', emoji: '🌹', cost: 5 },
  { name: 'Cœur', emoji: '💖', cost: 10 },
  { name: 'Lettre d’or', emoji: '🅰️', cost: 20 },
  { name: 'Étoile', emoji: '⭐', cost: 25 },
  { name: 'Trophée', emoji: '🏆', cost: 50 },
  { name: 'Couronne', emoji: '👑', cost: 99 },
];

export function LettresDor({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <LiveSlide open={open}>
      <Game onClose={onClose} />
    </LiveSlide>
  );
}

function Game({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const T = insets.top;
  const { profile } = useSession();
  const toast = useToast();
  const chat = useLiveChat(CHAT0, AUTO, 3800);
  const floaters = useFloaters();
  const [giftOpen, setGiftOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const chatY = useRef(600);
  const [chatRows, setChatRows] = useState(5); // autant de messages que la place le permet

  const [players, setPlayers] = useState<Player[]>(() => [
    {
      id: 'me',
      name: profile?.pseudo ? `@${profile.pseudo}` : 'Toi',
      photo: DEENA_PHOTO,
      me: true,
      score: 0,
    },
    ...BOTS.map((b) => botPlayer(b.id, b.level)),
  ]);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [data, setData] = useState<RoundData | null>(null);
  const [shown, setShown] = useState(0); // éléments du tirage déjà affichés
  const [elapsed, setElapsed] = useState(0);
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const botAnswers = useRef<Record<string, Answer | null>>({});
  const [mine, setMine] = useState<Answer | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [nextIn, setNextIn] = useState(0);
  const [, setGame] = useState(1);

  // saisie lettres
  const [picked, setPicked] = useState<number[]>([]);
  // saisie chiffres
  const [items, setItems] = useState<{ v: number; used: boolean; made?: boolean }[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [steps, setSteps] = useState<{ a: number; b: number; text: string }[]>([]);

  const kind = ROUNDS[round];
  const duration = DURATION[kind];
  const left = duration - elapsed;

  // ── 1. Intro de la manche, puis tirage ──
  useEffect(() => {
    if (phase !== 'intro') return;
    const t = setTimeout(() => {
      const bots = players.filter((p) => !p.me);
      const answers: Record<string, Answer | null> = {};
      let d: RoundData;
      if (kind === 'L') {
        const { letters, solution } = drawLetters();
        d = { kind: 'L', letters, sol: solution };
        for (const b of bots) answers[b.id] = Math.random() < 0.05 ? null : { at: rand(8, 27), word: botWord(solution, b.level!) };
        setPicked([]);
      } else {
        const { plaques, target } = drawNumbers();
        const s = solveNumbers(plaques, target);
        d = {
          kind: 'C',
          plaques,
          target,
          best: s.best,
          bestSteps: s.steps,
          reach: s.reach,
        };
        for (const b of bots) {
          const c = botCount(s.reach, target, b.level!);
          answers[b.id] = Math.random() < 0.05 ? null : { at: rand(14, 37), value: c.value, steps: c.steps };
        }
        setItems(plaques.map((v) => ({ v, used: false })));
        setSel(null);
        setOp(null);
        setSteps([]);
      }
      botAnswers.current = answers;
      setData(d);
      setMine(null);
      setElapsed(0);
      setStoppedEarly(false);
      setShown(0);
      setPhase('draw');
    }, 2400);
    return () => clearTimeout(t);
  }, [phase, kind, players]);

  // ── 2. Les lettres / plaques apparaissent une par une ──
  useEffect(() => {
    if (phase !== 'draw' || !data) return;
    const total = data.kind === 'L' ? data.letters.length : data.plaques.length + 1;
    if (shown >= total) {
      const t = setTimeout(() => setPhase('play'), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => {
        setShown((n) => n + 1);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      },
      data.kind === 'C' && shown === data.plaques.length ? 700 : 260,
    );
    return () => clearTimeout(t);
  }, [phase, data, shown]);

  // ── 3. Le chrono ──
  useEffect(() => {
    if (phase !== 'play') return;
    const t = setInterval(() => setElapsed((e) => e + TICK / 1000), TICK);
    return () => clearInterval(t);
  }, [phase]);

  const answered = (id: string) => {
    if (id === 'me') return !!mine;
    const a = botAnswers.current[id];
    return !!a && a.at <= elapsed;
  };
  const allAnswered = players.every((p) => answered(p.id));

  useEffect(() => {
    if (phase !== 'play') return;
    if (allAnswered || elapsed >= duration) finish(allAnswered && elapsed < duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, allAnswered, phase]);

  // valeur actuelle de mon compte
  const myValue = useMemo(() => {
    if (sel !== null && items[sel]) return items[sel].v;
    const last = [...items].reverse().find((x) => x.made && !x.used);
    return last ? last.v : null;
  }, [sel, items]);

  const myWord = data?.kind === 'L' ? picked.map((i) => data.letters[i]).join('') : '';

  const submit = () => {
    if (phase !== 'play' || mine) return;
    if (data?.kind === 'L') {
      if (myWord.length < 2) return toast.show('Forme un mot avec les lettres');
      setMine({ at: elapsed, word: myWord });
    } else {
      if (myValue === null) return toast.show('Choisis une plaque ou fais un calcul');
      setMine({ at: elapsed, value: myValue, steps: steps.map((s) => s.text) });
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  // ── 4. Fin du chrono : on calcule les points et on révèle ──
  const finish = (early: boolean) => {
    if (!data) return;
    setStoppedEarly(early);
    // sans validation, ce qui est tapé compte quand même
    let me = mine;
    if (!me) {
      if (data.kind === 'L' && myWord.length >= 2) me = { at: duration, word: myWord };
      if (data.kind === 'C' && myValue !== null) me = { at: duration, value: myValue, steps: steps.map((s) => s.text) };
      if (me) setMine(me);
    }
    const all: Record<string, Answer | null> = { ...botAnswers.current, me };
    for (const id of Object.keys(all)) if (all[id] && all[id]!.at > elapsed + 0.01 && id !== 'me') all[id] = null;

    let res: Result[];
    if (data.kind === 'L') {
      res = players.map((p) => {
        const a = all[p.id];
        if (!a?.word)
          return {
            id: p.id,
            answer: null,
            valid: false,
            points: 0,
            note: 'Pas de réponse',
          };
        const ok = isWord(a.word);
        return {
          id: p.id,
          answer: a,
          valid: ok,
          points: ok ? a.word.length : 0,
          note: ok ? `${a.word.length} lettres` : 'Mot refusé',
        };
      });
      res.sort((x, y) => (x.valid ? x.answer!.word!.length : -1) - (y.valid ? y.answer!.word!.length : -1));
    } else {
      const dists = players.map((p) => (all[p.id]?.value !== undefined ? Math.abs(all[p.id]!.value! - data.target) : Infinity));
      const min = Math.min(...dists);
      res = players.map((p, i) => {
        const a = all[p.id];
        if (!a || a.value === undefined)
          return {
            id: p.id,
            answer: null,
            valid: false,
            points: 0,
            note: 'Pas de réponse',
          };
        const d = dists[i];
        const pts = d === 0 ? 10 : d === min ? 7 : 0;
        return {
          id: p.id,
          answer: a,
          valid: true,
          dist: d,
          points: pts,
          note: d === 0 ? 'Compte bon !' : `Écart ${d}`,
        };
      });
      res.sort((x, y) => (y.dist ?? 1e9) - (x.dist ?? 1e9));
    }
    setResults(res);
    setRevealed(0);
    setPhase('reveal');
  };

  // ── 5. Révélation une par une ──
  useEffect(() => {
    if (phase !== 'reveal') return;
    if (revealed > results.length) {
      if (nextIn <= 0) return;
      const t = setTimeout(() => setNextIn((n) => n - 1), 1000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        if (revealed === results.length) {
          setPlayers((ps) =>
            ps.map((p) => ({
              ...p,
              score: p.score + (results.find((r) => r.id === p.id)?.points ?? 0),
            })),
          );
          setNextIn(round < ROUNDS.length - 1 ? 6 : 4);
        }
        setRevealed((n) => n + 1);
      },
      revealed === 0 ? 900 : 1400,
    );
    return () => clearTimeout(t);
  }, [phase, revealed, results, nextIn, round]);

  useEffect(() => {
    if (phase === 'reveal' && revealed > results.length && nextIn === 0) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextIn]);

  const next = () => {
    if (round < ROUNDS.length - 1) {
      setRound(round + 1);
      setPhase('intro');
    } else setPhase('final');
  };

  const replay = () => {
    // le dernier descend, un nouveau challenger monte (sauf toi : tu restes pour la démo)
    const ranking = [...players].sort((a, b) => b.score - a.score);
    const out = ranking[ranking.length - 1];
    const ids = players.map((p) => p.id);
    const nextId = CHALLENGERS.find((c) => !ids.includes(c));
    setPlayers((ps) => ps.map((p) => (p.id === out.id && !p.me && nextId ? botPlayer(nextId) : { ...p, score: 0 })));
    setGame((g) => g + 1);
    setRound(0);
    setPhase('intro');
  };

  // ── saisie ──
  const pickTile = (i: number) => {
    if (phase !== 'play' || mine || picked.includes(i)) return;
    tap();
    setPicked([...picked, i]);
  };
  const unpick = (pos: number) => {
    if (phase !== 'play' || mine) return;
    tap();
    setPicked(picked.filter((_, k) => k !== pos));
  };

  const pressPlaque = (i: number) => {
    if (phase !== 'play' || mine || items[i].used) return;
    tap();
    if (sel === null || op === null) return setSel(sel === i ? null : i);
    if (i === sel) return;
    const a = items[sel].v;
    const b = items[i].v;
    const r = applyOp(a, op, b);
    if (r === null) return toast.show(op === '−' ? 'Pas de résultat négatif ou nul' : 'Division non entière');
    const nextItems = items.map((x, k) => (k === sel || k === i ? { ...x, used: true } : x));
    nextItems.push({ v: r, used: false, made: true });
    setItems(nextItems);
    setSteps([...steps, { a: sel, b: i, text: `${a} ${op} ${b} = ${r}` }]);
    setSel(nextItems.length - 1);
    setOp(null);
  };
  const undo = () => {
    if (phase !== 'play' || mine) return;
    const last = steps[steps.length - 1];
    tap();
    if (!last) {
      setSel(null);
      setOp(null);
      return;
    }
    setItems(items.slice(0, -1).map((x, k) => (k === last.a || k === last.b ? { ...x, used: false } : x)));
    setSteps(steps.slice(0, -1));
    setSel(null);
    setOp(null);
  };

  // ── réactions du live ──
  const hearts = () => {
    tap();
    for (let k = 0; k < 3; k++) setTimeout(() => floaters.add(['❤️', '💖', '💗'][k], width - 46 - Math.random() * 26, chatY.current + 60), k * 120);
  };
  const sendComment = () => {
    const t = draft.trim();
    if (!t) return;
    tap();
    chat.push(profile?.pseudo ?? 'Toi', t, true);
    setDraft('');
  };

  // ── mise en page ──
  const card = (width - 24 - 3 * 8) / 4;
  const boardInner = width - 24 - 4 - 24;
  const ringSize = 60;
  const tile = Math.floor((boardInner - 9 * 4) / 10); // les 10 lettres sur une seule ligne
  const plaqueW = (boardInner - 5 * 5) / 6;
  const ranking = [...players].sort((a, b) => b.score - a.score);
  const resultOf = (id: string) => results.find((r) => r.id === id);
  const revealedIds = results.slice(0, revealed).map((r) => r.id);
  const ringValue = phase === 'play' ? left : phase === 'reveal' ? Math.max(0, duration - elapsed) : duration;
  const reveal = phase === 'reveal' || phase === 'final';

  return (
    <View style={{ flex: 1, backgroundColor: '#07061A' }}>
      <Backdrop />

      {/* ── en-tête compact ── */}
      <View style={[styles.header, { paddingTop: T - 2 }]}>
        <Pressable onPress={onClose} hitSlop={8} style={styles.roundBtn}>
          <Ionicons name="chevron-back" size={19} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.title} numberOfLines={1}>
            Lettres d’Or <Text style={styles.titleZembo}>ZEMBO</Text>
          </Text>
          <View style={styles.liveRow}>
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <View style={styles.viewers}>
              <Ionicons name="eye-outline" size={12} color="#fff" />
              <Text style={styles.viewersText}>1 248</Text>
            </View>
          </View>
        </View>
        <View style={styles.prize}>
          <Text style={{ fontSize: 15 }}>🏆</Text>
          <Text style={styles.prizeText}>500 Zems</Text>
        </View>
        <Pressable onPress={() => toast.show('Lien du live copié')} hitSlop={8} style={[styles.roundBtn, { marginLeft: 8 }]}>
          <Ionicons name="share-social-outline" size={17} color="#fff" />
        </Pressable>
      </View>

      {/* ── manche ── */}
      <View style={styles.mancheRow}>
        <View style={styles.manche}>
          <View style={styles.mancheLabel}>
            <Text style={styles.mancheText}>
              Manche {round + 1}/{ROUNDS.length}
            </Text>
          </View>
          <View style={styles.dots}>
            {ROUNDS.map((_, i) => (
              <View key={i} style={[styles.dot, i <= round && { backgroundColor: GOLD2 }]} />
            ))}
          </View>
        </View>
      </View>

      {/* ── le plateau : lettres ou chiffres ── */}
      <View style={styles.boardWrap}>
        <View style={styles.board}>
          <View style={styles.boardLabelWrap} pointerEvents="none">
            <View style={styles.boardLabel}>
              <LinearGradient colors={goldGradient} style={styles.boardLabelIcon}>
                <Text style={styles.boardLabelIconText}>{kind === 'L' ? 'Aa' : '12'}</Text>
              </LinearGradient>
              <Text style={styles.boardLabelText}>{kind === 'L' ? 'LES LETTRES' : 'LES CHIFFRES'}</Text>
            </View>
          </View>

          <View style={{ marginTop: 8 }}>
            <View>
              {phase === 'intro' && <IntroText round={round} kind={kind} />}

              {data?.kind === 'L' && phase !== 'intro' && (
                <View style={styles.tiles}>
                  {data.letters.map((l, i) => {
                    const used = picked.includes(i) || !!mine || reveal;
                    const visible = i < shown || phase !== 'draw';
                    return (
                      <Pressable key={i} onPress={() => pickTile(i)} disabled={!visible}>
                        {visible ? (
                          <LinearGradient
                            colors={used ? ['#4A3A1C', '#2B2210'] : ['#FFF0B0', '#F3C14B', '#B98318']}
                            style={[styles.tile, { width: tile, height: 46 }]}
                          >
                            <Text style={[styles.tileText, { fontSize: Math.min(24, tile * 0.68) }, used && { color: 'rgba(243,210,122,0.5)' }]}>{l}</Text>
                          </LinearGradient>
                        ) : (
                          <View style={[styles.tile, styles.tileEmpty, { width: tile, height: 46 }]} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {data?.kind === 'C' && phase !== 'intro' && (
                <View>
                  <View style={styles.targetRow}>
                    <Text style={styles.targetLabel}>À TROUVER</Text>
                    <Text style={styles.target}>{shown > data.plaques.length || phase !== 'draw' ? data.target : '???'}</Text>
                  </View>
                  <View style={styles.plaques}>
                    {(phase === 'draw' || reveal
                      ? data.plaques.map((v) => ({
                          v,
                          used: false,
                          made: false,
                        }))
                      : items
                    ).map((x, i) => {
                      const visible = i < shown || phase !== 'draw';
                      if (x.used) return null;
                      const w = plaqueW;
                      return (
                        <Pressable key={i} onPress={() => pressPlaque(i)} disabled={!visible || reveal}>
                          <View
                            style={[
                              styles.plaque,
                              { width: w },
                              x.made && styles.plaqueMade,
                              sel === i && !reveal && styles.plaqueSel,
                              !visible && styles.tileEmpty,
                            ]}
                          >
                            <Text style={[styles.plaqueText, x.made && { color: INK }]}>{visible ? x.v : ''}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* ligne du bas du plateau : ma saisie, ou le résultat */}
          <View
            style={{
              marginTop: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <TimerRing size={ringSize} value={ringValue} total={duration} paused={phase === 'reveal'} />
            <View style={{ flex: 1 }}>
              {(phase === 'intro' || phase === 'draw' || phase === 'final') && (
                <Text style={styles.hint}>
                  {phase === 'draw'
                    ? kind === 'L'
                      ? 'Tirage des lettres…'
                      : 'Tirage des plaques…'
                    : kind === 'L'
                      ? `10 lettres · ${DURATION.L} s · 1 point par lettre. Réponses cachées.`
                      : `6 plaques · ${DURATION.C} s · 10 pts si exact, 7 au plus proche.`}
                </Text>
              )}

              {phase === 'play' && data?.kind === 'L' && (
                <View style={styles.inputRow}>
                  <View style={styles.strip}>
                    {picked.length === 0 ? (
                      <Text style={styles.stripPh} numberOfLines={1}>
                        Touche les lettres
                      </Text>
                    ) : (
                      picked.map((i, pos) => (
                        <Pressable key={pos} onPress={() => unpick(pos)} hitSlop={2}>
                          <Text style={styles.stripLetter}>{mine ? '•' : data.letters[i]}</Text>
                        </Pressable>
                      ))
                    )}
                    {picked.length > 0 && <Text style={styles.stripLen}>{picked.length}</Text>}
                  </View>
                  <Pressable onPress={() => picked.length && unpick(picked.length - 1)} disabled={!!mine} style={[styles.iconBtn, !!mine && { opacity: 0.4 }]}>
                    <Ionicons name="backspace-outline" size={18} color="#fff" />
                  </Pressable>
                  <SubmitBtn done={!!mine} onPress={submit} />
                </View>
              )}

              {phase === 'play' && data?.kind === 'C' && (
                <View style={styles.inputRow}>
                  {OPS.map((o) => (
                    <Pressable
                      key={o}
                      onPress={() => {
                        if (mine || sel === null) return;
                        tap();
                        setOp(op === o ? null : o);
                      }}
                      style={[styles.op, op === o && styles.opOn, (sel === null || !!mine) && { opacity: 0.4 }]}
                    >
                      <Text style={[styles.opText, op === o && { color: INK }]}>{o}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={undo} disabled={!!mine} style={[styles.iconBtn, !!mine && { opacity: 0.4 }]}>
                    <Ionicons name="arrow-undo" size={17} color="#fff" />
                  </Pressable>
                  <SubmitBtn done={!!mine} onPress={submit} small />
                </View>
              )}
              {phase === 'play' && data?.kind === 'C' && myValue !== null && !mine && (
                <Text style={styles.myCount}>
                  Ton compte : {myValue} {myValue === data.target ? '🎯' : `· écart ${Math.abs(myValue - data.target)}`}
                </Text>
              )}

              {phase === 'reveal' && data && (
                <View style={styles.revealLine}>
                  <View style={{ flex: 1 }}>
                    {revealed <= results.length ? (
                      <Text style={styles.revealMsg}>
                        {stoppedEarly ? 'Tout le monde a répondu : chrono arrêté ! Révélation…' : 'Temps écoulé ! Révélation…'}
                      </Text>
                    ) : data.kind === 'L' ? (
                      <Text style={styles.revealMsg} numberOfLines={2}>
                        Meilleur mot : <Text style={{ color: GOLD, fontWeight: '900' }}>{data.sol.words[0]}</Text> ({data.sol.words[0]?.length} lettres)
                      </Text>
                    ) : (
                      <Text style={[styles.revealMsg, { fontSize: 11.5 }]} numberOfLines={2}>
                        {data.best === data.target ? 'Le compte est bon : ' : `Au plus près : ${data.best} · `}
                        <Text style={{ color: GOLD, fontWeight: '800' }}>{data.bestSteps.join(' · ')}</Text>
                      </Text>
                    )}
                  </View>
                  {revealed > results.length && (
                    <Pressable onPress={next} style={styles.nextBtn}>
                      <Text style={styles.nextText}>{nextIn}</Text>
                      <Ionicons name="play-forward" size={13} color={INK} />
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* ── les 4 joueurs (caméras) ── */}
      <View style={styles.players}>
        {players.map((p) => {
          const lead = ranking[0].id === p.id && ranking[0].score > ranking[1].score;
          const r = resultOf(p.id);
          const flash = phase === 'reveal' && revealedIds.includes(p.id) && !!r?.points;
          return (
            <View key={p.id} style={[styles.cam, { width: card, height: card * 1.4 }, p.me && styles.camMe, flash && styles.camFlash]}>
              <Image source={p.photo} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={['transparent', 'rgba(8,6,30,0.85)', 'rgba(8,6,30,0.97)']} locations={[0.45, 0.75, 1]} style={StyleSheet.absoluteFill} />
              {lead && <Text style={styles.camCrown}>👑</Text>}
              <View style={styles.camDot} />
              <View style={styles.camBottom}>
                <Text style={styles.camName} numberOfLines={1}>
                  {p.me ? 'Toi' : p.name}
                </Text>
                <LinearGradient colors={['#FFE89A', '#E9B949', '#B98318']} style={styles.ptsPill}>
                  <Text style={styles.ptsText}>
                    {p.score}
                    <Text style={{ fontSize: 10 }}> pts</Text>
                  </Text>
                </LinearGradient>
              </View>
            </View>
          );
        })}
      </View>

      {/* ── réponses cachées ── */}
      <View style={styles.answersWrap}>
        <View style={styles.answers}>
          <View style={styles.answersLabelWrap} pointerEvents="none">
            <View style={styles.answersLabel}>
              <Text style={{ fontSize: 13 }}>🔒</Text>
              <Text style={styles.answersLabelText}>{phase === 'reveal' && revealed > 0 ? 'Réponses révélées' : 'Réponses (cachées)'}</Text>
            </View>
          </View>
          <View style={styles.slots}>
            {players.map((p) => {
              const r = resultOf(p.id);
              const isOpen = phase === 'reveal' && revealedIds.includes(p.id);
              const did = phase === 'play' ? answered(p.id) : phase === 'reveal';
              return (
                <View key={p.id} style={[styles.slot, { width: card - 6 }, did && !isOpen && styles.slotDone, isOpen && r?.points ? styles.slotWin : null]}>
                  {isOpen && r ? (
                    <>
                      <Text style={[styles.slotAnswer, !r.valid && !!r.answer && styles.slotBad]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                        {r.answer ? (data?.kind === 'L' ? r.answer.word : r.answer.value) : '—'}
                      </Text>
                      <Text style={[styles.slotPts, !r.points && { color: 'rgba(255,255,255,0.5)' }]} numberOfLines={1}>
                        {r.points ? `+${r.points}` : r.answer ? r.note : 'Aucune'}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name={did ? 'lock-closed' : 'lock-closed-outline'} size={17} color={did ? GOLD : 'rgba(243,210,122,0.75)'} />
                      <Text style={[styles.slotDots, did && { color: GOLD }]}>{did ? '✓' : '•••'}</Text>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* ── chat ── */}
      <View
        style={styles.chatWrap}
        onLayout={(e) => {
          chatY.current = e.nativeEvent.layout.y;
          setChatRows(Math.max(2, Math.floor((e.nativeEvent.layout.height - 14) / 28)));
        }}
      >
        <View style={styles.chat}>
          {chat.msgs.slice(-chatRows).map((m) => (
            <View key={m.id} style={styles.msg}>
              <Image source={faceOf(m.user, 60)} style={[styles.msgAv, m.me && { borderColor: GOLD, borderWidth: 1.5 }]} />
              <Text style={styles.msgName} numberOfLines={1}>
                {m.user}
              </Text>
              <Text style={styles.msgText} numberOfLines={1}>
                {m.text}
              </Text>
            </View>
          ))}
        </View>
        <Pressable onPress={hearts} style={styles.likeBubble}>
          <Ionicons name="thumbs-up" size={18} color="#fff" />
        </Pressable>
      </View>

      {/* ── barre du bas ── */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined}>
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom - 6, 10) }]}>
          <View style={styles.comment}>
            <Ionicons name="chatbubble-outline" size={18} color="rgba(255,255,255,0.85)" />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Écrire un commentaire…"
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={styles.commentInput}
              onSubmitEditing={sendComment}
              returnKeyType="send"
              selectionColor={GOLD}
            />
            <Pressable onPress={() => setDraft((d) => d + '😊')} hitSlop={6}>
              <Ionicons name="happy-outline" size={21} color="rgba(255,255,255,0.85)" />
            </Pressable>
          </View>
          <RoundGold onPress={() => setGiftOpen(true)}>
            <Text style={{ fontSize: 20 }}>🎁</Text>
          </RoundGold>
          <RoundGold
            onPress={() => {
              tap();
              floaters.add('🌹', width - 70, chatY.current + 40);
              toast.show('Tu as envoyé une rose 🌹');
            }}
          >
            <Text style={{ fontSize: 20 }}>🌹</Text>
          </RoundGold>
          <RoundGold onPress={hearts}>
            <Text style={{ fontSize: 20 }}>👍</Text>
          </RoundGold>
        </View>
      </KeyboardAvoidingView>

      {floaters.layer}

      {/* ── fin de partie ── */}
      {phase === 'final' && <Final ranking={ranking} onReplay={replay} onClose={onClose} top={T + 150} />}

      <Sheet open={giftOpen} onClose={() => setGiftOpen(false)} title="Envoyer un cadeau" subtitle="Soutiens tes joueurs préférés">
        <GiftGrid
          gifts={GIFTS}
          onPick={(g) => {
            setGiftOpen(false);
            floaters.add(g.emoji, undefined, undefined, true);
            toast.show(`${g.emoji} ${g.name} envoyé !`);
          }}
        />
      </Sheet>
      <Toast text={toast.text} top={T + 110} />
    </View>
  );
}

// ── Fond de scène : dégradé violet, projecteurs, halo doré ──
const Backdrop = memo(function Backdrop() {
  const { width: W, height: H } = useWindowDimensions();
  const beams = useMemo(
    () =>
      [
        [8, -40, 70, 0.55],
        [W - 8, W - 70, W + 40, 0.55],
        [W * 0.22, W * 0.05, W * 0.3, 0.3],
        [W * 0.78, W * 0.7, W * 0.95, 0.3],
      ].map(([a, b, c, o]) => ({
        path: Skia.Path.MakeFromSVGString(`M ${a} 60 L ${b} ${H * 0.72} L ${c} ${H * 0.72} Z`)!,
        o,
      })),
    [W, H],
  );
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={0} y={0} width={W} height={H}>
        <SkLinear start={vec(0, 0)} end={vec(0, H)} colors={['#1B0F45', '#0E0B33', '#0A0A2A', '#07061A']} positions={[0, 0.35, 0.7, 1]} />
      </Rect>
      {/* projecteurs */}
      {beams.map((b, i) => (
        <Path key={i} path={b.path} opacity={b.o}>
          <SkLinear start={vec(0, 60)} end={vec(0, H * 0.72)} colors={['rgba(110,140,255,0.55)', 'rgba(110,140,255,0)']} />
          <BlurMask blur={10} style="normal" />
        </Path>
      ))}
      {/* halos violets */}
      <Circle cx={0} cy={H * 0.33} r={W * 0.55}>
        <RadialGradient c={vec(0, H * 0.33)} r={W * 0.55} colors={['rgba(150,80,255,0.45)', 'rgba(150,80,255,0)']} />
      </Circle>
      <Circle cx={W} cy={H * 0.33} r={W * 0.55}>
        <RadialGradient c={vec(W, H * 0.33)} r={W * 0.55} colors={['rgba(150,80,255,0.45)', 'rgba(150,80,255,0)']} />
      </Circle>
      {/* halo doré derrière le titre */}
      <Circle cx={W / 2} cy={H * 0.2} r={W * 0.62}>
        <RadialGradient
          c={vec(W / 2, H * 0.2)}
          r={W * 0.62}
          colors={['rgba(255,190,80,0.42)', 'rgba(255,170,60,0.12)', 'rgba(255,170,60,0)']}
          positions={[0, 0.5, 1]}
        />
      </Circle>
      {/* scène dorée en bas */}
      <Oval x={-W * 0.3} y={H - 90} width={W * 1.6} height={150}>
        <RadialGradient c={vec(W / 2, H - 15)} r={W * 0.8} colors={['rgba(255,190,80,0.45)', 'rgba(255,190,80,0)']} />
      </Oval>
      {/* paillettes */}
      {Array.from({ length: 22 }).map((_, i) => {
        const x = (i * 97) % W;
        const y = 90 + ((i * 173) % (H * 0.75));
        return <Circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2 : 1.2} color={i % 2 ? 'rgba(255,215,120,0.55)' : 'rgba(170,190,255,0.45)'} />;
      })}
    </Canvas>
  );
});

// ── Chrono circulaire bleu ──
function TimerRing({ size, value, total, paused }: { size: number; value: number; total: number; paused: boolean }) {
  const c = size / 2;
  const r = c - 7;
  const path = useMemo(() => Skia.Path.MakeFromSVGString(`M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r} Z`)!, [c, r]);
  const p = Math.max(0, Math.min(1, value / total));
  const urgent = !paused && value <= 5;
  const color = urgent ? '#FF5A6E' : BLUE;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={c} cy={c} r={r} color="rgba(10,12,40,0.9)" />
        <Circle cx={c} cy={c} r={r} style="stroke" strokeWidth={5} color="rgba(91,124,255,0.18)" />
        <Path path={path} start={0} end={p} style="stroke" strokeWidth={7} strokeCap="round" color={color} opacity={0.7}>
          <BlurMask blur={6} style="solid" />
        </Path>
        <Path path={path} start={0} end={p} style="stroke" strokeWidth={3.5} strokeCap="round" color={urgent ? '#FFB3BC' : '#BFD0FF'} />
      </Canvas>
      <Text style={[styles.ringNum, { fontSize: size * 0.36 }, urgent && { color: '#FF8A97' }]}>
        {Math.ceil(value)}
        <Text style={{ fontSize: size * 0.18 }}>s</Text>
      </Text>
      {paused && <Ionicons name="pause" size={9} color={GOLD} style={{ position: 'absolute', bottom: 8 }} />}
    </View>
  );
}

function IntroText({ round, kind }: { round: number; kind: 'L' | 'C' }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start();
  }, [round, v]);
  return (
    <Animated.View
      style={{
        height: 46,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: v,
        transform: [
          {
            scale: v.interpolate({
              inputRange: [0, 1],
              outputRange: [0.85, 1],
            }),
          },
        ],
      }}
    >
      <Text style={styles.introSmall}>MANCHE {round + 1}</Text>
      <Text style={styles.introBig}>{kind === 'L' ? 'Le mot le plus long' : 'Le compte est bon'}</Text>
    </Animated.View>
  );
}

function Final({ ranking, onReplay, onClose, top }: { ranking: Player[]; onReplay: () => void; onClose: () => void; top: number }) {
  const out = ranking[ranking.length - 1];
  const win = ranking[0];
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,4,20,0.72)', zIndex: 30 }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: top,
          paddingHorizontal: 16,
          paddingBottom: 40,
        }}
      >
        <View style={styles.finalCard}>
          <Text style={styles.finalTitle}>{win.me ? 'Tu gagnes la partie ! 👑' : `${win.name} gagne la partie 👑`}</Text>
          <Text style={styles.finalSub}>{win.me ? 'Tu remportes les 500 Zems 🏆' : `${win.name} remporte les 500 Zems 🏆`}</Text>
          {ranking.map((p, i) => (
            <View key={p.id} style={[styles.rankRow, i === 0 && styles.rankWin, i === ranking.length - 1 && { opacity: 0.6 }]}>
              <Text style={styles.rankPos}>{i === 0 ? '👑' : i + 1}</Text>
              <Image source={p.photo} style={styles.rankAv} />
              <Text style={styles.rankName}>{p.me ? 'Toi' : p.name}</Text>
              <Text style={styles.rankScore}>{p.score} pts</Text>
            </View>
          ))}
          <Text style={styles.outText}>
            ⬇{' '}
            {out.me
              ? 'Tu descends de la scène… Remets-toi dans la file pour retenter ta chance.'
              : `${out.name} descend de la scène. Un challenger de la file monte.`}
          </Text>
          <Pressable onPress={onReplay}>
            <LinearGradient colors={goldGradient} style={styles.replay}>
              <Ionicons name="refresh" size={18} color={INK} />
              <Text style={styles.replayText}>Rejouer</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={onClose} style={{ alignSelf: 'center', marginTop: 12, padding: 6 }}>
            <Text style={styles.quitText}>Quitter le live</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function SubmitBtn({ done, onPress, small }: { done: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={done} style={small ? { flex: 1 } : { width: 88 }}>
      <LinearGradient colors={done ? ['#3A2E18', '#2A2010'] : goldGradient} style={styles.submit}>
        <Ionicons name={done ? 'lock-closed' : 'checkmark'} size={16} color={done ? GOLD : INK} />
        <Text style={[styles.submitText, done && { color: GOLD }]}>{done ? 'Envoyé' : 'Valider'}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function RoundGold({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <LinearGradient colors={['#FFE89A', '#D9A43A', '#8E5C0E']} style={styles.roundGold}>
        <View style={styles.roundGoldInner}>{children}</View>
      </LinearGradient>
    </Pressable>
  );
}

const glow = {
  shadowColor: '#FFB347',
  shadowOpacity: 0.7,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 0 },
};
const purpleGlow = {
  shadowColor: PURPLE,
  shadowOpacity: 0.9,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 0 },
};

const styles = StyleSheet.create({
  // en-tête
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  roundBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,40,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  title: {
    color: GOLD,
    fontSize: 18,
    fontWeight: '900',
    fontStyle: 'italic',
    fontFamily: 'Georgia',
  },
  titleZembo: {
    color: '#fff',
    fontSize: 12,
    fontStyle: 'normal',
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  prize: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: GOLD2,
    backgroundColor: 'rgba(12,10,40,0.8)',
  },
  prizeText: { color: GOLD, fontSize: 11.5, fontWeight: '900' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  liveBadge: {
    backgroundColor: '#FF2D55',
    paddingHorizontal: 9,
    height: 20,
    borderRadius: 6,
    justifyContent: 'center',
  },
  liveText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  viewers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  viewersText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // manche
  mancheRow: { alignItems: 'center', marginTop: 12 },
  manche: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: GOLD2,
    backgroundColor: 'rgba(10,10,40,0.8)',
    overflow: 'hidden',
  },
  mancheLabel: {
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
    borderRightWidth: 1.5,
    borderRightColor: GOLD2,
    borderRadius: 15,
  },
  mancheText: { color: '#fff', fontSize: 13.5, fontWeight: '900' },
  dots: { flexDirection: 'row', gap: 7, paddingHorizontal: 14 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  // plateau
  boardWrap: { paddingHorizontal: 12, marginTop: 18 },
  board: {
    borderRadius: 22,
    borderWidth: 2,
    borderColor: GOLD2,
    backgroundColor: NAVY,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
    ...glow,
  },
  boardLabelWrap: {
    position: 'absolute',
    top: -16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  boardLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 6,
    paddingRight: 16,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: PURPLE,
    backgroundColor: '#15114A',
    ...purpleGlow,
  },
  boardLabelIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardLabelIconText: { color: INK, fontSize: 10.5, fontWeight: '900' },
  boardLabelText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tiles: { flexDirection: 'row', justifyContent: 'space-between' },
  tile: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,240,190,0.6)',
  },
  tileEmpty: {
    borderWidth: 1,
    borderColor: 'rgba(233,185,73,0.35)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tileText: { color: INK, fontWeight: '900' },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 6,
  },
  targetLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  target: {
    color: GOLD,
    fontSize: 34,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  plaques: { flexDirection: 'row', gap: 5, minHeight: 40 },
  plaque: {
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(233,185,73,0.5)',
  },
  plaqueMade: { backgroundColor: GOLD, borderColor: GOLD },
  plaqueSel: { borderColor: '#fff', borderWidth: 2.5 },
  plaqueText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  ringNum: { color: GOLD, fontSize: 28, fontWeight: '900' },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  strip: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.7)',
    backgroundColor: 'rgba(25,20,80,0.7)',
  },
  stripPh: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5 },
  stripLetter: {
    color: GOLD,
    fontSize: 16,
    fontWeight: '900',
    paddingHorizontal: 1,
  },
  stripLen: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 4,
  },
  iconBtn: {
    width: 36,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  submit: {
    height: 42,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: INK, fontSize: 14, fontWeight: '900' },
  op: {
    width: 36,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(233,185,73,0.45)',
  },
  opOn: { backgroundColor: GOLD, borderColor: GOLD },
  opText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  myCount: { color: GOLD, fontSize: 12, fontWeight: '800', marginTop: 4 },
  revealLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 42,
  },
  revealMsg: { color: '#fff', fontSize: 13, fontWeight: '700', lineHeight: 17 },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: GOLD,
  },
  nextText: { color: INK, fontSize: 13, fontWeight: '900' },
  introSmall: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  introBig: {
    color: GOLD,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 1,
    fontFamily: 'Georgia',
  },
  introSub: { color: '#fff', fontSize: 12.5, marginTop: 6 },

  // caméras
  players: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 14,
  },
  cam: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#9B6BFF',
    backgroundColor: '#15114A',
  },
  camMe: { borderColor: GOLD2 },
  camFlash: { borderColor: GOLD, borderWidth: 3 },
  camCrown: { position: 'absolute', top: 3, left: 5, fontSize: 22 },
  camDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#35D07F',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.4)',
  },
  camBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 7,
    alignItems: 'center',
  },
  camName: { color: '#fff', fontSize: 14, fontWeight: '900', maxWidth: '92%' },
  ptsPill: {
    marginTop: 4,
    paddingHorizontal: 12,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
  },
  ptsText: { color: INK, fontSize: 15, fontWeight: '900' },

  // réponses cachées
  answersWrap: { paddingHorizontal: 12, marginTop: 20 },
  answers: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: GOLD2,
    backgroundColor: NAVY,
    paddingTop: 18,
    paddingBottom: 10,
    paddingHorizontal: 4,
    ...glow,
  },
  answersLabelWrap: {
    position: 'absolute',
    top: -15,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  answersLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: PURPLE,
    backgroundColor: '#15114A',
    ...purpleGlow,
  },
  answersLabelText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  slots: { flexDirection: 'row', justifyContent: 'space-around' },
  slot: {
    height: 50,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(110,130,255,0.45)',
    backgroundColor: 'rgba(20,28,90,0.75)',
    paddingHorizontal: 4,
  },
  slotDone: { borderColor: GOLD2 },
  slotWin: { borderColor: GOLD, backgroundColor: 'rgba(233,185,73,0.2)' },
  slotDots: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 1,
  },
  slotAnswer: {
    color: GOLD,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  slotBad: { color: '#FF8A8A', textDecorationLine: 'line-through' },
  slotPts: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 1 },

  // chat
  chatWrap: { flex: 1, paddingHorizontal: 12, marginTop: 10, marginBottom: 8 },
  chat: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(14,16,52,0.75)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  msg: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 28 },
  msgAv: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: GOLD2,
  },
  msgName: { color: '#fff', fontSize: 13.5, fontWeight: '900', maxWidth: 76 },
  msgText: {
    flex: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13.5,
    marginRight: 40,
  },
  likeBubble: {
    position: 'absolute',
    right: 22,
    bottom: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2D6BFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // barre du bas
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 2,
  },
  comment: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(10,10,40,0.6)',
  },
  commentInput: { flex: 1, color: '#fff', fontSize: 14 },
  roundGold: { width: 46, height: 46, borderRadius: 23, padding: 2 },
  roundGoldInner: {
    flex: 1,
    borderRadius: 21,
    backgroundColor: '#130E2E',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // fin
  finalCard: {
    borderRadius: 22,
    borderWidth: 2,
    borderColor: GOLD2,
    backgroundColor: 'rgba(14,16,52,0.97)',
    padding: 16,
    ...glow,
  },
  finalTitle: {
    color: GOLD,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    fontFamily: 'Georgia',
  },
  finalSub: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 6,
  },
  rankWin: {
    backgroundColor: 'rgba(233,185,73,0.18)',
    borderWidth: 1,
    borderColor: GOLD,
  },
  rankPos: {
    width: 26,
    textAlign: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  rankAv: { width: 36, height: 36, borderRadius: 18 },
  rankName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '800' },
  rankScore: { color: GOLD, fontSize: 16, fontWeight: '900' },
  outText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12.5,
    marginTop: 6,
    lineHeight: 18,
  },
  replay: {
    marginTop: 14,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replayText: { color: INK, fontSize: 16, fontWeight: '900' },
  quitText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '800' },
});
