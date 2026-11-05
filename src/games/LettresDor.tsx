import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurMask, Canvas, Circle, LinearGradient as SkLinear, Oval, Path, RadialGradient, Rect, Skia, vec } from '@shopify/react-native-skia';
import { goldGradient } from '../theme';
import { FadeIn, GiftGrid, LiveSlide, Sheet, Toast, faceOf, tap, useFloaters, useLiveChat, useToast, type Gift } from '../talk/LiveKit';
import { DEENA_PHOTO } from '../table/data';
import { findPerson } from '../world/data';
import { useSession } from '../lib/session';
import {
  LETTER_COUNT,
  MIN_CONSONANTS,
  MIN_VOWELS,
  OPS,
  applyOp,
  botCount,
  botWord,
  drawNumbers,
  drawOne,
  isVowel,
  isWord,
  rand,
  solveLetters,
  solveNumbers,
  type BotLevel,
  type Op,
} from './engine';

// « Lettres d'Or Zembo » (nom provisoire) : le jeu des lettres et des chiffres en live.
//
// MODE TOURNOI
// - 4 joueurs sur scène (caméra obligatoire), les autres attendent dans la file.
// - Tour à 4 : Lettres, Lettres, Chiffres → le dernier descend.
// - Tour à 3 : Lettres, Lettres, Chiffres → le dernier descend.
// - Finale à 2 : Chiffres, Chiffres, Lettres → le gagnant prend une couronne.
// - Le gagnant reste, 3 joueurs de la file montent. 5 manches de suite.
// - Pour les lettres, les joueurs choisissent Voyelle ou Consonne chacun leur tour.
// - Réponses cachées, chrono qui s'arrête quand tout le monde a répondu, puis révélation.
//
// Ici : toi + des joueurs simulés.

const GOLD = '#F3D27A';
const GOLD2 = '#E9B949';
const INK = '#1D1405';
const NAVY = 'rgba(14,16,52,0.88)';
const PURPLE = '#8B5CF6';
const BLUE = '#5B7CFF';
const GREEN = '#3DDC97';
const DURATION = { L: 30, C: 40 };
const TICK = 250;
const MANCHES = 5;
const CHOOSE_TIME = 3;

type Kind = 'L' | 'C';
const STAGES: { n: number; label: string; rounds: Kind[] }[] = [
  { n: 4, label: 'Tour à 4', rounds: ['L', 'L', 'C'] },
  { n: 3, label: 'Tour à 3', rounds: ['L', 'L', 'C'] },
  { n: 2, label: 'Finale', rounds: ['C', 'C', 'L'] },
];

type Player = { id: string; name: string; photo: number | string; me?: boolean; level: BotLevel; score: number; last: number };
type Answer = { at: number; word?: string; value?: number; steps?: string[] };
type RoundData =
  | { kind: 'L'; letters: string[]; sol: ReturnType<typeof solveLetters> }
  | { kind: 'C'; plaques: number[]; target: number; best: number; bestSteps: string[]; reach: Map<number, string[]> };
type Result = { id: string; answer: Answer | null; valid: boolean; points: number; dist?: number; note: string };
type Phase = 'mode' | 'intro' | 'choose' | 'draw' | 'play' | 'reveal' | 'elim' | 'champion' | 'end';
type Overlay = { who: Player; ranking: Player[]; up?: Player[] };
type Crowns = Record<string, { n: number; p: Player }>;

const LEVELS: BotLevel[] = [
  { exact: 0.5, slack: [0, 1, 1, 2] },
  { exact: 0.35, slack: [0, 1, 2, 2, 3] },
  { exact: 0.6, slack: [0, 0, 1, 2] },
  { exact: 0.4, slack: [0, 1, 2] },
];
// spectateurs qui demandent à monter (simulés)
const VIEWERS = ['Fatou', 'Yann', 'Nadia', 'Karim', 'Sophie', 'Djamal', 'Lina', 'Alex', 'Emma', 'Momo', 'Sarah', 'Kevin', 'Bintou', 'Idriss', 'Leïla', 'Malik', 'Noura', 'Jordan', 'Mariam', 'Samir'];

