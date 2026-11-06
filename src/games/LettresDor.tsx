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
import { auth } from '../lib/firebase';
import { CameraFeed, CameraPreview, mediaAvailable, useLiveMedia } from '../live/media';
import { useHostOnAir } from '../live/onair';
import { PlayerSheet } from './PlayerSheet';
import { BOTS, LEVEL_INFO } from './bots';
import { LEVEL_LABEL, type Level } from './motdorEngine';
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
// MODE GROUPE (championnat)
// - L'hôte choisit 12, 16 ou 20 joueurs ; les spectateurs s'inscrivent.
// - Ronde 1 : tables de 4 au hasard. Chaque table joue Lettres, Lettres, Chiffres.
// - Points au classement général : 1er 4 pts, 2e 3, 3e 2, 4e 1.
// - Rondes suivantes : tables refaites d'après le classement (système suisse).
// - Après la dernière ronde, les 4 premiers jouent la grande finale.
//
// Ici : toi + des joueurs simulés.

const GOLD = '#F3D27A';
const GOLD2 = '#E9B949';
const INK = '#1D1405';
const NAVY = 'rgba(14,16,52,0.88)';
const PURPLE = '#8B5CF6';
const BLUE = '#5B7CFF';
const GREEN = '#3DDC97';
// chrono selon le niveau : plus long en Facile, plus court en Expert
const DURS: Record<Level, { L: number; C: number }> = { facile: { L: 45, C: 60 }, difficile: { L: 30, C: 40 }, expert: { L: 20, C: 30 } };
// entraînement : 6 épreuves contre l'ordinateur, sans élimination
const TRAIN_STAGE = { n: 4, label: 'Entraînement', rounds: ['L', 'L', 'C', 'L', 'L', 'C'] as Kind[] };
const TICK = 250;
const MANCHES = 5;
const CHOOSE_TIME = 6;

type Kind = 'L' | 'C';
const STAGES: { n: number; label: string; rounds: Kind[] }[] = [
  { n: 4, label: 'Tour à 4', rounds: ['L', 'L', 'C'] },
  { n: 3, label: 'Tour à 3', rounds: ['L', 'L', 'C'] },
  { n: 2, label: 'Finale', rounds: ['C', 'C', 'L'] },
];

// championnat : une table joue 3 épreuves, la grande finale en joue 4
const TABLE_STAGE = { n: 4, label: 'Table', rounds: ['L', 'L', 'C'] as Kind[] };
const FINAL_STAGE = { n: 4, label: 'Grande finale', rounds: ['L', 'C', 'L', 'C'] as Kind[] };
const GROUP_SIZES = [12, 16, 20];
const RONDES: Record<number, number> = { 12: 5, 16: 4, 20: 3 }; // environ 15 parties, soit à peu près 1 h
const TABLE_POINTS = [4, 3, 2, 1];
const PARTIE_MIN = 3; // durée moyenne d'une table, en minutes
const CALL_TIME = 60; // appel « Prépare-toi » pendant la dernière épreuve de la table d'avant
const CALL_TIME_LATE = 25; // appel au dernier moment (table connue seulement à la fin de la ronde)

type Player = { id: string; name: string; photo: number | string; me?: boolean; level: BotLevel; score: number; last: number };
type Answer = { at: number; word?: string; value?: number; steps?: string[] };
type RoundData =
  | { kind: 'L'; letters: string[]; sol: ReturnType<typeof solveLetters> }
  | { kind: 'C'; plaques: number[]; target: number; best: number; bestSteps: string[]; reach: Map<number, string[]> };
type Result = { id: string; answer: Answer | null; valid: boolean; points: number; dist?: number; note: string };
type Phase =
  | 'mode'
  | 'intro'
  | 'choose'
  | 'draw'
  | 'play'
  | 'reveal'
  | 'elim'
  | 'champion'
  | 'end'
  | 'size'
  | 'signup'
  | 'tableEnd'
  | 'leagueEnd'
  | 'camcheck'
  | 'level'
  | 'trainEnd';
type Format = 'tournoi' | 'groupe' | 'training';
type Standing = { p: Player; pts: number; game: number; wins: number };
type TableEnd = {
  ranking: Player[];
  label: string;
  next: Player[];
  nextLabel: string;
  note: string;
  step: 'table' | 'ronde' | 'final';
  tables?: Player[][];
  absent?: string[];
};
const IDLE: Phase[] = ['intro', 'mode', 'elim', 'champion', 'end', 'size', 'signup', 'tableEnd', 'leagueEnd', 'camcheck', 'level', 'trainEnd'];
type Overlay = { who: Player; ranking: Player[]; up?: Player[] };
type Crowns = Record<string, { n: number; p: Player }>;

const LEVELS: BotLevel[] = [
  { exact: 0.5, slack: [0, 1, 1, 2] },
  { exact: 0.35, slack: [0, 1, 2, 2, 3] },
  { exact: 0.6, slack: [0, 0, 1, 2] },
  { exact: 0.4, slack: [0, 1, 2] },
];
// spectateurs qui demandent à monter (simulés)
const VIEWERS = [
  'Fatou',
  'Yann',
  'Nadia',
  'Karim',
  'Sophie',
  'Djamal',
  'Lina',
  'Alex',
  'Emma',
  'Momo',
  'Sarah',
  'Kevin',
  'Bintou',
  'Idriss',
  'Leïla',
  'Malik',
  'Noura',
  'Jordan',
  'Mariam',
  'Samir',
];

const fresh = (p: Player): Player => ({ ...p, score: 0, last: 0 });
/** Entraînement : 3 adversaires tirés parmi les 4 du niveau */
const pickBots = (level: Level): Player[] =>
  [...BOTS[level]]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((b) => ({ id: b.id, name: b.name, photo: b.photo, level: b.letters, score: 0, last: 0 }));
const aboutOf = (id: string) =>
  Object.values(BOTS)
    .flat()
    .find((b) => b.id === id)?.about;
