import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { LiveBadge, LiveChat, LiveSlide, Toast, tap, useLiveChat, useToast } from '../talk/LiveKit';
import { DEENA_PHOTO } from '../table/data';
import { findPerson } from '../world/data';
import { useSession } from '../lib/session';
import {
  OPS,
  applyOp,
  botCount,
  botWord,
  drawLetters,
  drawNumbers,
  isWord,
  rand,
  solveLetters,
  solveNumbers,
  type BotLevel,
  type Op,
} from './engine';

// « Lettres d'Or » (nom provisoire) : un jeu de lettres et de chiffres en live.
// 4 joueurs sur scène, réponses cachées, chrono qui s'arrête quand tout le monde a répondu,
// puis révélation. Manches : Lettres, Lettres, Chiffres. Le dernier descend de la scène.
// Ici : toi contre 3 joueurs simulés.

const GOLD = '#F3D27A';
const ROUNDS = ['L', 'L', 'C'] as const;
const DURATION = { L: 30, C: 40 };
const TICK = 250;

type Player = { id: string; name: string; photo: number | string; me?: boolean; level?: BotLevel; score: number };
type Answer = { at: number; word?: string; value?: number; steps?: string[] };
type RoundData =
  | { kind: 'L'; letters: string[]; sol: ReturnType<typeof solveLetters> }
  | { kind: 'C'; plaques: number[]; target: number; best: number; bestSteps: string[]; reach: Map<number, string[]> };
type Result = { id: string; answer: Answer | null; valid: boolean; points: number; dist?: number; note: string };
type Phase = 'intro' | 'draw' | 'play' | 'reveal' | 'final';

const BOTS: { id: string; level: BotLevel }[] = [
  { id: 'moussa', level: { exact: 0.5, slack: [0, 1, 1, 2] } },
  { id: 'awa', level: { exact: 0.35, slack: [0, 1, 2, 2, 3] } },
  { id: 'kenji', level: { exact: 0.6, slack: [0, 0, 1, 2] } },
];
const CHALLENGERS = ['chloe', 'elena', 'moussa', 'awa', 'kenji'];

const botPlayer = (id: string, level?: BotLevel): Player => {
  const p = findPerson(id);
  return { id, name: p?.name ?? id, photo: p?.photo ?? '', level: level ?? { exact: 0.45, slack: [0, 1, 2] }, score: 0 };
};

const CHAT0: [string, string][] = [
  ['Fatou', 'Allez Kenji 🔥'],
  ['Yann', "J'adore ce jeu en live 😍"],
  ['Nadia', 'Moussa va tout rafler 👀'],
];
const AUTO: [string, string][] = [
  ['Karim', 'Moi je vois un 8 lettres 😏'],
  ['Emma', 'Les réponses cachées, ça met la pression 😅'],
  ['Momo', 'Le compte est bon ?!'],
  ['Sophie', 'Awa est trop forte 💯'],
  ['Djamal', 'Je veux monter sur scène 🙋'],
  ['Lina', 'Chrono arrêté, révélation !! 👏'],
  ['Alex', "J'ai trouvé un 9 lettres 🤯"],
];