const fresh = (p: Player): Player => ({ ...p, score: 0, last: 0 });
const nameOf = (p: Player) => (p.me ? 'Toi' : p.name);
const worldPlayer = (id: string, level: BotLevel): Player => {
  const p = findPerson(id);
  return { id, name: p?.name ?? id, photo: p?.photo ?? '', level, score: 0, last: 0 };
};
const ME: Player = { id: 'me', name: 'Toi', photo: DEENA_PHOTO, me: true, level: LEVELS[0], score: 0, last: 0 };

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
  ['Alex', 'Chrono arrêté, révélation !! 👏'],
  ['Yann', 'Les réponses cachées, ça met la pression 😅'],
  ['Fatou', 'Kenji calcule trop vite 🤯'],
  ['Emma', 'Consonne ! Consonne ! 😂'],
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
  const [queueOpen, setQueueOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const chatY = useRef(600);
  const [chatRows, setChatRows] = useState(5); // autant de messages que la place le permet

  // ── le tournoi ──
  const viewerSeq = useRef(0);
  const newViewer = () => {
    const k = viewerSeq.current++;
    const name = VIEWERS[k % VIEWERS.length];
    return { id: `v${k}`, name, photo: faceOf(name, 300), level: LEVELS[k % LEVELS.length], score: 0, last: 0 } as Player;
  };
  const [stage, setStage] = useState<Player[]>(() => [ME, worldPlayer('moussa', LEVELS[0]), worldPlayer('awa', LEVELS[1]), worldPlayer('kenji', LEVELS[2])]);
  const [queue, setQueue] = useState<Player[]>(() => Array.from({ length: 4 }, newViewer));
  const [crowns, setCrowns] = useState<Crowns>({});
  const [manche, setManche] = useState(1);
  const [stageIdx, setStageIdx] = useState(0);
  const [epreuve, setEpreuve] = useState(0);
  const [phase, setPhase] = useState<Phase>('mode');
  const [overlay, setOverlay] = useState<Overlay | null>(null);

  // ── l'épreuve en cours ──
  const [data, setData] = useState<RoundData | null>(null);
  const [shown, setShown] = useState(0); // plaques déjà affichées
  const [elapsed, setElapsed] = useState(0);
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const botAnswers = useRef<Record<string, Answer | null>>({});
  const [mine, setMine] = useState<Answer | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [nextIn, setNextIn] = useState(0);
  // choix des lettres
  const [letters, setLetters] = useState<string[]>([]);
  const [lastPick, setLastPick] = useState<{ who: string; type: 'V' | 'C'; forced: boolean } | null>(null);
  const [chooseLeft, setChooseLeft] = useState(CHOOSE_TIME);
  // saisie lettres
  const [picked, setPicked] = useState<number[]>([]);
  // saisie chiffres
  const [items, setItems] = useState<{ v: number; used: boolean; made?: boolean }[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [steps, setSteps] = useState<{ a: number; b: number; text: string }[]>([]);

  const STAGE = STAGES[stageIdx];
  const kind = STAGE.rounds[epreuve];
  const duration = DURATION[kind];
  const left = duration - elapsed;
  const meOnStage = stage.some((p) => p.me);
  const meQueued = queue.some((p) => p.me);
  const chooser = stage[(epreuve + stageIdx + letters.length) % stage.length];

  // ── des spectateurs demandent à monter de temps en temps ──
  useEffect(() => {
    if (phase === 'mode') return;
    const t = setInterval(() => {
      setQueue((q) => {
        if (q.length >= 6) return q;
        const v = newViewer();
        chat.push(v.name, '🙋 demande à monter sur scène');
        return [...q, v];
      });
    }, 14000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'mode']);

  // ── 1. Intro de l'épreuve ──
  useEffect(() => {
    if (phase !== 'intro') return;
    const t = setTimeout(() => {
      setMine(null);
      setElapsed(0);
      setStoppedEarly(false);
      setResults([]);
      setRevealed(0);
      setPicked([]);
      setSel(null);
      setOp(null);
      setSteps([]);
      if (kind === 'L') {
        setData(null);
        setLetters([]);
        setLastPick(null);
        setPhase('choose');
      } else {
        const { plaques, target } = drawNumbers();
        const s = solveNumbers(plaques, target);
        const answers: Record<string, Answer | null> = {};
        for (const b of stage.filter((p) => !p.me)) {
          const c = botCount(s.reach, target, b.level);
          answers[b.id] = Math.random() < 0.05 ? null : { at: rand(14, 37), value: c.value, steps: c.steps };
        }
        botAnswers.current = answers;
        setData({ kind: 'C', plaques, target, best: s.best, bestSteps: s.steps, reach: s.reach });
        setItems(plaques.map((v) => ({ v, used: false })));
        setShown(0);
        setPhase('draw');
      }
    }, 2600);
    return () => clearTimeout(t);
  }, [phase, kind, stage]);

  // ── 2a. Lettres : chaque joueur choisit Voyelle ou Consonne à son tour ──
  const choose = (want: 'V' | 'C') => {
    if (phase !== 'choose' || letters.length >= LETTER_COUNT) return;
    const v = letters.filter(isVowel).length;
    const c = letters.length - v;
    const remaining = LETTER_COUNT - letters.length;
    let type = want;
    if (type === 'C' && v + remaining - 1 < MIN_VOWELS) type = 'V';
    if (type === 'V' && c + remaining - 1 < MIN_CONSONANTS) type = 'C';
    setLetters([...letters, drawOne(type, letters)]);
    setLastPick({ who: nameOf(chooser), type, forced: type !== want });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  useEffect(() => {
    if (phase !== 'choose') return;
    if (letters.length >= LETTER_COUNT) {
      // tirage complet : on cherche les solutions et on lance le chrono
      const t = setTimeout(() => {
        const sol = solveLetters(letters);
        const answers: Record<string, Answer | null> = {};
        for (const b of stage.filter((p) => !p.me)) {
          const w = botWord(sol, b.level);
          answers[b.id] = !w || Math.random() < 0.05 ? null : { at: rand(8, 27), word: w };
        }
        botAnswers.current = answers;
        setData({ kind: 'L', letters, sol });
        setPhase('play');
      }, 700);
      return () => clearTimeout(t);
    }
    if (!chooser.me) {
      // joueur simulé : garde un bon équilibre voyelles / consonnes
      const v = letters.filter(isVowel).length;
      const wantV = v < letters.length * 0.42 ? Math.random() < 0.75 : Math.random() < 0.3;
      const t = setTimeout(() => choose(wantV ? 'V' : 'C'), rand(800, 1400));
      return () => clearTimeout(t);
    }
    setChooseLeft(CHOOSE_TIME);
    const t = setInterval(() => setChooseLeft((x) => x - 1), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, letters.length]);

  // trop tard : le jeu choisit pour toi
  useEffect(() => {
    if (phase === 'choose' && chooser?.me && chooseLeft <= 0 && letters.length < LETTER_COUNT) choose(Math.random() < 0.45 ? 'V' : 'C');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chooseLeft]);

  // ── 2b. Chiffres : les plaques apparaissent une par une ──
  useEffect(() => {
    if (phase !== 'draw' || !data || data.kind !== 'C') return;
    const total = data.plaques.length + 1;
    if (shown >= total) {
      const t = setTimeout(() => setPhase('play'), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => {
        setShown((n) => n + 1);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      },
      shown === data.plaques.length ? 700 : 260,
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
  const allAnswered = stage.every((p) => answered(p.id));

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
    if (phase !== 'play' || mine || !meOnStage) return;
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
    let me = meOnStage ? mine : null;
    if (meOnStage && !me) {
      if (data.kind === 'L' && myWord.length >= 2) me = { at: duration, word: myWord };
      if (data.kind === 'C' && myValue !== null) me = { at: duration, value: myValue, steps: steps.map((s) => s.text) };
      if (me) setMine(me);
    }
    const all: Record<string, Answer | null> = { ...botAnswers.current, me };
    for (const id of Object.keys(all)) if (all[id] && all[id]!.at > elapsed + 0.01 && id !== 'me') all[id] = null;

    let res: Result[];
    if (data.kind === 'L') {
      res = stage.map((p) => {
        const a = all[p.id];
        if (!a?.word) return { id: p.id, answer: null, valid: false, points: 0, note: 'Aucune' };
        const ok = isWord(a.word);
        return { id: p.id, answer: a, valid: ok, points: ok ? a.word.length : 0, note: ok ? `${a.word.length} lettres` : 'Mot refusé' };
      });
      res.sort((x, y) => (x.valid ? x.answer!.word!.length : -1) - (y.valid ? y.answer!.word!.length : -1));
    } else {
      const dists = stage.map((p) => (all[p.id]?.value !== undefined ? Math.abs(all[p.id]!.value! - data.target) : Infinity));
      const min = Math.min(...dists);
      res = stage.map((p, i) => {
        const a = all[p.id];
        if (!a || a.value === undefined) return { id: p.id, answer: null, valid: false, points: 0, note: 'Aucune' };
        const d = dists[i];
        const pts = d === 0 ? 10 : d === min ? 7 : 0;
        return { id: p.id, answer: a, valid: true, dist: d, points: pts, note: d === 0 ? 'Compte bon !' : `Écart ${d}` };
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
          setStage((ps) =>
            ps.map((p) => {
              const pts = results.find((r) => r.id === p.id)?.points ?? 0;
              return { ...p, score: p.score + pts, last: pts };
            }),
          );
          setNextIn(5);
        }
        setRevealed((n) => n + 1);
      },
      revealed === 0 ? 900 : 1400,
    );
    return () => clearTimeout(t);
  }, [phase, revealed, results, nextIn]);

  useEffect(() => {
    if (phase === 'reveal' && revealed > results.length && nextIn === 0) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextIn]);

  // classement du tour : points, puis la dernière épreuve, puis au hasard
  const ranked = (ps: Player[]) => [...ps].sort((a, b) => b.score - a.score || b.last - a.last || Math.random() - 0.5);

  const next = () => {
    if (phase !== 'reveal') return;
    if (epreuve < STAGE.rounds.length - 1) {
      setEpreuve(epreuve + 1);
      setPhase('intro');
      return;
    }
    const ranking = ranked(stage);
    if (stage.length > 2) {
      // le dernier descend de la scène
      setOverlay({ who: ranking[ranking.length - 1], ranking });
      setPhase('elim');
      return;
    }
    // finale terminée : couronne pour le gagnant
    const winner = ranking[0];
    setCrowns((c) => ({ ...c, [winner.id]: { n: (c[winner.id]?.n ?? 0) + 1, p: winner } }));
    if (manche >= MANCHES) {
      setOverlay({ who: winner, ranking });
      setPhase('end');
      return;
    }
    const q = [...queue];
    while (q.length < 3) q.push(newViewer());
    setOverlay({ who: winner, ranking, up: q.slice(0, 3) });
    setPhase('champion');
  };

  // élimination : le dernier descend, on passe au tour suivant
  useEffect(() => {
    if (phase !== 'elim' || !overlay) return;
    const t = setTimeout(() => {
      const out = overlay.who;
      if (out.me) toast.show('Tu descends de la scène… Touche 🙋 pour redemander à monter.');
      setStage((ps) => ps.filter((p) => p.id !== out.id).map(fresh));
      setStageIdx((s) => s + 1);
      setEpreuve(0);
      setOverlay(null);
      setPhase('intro');
    }, 4500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, overlay]);

  // fin de manche : le gagnant reste, 3 joueurs de la file montent
  useEffect(() => {
    if (phase !== 'champion' || !overlay?.up) return;
    const t = setTimeout(() => {
      const up = overlay.up!;
      const ids = up.map((p) => p.id);
      setStage([fresh(overlay.who), ...up.map(fresh)]);
      setQueue((q) => q.filter((p) => !ids.includes(p.id)));
      if (up.some((p) => p.me)) toast.show('À toi ! Tu montes sur scène 🎤');
      setManche((m) => m + 1);
      setStageIdx(0);
      setEpreuve(0);
      setOverlay(null);
      setPhase('intro');
    }, 5500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, overlay]);

  const relaunch = () => {
    const champ = overlay?.who;
    const q = [...queue];
    while (q.length < 3) q.push(newViewer());
    const up = q.slice(0, 3);
    const ids = up.map((p) => p.id);
    setStage([fresh(champ ?? ME), ...up.map(fresh)]);
    setQueue((cur) => cur.filter((p) => !ids.includes(p.id)));
    setCrowns({});
    setManche(1);
    setStageIdx(0);
    setEpreuve(0);
    setOverlay(null);
    setPhase('intro');
  };

  // ── file d'attente ──
  const requestStage = () => {
    tap();
    if (meOnStage) return toast.show('Tu es déjà sur scène 🎤');
    if (meQueued) {
      setQueue((q) => q.filter((p) => !p.me));
      return toast.show('Tu as quitté la file');
    }
    setQueue((q) => [...q, fresh(ME)]);
    toast.show(`Demande envoyée : tu es n°${queue.length + 1} dans la file 🙋`);
  };

  // ── saisie ──
  const canPlay = phase === 'play' && meOnStage && !mine;
  const pickTile = (i: number) => {
    if (!canPlay || picked.includes(i)) return;
    tap();
    setPicked([...picked, i]);
  };
  const unpick = (pos: number) => {
    if (!canPlay) return;
    tap();
    setPicked(picked.filter((_, k) => k !== pos));
  };

  const pressPlaque = (i: number) => {
    if (!canPlay || items[i].used) return;
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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };
  const undo = () => {
    if (!canPlay) return;
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
  const n = stage.length;
  const card4 = (width - 24 - 3 * 8) / 4;
  const camW = (width - 24 - (n - 1) * 8) / n;
  const boardInner = width - 24 - 4 - 24;
  const ringSize = 60;
  const tile = Math.floor((boardInner - 9 * 4) / 10); // les 10 lettres sur une seule ligne
  const plaqueW = (boardInner - 5 * 5) / 6;
  const resultOf = (id: string) => results.find((r) => r.id === id);
  const revealedIds = results.slice(0, revealed).map((r) => r.id);
  const myChoice = phase === 'choose' && chooser?.me && letters.length < LETTER_COUNT;
  const ringValue =
    phase === 'play' ? left : phase === 'reveal' ? Math.max(0, duration - elapsed) : myChoice ? Math.max(0, chooseLeft) : duration;
  const ringTotal = myChoice ? CHOOSE_TIME : duration;
  const reveal = phase === 'reveal';
  const showLetters = kind === 'L' && (phase === 'choose' || ((phase === 'play' || phase === 'reveal') && data?.kind === 'L'));
  const boardLetters = phase === 'choose' ? letters : data?.kind === 'L' ? data.letters : [];
  const lastResult = steps.length > 0 && sel === items.length - 1 && items[sel]?.made;

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

      {/* ── manche / tour / épreuve ── */}
      <View style={styles.mancheRow}>
        <View style={styles.manche}>
          <View style={styles.mancheLabel}>
            <Text style={styles.mancheText}>
              Manche {manche}/{MANCHES}
            </Text>
          </View>
          <Text style={styles.stageText}>{STAGE.label}</Text>
          <View style={styles.dots}>
            {STAGE.rounds.map((k, i) => (
              <View key={i} style={[styles.dot, i <= epreuve && { backgroundColor: k === 'L' ? GOLD2 : GREEN }]} />
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
            {(phase === 'intro' || phase === 'mode' || phase === 'elim' || phase === 'champion' || phase === 'end') && (
              <IntroText epreuve={epreuve} stageLabel={STAGE.label} kind={kind} />
            )}

            {/* lettres : 10 tuiles sur une ligne */}
            {showLetters && (
              <View style={styles.tiles}>
                {Array.from({ length: LETTER_COUNT }).map((_, i) => {
                  const l = boardLetters[i];
                  if (!l) return <View key={i} style={[styles.tile, styles.tileEmpty, { width: tile, height: 46 }]} />;
                  const used = picked.includes(i) || !!mine || reveal || !meOnStage || phase === 'choose';
                  const dim = phase === 'play' && (picked.includes(i) || !!mine);
                  return (
                    <Pressable key={i} onPress={() => pickTile(i)} disabled={!canPlay}>
                      <LinearGradient
                        colors={dim || reveal ? ['#4A3A1C', '#2B2210'] : isVowel(l) && phase === 'choose' ? ['#FFF6D0', '#F6D36A', '#C99A2E'] : ['#FFF0B0', '#F3C14B', '#B98318']}
                        style={[styles.tile, { width: tile, height: 46 }]}
                      >
                        <Text style={[styles.tileText, { fontSize: Math.min(24, tile * 0.68) }, (dim || reveal) && used && { color: 'rgba(243,210,122,0.5)' }]}>{l}</Text>
                      </LinearGradient>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* chiffres : nombre à trouver, plaques, résultats */}
            {kind === 'C' && data?.kind === 'C' && (phase === 'draw' || phase === 'play' || phase === 'reveal') && (
              <View>
                <View style={styles.targetRow}>
                  <Text style={styles.targetLabel}>À TROUVER</Text>
                  <Text style={styles.target}>{shown > data.plaques.length || phase !== 'draw' ? data.target : '???'}</Text>
                </View>
                <View style={styles.plaques}>
                  {data.plaques.map((v, i) => {
                    const visible = i < shown || phase !== 'draw';
                    const x = phase === 'play' && meOnStage ? items[i] : { v, used: false };
                    return (
                      <Pressable key={i} onPress={() => pressPlaque(i)} disabled={!visible || !canPlay || x.used}>
                        <View style={[styles.plaque, { width: plaqueW }, x.used && styles.plaqueUsed, sel === i && canPlay && styles.plaqueSel, !visible && styles.tileEmpty]}>
                          <Text style={[styles.plaqueText, x.used && styles.plaqueTextUsed]}>{visible ? x.v : ''}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                {/* tes résultats, en vert */}
                {phase === 'play' && meOnStage && items.length > 6 && (
                  <View style={styles.results}>
                    <Text style={styles.resultsLabel}>Tes résultats</Text>
                    {items.slice(6).map((x, k) => {
                      const i = k + 6;
                      return (
                        <FadeIn key={i}>
                          <Pressable onPress={() => pressPlaque(i)} disabled={!canPlay || x.used}>
                            <View style={[styles.resultChip, x.used && styles.plaqueUsed, sel === i && canPlay && styles.plaqueSel]}>
                              <Text style={[styles.resultText, x.used && styles.plaqueTextUsed]}>{x.v}</Text>
                            </View>
                          </Pressable>
                        </FadeIn>
                      );
                    })}
                  </View>
                )}
                {/* la ligne de calcul, comme une calculatrice */}
                {phase === 'play' && meOnStage && (
                  <View style={styles.calcLine}>
                    {mine ? (
                      <Text style={styles.calcHint}>🔒 Compte envoyé, caché jusqu’à la révélation</Text>
                    ) : sel !== null && op !== null ? (
                      <Text style={styles.calcExpr}>
                        {items[sel].v} {op} <Text style={styles.calcQ}>?</Text>
                      </Text>
                    ) : lastResult ? (
                      <Text style={styles.calcExpr}>
                        {steps[steps.length - 1].text.split(' = ')[0]} <Text style={styles.calcEq}>= {items[sel!].v}</Text>
                      </Text>
                    ) : sel !== null ? (
                      <Text style={styles.calcExpr}>
                        {items[sel].v} <Text style={styles.calcHintInline}>→ choisis + − × ÷</Text>
                      </Text>
                    ) : (
                      <Text style={styles.calcHint}>Touche une plaque pour commencer</Text>
                    )}
                    {myValue !== null && !mine && (
                      <Text style={[styles.calcGap, myValue === data.target && { color: GREEN }]}>
                        {myValue === data.target ? '🎯 Compte bon' : `écart ${Math.abs(myValue - data.target)}`}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ligne du bas du plateau : chrono + ma saisie, ou le résultat */}
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TimerRing size={ringSize} value={ringValue} total={ringTotal} paused={phase === 'reveal'} />
            <View style={{ flex: 1 }}>
              {(phase === 'intro' || phase === 'mode' || phase === 'elim' || phase === 'champion' || phase === 'end') && (
                <Text style={styles.hint}>
                  {kind === 'L'
                    ? `Chacun choisit voyelle ou consonne à son tour. ${DURATION.L} s · 1 point par lettre.`
                    : `6 plaques · ${DURATION.C} s · 10 pts si exact, 7 au plus proche.`}
                </Text>
              )}

              {phase === 'choose' &&
                (letters.length >= LETTER_COUNT ? (
                  <Text style={styles.hint}>Tirage complet ! C’est parti…</Text>
                ) : myChoice ? (
                  <View style={styles.inputRow}>
                    <Pressable onPress={() => choose('V')} style={{ flex: 1 }}>
                      <LinearGradient colors={['#FFF6D0', '#F6D36A', '#C99A2E']} style={styles.vcBtn}>
                        <Text style={styles.vcText}>Voyelle</Text>
                      </LinearGradient>
                    </Pressable>
                    <Pressable onPress={() => choose('C')} style={{ flex: 1 }}>
                      <LinearGradient colors={['#B79CFF', '#7C4DFF', '#4B2BB8']} style={styles.vcBtn}>
                        <Text style={[styles.vcText, { color: '#fff' }]}>Consonne</Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.hint}>
                      <Text style={{ color: GOLD, fontWeight: '900' }}>{nameOf(chooser)}</Text> choisit : voyelle ou consonne ?
                    </Text>
                    {lastPick && (
                      <Text style={styles.pickNote}>
                        {lastPick.who} → {lastPick.type === 'V' ? 'Voyelle' : 'Consonne'}
                        {lastPick.forced ? ' (imposée)' : ''}
                      </Text>
                    )}
                  </View>
                ))}

              {phase === 'draw' && <Text style={styles.hint}>Tirage des plaques…</Text>}

              {phase === 'play' && !meOnStage && <Text style={styles.hint}>Tu regardes. Touche 🙋 en bas pour demander à monter sur scène.</Text>}

              {phase === 'play' && meOnStage && data?.kind === 'L' && (
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

              {phase === 'play' && meOnStage && data?.kind === 'C' && (
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

              {phase === 'reveal' && data && (
                <View style={styles.revealLine}>
                  <View style={{ flex: 1 }}>
                    {revealed <= results.length ? (
                      <Text style={styles.revealMsg}>{stoppedEarly ? 'Tout le monde a répondu : chrono arrêté ! Révélation…' : 'Temps écoulé ! Révélation…'}</Text>
                    ) : data.kind === 'L' ? (
                      <Text style={styles.revealMsg} numberOfLines={2}>
                        Meilleur mot : <Text style={{ color: GOLD, fontWeight: '900' }}>{data.sol.words[0] ?? '—'}</Text>
                        {data.sol.words[0] ? ` (${data.sol.words[0].length} lettres)` : ''}
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

      {/* ── les joueurs sur scène (caméras) ── */}
      <View style={styles.players}>
        {stage.map((p) => {
          const r = resultOf(p.id);
          const flash = phase === 'reveal' && revealedIds.includes(p.id) && !!r?.points;
          const choosing = phase === 'choose' && letters.length < LETTER_COUNT && chooser?.id === p.id;
          const crown = crowns[p.id]?.n ?? 0;
          return (
            <View key={p.id} style={{ width: camW }}>
              <View style={[styles.cam, { height: card4 * 1.4 }, p.me && styles.camMe, (flash || choosing) && styles.camFlash]}>
                <Image source={p.photo} style={StyleSheet.absoluteFill} contentFit="cover" />
                <LinearGradient colors={['transparent', 'rgba(8,6,30,0.85)', 'rgba(8,6,30,0.97)']} locations={[0.45, 0.75, 1]} style={StyleSheet.absoluteFill} />
                <View style={styles.camDot} />
                {choosing && (
                  <View style={styles.choosingTag}>
                    <Text style={styles.choosingText}>À son tour</Text>
                  </View>
                )}
                <View style={styles.camBottom}>
                  <Text style={styles.camName} numberOfLines={1}>
                    {nameOf(p)}
                  </Text>
                  <LinearGradient colors={['#FFE89A', '#E9B949', '#B98318']} style={styles.ptsPill}>
                    <Text style={styles.ptsText}>
                      {p.score}
                      <Text style={{ fontSize: 10 }}> pts</Text>
                    </Text>
                  </LinearGradient>
                </View>
              </View>
              {crown > 0 && (
                <View style={styles.crownPill} pointerEvents="none">
                  <Text style={styles.crownText}>👑 {crown}</Text>
                </View>
              )}
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
            {stage.map((p) => {
              const r = resultOf(p.id);
              const isOpen = phase === 'reveal' && revealedIds.includes(p.id);
              const did = phase === 'play' ? answered(p.id) : phase === 'reveal';
              return (
                <View key={p.id} style={[styles.slot, { width: camW - 6 }, did && !isOpen && styles.slotDone, isOpen && r?.points ? styles.slotWin : null]}>
                  {isOpen && r ? (
                    <>
                      <Text style={[styles.slotAnswer, !r.valid && !!r.answer && styles.slotBad]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                        {r.answer ? (data?.kind === 'L' ? r.answer.word : r.answer.value) : '—'}
                      </Text>
                      <Text style={[styles.slotPts, !r.points && { color: 'rgba(255,255,255,0.5)' }]} numberOfLines={1}>
                        {r.points ? `+${r.points}` : r.note}
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
          <View>
            <RoundGold onPress={() => setQueueOpen(true)}>
              <Text style={{ fontSize: 20 }}>🙋</Text>
            </RoundGold>
            {queue.length > 0 && (
              <View style={styles.badge} pointerEvents="none">
                <Text style={styles.badgeText}>{queue.length}</Text>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {floaters.layer}

      {/* ── écrans par-dessus : mode, élimination, fin de manche, fin du tournoi ── */}
      {phase === 'mode' && <ModePicker top={T + 120} onTournament={() => setPhase('intro')} onClose={onClose} />}
      {phase === 'elim' && overlay && <ElimCard o={overlay} top={T + 150} />}
      {phase === 'champion' && overlay && <ChampionCard o={overlay} manche={manche} crowns={crowns} top={T + 130} />}
      {phase === 'end' && overlay && <EndCard o={overlay} crowns={crowns} top={T + 110} onRelaunch={relaunch} onClose={onClose} />}

      <Sheet open={queueOpen} onClose={() => setQueueOpen(false)} title="File d’attente" subtitle="Les prochains à monter sur scène">
        <ScrollView style={{ maxHeight: 300 }}>
          {queue.length === 0 && <Text style={styles.queueEmpty}>Personne dans la file pour l’instant.</Text>}
          {queue.map((p, i) => (
            <View key={p.id} style={styles.queueRow}>
              <Text style={styles.queuePos}>{i + 1}</Text>
              <Image source={p.photo} style={styles.rankAv} />
              <Text style={styles.queueName}>{nameOf(p)}</Text>
              {i < 3 && <Text style={styles.queueNext}>prochain</Text>}
            </View>
          ))}
        </ScrollView>
        <Pressable
          onPress={() => {
            requestStage();
            setQueueOpen(false);
          }}
          disabled={meOnStage}
        >
          <LinearGradient colors={meOnStage ? ['#3A2E18', '#2A2010'] : goldGradient} style={styles.replay}>
            <Text style={[styles.replayText, meOnStage && { color: GOLD }]}>
              {meOnStage ? 'Tu es sur scène 🎤' : meQueued ? 'Quitter la file' : '🙋 Demander à monter'}
            </Text>
          </LinearGradient>
        </Pressable>
      </Sheet>

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

function IntroText({ epreuve, stageLabel, kind }: { epreuve: number; stageLabel: string; kind: Kind }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 450, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
  }, [epreuve, stageLabel, v]);
  return (
    <Animated.View
      style={{
        height: 46,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: v,
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
      }}
    >
      <Text style={styles.introSmall}>
        {stageLabel.toUpperCase()} · ÉPREUVE {epreuve + 1}/3
      </Text>
      <Text style={styles.introBig}>{kind === 'L' ? 'Le mot le plus long' : 'Le compte est bon'}</Text>
    </Animated.View>
  );
}

function Cover({ top, children }: { top: number; children: React.ReactNode }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,4,20,0.72)', zIndex: 30 }]}>
      <ScrollView contentContainerStyle={{ paddingTop: top, paddingHorizontal: 16, paddingBottom: 40 }}>
        <FadeIn style={styles.finalCard}>{children}</FadeIn>
      </ScrollView>
    </View>
  );
}

// Au lancement : choisir le mode de jeu
function ModePicker({ top, onTournament, onClose }: { top: number; onTournament: () => void; onClose: () => void }) {
  return (
    <Cover top={top}>
      <Text style={styles.finalTitle}>Lance ton live</Text>
      <Text style={styles.finalSub}>Quel mode de jeu veux-tu ?</Text>
      <Pressable onPress={onTournament}>
        <View style={[styles.modeRow, styles.modeRowOn]}>
          <Text style={{ fontSize: 30 }}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeTitle}>Tournoi</Text>
            <Text style={styles.modeDesc}>4 joueurs. Le dernier descend à chaque tour, jusqu’au gagnant. 5 manches.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={GOLD} />
        </View>
      </Pressable>
      <View style={[styles.modeRow, { opacity: 0.55 }]}>
        <Text style={{ fontSize: 30 }}>👥</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.modeTitle}>Groupe</Text>
          <Text style={styles.modeDesc}>Bientôt disponible.</Text>
        </View>
        <Text style={styles.soon}>Bientôt</Text>
      </View>
      <Pressable onPress={onClose} style={{ alignSelf: 'center', marginTop: 8, padding: 6 }}>
        <Text style={styles.quitText}>Annuler</Text>
      </Pressable>
    </Cover>
  );
}

function RankList({ ranking, crowns, highlight, out }: { ranking: Player[]; crowns?: Crowns; highlight?: string; out?: string }) {
  return (
    <>
      {ranking.map((p, i) => (
        <View key={p.id} style={[styles.rankRow, p.id === highlight && styles.rankWin, p.id === out && { opacity: 0.55 }]}>
          <Text style={styles.rankPos}>{i + 1}</Text>
          <Image source={p.photo} style={styles.rankAv} />
          <Text style={styles.rankName}>
            {nameOf(p)}
            {crowns?.[p.id] ? `  👑 ${crowns[p.id].n}` : ''}
          </Text>
          <Text style={styles.rankScore}>{p.score} pts</Text>
        </View>
      ))}
    </>
  );
}

function ElimCard({ o, top }: { o: Overlay; top: number }) {
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, []);
  return (
    <Cover top={top}>
      <Text style={styles.finalTitle}>⬇ {o.who.me ? 'Tu descends de la scène' : `${o.who.name} descend`}</Text>
      <Text style={styles.finalSub}>Le moins de points du tour. Les autres continuent !</Text>
      <RankList ranking={o.ranking} out={o.who.id} />
    </Cover>
  );
}

function ChampionCard({ o, manche, crowns, top }: { o: Overlay; manche: number; crowns: Crowns; top: number }) {
  const n = crowns[o.who.id]?.n ?? 1;
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);
  return (
    <Cover top={top}>
      <Text style={{ fontSize: 44, textAlign: 'center' }}>👑</Text>
      <Text style={styles.finalTitle}>{o.who.me ? `Tu gagnes la manche ${manche} !` : `${o.who.name} gagne la manche ${manche}`}</Text>
      <Text style={styles.finalSub}>
        {n} couronne{n > 1 ? 's' : ''} · reste sur scène pour la manche suivante
      </Text>
      <RankList ranking={o.ranking} crowns={crowns} highlight={o.who.id} />
      {!!o.up?.length && (
        <View style={styles.upBox}>
          <Text style={styles.upTitle}>🙋 Montent sur scène</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            {o.up.map((p) => (
              <View key={p.id} style={{ alignItems: 'center', flex: 1 }}>
                <Image source={p.photo} style={styles.upAv} />
                <Text style={styles.upName} numberOfLines={1}>
                  {nameOf(p)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Cover>
  );
}

function EndCard({ o, crowns, top, onRelaunch, onClose }: { o: Overlay; crowns: Crowns; top: number; onRelaunch: () => void; onClose: () => void }) {
  // champion du tournoi : le plus de couronnes (en cas d'égalité, le dernier gagnant)
  const best = Math.max(0, ...Object.values(crowns).map((c) => c.n));
  const champ = (crowns[o.who.id]?.n ?? 0) === best ? o.who : (Object.values(crowns).find((c) => c.n === best)?.p ?? o.who);
  const champName = nameOf(champ);
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);
  return (
    <Cover top={top}>
      <Text style={{ fontSize: 44, textAlign: 'center' }}>🏆</Text>
      <Text style={styles.finalTitle}>Fin du tournoi !</Text>
      <Text style={styles.finalSub}>
        {champ.me ? 'Tu remportes' : `${champName} remporte`} le tournoi avec {best} couronne{best > 1 ? 's' : ''} et les 500 Zems.
      </Text>
      <Text style={styles.outText}>Le dernier gagnant peut relancer le tournoi, ou l’hôte peut terminer le live.</Text>
      <Pressable onPress={onRelaunch}>
        <LinearGradient colors={goldGradient} style={styles.replay}>
          <Ionicons name="refresh" size={18} color={INK} />
          <Text style={styles.replayText}>Relancer le tournoi</Text>
        </LinearGradient>
      </Pressable>
      <Pressable onPress={onClose} style={{ alignSelf: 'center', marginTop: 12, padding: 6 }}>
        <Text style={styles.quitText}>Terminer le live</Text>
      </Pressable>
    </Cover>
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
    width: 33,
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
    width: 33,
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

  // tournoi : manche, choix des lettres, couronnes, file
  stageText: { color: GOLD, fontSize: 12, fontWeight: '900', paddingLeft: 12 },
  vcBtn: { height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  vcText: { color: INK, fontSize: 15, fontWeight: '900' },
  pickNote: { color: 'rgba(255,255,255,0.6)', fontSize: 11.5, fontWeight: '700', marginTop: 3 },
  choosingTag: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 7, height: 20, borderRadius: 10, backgroundColor: GOLD, justifyContent: 'center' },
  choosingText: { color: INK, fontSize: 10, fontWeight: '900' },
  crownPill: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#15114A',
    borderWidth: 1.5,
    borderColor: GOLD,
  },
  crownText: { color: GOLD, fontSize: 12.5, fontWeight: '900' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#FF2D55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10.5, fontWeight: '900' },
  queueEmpty: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', marginVertical: 14 },
  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  queuePos: { width: 22, textAlign: 'center', color: GOLD, fontSize: 14, fontWeight: '900' },
  queueName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '800' },
  queueNext: { color: GREEN, fontSize: 11, fontWeight: '900' },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 10,
  },
  modeRowOn: { borderColor: GOLD, backgroundColor: 'rgba(233,185,73,0.14)' },
  modeTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  modeDesc: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  soon: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '800' },
  upBox: { marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: 'rgba(61,220,151,0.1)', borderWidth: 1, borderColor: 'rgba(61,220,151,0.4)' },
  upTitle: { color: GREEN, fontSize: 13.5, fontWeight: '900' },
  upAv: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: GREEN },
  upName: { color: '#fff', fontSize: 12.5, fontWeight: '800', marginTop: 4 },

  // chiffres : plaques utilisées, résultats en vert, ligne de calcul
  plaqueUsed: { opacity: 0.3, borderStyle: 'dashed' },
  plaqueTextUsed: { textDecorationLine: 'line-through' },
  results: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  resultsLabel: { color: GREEN, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.5, marginRight: 2 },
  resultChip: {
    minWidth: 56,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GREEN,
    borderWidth: 1.5,
    borderColor: '#B6F5DA',
    shadowColor: GREEN,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  resultText: { color: '#06291B', fontSize: 18, fontWeight: '900' },
  calcLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  calcExpr: { flexShrink: 1, color: '#fff', fontSize: 19, fontWeight: '900', fontVariant: ['tabular-nums'] },
  calcEq: { color: GREEN },
  calcQ: { color: 'rgba(255,255,255,0.4)' },
  calcHint: { color: 'rgba(255,255,255,0.65)', fontSize: 12.5 },
  calcHintInline: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '700' },
  calcGap: { color: GOLD, fontSize: 12, fontWeight: '900' },
});