const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const chunk4 = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / 4) }, (_, i) => a.slice(i * 4, i * 4 + 4));
// classement général : points, puis points de jeu, puis victoires
const sortStandings = (st: Record<string, Standing>) => Object.values(st).sort((a, b) => b.pts - a.pts || b.game - a.game || b.wins - a.wins);
const nameOf = (p: Player) => (p.me ? 'Toi' : p.name);
const pts = (n: number) => `${n} pt${n > 1 ? 's' : ''}`;
const worldPlayer = (id: string, level: BotLevel): Player => {
  const p = findPerson(id);
  return { id, name: p?.name ?? id, photo: p?.photo ?? '', level, score: 0, last: 0 };
};
// quand l'hôte présente sans jouer, cette joueuse prend sa place sur scène
const HOST_SEAT: Player = { id: 'v-sarah', name: 'Sarah', photo: faceOf('Sarah', 300), level: LEVELS[3], score: 0, last: 0 };
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
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const chatY = useRef(600);
  const [chatH, setChatH] = useState(160);
  const [answersTop, setAnswersTop] = useState(480); // l'appel « Prépare-toi » se pose sur les réponses, pas sur le chat // hauteur du chat : autant de messages que la place le permet

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
  const [lastPick, setLastPick] = useState<{ who: string; whoId: string; type: 'V' | 'C'; forced: boolean } | null>(null);
  const [chooseLeft, setChooseLeft] = useState(CHOOSE_TIME);
  // saisie lettres
  const [picked, setPicked] = useState<number[]>([]);
  // saisie chiffres
  const [items, setItems] = useState<{ v: number; used: boolean; made?: boolean }[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [steps, setSteps] = useState<{ a: number; b: number; text: string }[]>([]);

  // ── le championnat (mode groupe) ──
  const [format, setFormat] = useState<Format>('tournoi');
  const [lgSize, setLgSize] = useState(16);
  const [signups, setSignups] = useState<Player[]>([]);
  const [standings, setStandings] = useState<Record<string, Standing>>({});
  const [ronde, setRonde] = useState(1);
  const [tables, setTables] = useState<Player[][]>([]);
  const [tableIdx, setTableIdx] = useState(0);
  const [isFinal, setIsFinal] = useState(false);
  const [tableEnd, setTableEnd] = useState<TableEnd | null>(null);
  const [champ, setChamp] = useState<{ who: Player; ranking: Player[] } | null>(null);
  // appel avant de monter : ta réponse (prêt / absent), la fenêtre et son compte à rebours
  const [ready, setReady] = useState<boolean | null>(null);
  const [callUp, setCallUp] = useState(false);
  const [callLeft, setCallLeft] = useState(0);
  const [absentIds, setAbsentIds] = useState<string[]>([]);
  const tableEndAt = useRef(0);
  const group = format === 'groupe';
  const training = format === 'training';
  const [level, setLevel] = useState<Level>('difficile');
  const [trainBots, setTrainBots] = useState<Player[]>(() => pickBots('difficile'));
  const [hostPlays, setHostPlays] = useState(true); // l'hôte prend une des 4 places, ou présente sans jouer
  const [focus, setFocus] = useState<Player | null>(null);
  const rondes = RONDES[lgSize] ?? 4;
  const general = sortStandings(standings);
  const rankOf = (id: string) => general.findIndex((x) => x.p.id === id) + 1;

  const STAGE = training ? TRAIN_STAGE : group ? (isFinal ? FINAL_STAGE : TABLE_STAGE) : STAGES[stageIdx];
  const kind = STAGE.rounds[epreuve];
  const duration = DURS[level][kind];
  const left = duration - elapsed;
  const meOnStage = stage.some((p) => p.me);
  const meQueued = queue.some((p) => p.me);
  const chooser = stage[(epreuve + stageIdx + letters.length) % stage.length];
  const nextChooser = letters.length + 1 < LETTER_COUNT ? stage[(epreuve + stageIdx + letters.length + 1) % stage.length] : null;

  // ── caméras et micros (LiveKit) : ta caméra est diffusée quand tu es sur scène,
  // les micros se coupent pendant le chrono pour ne pas gâcher les réponses cachées ──
  // tu vérifies ta caméra avant le direct ; ensuite tu peux couper ton micro et retourner la caméra
  const [camReady, setCamReady] = useState(false);
  const [myMic, setMyMic] = useState(true);
  const liveRoom = mediaAvailable && !training && !['mode', 'level'].includes(phase) && auth.currentUser ? `lettres-${auth.currentUser.uid}` : null;
  const media = useLiveMedia(liveRoom, {
    publish: camReady && meOnStage && !['mode', 'size', 'signup', 'camcheck'].includes(phase),
    mic: myMic && phase !== 'play',
    name: profile?.pseudo,
  });

  // le live apparaît sur l'accueil ; les messages des spectateurs arrivent dans le chat
  const onAir = useHostOnAir('lettres', {
    active: !!liveRoom,
    title: 'Lettres d’Or',
    pseudo: profile?.pseudo,
    name: [profile?.prenom, profile?.nom].filter(Boolean).join(' '),
    onMessage: (m) => chat.push(m.pseudo, m.text),
  });
  const micsOff = phase === 'play';
  useEffect(() => {
    if (media.status === 'error') toast.show('Caméra indisponible pour le moment. Le jeu continue.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.status]);

  // ── championnat : ta place, la prochaine table ──
  const nextTable = group && !isFinal && tableIdx + 1 < tables.length ? tables[tableIdx + 1] : null;
  const nextNote =
    !group || isFinal || phase === 'size' || phase === 'signup' || phase === 'leagueEnd'
      ? null
      : nextTable
        ? 'Ensuite'
        : ronde < rondes
          ? `Ronde ${ronde + 1} ensuite`
          : 'Finale ensuite';
  const myTable = group ? tables.findIndex((t) => t.some((p) => p.me)) : -1;
  const myStatus = (() => {
    if (!group || meOnStage || !general.length || phase === 'size' || phase === 'signup' || phase === 'leagueEnd') return null;
    const r = rankOf('me');
    // ta place n'a de sens qu'une fois les premiers points distribués
    const place = general.some((x) => x.pts > 0) ? ` · ${r === 1 ? '1er' : `${r}e`} (${pts(standings.me?.pts ?? 0)})` : '';
    if (isFinal) return `Tu finis${place.replace(' ·', '')} · place à la finale`;
    if (ready === true) return '✅ Prêt · tu montes juste après';
    if (ready === false) return '❌ Tu passes ta table · 0 point';
    if (myTable === tableIdx && absentIds.includes('me')) return '❌ Absent à ta table · 0 point';
    if (myTable > tableIdx) {
      if (myTable === tableIdx + 1) return `🎮 Tu joues juste après${place}`;
      const left = myTable - tableIdx - (phase === 'tableEnd' ? 1 : epreuve / STAGE.rounds.length);
      return `🎮 Table ${myTable + 1} · dans ~${Math.max(1, Math.round(left * PARTIE_MIN))} min${place}`;
    }
    return `✔︎ Ta table a joué${place}`;
  })();
  const chatRows = Math.max(2, Math.floor((chatH - 8) / 28));

  // ── des spectateurs demandent à monter de temps en temps ──
  useEffect(() => {
    if (phase === 'mode' || phase === 'level' || group || training) return;
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
  }, [phase === 'mode', group]);

  // ── championnat : les spectateurs s'inscrivent jusqu'à ce que le groupe soit complet ──
  useEffect(() => {
    if (phase !== 'signup' || signups.length >= lgSize) return;
    const t = setTimeout(
      () => {
        const taken = new Set(signups.map((p) => p.name));
        let v = newViewer();
        for (let k = 0; k < 40 && taken.has(v.name); k++) v = newViewer();
        chat.push(v.name, '✍️ s’inscrit au championnat');
        setSignups((cur) => [...cur, v]);
      },
      rand(250, 600),
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, signups, lgSize]);

  const pickSize = (n: number) => {
    tap();
    setLgSize(n);
    setSignups([...(hostPlays ? [ME] : [newViewer()]), worldPlayer('moussa', LEVELS[0]), worldPlayer('awa', LEVELS[1]), worldPlayer('kenji', LEVELS[2])]);
    setPhase('signup');
  };

  // ronde 1 : tables de 4 au hasard
  const startLeague = () => {
    tap();
    const st: Record<string, Standing> = {};
    for (const p of signups) st[p.id] = { p: fresh(p), pts: 0, game: 0, wins: 0 };
    const tb = chunk4(shuffle(signups));
    setStandings(st);
    setTables(tb);
    setTableIdx(0);
    setRonde(1);
    setIsFinal(false);
    setChamp(null);
    setReady(null);
    setCallUp(false);
    setAbsentIds([]);
    setStage(tb[0].map(fresh));
    setStageIdx(0);
    setEpreuve(0);
    setPhase('intro');
  };

  // fin d'une table : points au classement, puis table suivante, ronde suivante ou grande finale
  const endTable = (present: Player[]) => {
    // les absents finissent derniers, avec 0 point
    const away = absentIds
      .map((id) => standings[id]?.p)
      .filter((p): p is Player => !!p)
      .map(fresh);
    if (isFinal) {
      // égalité en finale : le mieux classé des rondes passe devant
      const fin = [...present].sort((x, y) => y.score - x.score || y.last - x.last || rankOf(x.id) - rankOf(y.id));
      setChamp({ who: fin[0], ranking: [...fin, ...away] });
      setPhase('leagueEnd');
      return;
    }
    const ranking = [...present, ...away];
    const absent = absentIds;
    const st = { ...standings };
    present.forEach((p, i) => {
      const cur = st[p.id];
      if (cur) st[p.id] = { ...cur, pts: cur.pts + TABLE_POINTS[i], game: cur.game + p.score, wins: cur.wins + (i === 0 ? 1 : 0) };
    });
    setStandings(st);
    const label = `Ronde ${ronde}/${rondes} · Table ${tableIdx + 1}/${tables.length}`;
    if (tableIdx + 1 < tables.length) {
      setTableEnd({ ranking, absent, label, next: tables[tableIdx + 1], nextLabel: `Table ${tableIdx + 2} monte sur scène`, note: '', step: 'table' });
    } else if (ronde < rondes) {
      // système suisse : les premiers ensemble, les derniers ensemble ; on commence par le bas du classement
      const tb = chunk4(sortStandings(st).map((x) => x.p)).reverse();
      setTableEnd({
        ranking,
        absent,
        label,
        next: tb[0],
        nextLabel: `Ronde ${ronde + 1} · Table 1 monte sur scène`,
        note: `Fin de la ronde ${ronde} ! Les tables sont refaites d’après le classement : les premiers jouent ensemble, les derniers aussi.`,
        step: 'ronde',
        tables: tb,
      });
    } else {
      setTableEnd({
        ranking,
        absent,
        label,
        next: sortStandings(st)
          .slice(0, 4)
          .map((x) => x.p),
        nextLabel: 'Grande finale : les 4 premiers',
        note: 'Fin des rondes ! Les 4 premiers du classement jouent la grande finale.',
        step: 'final',
      });
    }
    tableEndAt.current = Date.now();
    setPhase('tableEnd');
  };

  useEffect(() => {
    if (phase !== 'tableEnd' || !tableEnd) return;
    const meNext = tableEnd.next.some((p) => p.me);
    const mustConfirm = meNext && !stage.some((p) => p.me);
    if (mustConfirm && ready === null) return; // on attend ta réponse à l'appel « Prépare-toi »
    const wait = Math.max(mustConfirm ? 1200 : 0, 9000 - (Date.now() - tableEndAt.current));
    const t = setTimeout(() => {
      const away = mustConfirm && ready !== true;
      if (tableEnd.step === 'table') setTableIdx((i) => i + 1);
      if (tableEnd.step === 'ronde') {
        setTables(tableEnd.tables ?? []);
        setTableIdx(0);
        setRonde((r) => r + 1);
      }
      if (tableEnd.step === 'final') setIsFinal(true);
      setAbsentIds(away ? ['me'] : []);
      setStage((away ? tableEnd.next.filter((p) => !p.me) : tableEnd.next).map(fresh));
      if (meNext && !away) toast.show('À toi ! Ta table monte sur scène 🎤');
      setReady(null);
      setCallUp(false);
      setEpreuve(0);
      setTableEnd(null);
      setPhase('intro');
    }, wait);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tableEnd, ready]);

  // ── appel « Prépare-toi » : pendant la dernière épreuve de la table d'avant, ou à la fin de la ronde ──
  useEffect(() => {
    if (!group || callUp || ready !== null || meOnStage) return;
    const lastEpreuve = epreuve === STAGE.rounds.length - 1 && ['intro', 'choose', 'draw', 'play'].includes(phase);
    let left = 0;
    if (lastEpreuve && nextTable?.some((p) => p.me)) left = CALL_TIME;
    else if (phase === 'tableEnd' && tableEnd?.next.some((p) => p.me)) left = CALL_TIME_LATE;
    if (!left) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setCallLeft(left);
    setCallUp(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, phase, epreuve, tableEnd, callUp, ready, meOnStage]);

  // compte à rebours : sans réponse, tu es absent pour cette table
  useEffect(() => {
    if (!callUp) return;
    if (callLeft <= 0) {
      setReady(false);
      setCallUp(false);
      toast.show('Pas de réponse : tu es absent pour cette table (0 point)');
      return;
    }
    const t = setTimeout(() => setCallLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callUp, callLeft]);

  const confirmReady = () => {
    setReady(true);
    setCallUp(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast.show('Parfait ! Tu montes juste après 🎤');
  };
  const skipTable = () => {
    tap();
    setReady(false);
    setCallUp(false);
    toast.show('Tu passes cette table : 0 point. Tu restes dans le championnat.');
  };

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
          answers[b.id] = Math.random() < 0.05 ? null : { at: rand(0.35, 0.92) * duration, value: c.value, steps: c.steps };
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
    setLastPick({ who: nameOf(chooser), whoId: chooser.id, type, forced: type !== want });
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
          answers[b.id] = !w || Math.random() < 0.05 ? null : { at: rand(0.27, 0.9) * duration, word: w };
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
    // c'est ton tour : vibration pour te prévenir
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
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
    if (training) {
      setOverlay({ who: ranking[0], ranking });
      setPhase('trainEnd');
      return;
    }
    if (group) return endTable(ranking);
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
    onAir.send(t);
    setDraft('');
  };
  // toucher le nom de quelqu'un dans le chat pour lui répondre
  const replyTo = (user: string) => {
    tap();
    setDraft(`@${user} `);
    inputRef.current?.focus();
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
  const ringValue = phase === 'play' ? left : phase === 'reveal' ? Math.max(0, duration - elapsed) : myChoice ? Math.max(0, chooseLeft) : duration;
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
            {training ? (
              <View style={styles.trainBadge}>
                <Text style={styles.trainText}>ENTRAÎNEMENT · {LEVEL_LABEL[level].toUpperCase()}</Text>
              </View>
            ) : (
              <>
                <View style={styles.liveBadge}>
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
                <View style={styles.viewers}>
                  <Ionicons name="eye-outline" size={12} color="#fff" />
                  <Text style={styles.viewersText}>1 248</Text>
                </View>
              </>
            )}
          </View>
        </View>
        {!training && (
          <View style={styles.prize}>
            <Text style={{ fontSize: 15 }}>🏆</Text>
            <Text style={styles.prizeText}>500 Zems</Text>
          </View>
        )}
        <Pressable onPress={() => toast.show('Lien du live copié')} hitSlop={8} style={[styles.roundBtn, { marginLeft: 8 }]}>
          <Ionicons name="share-social-outline" size={17} color="#fff" />
        </Pressable>
      </View>

      {/* ── le plateau : lettres ou chiffres (manche à gauche, tour à droite) ── */}
      <View style={styles.boardWrap}>
        <View style={styles.board}>
          <View style={styles.boardLabelWrap} pointerEvents="none">
            <View style={styles.sideLeft}>
              <View style={styles.sidePill}>
                <Text style={styles.sideText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {training
                    ? `Épreuve ${epreuve + 1}/${TRAIN_STAGE.rounds.length}`
                    : group
                      ? isFinal
                        ? 'Grande finale'
                        : `Ronde ${ronde}/${rondes}`
                      : `Manche ${manche}/${MANCHES}`}
                </Text>
              </View>
            </View>
            <View style={styles.boardLabel}>
              <LinearGradient colors={goldGradient} style={styles.boardLabelIcon}>
                <Text style={styles.boardLabelIconText}>{kind === 'L' ? 'Aa' : '12'}</Text>
              </LinearGradient>
              <Text style={styles.boardLabelText}>{kind === 'L' ? 'LES LETTRES' : 'LES CHIFFRES'}</Text>
            </View>
            <View style={styles.sideRight}>
              <View style={styles.sidePill}>
                <Text style={[styles.sideText, { color: GOLD, flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {training ? '🎯' : group ? (isFinal ? 'Top 4' : `Table ${tableIdx + 1}/${tables.length || 1}`) : STAGE.label}
                </Text>
                <View style={styles.dots}>
                  {STAGE.rounds.map((k, i) => (
                    <View key={i} style={[styles.dot, i <= epreuve && { backgroundColor: k === 'L' ? GOLD2 : GREEN }]} />
                  ))}
                </View>
              </View>
            </View>
          </View>

          <View style={{ marginTop: 8 }}>
            {IDLE.includes(phase) && (
              <IntroText
                epreuve={epreuve}
                total={STAGE.rounds.length}
                stageLabel={group ? (isFinal ? 'Grande finale' : `Ronde ${ronde} · Table ${tableIdx + 1}`) : STAGE.label}
                kind={kind}
              />
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
                        colors={
                          dim || reveal
                            ? ['#4A3A1C', '#2B2210']
                            : isVowel(l) && phase === 'choose'
                              ? ['#FFF6D0', '#F6D36A', '#C99A2E']
                              : ['#FFF0B0', '#F3C14B', '#B98318']
                        }
                        style={[styles.tile, { width: tile, height: 46 }]}
                      >
                        <Text style={[styles.tileText, { fontSize: Math.min(24, tile * 0.68) }, (dim || reveal) && used && { color: 'rgba(243,210,122,0.5)' }]}>
                          {l}
                        </Text>
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
                  {phase === 'play' && meOnStage && myValue !== null && !mine && (
                    <Text style={[styles.calcGap, myValue === data.target && { color: GREEN }]}>
                      {myValue === data.target ? '🎯 Compte bon' : `écart ${Math.abs(myValue - data.target)}`}
                    </Text>
                  )}
                </View>
                <View style={styles.plaques}>
                  {data.plaques.map((v, i) => {
                    const visible = i < shown || phase !== 'draw';
                    const x = phase === 'play' && meOnStage ? items[i] : { v, used: false };
                    return (
                      <Pressable key={i} onPress={() => pressPlaque(i)} disabled={!visible || !canPlay || x.used}>
                        <View
                          style={[
                            styles.plaque,
                            { width: plaqueW },
                            x.used && styles.plaqueUsed,
                            sel === i && canPlay && styles.plaqueSel,
                            !visible && styles.tileEmpty,
                          ]}
                        >
                          <Text style={[styles.plaqueText, x.used && styles.plaqueTextUsed]}>{visible ? x.v : ''}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                {/* la ligne de calcul (comme une calculatrice) + tes résultats en vert, sur la même ligne */}
                {phase === 'play' && meOnStage && (
                  <View style={styles.calcLine}>
                    <View style={{ flex: 1 }}>
                      {mine ? (
                        <Text style={styles.calcHint}>🔒 Compte envoyé, caché</Text>
                      ) : sel !== null && op !== null ? (
                        <Text style={styles.calcExpr}>
                          {items[sel].v} {op} <Text style={styles.calcQ}>?</Text>
                        </Text>
                      ) : lastResult ? (
                        <Text style={styles.calcExpr} numberOfLines={1} adjustsFontSizeToFit>
                          {steps[steps.length - 1].text.split(' = ')[0]} <Text style={styles.calcEq}>= {items[sel!].v}</Text>
                        </Text>
                      ) : sel !== null ? (
                        <Text style={styles.calcExpr}>
                          {items[sel].v} <Text style={styles.calcHintInline}>→ + − × ÷</Text>
                        </Text>
                      ) : (
                        <Text style={styles.calcHint}>Touche une plaque pour commencer</Text>
                      )}
                    </View>
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
              </View>
            )}
          </View>

          {/* ligne du bas du plateau : chrono + ma saisie, ou le résultat */}
          <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TimerRing size={ringSize} value={ringValue} total={ringTotal} paused={phase === 'reveal'} />
            <View style={{ flex: 1 }}>
              {IDLE.includes(phase) && (
                <Text style={styles.hint}>
                  {kind === 'L'
                    ? `Chacun choisit voyelle ou consonne à son tour. ${DURS[level].L} s · 1 point par lettre.`
                    : `6 plaques · ${DURS[level].C} s · 10 pts si exact, 7 au plus proche.`}
                </Text>
              )}

              {phase === 'choose' &&
                (letters.length >= LETTER_COUNT ? (
                  <Text style={styles.hint}>Tirage complet ! C’est parti…</Text>
                ) : myChoice ? (
                  <View>
                    <Text style={styles.myTurn}>À toi ! Voyelle ou consonne ?</Text>
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
                  </View>
                ) : (
                  <View>
                    <Text style={styles.hint}>
                      <Text style={{ color: GOLD, fontWeight: '900' }}>{nameOf(chooser)}</Text> choisit…
                      {nextChooser ? <Text style={styles.nextUp}>{`  ·  ensuite : ${nameOf(nextChooser)}`}</Text> : null}
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

              {phase === 'play' && !meOnStage && !group && <Text style={styles.hint}>Tu regardes. Touche 🙋 en bas pour demander à monter sur scène.</Text>}
              {phase === 'play' && !meOnStage && group && <LeagueInfo status={myStatus} next={nextTable} note={nextNote} onPress={() => setQueueOpen(true)} />}

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
                      <Text style={styles.revealMsg}>
                        {stoppedEarly ? 'Tout le monde a répondu : chrono arrêté ! Révélation…' : 'Temps écoulé ! Révélation…'}
                      </Text>
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
          const crown = group ? 0 : (crowns[p.id]?.n ?? 0);
          const rank = group && general.some((x) => x.pts > 0) ? rankOf(p.id) : 0;
          return (
            <Pressable
              key={p.id}
              style={{ width: camW }}
              onPress={() => {
                tap();
                setFocus(p);
              }}
            >
              <View style={[styles.cam, { height: card4 * 1.6 }, p.me && styles.camMe, (flash || choosing) && styles.camFlash]}>
                <Image source={p.photo} style={StyleSheet.absoluteFill} contentFit="cover" />
                {p.me && <CameraFeed trackRef={media.cameraOf('me')} mirror={media.facing === 'user'} style={StyleSheet.absoluteFill} />}
                {p.me && media.status === 'on' && (
                  <View style={styles.camTools}>
                    <Pressable
                      onPress={() => {
                        tap();
                        setMyMic((m) => !m);
                      }}
                      hitSlop={6}
                      style={[styles.camTool, !myMic && styles.camToolOff]}
                    >
                      <Ionicons name={myMic ? 'mic' : 'mic-off'} size={13} color="#fff" />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        tap();
                        void media.flipCamera();
                      }}
                      hitSlop={6}
                      style={styles.camTool}
                    >
                      <Ionicons name="camera-reverse" size={14} color="#fff" />
                    </Pressable>
                  </View>
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(8,6,30,0.85)', 'rgba(8,6,30,0.97)']}
                  locations={[0.45, 0.75, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.camDot} />
                {(micsOff || (p.me && !myMic)) && (
                  <View style={styles.micOff} pointerEvents="none">
                    <Ionicons name="mic-off" size={12} color="#fff" />
                  </View>
                )}
                {phase === 'choose' && lastPick?.whoId === p.id && (
                  <FadeIn key={letters.length} style={[styles.pickBubble, lastPick.type === 'V' ? styles.pickV : styles.pickC]} pointerEvents="none">
                    <Text style={[styles.pickBubbleText, lastPick.type === 'C' && { color: '#fff' }]}>
                      {lastPick.type === 'V' ? 'Voyelle !' : 'Consonne !'}
                    </Text>
                  </FadeIn>
                )}
                {choosing && (
                  <View style={styles.choosingTag}>
                    <Text style={styles.choosingText}>{p.me ? 'À toi !' : 'À son tour'}</Text>
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
              {(crown > 0 || rank > 0) && (
                <View style={styles.crownPill} pointerEvents="none">
                  <Text style={styles.crownText}>{rank > 0 ? `#${rank} · ${pts(standings[p.id]?.pts ?? 0)}` : `👑 ${crown}`}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* ── réponses cachées ── */}
      <View style={styles.answersWrap} onLayout={(e) => setAnswersTop(e.nativeEvent.layout.y)}>
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
          setChatH(e.nativeEvent.layout.height);
        }}
      >
        <View style={styles.chat}>
          {(training ? [] : chat.msgs.slice(-chatRows)).map((m) => {
            const mention = m.text.match(/^@\S+/)?.[0];
            return (
              <View key={m.id} style={styles.msg}>
                <Pressable onPress={() => !m.me && replyTo(m.user)} disabled={m.me} hitSlop={4} style={styles.msgWho}>
                  <Image source={faceOf(m.user, 60)} style={[styles.msgAv, m.me && { borderColor: GOLD, borderWidth: 1.5 }]} />
                  <Text style={[styles.msgName, m.me && { color: GOLD }]} numberOfLines={1}>
                    {m.user}
                  </Text>
                </Pressable>
                <Text style={styles.msgText} numberOfLines={1}>
                  {mention ? <Text style={styles.msgMention}>{mention}</Text> : null}
                  {mention ? m.text.slice(mention.length) : m.text}
                </Text>
              </View>
            );
          })}
        </View>
        {!training && (
          <Pressable onPress={hearts} style={styles.likeBubble}>
            <Ionicons name="thumbs-up" size={18} color="#fff" />
          </Pressable>
        )}
      </View>

      {/* ── barre du bas ── */}
      {training ? (
        <View style={[styles.trainBar, { paddingBottom: Math.max(insets.bottom - 6, 10) }]}>
          <Text style={styles.trainBarText}>🎯 Entraînement contre l’ordinateur · niveau {LEVEL_LABEL[level]}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined}>
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom - 6, 10) }]}>
            <View style={styles.comment}>
              <Ionicons name="chatbubble-outline" size={18} color="rgba(255,255,255,0.85)" />
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                placeholder="Écrire un commentaire…"
                placeholderTextColor="rgba(255,255,255,0.6)"
                style={styles.commentInput}
                onSubmitEditing={sendComment}
                returnKeyType="send"
                selectionColor={GOLD}
              />
              {draft.trim() ? (
                <Pressable onPress={sendComment} hitSlop={6} style={styles.sendBtn}>
                  <Ionicons name="send" size={15} color={INK} />
                </Pressable>
              ) : (
                <Pressable onPress={() => setDraft((d) => d + '😊')} hitSlop={6}>
                  <Ionicons name="happy-outline" size={21} color="rgba(255,255,255,0.85)" />
                </Pressable>
              )}
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
                <Text style={{ fontSize: 20 }}>{group ? '📊' : '🙋'}</Text>
              </RoundGold>
              {!group && queue.length > 0 && (
                <View style={styles.badge} pointerEvents="none">
                  <Text style={styles.badgeText}>{queue.length}</Text>
                </View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {floaters.layer}

      {/* ── écrans par-dessus : mode, élimination, fin de manche, fin du tournoi ── */}
      {(phase === 'mode' || phase === 'level') && (
        <StartForm
          top={T + 56}
          format={format}
          setFormat={(f) => {
            tap();
            setFormat(f);
          }}
          level={level}
          setLevel={(l) => {
            tap();
            setLevel(l);
            setTrainBots(pickBots(l));
          }}
          hostPlays={hostPlays}
          setHostPlays={setHostPlays}
          players={
            format === 'training'
              ? [ME, ...trainBots]
              : hostPlays
                ? [ME, worldPlayer('moussa', LEVELS[0]), worldPlayer('awa', LEVELS[1]), worldPlayer('kenji', LEVELS[2])]
                : [
                    worldPlayer('moussa', LEVELS[0]),
                    worldPlayer('awa', LEVELS[1]),
                    worldPlayer('kenji', LEVELS[2]),
                    HOST_SEAT,
                  ]
          }
          onStart={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setStageIdx(0);
            setEpreuve(0);
            if (format === 'training') {
              setStage([fresh(ME), ...trainBots.map(fresh)]);
              setPhase('intro');
              return;
            }
            setCamReady(hostPlays);
            if (format === 'groupe') return setPhase('size');
            setStage(
              hostPlays
                ? [fresh(ME), worldPlayer('moussa', LEVELS[0]), worldPlayer('awa', LEVELS[1]), worldPlayer('kenji', LEVELS[2])]
                : [worldPlayer('moussa', LEVELS[0]), worldPlayer('awa', LEVELS[1]), worldPlayer('kenji', LEVELS[2]), fresh(HOST_SEAT)],
            );
            setPhase('intro');
          }}
          onClose={onClose}
        />
      )}
      {phase === 'trainEnd' && overlay && (
        <TrainEndCard
          o={overlay}
          level={level}
          top={T + 90}
          onReplay={() => {
            const b = pickBots(level);
            setTrainBots(b);
            setStage([fresh(ME), ...b.map(fresh)]);
            setEpreuve(0);
            setOverlay(null);
            setPhase('intro');
          }}
          onLevel={() => {
            setOverlay(null);
            setPhase('mode');
          }}
          onClose={onClose}
        />
      )}
      {phase === 'size' && <SizePicker top={T + 100} onPick={pickSize} onBack={() => setPhase('mode')} />}
      {phase === 'signup' && <SignupCard top={T + 90} size={lgSize} players={signups} onStart={startLeague} onBack={() => setPhase('size')} />}
      {phase === 'tableEnd' && tableEnd && <TableEndCard t={tableEnd} general={general} top={T + 80} />}
      {phase === 'leagueEnd' && champ && <LeagueEndCard c={champ} general={general} top={T + 80} onRelaunch={() => setPhase('size')} onClose={onClose} />}
      {callUp && (
        <FadeIn style={[styles.callCard, { top: answersTop - 8 }]}>
          <View style={styles.callCam}>
            <Image source={DEENA_PHOTO} style={StyleSheet.absoluteFill} contentFit="cover" />
            <CameraPreview active={callUp} style={StyleSheet.absoluteFill} />
            <View style={styles.camDot} />
            <Text style={styles.callCamText}>📷</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.callTitle} numberOfLines={1}>
              Prépare-toi ! 🎤
            </Text>
            <Text style={styles.callSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {phase === 'tableEnd' ? 'Ta table monte maintenant !' : 'Ta table monte après cette épreuve.'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 }}>
              <Pressable onPress={confirmReady} style={{ flex: 1 }}>
                <LinearGradient colors={goldGradient} style={styles.callBtn}>
                  <Text style={styles.callBtnText}>Je suis prêt ✅ · {callLeft}s</Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={skipTable} hitSlop={8}>
                <Text style={styles.callSkip}>Passer</Text>
              </Pressable>
            </View>
          </View>
        </FadeIn>
      )}
      {phase === 'elim' && overlay && <ElimCard o={overlay} top={T + 150} />}
      {phase === 'champion' && overlay && <ChampionCard o={overlay} manche={manche} crowns={crowns} top={T + 130} />}
      {phase === 'end' && overlay && <EndCard o={overlay} crowns={crowns} top={T + 110} onRelaunch={relaunch} onClose={onClose} />}

      <Sheet
        open={queueOpen && group}
        onClose={() => setQueueOpen(false)}
        title="Classement général"
        subtitle={isFinal ? 'Grande finale en cours' : `Ronde ${ronde}/${rondes} · 1er 4 pts, 2e 3, 3e 2, 4e 1`}
      >
        {(myStatus || nextNote) && (
          <View style={{ marginBottom: 10 }}>
            <LeagueInfo status={myStatus} next={nextTable} note={nextNote} />
          </View>
        )}
        <ScrollView style={{ maxHeight: 420 }}>
          {general.length === 0 ? (
            <Text style={styles.queueEmpty}>Le classement apparaît quand le championnat commence.</Text>
          ) : (
            <StandingsList general={general} highlight={stage.map((p) => p.id)} />
          )}
        </ScrollView>
      </Sheet>

      <Sheet open={queueOpen && !group} onClose={() => setQueueOpen(false)} title="File d’attente" subtitle="Les prochains à monter sur scène">
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
      <PlayerSheet
        player={focus}
        about={focus ? (aboutOf(focus.id) ?? (focus.me ? undefined : 'Joueur Zembo')) : undefined}
        stats={
          focus
            ? [
                `${stage.find((x) => x.id === focus.id)?.score ?? focus.score} points dans ce tour`,
                group
                  ? `Classement : ${rankOf(focus.id) || '—'}${standings[focus.id] ? ` · ${pts(standings[focus.id].pts)}` : ''}`
                  : crowns[focus.id]
                    ? `👑 ${crowns[focus.id].n} couronne${crowns[focus.id].n > 1 ? 's' : ''}`
                    : 'Pas encore de couronne',
                training ? `Niveau ${LEVEL_LABEL[level]}` : 'Sur scène en direct',
              ]
            : []
        }
        gifts={GIFTS}
        actions={!training}
        onClose={() => setFocus(null)}
        onGift={(g) => {
          if (!focus) return;
          floaters.add(g.emoji, undefined, undefined, true);
          chat.push(profile?.pseudo ?? 'Toi', `a envoyé ${g.emoji} ${g.name} à ${focus.name}`, true);
          toast.show(`${g.emoji} ${g.name} envoyé à ${focus.name} !`);
        }}
        onApplaud={() => {
          if (!focus) return;
          tap();
          for (let k = 0; k < 5; k++) setTimeout(() => floaters.add('👏', width / 2 - 60 + Math.random() * 120, chatY.current + 30), k * 110);
          chat.push(profile?.pseudo ?? 'Toi', `👏 applaudit ${focus.name}`, true);
        }}
      />
      <Toast text={toast.text} top={T + 110} />
    </View>
  );
}

// ── Fond de scène : dégradé violet, projecteurs, halo doré ──
export const Backdrop = memo(function Backdrop() {
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

function IntroText({ epreuve, total, stageLabel, kind }: { epreuve: number; total: number; stageLabel: string; kind: Kind }) {
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
        {stageLabel.toUpperCase()} · ÉPREUVE {epreuve + 1}/{total}
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

// ── Au lancement : mode, niveau, ton rôle, ta caméra (même format que Mot d'Or) ──
function StartForm({
  top,
  format,
  setFormat,
  level,
  setLevel,
  hostPlays,
  setHostPlays,
  players,
  onStart,
  onClose,
}: {
  top: number;
  format: Format;
  setFormat: (f: Format) => void;
  level: Level;
  setLevel: (l: Level) => void;
  hostPlays: boolean;
  setHostPlays: (b: boolean) => void;
  players: Player[];
  onStart: () => void;
  onClose: () => void;
}) {
  const training = format === 'training';
  const withCam = !training && hostPlays;
  return (
    <Cover top={top}>
      <Text style={styles.finalTitle}>Lettres d’Or</Text>
      <Text style={styles.finalSub}>Le mot le plus long et le compte est bon, en direct.</Text>

      <Text style={styles.formLabel}>Mode</Text>
      <View style={styles.fChoice}>
        {[
          { v: 'tournoi' as Format, t: '🏆 Tournoi', d: '4 joueurs, le dernier descend' },
          { v: 'groupe' as Format, t: '👥 Groupe', d: 'Championnat de 12 à 20' },
          { v: 'training' as Format, t: '🎯 Entraînement', d: 'Contre l’ordinateur' },
        ].map((o) => (
          <Pressable key={o.v} onPress={() => setFormat(o.v)} style={[styles.fCard, format === o.v && styles.fOn]}>
            <Text style={[styles.fText, format === o.v && { color: INK }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {o.t}
            </Text>
            <Text style={[styles.fDesc, format === o.v && { color: INK }]}>{o.d}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.formLabel}>Niveau</Text>
      <View style={styles.fChoice}>
        {(['facile', 'difficile', 'expert'] as Level[]).map((l) => (
          <Pressable key={l} onPress={() => setLevel(l)} style={[styles.fBtn, level === l && styles.fOn]}>
            <Text style={[styles.fText, level === l && { color: INK }]}>
              {LEVEL_INFO[l].emoji} {LEVEL_LABEL[l]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.formHint}>
        Chrono : {DURS[level].L} s pour les lettres, {DURS[level].C} s pour les chiffres.
      </Text>

      {!training && (
        <>
          <Text style={styles.formLabel}>Ton rôle</Text>
          <View style={styles.fChoice}>
            {[
              { v: true, t: 'Je joue', d: 'Tu prends une des 4 places sur scène' },
              { v: false, t: 'Je présente sans jouer', d: 'Tu animes et gères la liste d’attente' },
            ].map((o) => (
              <Pressable key={String(o.v)} onPress={() => setHostPlays(o.v)} style={[styles.fCard, hostPlays === o.v && styles.fOn]}>
                <Text style={[styles.fText, hostPlays === o.v && { color: INK }]}>{o.t}</Text>
                <Text style={[styles.fDesc, hostPlays === o.v && { color: INK }]}>{o.d}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {withCam && (
        <View style={styles.fCam}>
          <Image source={DEENA_PHOTO} style={StyleSheet.absoluteFill} contentFit="cover" />
          <CameraPreview active style={StyleSheet.absoluteFill} />
          <Text style={styles.fCamText}>{mediaAvailable ? '📷 Ta caméra' : 'Aperçu dans l’app installée'}</Text>
        </View>
      )}

      {format === 'groupe' ? (
        <Text style={styles.formHint}>Tu choisis ensuite le nombre de joueurs (12, 16 ou 20).</Text>
      ) : (
        <>
          <Text style={styles.formLabel}>{training ? 'Tes adversaires' : 'Montent sur scène'}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {players.map((p, i) => (
              <View key={p.id} style={{ flex: 1, alignItems: 'center' }}>
                <Image source={p.photo} style={[styles.fAv, p.me && { borderColor: GOLD }]} />
                <Text style={styles.upName} numberOfLines={1}>
                  {training ? nameOf(p) : `${i + 1}. ${nameOf(p)}`}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Pressable onPress={onStart}>
        <LinearGradient colors={goldGradient} style={styles.replay}>
          <Ionicons name={withCam ? 'videocam' : 'play'} size={18} color={INK} />
          <Text style={styles.replayText}>
            {training ? 'Commencer l’entraînement' : format === 'groupe' ? 'Continuer' : withCam ? 'Je suis prêt, on commence !' : 'Lancer la partie'}
          </Text>
        </LinearGradient>
      </Pressable>
      <Pressable onPress={onClose} style={{ alignSelf: 'center', marginTop: 12, padding: 6 }}>
        <Text style={styles.quitText}>Annuler</Text>
      </Pressable>
    </Cover>
  );
}

function TrainEndCard({
  o,
  level,
  top,
  onReplay,
  onLevel,
  onClose,
}: {
  o: Overlay;
  level: Level;
  top: number;
  onReplay: () => void;
  onLevel: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);
  const won = !!o.who.me;
  return (
    <Cover top={top}>
      <Text style={{ fontSize: 44, textAlign: 'center' }}>{won ? '🏆' : '💪'}</Text>
      <Text style={styles.finalTitle}>{won ? 'Tu as gagné !' : `${o.who.name} gagne l’entraînement`}</Text>
      <Text style={styles.finalSub}>
        Niveau {LEVEL_LABEL[level]} · {won ? 'Bravo, tu as battu l’ordinateur !' : 'Entraîne-toi encore, tu vas y arriver !'}
      </Text>
      <RankList ranking={o.ranking} highlight={o.who.id} />
      <Pressable onPress={onReplay}>
        <LinearGradient colors={goldGradient} style={styles.replay}>
          <Ionicons name="refresh" size={18} color={INK} />
          <Text style={styles.replayText}>Rejouer</Text>
        </LinearGradient>
      </Pressable>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 12 }}>
        <Pressable onPress={onLevel} style={{ padding: 6 }}>
          <Text style={styles.quitText}>Changer de niveau</Text>
        </Pressable>
        <Pressable onPress={onClose} style={{ padding: 6 }}>
          <Text style={styles.quitText}>Quitter</Text>
        </Pressable>
      </View>
    </Cover>
  );
}

// ── Championnat : ta place et la table qui monte ensuite ──
function LeagueInfo({ status, next, note, onPress }: { status: string | null; next: Player[] | null; note: string | null; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      {!!status && (
        <Text style={styles.lgMe} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {status}
        </Text>
      )}
      {!!note && (
        <View style={styles.lgNext}>
          <Text style={styles.lgNextText}>{note}</Text>
          {next?.map((p, i) => (
            <Image key={p.id} source={p.photo} style={[styles.lgNextAv, i > 0 && { marginLeft: -7 }, p.me && { borderColor: GOLD }]} />
          ))}
          {!!next && (
            <Text style={styles.lgNextNames} numberOfLines={1}>
              {next.map(nameOf).join(', ')}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ── Championnat : nombre de joueurs ──
function SizePicker({ top, onPick, onBack }: { top: number; onPick: (n: number) => void; onBack: () => void }) {
  return (
    <Cover top={top}>
      <Text style={styles.finalTitle}>Championnat</Text>
      <Text style={styles.finalSub}>Combien de joueurs dans le groupe ?</Text>
      {GROUP_SIZES.map((n) => (
        <Pressable key={n} onPress={() => onPick(n)}>
          <View style={[styles.modeRow, styles.modeRowOn]}>
            <Text style={styles.sizeNum}>{n}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.modeTitle}>{n} joueurs</Text>
              <Text style={styles.modeDesc}>
                {n / 4} tables de 4 · {RONDES[n]} rondes + finale · environ 1 h
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={GOLD} />
          </View>
        </Pressable>
      ))}
      <View style={styles.rulesBox}>
        <Text style={styles.rulesText}>
          {
            '• Chaque table joue 2 lettres + 1 chiffres.\n• Classement : 1er 4 pts, 2e 3, 3e 2, 4e 1.\n• Après chaque ronde, les tables sont refaites d’après le classement.\n• Les 4 premiers jouent la grande finale (égalité : le mieux classé gagne).'
          }
        </Text>
      </View>
      <Pressable onPress={onBack} style={{ alignSelf: 'center', marginTop: 8, padding: 6 }}>
        <Text style={styles.quitText}>Retour</Text>
      </Pressable>
    </Cover>
  );
}

// ── Championnat : inscriptions ──
function SignupCard({ top, size, players, onStart, onBack }: { top: number; size: number; players: Player[]; onStart: () => void; onBack: () => void }) {
  const full = players.length >= size;
  return (
    <Cover top={top}>
      <Text style={styles.finalTitle}>Inscriptions</Text>
      <Text style={styles.finalSub}>
        {full ? 'Le groupe est complet !' : 'Les spectateurs s’inscrivent…'} {Math.min(players.length, size)}/{size}
      </Text>
      <View style={styles.signGrid}>
        {Array.from({ length: size }).map((_, i) => {
          const p = players[i];
          return (
            <View key={i} style={styles.signCell}>
              {p ? (
                <Image source={p.photo} style={[styles.signAv, p.me && { borderColor: GOLD, borderWidth: 2.5 }]} />
              ) : (
                <View style={[styles.signAv, styles.signEmpty]} />
              )}
              <Text style={styles.signName} numberOfLines={1}>
                {p ? nameOf(p) : ''}
              </Text>
            </View>
          );
        })}
      </View>
      <Pressable onPress={onStart} disabled={!full}>
        <LinearGradient colors={full ? goldGradient : ['#3A2E18', '#2A2010']} style={styles.replay}>
          <Text style={[styles.replayText, !full && { color: GOLD }]}>{full ? '🏁 Lancer le championnat' : 'En attente des joueurs…'}</Text>
        </LinearGradient>
      </Pressable>
      <Pressable onPress={onBack} style={{ alignSelf: 'center', marginTop: 12, padding: 6 }}>
        <Text style={styles.quitText}>Retour</Text>
      </Pressable>
    </Cover>
  );
}

// ── Championnat : le classement général ──
function StandingsList({ general, limit, highlight }: { general: Standing[]; limit?: number; highlight?: string[] }) {
  const meIdx = general.findIndex((x) => x.p.me);
  const rows = limit ? general.slice(0, limit) : general;
  const row = (x: Standing, i: number) => (
    <View key={x.p.id} style={[styles.stRow, highlight?.includes(x.p.id) && styles.stHi, x.p.me && styles.stMe]}>
      <Text style={[styles.stPos, i < 4 && { color: GOLD }]}>{i + 1}</Text>
      <Image source={x.p.photo} style={styles.stAv} />
      <Text style={styles.stName} numberOfLines={1}>
        {nameOf(x.p)}
      </Text>
      {x.wins > 0 && <Text style={styles.stWins}>🥇 {x.wins}</Text>}
      <Text style={styles.stPts}>{pts(x.pts)}</Text>
    </View>
  );
  return (
    <>
      {rows.map(row)}
      {!!limit && meIdx >= limit && (
        <>
          <Text style={styles.stDots}>• • •</Text>
          {row(general[meIdx], meIdx)}
        </>
      )}
    </>
  );
}

// ── Championnat : fin d'une table ──
function TableEndCard({ t, general, top }: { t: TableEnd; general: Standing[]; top: number }) {
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);
  const w = t.ranking[0];
  return (
    <Cover top={top}>
      <Text style={styles.finalTitle}>{w.me ? 'Tu gagnes ta table !' : `${w.name} gagne la table`}</Text>
      <Text style={styles.finalSub}>{t.label}</Text>
      {t.ranking.map((p, i) => {
        const away = t.absent?.includes(p.id);
        return (
          <View key={p.id} style={[styles.rankRow, i === 0 && styles.rankWin, away && { opacity: 0.55 }]}>
            <Text style={styles.rankPos}>{i + 1}</Text>
            <Image source={p.photo} style={styles.rankAv} />
            <Text style={styles.rankName}>
              {nameOf(p)} <Text style={styles.rankSmall}>{away ? 'absent' : `${pts(p.score)} de jeu`}</Text>
            </Text>
            <Text style={styles.rankScore}>+{away ? 0 : TABLE_POINTS[i]}</Text>
          </View>
        );
      })}
      <Text style={styles.sectionTitle}>📊 Classement général</Text>
      <StandingsList general={general} limit={5} highlight={t.ranking.map((p) => p.id)} />
      {!!t.note && <Text style={styles.outText}>{t.note}</Text>}
      <View style={styles.upBox}>
        <Text style={styles.upTitle}>🎤 {t.nextLabel}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          {t.next.map((p) => (
            <View key={p.id} style={{ alignItems: 'center', flex: 1 }}>
              <Image source={p.photo} style={styles.upAv} />
              <Text style={styles.upName} numberOfLines={1}>
                {nameOf(p)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Cover>
  );
}

// ── Championnat : le champion ──
function LeagueEndCard({
  c,
  general,
  top,
  onRelaunch,
  onClose,
}: {
  c: { who: Player; ranking: Player[] };
  general: Standing[];
  top: number;
  onRelaunch: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);
  return (
    <Cover top={top}>
      <Text style={{ fontSize: 44, textAlign: 'center' }}>🏆</Text>
      <Text style={styles.finalTitle}>{c.who.me ? 'Tu remportes le championnat !' : `${c.who.name} remporte le championnat !`}</Text>
      <Text style={styles.finalSub}>Grande finale terminée · 500 Zems pour le champion</Text>
      <RankList ranking={c.ranking} highlight={c.who.id} />
      <Text style={styles.sectionTitle}>📊 Classement des rondes</Text>
      <StandingsList general={general} limit={8} />
      <Pressable onPress={onRelaunch}>
        <LinearGradient colors={goldGradient} style={styles.replay}>
          <Ionicons name="refresh" size={18} color={INK} />
          <Text style={styles.replayText}>Nouveau championnat</Text>
        </LinearGradient>
      </Pressable>
      <Pressable onPress={onClose} style={{ alignSelf: 'center', marginTop: 12, padding: 6 }}>
        <Text style={styles.quitText}>Terminer le live</Text>
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

export function RoundGold({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
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

  // manche (à gauche) et tour (à droite), posés sur le bord du plateau
  sideLeft: { flex: 1, alignItems: 'flex-start' },
  sideRight: { flex: 1, alignItems: 'flex-end' },
  sidePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: GOLD2,
    backgroundColor: '#15114A',
  },
  sideText: { color: '#fff', fontSize: 11.5, fontWeight: '900' },
  dots: { flexDirection: 'row', gap: 3 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  // plateau
  boardWrap: { paddingHorizontal: 12, marginTop: 22 },
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
    left: 8,
    right: 8,
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  boardLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 6,
    paddingRight: 12,
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
    fontSize: 14,
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
    height: 42,
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
  plaques: { flexDirection: 'row', gap: 5, minHeight: 44 },
  plaque: {
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(233,185,73,0.5)',
  },
  plaqueMade: { backgroundColor: GOLD, borderColor: GOLD },
  plaqueSel: { borderColor: '#fff', borderWidth: 2.5 },
  plaqueText: { color: '#fff', fontSize: 20, fontWeight: '900' },
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
    paddingVertical: 4,
    paddingHorizontal: 2,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  msg: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 28 },
  msgWho: { flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: 120 },
  msgMention: { color: GOLD, fontWeight: '900' },
  sendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  msgAv: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: GOLD2,
  },
  msgName: { flexShrink: 1, color: '#C9B8FF', fontSize: 13.5, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  msgText: {
    flex: 1,
    color: '#fff',
    fontSize: 13.5,
    fontWeight: '600',
    marginRight: 44,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowRadius: 3,
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
  formLabel: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 0.5, marginBottom: 6 },
  formHint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center', marginTop: -6, marginBottom: 12 },
  fChoice: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  fCard: {
    flex: 1,
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: GOLD2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 8,
  },
  fBtn: { flex: 1, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: GOLD2, alignItems: 'center', justifyContent: 'center' },
  fOn: { backgroundColor: GOLD },
  fText: { color: GOLD, fontSize: 13.5, fontWeight: '900' },
  fDesc: { color: 'rgba(255,255,255,0.7)', fontSize: 10.5, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  fCam: {
    alignSelf: 'center',
    width: 92,
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: GOLD2,
    marginBottom: 10,
    backgroundColor: '#15114A',
  },
  fCamText: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 4,
    textAlign: 'center',
    color: '#fff',
    fontSize: 9.5,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  fAv: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: PURPLE },
  modeRowTrain: { borderColor: '#3DDC97', backgroundColor: 'rgba(61,220,151,0.1)' },
  trainBadge: {
    backgroundColor: 'rgba(61,220,151,0.18)',
    borderWidth: 1,
    borderColor: GREEN,
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 6,
    justifyContent: 'center',
  },
  trainText: { color: '#7CF2B5', fontSize: 10.5, fontWeight: '900', letterSpacing: 0.5 },
  trainBar: { alignItems: 'center', paddingTop: 8 },
  trainBarText: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, fontWeight: '800' },
  modeRowOn: { borderColor: GOLD, backgroundColor: 'rgba(233,185,73,0.14)' },
  modeTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  modeDesc: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 2, lineHeight: 17 },
  soon: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '800' },

  // championnat
  lgMe: { color: '#FFE7A8', fontSize: 13.5, fontWeight: '900' },
  lgNext: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  lgNextText: { color: '#C9B8FF', fontSize: 12, fontWeight: '900', marginRight: 6 },
  lgNextAv: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#15114A' },
  lgNextNames: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 11.5, fontWeight: '700', marginLeft: 6 },
  camTools: { position: 'absolute', top: 24, right: 5, gap: 6 },
  camTool: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camToolOff: { backgroundColor: '#E5484D', borderColor: '#E5484D' },
  checkCam: {
    alignSelf: 'center',
    width: 170,
    height: 230,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: GOLD2,
    backgroundColor: '#15114A',
    marginBottom: 12,
  },
  checkNote: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.6)' },
  checkNoteText: { color: '#fff', fontSize: 11, fontWeight: '800', textAlign: 'center' },
  micOff: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: GOLD,
    backgroundColor: 'rgba(14,16,52,0.98)',
    ...glow,
  },
  callCam: { width: 56, height: 76, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: GOLD2, backgroundColor: '#15114A' },
  callCamText: { position: 'absolute', bottom: 3, alignSelf: 'center', fontSize: 12 },
  callTitle: { color: GOLD, fontSize: 17, fontWeight: '900', fontFamily: 'Georgia' },
  callSub: { color: '#fff', fontSize: 12.5, marginTop: 2 },
  callBtn: { height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  callBtnText: { color: INK, fontSize: 14, fontWeight: '900' },
  callSkip: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, fontWeight: '800', textDecorationLine: 'underline' },
  sizeNum: { width: 44, textAlign: 'center', color: GOLD, fontSize: 28, fontWeight: '900', fontFamily: 'Georgia' },
  rulesBox: { marginTop: 4, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)' },
  rulesText: { color: 'rgba(255,255,255,0.8)', fontSize: 12.5, lineHeight: 19 },
  signGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, marginBottom: 4 },
  signCell: { width: '20%', alignItems: 'center' },
  signAv: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: PURPLE },
  signEmpty: { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.04)' },
  signName: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 3, maxWidth: '92%' },
  sectionTitle: { color: GOLD, fontSize: 14, fontWeight: '900', marginTop: 10, marginBottom: 6 },
  rankSmall: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontWeight: '700' },
  stRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 8, borderRadius: 10, marginBottom: 3 },
  stHi: { backgroundColor: 'rgba(139,92,246,0.18)' },
  stMe: { backgroundColor: 'rgba(233,185,73,0.16)', borderWidth: 1, borderColor: 'rgba(233,185,73,0.6)' },
  stPos: { width: 22, textAlign: 'center', color: '#fff', fontSize: 14, fontWeight: '900' },
  stAv: { width: 26, height: 26, borderRadius: 13 },
  stName: { flex: 1, color: '#fff', fontSize: 13.5, fontWeight: '800' },
  stWins: { color: 'rgba(255,255,255,0.75)', fontSize: 11.5, fontWeight: '800' },
  stPts: { width: 54, textAlign: 'right', color: GOLD, fontSize: 14, fontWeight: '900' },
  stDots: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: 10, marginVertical: 1 },
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
    minWidth: 46,
    height: 28,
    paddingHorizontal: 8,
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
  resultText: { color: '#06291B', fontSize: 15, fontWeight: '900' },
  calcLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 6,
    height: 38,
    paddingLeft: 12,
    paddingRight: 5,
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
  calcGap: { position: 'absolute', right: 2, color: GOLD, fontSize: 12, fontWeight: '900' },
  myTurn: { color: GOLD, fontSize: 14, fontWeight: '900', marginBottom: 6 },
  nextUp: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700' },
  pickBubble: { position: 'absolute', top: '32%', alignSelf: 'center', paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center' },
  pickV: { backgroundColor: GOLD },
  pickC: { backgroundColor: PURPLE },
  pickBubbleText: { color: INK, fontSize: 12.5, fontWeight: '900' },
});