const mmss = (s: number) => `0:${String(Math.max(0, Math.ceil(s))).padStart(2, '0')}`;

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

  const [players, setPlayers] = useState<Player[]>(() => [
    { id: 'me', name: profile?.pseudo ? `@${profile.pseudo}` : 'Toi', photo: DEENA_PHOTO, me: true, score: 0 },
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
  const [game, setGame] = useState(1);

  // saisie lettres
  const [picked, setPicked] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>([]);
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
        setOrder(letters.map((_, i) => i));
        setPicked([]);
      } else {
        const { plaques, target } = drawNumbers();
        const s = solveNumbers(plaques, target);
        d = { kind: 'C', plaques, target, best: s.best, bestSteps: s.steps, reach: s.reach };
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
    }, 2200);
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
    const t = setTimeout(() => {
      setShown((n) => n + 1);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, data.kind === 'C' && shown === data.plaques.length ? 700 : 260);
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
        if (!a?.word) return { id: p.id, answer: null, valid: false, points: 0, note: 'Pas de réponse' };
        const ok = isWord(a.word);
        return { id: p.id, answer: a, valid: ok, points: ok ? a.word.length : 0, note: ok ? `${a.word.length} lettres` : 'Pas dans le dictionnaire' };
      });
      res.sort((x, y) => (x.valid ? x.answer!.word!.length : -1) - (y.valid ? y.answer!.word!.length : -1));
    } else {
      const dists = players.map((p) => (all[p.id]?.value !== undefined ? Math.abs(all[p.id]!.value! - data.target) : Infinity));
      const min = Math.min(...dists);
      res = players.map((p, i) => {
        const a = all[p.id];
        if (!a || a.value === undefined) return { id: p.id, answer: null, valid: false, points: 0, note: 'Pas de réponse' };
        const d = dists[i];
        const pts = d === 0 ? 10 : d === min ? 7 : 0;
        return { id: p.id, answer: a, valid: true, dist: d, points: pts, note: d === 0 ? 'Le compte est bon !' : `Écart de ${d}` };
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
      // points ajoutés, puis manche suivante
      if (nextIn <= 0) return;
      const t = setTimeout(() => setNextIn((n) => n - 1), 1000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        if (revealed === results.length) {
          setPlayers((ps) => ps.map((p) => ({ ...p, score: p.score + (results.find((r) => r.id === p.id)?.points ?? 0) })));
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
    setPlayers((ps) =>
      ps.map((p) => (p.id === out.id && !p.me && nextId ? botPlayer(nextId) : { ...p, score: 0 })).map((p) => ({ ...p, score: 0 })),
    );
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
  const shuffle = () => {
    tap();
    setOrder((o) => [...o].sort(() => Math.random() - 0.5));
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

  const card = (width - 24 - 3 * 8) / 4;
  const tile = Math.min(58, (width - 24 - 4 * 8) / 5);
  const ranking = [...players].sort((a, b) => b.score - a.score);
  const resultOf = (id: string) => results.find((r) => r.id === id);
  const revealedIds = results.slice(0, revealed).map((r) => r.id);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={['#1B1206', '#0B0805', '#000']} style={StyleSheet.absoluteFill} />
      <Image source={require('../../assets/talk/slam-stage.jpg')} style={[StyleSheet.absoluteFill, { opacity: 0.12 }]} contentFit="cover" />

      {/* en-tête du live */}
      <View style={[styles.header, { paddingTop: T + 6 }]}>
        <LinearGradient colors={goldGradient} style={styles.logo}>
          <Text style={styles.logoText}>Aa</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>Lettres d'Or</Text>
          <Text style={styles.brandSub}>Partie {game} · 4 joueurs sur scène</Text>
        </View>
        <LiveBadge />
        <View style={styles.viewers}>
          <Ionicons name="eye" size={12} color={colors.text} />
          <Text style={styles.viewersText}>1,4k</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.text} />
        </Pressable>
      </View>

      {/* les 4 joueurs */}
      <View style={styles.players}>
        {players.map((p) => {
          const r = resultOf(p.id);
          const isRevealed = phase === 'reveal' && revealedIds.includes(p.id);
          const lead = ranking[0].id === p.id && ranking[0].score > ranking[1].score;
          return (
            <View key={p.id} style={[styles.player, { width: card }, p.me && styles.playerMe]}>
              <View>
                <Image source={p.photo} style={styles.playerAv} />
                {lead && <Text style={styles.crown}>👑</Text>}
              </View>
              <Text style={styles.playerName} numberOfLines={1}>
                {p.me ? 'Toi' : p.name}
              </Text>
              <Text style={styles.playerScore}>{p.score} pts</Text>
              {phase === 'play' && (
                <View style={[styles.status, answered(p.id) && styles.statusOn]}>
                  <Text style={[styles.statusText, answered(p.id) && { color: '#1D1405' }]}>{answered(p.id) ? '✓ a répondu' : 'réfléchit…'}</Text>
                </View>
              )}
              {phase === 'reveal' && (
                <View style={[styles.status, isRevealed && r?.points ? styles.statusOn : null]}>
                  <Text style={[styles.statusText, isRevealed && r?.points ? { color: '#1D1405' } : null]}>
                    {isRevealed ? (r?.points ? `+${r.points}` : '0') : '🔒 cachée'}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* bandeau de la manche + chrono */}
      {phase !== 'final' && (
        <View style={styles.roundBar}>
          <View style={styles.roundChips}>
            {ROUNDS.map((k, i) => (
              <View key={i} style={[styles.roundChip, i === round && styles.roundChipOn, i < round && styles.roundChipDone]}>
                <Text style={[styles.roundChipText, i === round && { color: '#1D1405' }]}>{k === 'L' ? 'Lettres' : 'Chiffres'}</Text>
              </View>
            ))}
          </View>
          {phase === 'reveal' && <Ionicons name="pause-circle" size={22} color={GOLD} style={{ marginRight: 4 }} />}
          <Text style={[styles.timer, phase === 'play' && left <= 5 && { color: '#FF5A6E' }]}>
            {phase === 'play' ? mmss(left) : phase === 'reveal' ? mmss(duration - Math.min(elapsed, duration)) : mmss(duration)}
          </Text>
        </View>
      )}
      {phase !== 'final' && (
        <View style={styles.timeTrack}>
          <View style={[styles.timeFill, { width: `${phase === 'play' ? (left / duration) * 100 : phase === 'reveal' ? ((duration - elapsed) / duration) * 100 : 100}%` }]} />
        </View>
      )}

      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        {phase === 'intro' && <Intro round={round} kind={kind} />}

        {/* ── Lettres ── */}
        {data?.kind === 'L' && (phase === 'draw' || phase === 'play') && (
          <View>
            <Text style={styles.hint}>
              {phase === 'draw' ? 'Tirage des lettres…' : mine ? '🔒 Réponse envoyée. Elle reste cachée jusqu’à la révélation.' : 'Forme le mot le plus long possible'}
            </Text>
            <View style={styles.tiles}>
              {order.map((i, k) => {
                const used = picked.includes(i);
                const visible = k < shown || phase === 'play';
                return (
                  <Pressable key={i} onPress={() => pickTile(i)} disabled={!visible}>
                    {visible ? (
                      <LinearGradient colors={used || mine ? ['#3A2E18', '#2A2010'] : goldGradient} style={[styles.tile, { width: tile, height: tile }]}>
                        <Text style={[styles.tileText, (used || mine) && { color: 'rgba(243,210,122,0.35)' }]}>{data.letters[i]}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.tile, styles.tileEmpty, { width: tile, height: tile }]} />
                    )}
                  </Pressable>
                );
              })}
            </View>
            {phase === 'play' && (
              <>
                <View style={styles.answerRow}>
                  {picked.length === 0 && <Text style={styles.answerPh}>Touche les lettres…</Text>}
                  {picked.map((i, pos) => (
                    <Pressable key={pos} onPress={() => unpick(pos)} style={styles.answerTile}>
                      <Text style={styles.answerTileText}>{mine ? '•' : data.letters[i]}</Text>
                    </Pressable>
                  ))}
                  {picked.length > 0 && <Text style={styles.answerLen}>{picked.length}</Text>}
                </View>
                <View style={styles.actions}>
                  <ActionBtn icon="shuffle" label="Mélanger" onPress={shuffle} disabled={!!mine} />
                  <ActionBtn icon="backspace-outline" label="Effacer" onPress={() => picked.length && unpick(picked.length - 1)} disabled={!!mine || !picked.length} />
                  <SubmitBtn done={!!mine} onPress={submit} />
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Chiffres ── */}
        {data?.kind === 'C' && (phase === 'draw' || phase === 'play') && (
          <View>
            <View style={styles.targetBox}>
              <Text style={styles.targetLabel}>À TROUVER</Text>
              <Text style={styles.target}>{shown > data.plaques.length || phase === 'play' ? data.target : '???'}</Text>
            </View>
            <Text style={styles.hint}>
              {phase === 'draw'
                ? 'Tirage des plaques…'
                : mine
                  ? '🔒 Compte envoyé. Il reste caché jusqu’à la révélation.'
                  : 'Touche une plaque, une opération, puis une autre plaque'}
            </Text>
            <View style={styles.plaques}>
              {(phase === 'draw' ? data.plaques.map((v) => ({ v, used: false, made: false })) : items).map((x, i) => {
                const visible = i < shown || phase === 'play';
                if (x.used) return null;
                return (
                  <Pressable key={i} onPress={() => pressPlaque(i)} disabled={!visible}>
                    <View style={[styles.plaque, x.made && styles.plaqueMade, sel === i && styles.plaqueSel, !visible && styles.tileEmpty]}>
                      <Text style={[styles.plaqueText, x.made && { color: '#1D1405' }]}>{visible ? x.v : ''}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {phase === 'play' && (
              <>
                <View style={styles.ops}>
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
                      <Text style={[styles.opText, op === o && { color: '#1D1405' }]}>{o}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.calc}>
                  {steps.length === 0 ? (
                    <Text style={styles.answerPh}>Tes calculs s'affichent ici</Text>
                  ) : (
                    <Text style={styles.calcText} numberOfLines={2}>
                      {mine ? 'Calculs cachés' : steps.map((s) => s.text).join('  ·  ')}
                    </Text>
                  )}
                  {myValue !== null && !mine && (
                    <Text style={styles.calcMine}>
                      Ton compte : {myValue} {myValue === data.target ? '🎯' : `(écart ${Math.abs(myValue - data.target)})`}
                    </Text>
                  )}
                </View>
                <View style={styles.actions}>
                  <ActionBtn icon="arrow-undo" label="Annuler" onPress={undo} disabled={!!mine} />
                  <SubmitBtn done={!!mine} onPress={submit} />
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Révélation ── */}
        {phase === 'reveal' && data && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.stopped}>{stoppedEarly ? 'Tout le monde a répondu : chrono arrêté !' : 'Temps écoulé !'}</Text>
            <Text style={styles.drawRecap}>
              {data.kind === 'L' ? data.letters.join(' ') : `${data.plaques.join(' · ')}  →  ${data.target}`}
            </Text>
            {results.map((r, i) => {
              const p = players.find((x) => x.id === r.id)!;
              const on = i < revealed;
              return (
                <View key={r.id} style={[styles.revealRow, on && r.points > 0 && styles.revealRowWin]}>
                  <Image source={p.photo} style={styles.revealAv} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.revealName}>{p.me ? 'Toi' : p.name}</Text>
                    {on ? (
                      <>
                        <Text style={[styles.revealAnswer, !r.valid && r.answer && styles.revealBad]}>
                          {r.answer ? (data.kind === 'L' ? r.answer.word : r.answer.value) : '—'}
                        </Text>
                        {data.kind === 'C' && !!r.answer?.steps?.length && (
                          <Text style={styles.revealSteps} numberOfLines={2}>
                            {r.answer.steps.join('  ·  ')}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Text style={styles.revealHidden}>🔒 Réponse cachée</Text>
                    )}
                  </View>
                  {on && (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.revealPts, !r.points && { color: colors.textFaint }]}>+{r.points}</Text>
                      <Text style={[styles.revealNote, !r.valid && r.answer && { color: '#FF8A8A' }]}>{r.note}</Text>
                    </View>
                  )}
                </View>
              );
            })}
            {revealed > results.length && (
              <View style={styles.best}>
                {data.kind === 'L' ? (
                  <Text style={styles.bestText}>
                    Meilleur mot possible : <Text style={{ color: GOLD, fontWeight: '900' }}>{data.sol.words[0]}</Text> ({data.sol.words[0]?.length} lettres)
                  </Text>
                ) : (
                  <Text style={styles.bestText}>
                    {data.best === data.target ? 'Le compte est bon : ' : `Meilleur résultat possible : ${data.best}. `}
                    <Text style={{ color: GOLD, fontWeight: '800' }}>{data.bestSteps.join('  ·  ')}</Text>
                  </Text>
                )}
                <Pressable onPress={next} style={styles.nextBtn}>
                  <Text style={styles.nextText}>{round < ROUNDS.length - 1 ? `Manche suivante (${nextIn})` : `Résultats (${nextIn})`}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#1D1405" />
                </Pressable>
              </View>
            )}
          </ScrollView>
        )}

        {/* ── Fin de partie ── */}
        {phase === 'final' && <Final ranking={ranking} onReplay={replay} onClose={onClose} />}
      </View>

      {/* chat du live */}
      {phase !== 'final' && (
        <View style={{ paddingBottom: insets.bottom + 6, height: 96 + insets.bottom }} pointerEvents="none">
          <LiveChat msgs={chat.msgs} max={3} />
        </View>
      )}
      <Toast text={toast.text} top={T + 120} />
    </View>
  );
}

function Intro({ round, kind }: { round: number; kind: 'L' | 'C' }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
  }, [round, v]);
  return (
    <Animated.View style={[styles.intro, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}>
      <Text style={styles.introSmall}>MANCHE {round + 1} / {ROUNDS.length}</Text>
      <Text style={styles.introBig}>{kind === 'L' ? 'Le mot le plus long' : 'Le compte est bon'}</Text>
      <Text style={styles.introSub}>
        {kind === 'L'
          ? `10 lettres · ${DURATION.L} secondes\nUn point par lettre si le mot existe`
          : `6 plaques · ${DURATION.C} secondes\n10 points si c'est exact, 7 pour le plus proche`}
      </Text>
      <Text style={styles.introNote}>Les réponses restent cachées. Le chrono s'arrête quand les 4 ont répondu.</Text>
    </Animated.View>
  );
}

function Final({ ranking, onReplay, onClose }: { ranking: Player[]; onReplay: () => void; onClose: () => void }) {
  const out = ranking[ranking.length - 1];
  const win = ranking[0];
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);
  return (
    <ScrollView contentContainerStyle={{ paddingTop: 10, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.finalTitle}>{win.me ? 'Tu as gagné ! 👑' : `${win.name} gagne la partie 👑`}</Text>
      {ranking.map((p, i) => (
        <View key={p.id} style={[styles.rankRow, i === 0 && styles.rankWin, i === ranking.length - 1 && styles.rankOut]}>
          <Text style={styles.rankPos}>{i === 0 ? '👑' : i + 1}</Text>
          <Image source={p.photo} style={styles.revealAv} />
          <Text style={[styles.revealName, { flex: 1 }]}>{p.me ? 'Toi' : p.name}</Text>
          <Text style={styles.rankScore}>{p.score} pts</Text>
        </View>
      ))}
      <View style={styles.outBox}>
        <Text style={styles.outText}>
          ⬇ {out.me ? 'Tu descends de la scène… Remets-toi dans la file pour retenter ta chance.' : `${out.name} descend de la scène.`}
        </Text>
        <Text style={styles.outSub}>Un nouveau challenger de la file monte pour la prochaine partie.</Text>
      </View>
      <Pressable onPress={onReplay}>
        <LinearGradient colors={goldGradient} style={styles.replay}>
          <Ionicons name="refresh" size={18} color="#1D1405" />
          <Text style={styles.replayText}>Rejouer</Text>
        </LinearGradient>
      </Pressable>
      <Pressable onPress={onClose} style={styles.quit}>
        <Text style={styles.quitText}>Quitter le live</Text>
      </Pressable>
    </ScrollView>
  );
}

function ActionBtn({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.action, disabled && { opacity: 0.4 }]}>
      <Ionicons name={icon} size={17} color={colors.text} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function SubmitBtn({ done, onPress }: { done: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={done} style={{ flex: 1.4 }}>
      <LinearGradient colors={done ? ['#3A2E18', '#2A2010'] : goldGradient} style={styles.submit}>
        <Ionicons name={done ? 'lock-closed' : 'checkmark'} size={17} color={done ? GOLD : '#1D1405'} />
        <Text style={[styles.submitText, done && { color: GOLD }]}>{done ? 'Envoyé' : 'Valider'}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  logo: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#1D1405', fontWeight: '900', fontSize: 15 },
  brand: { color: colors.text, fontSize: 16, fontWeight: '900' },
  brandSub: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  viewers: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)' },
  viewersText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },

  players: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginTop: 4 },
  player: {
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(247,241,225,0.08)',
  },
  playerMe: { borderColor: 'rgba(212,175,55,0.6)', backgroundColor: 'rgba(212,175,55,0.08)' },
  playerAv: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.gold },
  crown: { position: 'absolute', top: -12, alignSelf: 'center', fontSize: 15 },
  playerName: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: 5, maxWidth: '90%' },
  playerScore: { color: GOLD, fontSize: 12, fontWeight: '900', marginTop: 1 },
  status: { marginTop: 5, paddingHorizontal: 6, height: 18, borderRadius: 9, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  statusOn: { backgroundColor: GOLD },
  statusText: { color: colors.textDim, fontSize: 9.5, fontWeight: '800' },

  roundBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 12 },
  roundChips: { flex: 1, flexDirection: 'row', gap: 6 },
  roundChip: { paddingHorizontal: 9, height: 24, borderRadius: 12, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)' },
  roundChipOn: { backgroundColor: GOLD, borderColor: GOLD },
  roundChipDone: { opacity: 0.45 },
  roundChipText: { color: colors.textDim, fontSize: 11, fontWeight: '800' },
  timer: { color: colors.text, fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  timeTrack: { height: 4, borderRadius: 2, marginHorizontal: 12, marginTop: 6, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  timeFill: { height: 4, backgroundColor: GOLD },

  hint: { color: colors.textDim, fontSize: 12.5, textAlign: 'center', marginBottom: 10 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  tile: { borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileEmpty: { borderWidth: 1, borderColor: 'rgba(212,175,55,0.25)', backgroundColor: 'rgba(255,255,255,0.04)' },
  tileText: { color: '#1D1405', fontSize: 26, fontWeight: '900' },
  answerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 58,
    marginTop: 14,
    padding: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.45)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  answerPh: { color: colors.textFaint, fontSize: 13, textAlign: 'center' },
  answerTile: { width: 28, height: 38, borderRadius: 8, backgroundColor: 'rgba(243,210,122,0.16)', alignItems: 'center', justifyContent: 'center' },
  answerTileText: { color: GOLD, fontSize: 20, fontWeight: '900' },
  answerLen: { color: colors.textDim, fontSize: 12, fontWeight: '800', marginLeft: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  action: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  actionText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  submit: { height: 46, borderRadius: 23, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  submitText: { color: '#1D1405', fontSize: 14.5, fontWeight: '900' },

  targetBox: { alignSelf: 'center', alignItems: 'center', paddingHorizontal: 26, paddingVertical: 6, borderRadius: 18, borderWidth: 1.5, borderColor: GOLD, backgroundColor: 'rgba(0,0,0,0.45)', marginBottom: 10 },
  targetLabel: { color: colors.textDim, fontSize: 9.5, fontWeight: '900', letterSpacing: 1.4 },
  target: { color: GOLD, fontSize: 40, fontWeight: '900', fontVariant: ['tabular-nums'] },
  plaques: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, minHeight: 104 },
  plaque: {
    width: 76,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  plaqueMade: { backgroundColor: GOLD, borderColor: GOLD },
  plaqueSel: { borderColor: '#FFFFFF', borderWidth: 2.5, transform: [{ scale: 1.06 }] },
  plaqueText: { color: colors.text, fontSize: 21, fontWeight: '900' },
  ops: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 12 },
  op: { width: 54, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)' },
  opOn: { backgroundColor: GOLD, borderColor: GOLD },
  opText: { color: colors.text, fontSize: 22, fontWeight: '900' },
  calc: { marginTop: 10, minHeight: 52, padding: 8, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)', justifyContent: 'center' },
  calcText: { color: colors.text, fontSize: 12.5, textAlign: 'center' },
  calcMine: { color: GOLD, fontSize: 13, fontWeight: '900', textAlign: 'center', marginTop: 3 },

  stopped: { color: GOLD, fontSize: 14, fontWeight: '900', textAlign: 'center' },
  drawRecap: { color: colors.textDim, fontSize: 13, fontWeight: '800', textAlign: 'center', letterSpacing: 1.5, marginTop: 4, marginBottom: 10 },
  revealRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 7 },
  revealRowWin: { backgroundColor: 'rgba(212,175,55,0.14)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.5)' },
  revealAv: { width: 38, height: 38, borderRadius: 19 },
  revealName: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
  revealAnswer: { color: GOLD, fontSize: 19, fontWeight: '900', letterSpacing: 1.5, marginTop: 1 },
  revealBad: { color: '#FF8A8A', textDecorationLine: 'line-through' },
  revealSteps: { color: colors.textDim, fontSize: 10.5, marginTop: 2 },
  revealHidden: { color: colors.textFaint, fontSize: 13, marginTop: 2 },
  revealPts: { color: GOLD, fontSize: 18, fontWeight: '900' },
  revealNote: { color: colors.textDim, fontSize: 10.5, fontWeight: '700', marginTop: 1 },
  best: { marginTop: 6, padding: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)' },
  bestText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  nextBtn: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: GOLD },
  nextText: { color: '#1D1405', fontSize: 12.5, fontWeight: '900' },

  intro: { alignItems: 'center', paddingTop: 30, paddingHorizontal: 16 },
  introSmall: { color: colors.textDim, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  introBig: { color: GOLD, fontSize: 30, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  introSub: { color: colors.text, fontSize: 15, textAlign: 'center', lineHeight: 22, marginTop: 12 },
  introNote: { color: colors.textDim, fontSize: 12.5, textAlign: 'center', marginTop: 18 },

  finalTitle: { color: GOLD, fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 14 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 7 },
  rankWin: { backgroundColor: 'rgba(212,175,55,0.16)', borderWidth: 1, borderColor: GOLD },
  rankOut: { opacity: 0.6 },
  rankPos: { width: 26, textAlign: 'center', color: colors.text, fontSize: 16, fontWeight: '900' },
  rankScore: { color: GOLD, fontSize: 16, fontWeight: '900' },
  outBox: { marginTop: 8, padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,90,110,0.1)', borderWidth: 1, borderColor: 'rgba(255,90,110,0.35)' },
  outText: { color: colors.text, fontSize: 13.5, fontWeight: '800' },
  outSub: { color: colors.textDim, fontSize: 12, marginTop: 4 },
  replay: { marginTop: 16, height: 50, borderRadius: 25, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  replayText: { color: '#1D1405', fontSize: 16, fontWeight: '900' },
  quit: { alignSelf: 'center', marginTop: 14, padding: 6 },
  quitText: { color: colors.textDim, fontSize: 13, fontWeight: '800' },
});
