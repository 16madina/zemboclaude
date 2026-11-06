import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  PanResponder,
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
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { goldGradient } from '../theme';
import { FadeIn, GiftGrid, LiveSlide, Sheet, Toast, faceOf, tap, useFloaters, useLiveChat, useToast, type Gift } from '../talk/LiveKit';
import { DEENA_PHOTO } from '../table/data';
import { findPerson } from '../world/data';
import { useSession } from '../lib/session';
import { auth } from '../lib/firebase';
import { CameraFeed, CameraPreview, mediaAvailable, useLiveMedia } from '../live/media';
import { Backdrop, RoundGold } from './LettresDor';
import { PlayerSheet } from './PlayerSheet';
import { BOTS, LEVEL_INFO } from './bots';
import {
  LEVELS,
  MAX_TRIES,
  LEVEL_LABEL,
  botFindChance,
  botGuess,
  checkGuess,
  givenCount,
  knownLetters,
  markGuess,
  pickWords,
  turnTime,
  wordPoints,
  type Level,
  type Mark,
  type Row,
} from './motdorEngine';

// « Mot d'Or Zembo » : le jeu du mot à trouver en live.
//
// - 4 joueurs sur scène, qui jouent chacun leur tour sur la grille commune.
// - Chaque joueur a son propre mot (même longueur), 6 essais, un chrono.
// - Première lettre donnée (les deux premières pour 9 lettres). Vert = bien placée, jaune = mal placée, gris = absente.
// - 6 niveaux : 4, 5, 6, 7, 8 puis 9 lettres. Ceux qui trouvent passent, les autres descendent.
//   Un seul trouve : il est champion. Personne : on rejoue le niveau (2 reprises au plus), puis départage.
// - Le champion reste sur scène, 3 joueurs de la liste d'attente montent (sur invitation de l'hôte).
//
// Ici : toi (l'hôte) + des joueurs simulés. Le serveur (mots secrets, chrono, scores) viendra avec la synchronisation.

const GOLD = '#F3D27A';
const GOLD2 = '#E9B949';
const INK = '#1D1405';
const NAVY = 'rgba(14,16,52,0.9)';
const PURPLE = '#8B5CF6';
const GREEN = '#22B24C';
const YELLOW = '#F4B400';
const GREY = '#5C5A6B';
const RED = '#FF5A6E';
const FLIP = 350; // délai entre deux cases qui se retournent (ms), comme une note toutes les 0,35 s

type P = { id: string; name: string; photo: number | string; me?: boolean; skill: number; about?: string };
type Mode = 'live' | 'training';
type Res = { found: boolean; tries: number; time: number; greens: number; points: number };
type Phase = 'lobby' | 'intro' | 'turn' | 'turnEnd' | 'levelEnd' | 'champion';
type Summary = { qualified: string[]; eliminated: string[]; note: string; title: string };
type QItem = { p: P; status: 'waiting' | 'invited' | 'accepted' | 'declined' };

const ME: P = { id: 'me', name: 'Toi', photo: DEENA_PHOTO, me: true, skill: 0.9 };
const person = (id: string, name: string, skill: number, face = name): P => {
  const w = findPerson(id);
  return { id, name, photo: w?.photo ?? faceOf(face, 300), skill };
};
const viewer = (name: string, k: number): P => ({ id: `q${k}-${name}`, name, photo: faceOf(name, 300), skill: 0.82 + (k % 4) * 0.04 });
const nameOf = (p?: P) => (p ? (p.me ? 'Toi' : p.name) : '');
/** Entraînement : 3 adversaires tirés parmi les 4 du niveau */
const pickTrio = (level: Level): P[] =>
  [...BOTS[level]]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((b) => ({ id: b.id, name: b.name, photo: b.photo, skill: b.skill, about: b.about }));
const QUEUE0 = ['Fatou', 'Idriss', 'Nadia', 'Malik', 'Mariam', 'Yann', 'Chloé', 'Samir'];
const LATER = ['Bintou', 'Jordan', 'Leïla', 'Djamal', 'Noura', 'Karim', 'Emma', 'Alex', 'Sophie', 'Kader'];

const CHAT0: [string, string][] = [
  ['Fatou', 'Allez Moussa ! 🔥'],
  ['Yann', 'Trop hâte de voir la grille 😍'],
  ['Chloé', 'Quel sera le premier mot ? 🤔'],
];
const AUTO: [string, string][] = [
  ['Nadia', 'Commence par les voyelles !'],
  ['Samir', 'Il y a un E, c’est sûr 😏'],
  ['Mariam', 'Mot d’Or, j’adore ce format 👑'],
  ['Yann', 'Le chrono stresse 😅'],
  ['Chloé', 'Bien joué !! 👏'],
  ['Malik', 'Les 9 lettres vont être chaudes'],
  ['Idriss', 'Allez Aïcha ! 💪'],
];
const GIFTS: Gift[] = [
  { name: 'Rose', emoji: '🌹', cost: 5 },
  { name: 'Cœur', emoji: '💖', cost: 10 },
  { name: 'Lettre d’or', emoji: '🅰️', cost: 20 },
  { name: 'Étoile', emoji: '⭐', cost: 25 },
  { name: 'Trophée', emoji: '🏆', cost: 50 },
  { name: 'Couronne', emoji: '👑', cost: 99 },
];
const KEYS = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];

// ── Effets sonores (créés pour Mot d'Or) ──
const SFX = {
  key: require('../../assets/sounds/motdor/key.wav'),
  ok: require('../../assets/sounds/motdor/ok.wav'),
  near: require('../../assets/sounds/motdor/near.wav'),
  no: require('../../assets/sounds/motdor/no.wav'),
  win: require('../../assets/sounds/motdor/win.wav'),
  fail: require('../../assets/sounds/motdor/fail.wav'),
  turn: require('../../assets/sounds/motdor/turn.wav'),
  tick: require('../../assets/sounds/motdor/tick.wav'),
  bad: require('../../assets/sounds/motdor/bad.wav'),
};
type Sfx = keyof typeof SFX;
function useSfx(on: boolean) {
  const players = useRef<Partial<Record<Sfx, AudioPlayer>>>({});
  const onRef = useRef(on);
  onRef.current = on;
  useEffect(() => {
    if (!mediaAvailable) setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    for (const k of Object.keys(SFX) as Sfx[]) players.current[k] = createAudioPlayer(SFX[k]);
    const all = players.current;
    return () => Object.values(all).forEach((p) => p?.remove());
  }, []);
  return useCallback((k: Sfx) => {
    if (!onRef.current) return;
    const p = players.current[k];
    if (!p) return;
    p.seekTo(0).catch(() => {});
    p.play();
  }, []);
}

const fmt = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function MotDor({ open, onClose }: { open: boolean; onClose: () => void }) {
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
  const chat = useLiveChat(CHAT0, AUTO, 4200);
  const floaters = useFloaters();
  const [soundOn, setSoundOn] = useState(true);
  const sfx = useSfx(soundOn);

  // ── la scène ──
  const [mode, setMode] = useState<Mode>('live');
  const [level, setLevel] = useState<Level>('difficile');
  const levelRef = useRef<Level>('difficile');
  levelRef.current = level;
  const [trio, setTrio] = useState<P[]>(() => pickTrio('difficile'));
  const [focus, setFocus] = useState<P | null>(null); // fiche d'un joueur (cadeau, applaudir, profil)
  const training = mode === 'training';
  const [hostPlays, setHostPlays] = useState(true);
  const [stage, setStage] = useState<P[]>([]);
  const [out, setOut] = useState<string[]>([]); // éliminés de la partie en cours (vignette grisée)
  const [phase, setPhase] = useState<Phase>('lobby');
  const phaseRef = useRef<Phase>('lobby');
  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const [levelIdx, setLevelIdx] = useState(0);
  const [retry, setRetry] = useState(0);
  const [tiebreak, setTiebreak] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [turnPos, setTurnPos] = useState(0);
  const [results, setResults] = useState<Record<string, Res>>({});
  const resultsRef = useRef<Record<string, Res>>({});
  const [totals, setTotals] = useState<Record<string, number>>({});
  const totalsRef = useRef<Record<string, number>>({});
  const secretsRef = useRef<Record<string, string>>({});
  const usedRef = useRef(new Set<string>());
  const [summary, setSummary] = useState<Summary | null>(null);
  const nextRef = useRef<(() => void) | null>(null);
  const [champion, setChampion] = useState<string | null>(null);
  const [streaks, setStreaks] = useState<Record<string, number>>({});

  // ── le tour en cours ──
  const [rows, setRows] = useState<Row[]>([]);
  const rowsRef = useRef<Row[]>([]);
  const [typed, setTyped] = useState('');
  const typedRef = useRef('');
  const setTyping = (t: string) => {
    typedRef.current = t;
    setTyped(t);
  };
  const [revealRow, setRevealRow] = useState<number | null>(null);
  const busyRef = useRef(false);
  const turnStartRef = useRef(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const tokenRef = useRef(0);
  const canFindRef = useRef(true);
  const [turnEnd, setTurnEnd] = useState<{ found: boolean; word: string; pts: number } | null>(null);
  const shake = useRef(new Animated.Value(0)).current;

  // ── liste d'attente ──
  const qSeq = useRef(0);
  const [queue, setQueue] = useState<QItem[]>(() => QUEUE0.map((n) => ({ p: viewer(n, qSeq.current++), status: 'waiting' as const })));
  const [requestsOpen, setRequestsOpen] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [joined, setJoined] = useState<number | null>(null); // fenêtre « tu es à la Xe place »
  const [menuOpen, setMenuOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [chatH, setChatH] = useState(120);

  const len = LEVELS[levelIdx];
  const activeId = order[turnPos];
  const active = stage.find((p) => p.id === activeId);
  const meOnStage = stage.some((p) => p.me) && !out.includes('me');
  const myTurn = phase === 'turn' && activeId === 'me';
  const playersOf = (ids: string[]) => ids.map((id) => stage.find((p) => p.id === id)).filter((p): p is P => !!p);

  // ── caméras (LiveKit) : seul le joueur actif a le micro ouvert pendant son tour ──
  const [camReady, setCamReady] = useState(false);
  const [myMic, setMyMic] = useState(true);
  const liveRoom = mediaAvailable && !training && phase !== 'lobby' && auth.currentUser ? `motdor-${auth.currentUser.uid}` : null;
  const media = useLiveMedia(liveRoom, {
    publish: camReady && meOnStage,
    mic: myMic && phase === 'turn' && activeId === 'me', // fermé pour tous les autres, impossible à rallumer
    name: profile?.pseudo,
  });

  // ── la partie ──
  const startLevel = (idx: number, ids: string[], retryN = 0, tb = false) => {
    const L = LEVELS[idx];
    const words = pickWords(L, ids.length, usedRef.current, levelRef.current);
    words.forEach((w) => usedRef.current.add(w));
    secretsRef.current = Object.fromEntries(ids.map((id, i) => [id, words[i]]));
    resultsRef.current = {};
    setResults({});
    setLevelIdx(idx);
    setRetry(retryN);
    setTiebreak(tb);
    setOrder(ids);
    setTurnPos(0);
    setRows([]);
    rowsRef.current = [];
    setTyping('');
    go('intro');
  };

  const startGame = (players: P[]) => {
    setStage(players);
    setOut([]);
    setChampion(null);
    usedRef.current = new Set();
    totalsRef.current = {};
    setTotals({});
    startLevel(
      0,
      players.map((p) => p.id),
    );
  };

  // présentation du joueur, puis son tour commence
  useEffect(() => {
    if (phase !== 'intro') return;
    const t = setTimeout(() => {
      const id = order[turnPos];
      const p = stage.find((x) => x.id === id);
      rowsRef.current = [];
      setRows([]);
      setTyping('');
      setRevealRow(null);
      busyRef.current = false;
      canFindRef.current = !p || p.me ? true : Math.random() < botFindChance(p.skill, LEVELS[levelIdx]);
      turnStartRef.current = Date.now();
      setTimeLeft(turnTime(LEVELS[levelIdx], levelRef.current));
      tokenRef.current += 1;
      go('turn');
      sfx('turn');
      if (p?.me) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      else if (p) scheduleBot(p);
    }, 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turnPos, order]);

  // le chrono (il ne repart pas de zéro à chaque essai)
  useEffect(() => {
    if (phase !== 'turn') return;
    let lastSec = -1;
    const t = setInterval(() => {
      const left = turnTime(LEVELS[levelIdx], levelRef.current) - (Date.now() - turnStartRef.current) / 1000;
      setTimeLeft(left);
      const sec = Math.ceil(left);
      if (sec <= 10 && sec > 0 && sec !== lastSec) sfx('tick');
      lastSec = sec;
      if (left <= 0 && !busyRef.current) endTurn(false);
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, levelIdx]);

  const timeIsUp = () => turnTime(LEVELS[levelIdx], levelRef.current) - (Date.now() - turnStartRef.current) / 1000 <= 0;

  /** Une proposition : vérifiée, colorée case par case, puis la suite */
  const submit = (guess: string, byMe: boolean) => {
    if (phaseRef.current !== 'turn' || busyRef.current) return;
    const secret = secretsRef.current[order[turnPos]];
    if (!secret) return;
    if (byMe) {
      const err = checkGuess(guess, secret);
      if (err) {
        sfx('bad');
        toast.show(err);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Animated.sequence([10, -10, 7, -7, 0].map((x) => Animated.timing(shake, { toValue: x, duration: 55, useNativeDriver: true }))).start(() => {
          // la ligne s'efface toute seule : pas besoin d'appuyer sur ⌫
          if (phaseRef.current === 'turn') setTyping('');
        });
        return;
      }
    }
    const marks = markGuess(guess, secret);
    const next = [...rowsRef.current, { guess, marks }];
    rowsRef.current = next;
    setRows(next);
    setTyping('');
    busyRef.current = true;
    setRevealRow(next.length - 1);
    const token = tokenRef.current;
    marks.forEach((m, i) =>
      setTimeout(
        () => {
          if (tokenRef.current === token) sfx(m);
        },
        i * FLIP + 150,
      ),
    );
    setTimeout(
      () => {
        if (tokenRef.current !== token) return;
        busyRef.current = false;
        setRevealRow(null);
        if (guess === secret) endTurn(true);
        else if (next.length >= MAX_TRIES || timeIsUp()) endTurn(false);
        else {
          const p = stage.find((x) => x.id === order[turnPos]);
          if (p && !p.me) scheduleBot(p);
        }
      },
      secret.length * FLIP + 380,
    );
  };

  /** Un joueur simulé réfléchit, tape son mot lettre par lettre, puis valide */
  const scheduleBot = (p: P) => {
    const token = tokenRef.current;
    const secret = secretsRef.current[p.id];
    const L = secret.length;
    setTimeout(
      () => {
        if (tokenRef.current !== token || phaseRef.current !== 'turn') return;
        const guess = botGuess(secret, rowsRef.current, p.skill - 0.15, canFindRef.current);
        if (!guess) return; // il sèche : le chrono finira son tour
        let k = 0;
        const typeNext = () => {
          if (tokenRef.current !== token || phaseRef.current !== 'turn') return;
          k += 1;
          setTyping(guess.slice(0, k));
          sfx('key');
          if (k < L) setTimeout(typeNext, rand(150, 260));
          else setTimeout(() => submit(guess, false), 420);
        };
        typeNext();
      },
      rand(2200, 4200) + L * 250,
    );
  };

  /** Fin du tour : mot trouvé ou non, points, puis joueur suivant */
  const endTurn = (found: boolean) => {
    if (phaseRef.current !== 'turn') return;
    tokenRef.current += 1;
    const id = order[turnPos];
    const L = LEVELS[levelIdx];
    const tries = rowsRef.current.length;
    const time = Math.min(turnTime(L, levelRef.current), (Date.now() - turnStartRef.current) / 1000);
    const greens = Math.max(0, ...rowsRef.current.map((r) => r.marks.filter((m) => m === 'ok').length));
    const points = found ? wordPoints(L, tries, 1 - time / turnTime(L, levelRef.current)) : 0;
    resultsRef.current = { ...resultsRef.current, [id]: { found, tries, time, greens, points } };
    setResults(resultsRef.current);
    totalsRef.current = { ...totalsRef.current, [id]: (totalsRef.current[id] ?? 0) + points };
    setTotals(totalsRef.current);
    setTurnEnd({ found, word: secretsRef.current[id], pts: points });
    sfx(found ? 'win' : 'fail');
    if (found) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    go('turnEnd');
  };

  useEffect(() => {
    if (phase !== 'turnEnd') return;
    const t = setTimeout(() => {
      if (turnPos + 1 < order.length) {
        setTurnPos(turnPos + 1);
        go('intro');
      } else finishLevel();
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── fin d'un niveau : qui passe, qui descend ──
  const showLevelEnd = (s: Summary, then: () => void) => {
    if (s.eliminated.length) setOut((o) => [...o, ...s.eliminated]);
    setSummary(s);
    nextRef.current = then;
    go('levelEnd');
  };
  useEffect(() => {
    if (phase !== 'levelEnd') return;
    const t = setTimeout(() => nextRef.current?.(), 5200);
    return () => clearTimeout(t);
  }, [phase]);

  const best = (ids: string[]) =>
    [...ids].sort((a, b) => {
      const ra = resultsRef.current[a];
      const rb = resultsRef.current[b];
      return Number(rb?.found) - Number(ra?.found) || (rb?.points ?? 0) - (ra?.points ?? 0) || (ra?.time ?? 999) - (rb?.time ?? 999) || Math.random() - 0.5;
    });

  const finalCompare = (ids: string[]) => {
    const max = Math.max(...ids.map((id) => totalsRef.current[id] ?? 0));
    const tops = ids.filter((id) => (totalsRef.current[id] ?? 0) === max);
    if (tops.length === 1) return declare(tops[0]);
    toast.show('Égalité au score ! Manche de départage à 9 lettres');
    startLevel(LEVELS.length - 1, tops, 0, true);
  };

  const finishLevel = () => {
    const A = order;
    const R = resultsRef.current;
    const F = A.filter((id) => R[id]?.found);
    const lost = A.filter((id) => !R[id]?.found);
    const last = levelIdx === LEVELS.length - 1;
    const names = (ids: string[]) => playersOf(ids).map(nameOf).join(', ');

    if (tiebreak) {
      const champ = best(A)[0];
      return showLevelEnd(
        { title: 'Départage', qualified: [champ], eliminated: A.filter((x) => x !== champ), note: `${names([champ])} gagne le départage.` },
        () => declare(champ),
      );
    }
    if (F.length === A.length) {
      return showLevelEnd(
        {
          title: `Niveau ${len} lettres terminé`,
          qualified: F,
          eliminated: [],
          note: last ? 'Tout le monde a trouvé les 9 lettres ! On compare les scores.' : 'Tout le monde a trouvé : tout le monde passe au niveau suivant !',
        },
        () => (last ? finalCompare(F) : startLevel(levelIdx + 1, F)),
      );
    }
    if (F.length === 1) {
      return showLevelEnd(
        { title: `Niveau ${len} lettres terminé`, qualified: F, eliminated: lost, note: `${names(F)} est le seul à avoir trouvé : champion !` },
        () => declare(F[0]),
      );
    }
    if (F.length > 1) {
      return showLevelEnd(
        {
          title: `Niveau ${len} lettres terminé`,
          qualified: F,
          eliminated: lost,
          note: last
            ? 'Ceux qui ont trouvé les 9 lettres se départagent au score.'
            : `${names(lost)} ${lost.length > 1 ? 'descendent' : 'descend'} parmi les spectateurs.`,
        },
        () => (last ? finalCompare(F) : startLevel(levelIdx + 1, F)),
      );
    }
    // personne n'a trouvé
    if (retry < 2) {
      return showLevelEnd(
        {
          title: 'Personne n’a trouvé',
          qualified: A,
          eliminated: [],
          note: `On rejoue le niveau ${len} lettres avec de nouveaux mots (reprise ${retry + 1}/2).`,
        },
        () => startLevel(levelIdx, A, retry + 1),
      );
    }
    // départage : le plus de lettres bien placées, puis le plus rapide
    const maxG = Math.max(...A.map((id) => R[id]?.greens ?? 0));
    const tops = A.filter((id) => (R[id]?.greens ?? 0) === maxG);
    const keep = tops.length === 1 ? tops : tops.length === A.length ? [best(tops)[0]] : tops;
    return showLevelEnd(
      {
        title: 'Départage',
        qualified: keep,
        eliminated: A.filter((id) => !keep.includes(id)),
        note:
          keep.length === 1
            ? `Personne n’a trouvé après 2 reprises : ${names(keep)} a placé le plus de lettres. Champion !`
            : `Personne n’a trouvé : ${names(keep)} ont placé le plus de lettres et continuent.`,
      },
      () => (keep.length === 1 ? declare(keep[0]) : last ? finalCompare(keep) : startLevel(levelIdx + 1, keep)),
    );
  };

  /** Le champion reste sur scène */
  const declare = (id: string) => {
    setChampion(id);
    setStreaks((s) => {
      const wasChamp = Object.keys(s).filter((k) => s[k] > 0);
      const next: Record<string, number> = {};
      for (const k of wasChamp) if (k === id) next[k] = s[k];
      next[id] = (next[id] ?? 0) + 1;
      return next;
    });
    sfx('win');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    go('champion');
  };

  // ── liste d'attente ──
  useEffect(() => {
    if (!requestsOpen || training) return;
    const t = setInterval(() => {
      setQueue((q) => {
        if (q.length >= 14) return q;
        const name = LATER[qSeq.current % LATER.length];
        const v = viewer(name, qSeq.current++);
        chat.push(v.name, '🙋 demande à jouer');
        return [...q, { p: v, status: 'waiting' }];
      });
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestsOpen, training]);

  const invite = (ids: string[]) => {
    if (!ids.length) return;
    tap();
    setQueue((q) => q.map((x) => (ids.includes(x.p.id) ? { ...x, status: 'invited' } : x)));
    ids.forEach((id) => {
      const me = id === 'me';
      setTimeout(
        () => {
          const yes = me || Math.random() < 0.85;
          setQueue((q) => {
            const item = q.find((x) => x.p.id === id);
            if (!item || item.status !== 'invited') return q;
            if (!yes) toast.show(`${item.p.name} a refusé l’invitation`);
            return q.map((x) => (x.p.id === id ? { ...x, status: yes ? 'accepted' : 'declined' } : x));
          });
          if (!yes) setTimeout(() => setQueue((q) => q.filter((x) => x.p.id !== id)), 2500);
        },
        me ? 300 : rand(1500, 4000),
      );
    });
  };
  const accepted = queue.filter((x) => x.status === 'accepted');
  const pending = queue.filter((x) => x.status === 'invited');
  const inviteNext = () => {
    const room = 3 - accepted.length - pending.length;
    invite(
      queue
        .filter((x) => x.status === 'waiting')
        .slice(0, Math.max(0, room))
        .map((x) => x.p.id),
    );
  };
  const removeFromQueue = (id: string, why: string) => {
    tap();
    const item = queue.find((x) => x.p.id === id);
    setQueue((q) => q.filter((x) => x.p.id !== id));
    if (item) toast.show(`${nameOf(item.p)} ${why}`);
  };
  const meQueued = queue.find((x) => x.p.me);
  const askToPlay = () => {
    tap();
    if (meOnStage) return toast.show('Tu es déjà sur scène 🎤');
    if (meQueued) return;
    setQueue((q) => [...q, { p: ME, status: 'waiting' }]);
    setDrawer(false);
    setJoined(queue.length + 1);
  };

  const newGame = () => {
    const champ = stage.find((p) => p.id === champion);
    const up = accepted.slice(0, 3).map((x) => x.p);
    if (!champ || up.length < 3) return;
    const ids = up.map((p) => p.id);
    setQueue((q) => q.filter((x) => !ids.includes(x.p.id)));
    if (up.some((p) => p.me)) {
      setCamReady(true);
      toast.show('À toi ! Tu montes sur scène 🎤');
    }
    startGame([champ, ...up]);
  };

  // ── saisie au clavier ──
  const secretNow = secretsRef.current[activeId ?? ''] ?? '';
  const given = givenCount(len);
  // les indices n'apparaissent qu'une fois les cases retournées
  const known = useMemo(() => (secretNow ? knownLetters(secretNow, revealRow == null ? rows : rows.slice(0, revealRow)) : []), [secretNow, rows, revealRow]);
  const press = (k: string) => {
    if (!myTurn || busyRef.current) return;
    if (k === '⌫') {
      tap();
      return setTyping(typedRef.current.slice(0, -1));
    }
    if (k === 'OK') {
      const word = typedRef.current;
      if (word.length < len) {
        sfx('bad');
        return toast.show(`Il faut ${len} lettres`);
      }
      return submit(word, true);
    }
    if (typedRef.current.length >= len) return;
    sfx('key');
    setTyping(typedRef.current + k);
  };

  // ── réactions du live ──
  const sendComment = () => {
    const t = draft.trim();
    if (!t) return;
    tap();
    chat.push(profile?.pseudo ?? 'Toi', t, true);
    setDraft('');
  };
  const replyTo = (user: string) => {
    tap();
    setDraft(`@${user} `);
    inputRef.current?.focus();
  };

  // ── mise en page ──
  const boardInner = width - 24 - 4 - 20;
  const gridW = boardInner;
  const tileW = Math.min(78, Math.floor((gridW - (len - 1) * 5) / len));
  const tileH = Math.min(36, Math.max(30, tileW));
  const camW = (width - 24 - 3 * 8) / 4;
  const chatRows = Math.max(myTurn ? 0 : 2, Math.floor((chatH - 6) / 27)); // pendant ton tour, pas de ligne coupée sous le clavier
  const timeTotal = turnTime(len, level);
  const clock = phase === 'turn' ? timeLeft : phase === 'intro' ? timeTotal : phase === 'turnEnd' ? timeLeft : timeTotal;
  const champStreak = champion ? (streaks[champion] ?? 1) : 0;

  const statusOf = (p: P): { text: string; icon: keyof typeof Ionicons.glyphMap; color: string } => {
    if (out.includes(p.id)) return { text: 'Éliminé', icon: 'close-circle', color: RED };
    if (phase === 'lobby') return { text: 'Prêt', icon: 'ellipsis-horizontal-circle', color: '#C9B8FF' };
    if (phase === 'champion' && p.id === champion) return { text: 'Champion', icon: 'trophy', color: GOLD };
    const r = results[p.id];
    if (phase === 'levelEnd' && summary?.qualified.includes(p.id)) return { text: 'Qualifié', icon: 'checkmark-circle', color: GREEN };
    if (r) return r.found ? { text: 'Trouvé', icon: 'checkmark-circle', color: GREEN } : { text: 'Échec', icon: 'close-circle', color: RED };
    if (p.id === activeId && (phase === 'turn' || phase === 'intro'))
      return { text: p.me ? 'À toi !' : 'En jeu', icon: 'ellipsis-horizontal-circle', color: GOLD };
    if (order.includes(p.id)) return { text: 'À venir', icon: 'ellipsis-horizontal-circle', color: '#C9B8FF' };
    return { text: 'En attente', icon: 'ellipsis-horizontal-circle', color: '#C9B8FF' };
  };
  const triesOf = (p: P) => {
    const r = results[p.id];
    if (r) return r.tries;
    if (p.id === activeId && (phase === 'turn' || phase === 'turnEnd') && rows.length) return rows.length;
    return null;
  };

  // la grille : les lignes jouées, la ligne en cours (avec ce qui est déjà connu), puis les lignes vides
  const gridRows = Array.from({ length: MAX_TRIES }).map((_, r) => {
    const played = rows[r];
    if (played) return played.guess.split('').map((ch, i) => ({ ch, mark: played.marks[i], hint: false, given: false }));
    const current = r === rows.length && (phase === 'turn' || phase === 'intro') && !!secretNow;
    return Array.from({ length: len }).map((__, i) => {
      if (!current) return { ch: '', mark: null as Mark | null, hint: false, given: false };
      const t = typed[i];
      if (t) return { ch: t, mark: null, hint: false, given: false };
      return { ch: known[i] ?? '', mark: null, hint: !!known[i], given: i < given };
    });
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#07061A' }}>
      <Backdrop />

      {/* ── en-tête ── */}
      <View style={[styles.header, { paddingTop: T - 2 }]}>
        <Pressable onPress={onClose} hitSlop={8} style={styles.roundBtn}>
          <Ionicons name="chevron-back" size={19} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.title} numberOfLines={1}>
            Mot d’Or <Text style={styles.titleZembo}>ZEMBO</Text>
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
                  <Text style={styles.viewersText}>986</Text>
                </View>
              </>
            )}
          </View>
        </View>
        {!training && (
          <Pressable onPress={() => setDrawer(true)} hitSlop={6} style={styles.queueBtn}>
            <Ionicons name="people" size={15} color={GOLD} />
            <Text style={styles.queueBtnText}>Jouer</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={[styles.roundBtn, { marginLeft: 8 }]}>
          <Ionicons name="ellipsis-horizontal" size={17} color="#fff" />
        </Pressable>
      </View>

      {/* ── manche, longueur du mot, chrono ── */}
      <View style={styles.infoRow}>
        <View style={styles.infoPill}>
          <Text style={styles.infoText}>
            Manche <Text style={{ color: GOLD }}>{levelIdx + 1}</Text>/{LEVELS.length}
          </Text>
        </View>
        <View style={[styles.infoPill, { flex: 1 }]}>
          <Text style={styles.infoText} numberOfLines={1}>
            {tiebreak ? 'Départage · ' : retry ? `Reprise ${retry}/2 · ` : 'Mot de '}
            <Text style={styles.infoBig}>{len}</Text> lettres
          </Text>
        </View>
        <View style={[styles.infoPill, phase === 'turn' && clock <= 10 && { borderColor: RED }]}>
          <Ionicons name="stopwatch-outline" size={15} color={phase === 'turn' && clock <= 10 ? RED : '#fff'} />
          <Text style={[styles.infoText, { fontVariant: ['tabular-nums'] }, phase === 'turn' && clock <= 10 && { color: RED }]}>{fmt(clock)}</Text>
        </View>
      </View>

      {/* ── légende, en tout petit ── */}
      <View style={styles.legendLine}>
        <Legend color={GREEN} text="Bien placée" />
        <Legend color={YELLOW} text="Mal placée" />
        <Legend color={GREY} text="Absente" />
      </View>

      {/* ── la grille ── */}
      <View style={styles.boardWrap}>
        <View style={styles.board}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {gridRows.map((cells, r) => {
              const isCurrent = r === rows.length && phase === 'turn';
              return (
                <Animated.View key={r} style={[styles.gridRow, { gap: 5 }, isCurrent && { transform: [{ translateX: shake }] }]}>
                  {cells.map((c, i) => (
                    <Tile
                      key={i}
                      w={tileW}
                      h={tileH}
                      ch={c.ch}
                      mark={c.mark}
                      delay={revealRow === r ? i * FLIP : undefined}
                      hint={c.hint}
                      given={c.given}
                      cursor={isCurrent && myTurn && i === typed.length}
                    />
                  ))}
                </Animated.View>
              );
            })}

            {/* bandeaux : au tour de…, mot trouvé, mot non trouvé */}
            {phase === 'intro' && active && (
              <FadeIn style={styles.banner} pointerEvents="none">
                <Image source={active.photo} style={styles.bannerAv} />
                <Text style={styles.bannerText}>{active.me ? 'À toi de jouer !' : `Au tour de ${active.name} !`}</Text>
                <Text style={styles.bannerSub}>
                  {len} lettres · {MAX_TRIES} essais · {fmt(timeTotal)}
                </Text>
              </FadeIn>
            )}
            {phase === 'turnEnd' && turnEnd && (
              <FadeIn style={[styles.banner, turnEnd.found && styles.bannerWin]} pointerEvents="none">
                <Text style={[styles.bannerText, turnEnd.found && { color: GOLD }]}>{turnEnd.found ? 'MOT TROUVÉ !' : 'Mot non trouvé'}</Text>
                <View style={{ flexDirection: 'row', gap: 3, marginTop: 6 }}>
                  {turnEnd.word.split('').map((ch, i) => (
                    <View key={i} style={[styles.solTile, { backgroundColor: turnEnd.found ? GREEN : '#3A2E6E' }]}>
                      <Text style={styles.solText}>{ch}</Text>
                    </View>
                  ))}
                </View>
                {turnEnd.found && <Text style={styles.bannerPts}>+{turnEnd.pts} pts</Text>}
              </FadeIn>
            )}
          </View>
        </View>
      </View>

      {/* ── les 4 joueurs ── */}
      <View style={styles.players}>
        {(stage.length ? stage : training ? [ME, ...trio] : lobbyPlayers(hostPlays)).map((p) => {
          const st = statusOf(p);
          const isActive = p.id === activeId && (phase === 'turn' || phase === 'intro');
          const isOut = out.includes(p.id);
          const tries = triesOf(p);
          const crown = streaks[p.id] ?? 0;
          const micOn = phase === 'turn' && p.id === activeId && (!p.me || myMic);
          return (
            <Pressable
              key={p.id}
              style={{ width: camW }}
              onPress={() => {
                tap();
                setFocus(p);
              }}
            >
              <View style={[styles.cam, p.me && styles.camMe, isOut && { opacity: 0.45 }]}>
                <Image source={p.photo} style={StyleSheet.absoluteFill} contentFit="cover" />
                {p.me && <CameraFeed trackRef={media.cameraOf('me')} mirror={media.facing === 'user'} style={StyleSheet.absoluteFill} />}
                <LinearGradient colors={['transparent', 'rgba(8,6,30,0.9)', 'rgba(8,6,30,0.98)']} locations={[0.3, 0.6, 1]} style={StyleSheet.absoluteFill} />
                {crown > 0 && (
                  <View style={styles.crown} pointerEvents="none">
                    <Text style={{ fontSize: 17 }}>👑</Text>
                    {crown > 1 && <Text style={styles.crownN}>{crown}</Text>}
                  </View>
                )}
                <View style={[styles.mic, !micOn && { backgroundColor: 'rgba(229,72,77,0.85)' }]}>
                  <Ionicons name={micOn ? 'mic' : 'mic-off'} size={11} color="#fff" />
                </View>
                {p.me && media.status === 'on' && myTurn && (
                  <Pressable onPress={() => setMyMic((m) => !m)} hitSlop={6} style={[styles.myMicBtn, !myMic && { backgroundColor: RED }]}>
                    <Ionicons name={myMic ? 'mic' : 'mic-off'} size={12} color="#fff" />
                  </Pressable>
                )}
                <View style={styles.camBottom}>
                  <Text style={styles.camName} numberOfLines={1}>
                    {nameOf(p)}
                  </Text>
                  <View style={styles.statusRow}>
                    <Ionicons name={st.icon} size={13} color={st.color} />
                    <Text style={[styles.statusText, { color: st.color === GOLD ? GOLD : '#fff' }]} numberOfLines={1}>
                      {st.text}
                    </Text>
                  </View>
                  <View style={[styles.triesPill, tries == null && styles.triesEmpty]}>
                    <Text style={[styles.triesText, tries == null && { color: 'rgba(255,255,255,0.5)' }]}>
                      {tries == null ? '—' : `${tries} essai${tries > 1 ? 's' : ''}`}
                    </Text>
                  </View>
                </View>
              </View>
              {isActive && <ActiveGlow />}
            </Pressable>
          );
        })}
      </View>

      {/* ── clavier quand c'est ton tour, sinon progression et commentaires ── */}
      {myTurn ? (
        <>
          <View style={styles.keyboard}>
            <Text style={styles.kbInfo}>
              Essai {rows.length + 1}/{MAX_TRIES} · le mot commence par {secretNow.slice(0, given)}
            </Text>
            {KEYS.map((row, r) => (
              <View key={r} style={styles.kbRow}>
                {row.split('').map((k) => (
                  <Key key={k} label={k} onPress={() => press(k)} />
                ))}
                {r === 2 && <Key label="⌫" wide onPress={() => press('⌫')} />}
                {r === 2 && <Key label="Valider" ok onPress={() => press('OK')} />}
              </View>
            ))}
          </View>
          <View style={styles.chatWrap} onLayout={(e) => setChatH(e.nativeEvent.layout.height)}>
            <View style={styles.chat}>
              {(training ? [] : chat.msgs.slice(-chatRows)).map((m) => (
                <View key={m.id} style={styles.msg}>
                  <Image source={faceOf(m.user, 60)} style={styles.msgAv} />
                  <Text style={styles.msgName} numberOfLines={1}>
                    {m.user}
                  </Text>
                  <Text style={styles.msgText} numberOfLines={1}>
                    {m.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </>
      ) : (
        <>
          <Progress levelIdx={levelIdx} started={phase !== 'lobby'} />
          <View style={styles.chatWrap} onLayout={(e) => setChatH(e.nativeEvent.layout.height)}>
            <View style={styles.chat}>
              {(training ? [] : chat.msgs.slice(-chatRows)).map((m) => {
                const mention = m.text.match(/^@\S+/)?.[0];
                return (
                  <View key={m.id} style={styles.msg}>
                    <Pressable onPress={() => !m.me && replyTo(m.user)} disabled={m.me} hitSlop={4} style={styles.msgWho}>
                      <Image source={faceOf(m.user, 60)} style={[styles.msgAv, m.me && { borderColor: GOLD }]} />
                      <Text style={[styles.msgName, m.me && { color: GOLD }]} numberOfLines={1}>
                        {m.user}
                      </Text>
                    </Pressable>
                    <Text style={styles.msgText} numberOfLines={1}>
                      {mention ? <Text style={{ color: GOLD, fontWeight: '900' }}>{mention}</Text> : null}
                      {mention ? m.text.slice(mention.length) : m.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </>
      )}

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
                floaters.add('🌹', width - 70, T + 560);
                toast.show('Tu as envoyé une rose 🌹');
              }}
            >
              <Text style={{ fontSize: 20 }}>🌹</Text>
            </RoundGold>
            <RoundGold
              onPress={() => {
                tap();
                for (let k = 0; k < 3; k++) setTimeout(() => floaters.add(['❤️', '💖', '👍'][k], width - 46 - Math.random() * 26, T + 600), k * 120);
              }}
            >
              <Text style={{ fontSize: 20 }}>👍</Text>
            </RoundGold>
          </View>
        </KeyboardAvoidingView>
      )}

      {floaters.layer}

      {/* ── écrans par-dessus ── */}
      {phase === 'lobby' && (
        <Lobby
          top={T + 56}
          mode={mode}
          setMode={setMode}
          level={level}
          setLevel={(l) => {
            setLevel(l);
            setTrio(pickTrio(l));
          }}
          hostPlays={hostPlays}
          setHostPlays={setHostPlays}
          players={training ? [ME, ...trio] : lobbyPlayers(hostPlays)}
          onStart={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            setCamReady(!training && hostPlays);
            startGame(training ? [ME, ...trio] : lobbyPlayers(hostPlays));
          }}
          onClose={onClose}
        />
      )}
      {phase === 'levelEnd' && summary && <LevelEnd s={summary} players={stage} results={results} totals={totals} top={T + 110} />}
      {phase === 'champion' && champion && (
        <ChampionCard
          top={T + 70}
          champ={stage.find((p) => p.id === champion)!}
          streak={champStreak}
          ranking={[...stage].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0))}
          totals={totals}
          accepted={accepted.map((x) => x.p)}
          pending={pending.map((x) => x.p)}
          onInvite={inviteNext}
          onChoose={() => setDrawer(true)}
          onStart={newGame}
          training={training}
          onReplay={() => {
            const t = pickTrio(level);
            setTrio(t);
            startGame([ME, ...t]);
          }}
          onLobby={() => {
            setStage([]);
            go('lobby');
          }}
          onClose={onClose}
        />
      )}

      <QueueDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        queue={queue}
        top={T}
        requestsOpen={requestsOpen}
        meOnStage={meOnStage}
        playing={phase !== 'champion' && phase !== 'lobby'}
        onToggleRequests={() => {
          tap();
          setRequestsOpen((o) => !o);
        }}
        onInvite={(id) => invite([id])}
        onInviteNext={inviteNext}
        onRemove={(id) => removeFromQueue(id, 'a été retiré de la liste')}
        onRefuse={(id) => removeFromQueue(id, ': demande refusée')}
        onAsk={askToPlay}
        onLeave={() => removeFromQueue('me', 'as quitté la liste')}
      />

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Mot d’Or" subtitle="Réglages du live">
        <MenuRow
          icon={soundOn ? 'volume-high' : 'volume-mute'}
          text={soundOn ? 'Effets sonores : activés' : 'Effets sonores : coupés'}
          onPress={() => {
            tap();
            setSoundOn((s) => !s);
          }}
        />
        <MenuRow
          icon="book-outline"
          text="Règles du jeu"
          onPress={() => {
            setMenuOpen(false);
            setTimeout(() => setRulesOpen(true), 250);
          }}
        />
        <MenuRow
          icon="people-outline"
          text="Liste d’attente"
          onPress={() => {
            setMenuOpen(false);
            setTimeout(() => setDrawer(true), 250);
          }}
        />
        <MenuRow icon="close-circle-outline" text="Terminer le live" danger onPress={onClose} />
      </Sheet>

      <Sheet open={rulesOpen} onClose={() => setRulesOpen(false)} title="Règles de Mot d’Or" subtitle="Trouve ton mot en 6 essais">
        <Text style={styles.rules}>
          {[
            '• 4 joueurs sur scène jouent chacun leur tour, chacun avec son propre mot.',
            '• La première lettre est donnée (les deux premières pour 9 lettres).',
            '• Vert : bien placée. Jaune : présente mais mal placée. Gris : absente.',
            '• 6 niveaux : de 4 à 9 lettres. Ceux qui trouvent passent, les autres descendent.',
            '• Un seul trouve : il est champion. Personne : on rejoue le niveau (2 fois au plus).',
            '• Points : longueur × 10, + bonus selon les essais (+30 en 1 essai… +5 en 6) et la rapidité.',
            '• Le champion reste sur scène, 3 nouveaux joueurs montent.',
          ].join('\n')}
        </Text>
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
      {joined != null && (
        <View style={[StyleSheet.absoluteFill, styles.popWrap]}>
          <FadeIn style={styles.pop}>
            <Text style={{ fontSize: 36, textAlign: 'center' }}>🙋</Text>
            <Text style={styles.cardTitle}>Demande envoyée !</Text>
            <Text style={styles.popPlace}>
              Tu es à la <Text style={{ color: GOLD }}>{joined === 1 ? '1re' : `${joined}e`}</Text> place
            </Text>
            <View style={styles.popRule}>
              <Ionicons name="videocam" size={18} color={GOLD} />
              <Text style={styles.popRuleText}>Pour monter sur scène, la caméra est obligatoire. Tu seras invité quand ce sera ton tour.</Text>
            </View>
            <Pressable onPress={() => setJoined(null)}>
              <LinearGradient colors={goldGradient} style={styles.cta}>
                <Text style={styles.ctaText}>J’ai compris</Text>
              </LinearGradient>
            </Pressable>
          </FadeIn>
        </View>
      )}
      <PlayerSheet
        player={focus}
        about={focus?.about ?? (focus && !focus.me ? 'Joueur Zembo' : undefined)}
        stats={
          focus
            ? [
                `${totals[focus.id] ?? 0} points dans cette partie`,
                streaks[focus.id]
                  ? `👑 ${streaks[focus.id]} victoire${streaks[focus.id] > 1 ? 's' : ''} de suite`
                  : out.includes(focus.id)
                    ? 'Éliminé de cette partie'
                    : 'En course',
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
          for (let k = 0; k < 5; k++) setTimeout(() => floaters.add('👏', width / 2 - 60 + Math.random() * 120, T + 520), k * 110);
          chat.push(profile?.pseudo ?? 'Toi', `👏 applaudit ${focus.name}`, true);
        }}
      />
      <Toast text={toast.text} top={T + 110} />
    </View>
  );
}

const lobbyPlayers = (hostPlays: boolean): P[] => {
  const base = [person('moussa', 'Moussa', 0.95), person('aicha', 'Aïcha', 0.9, 'Aïssatou'), person('kevin', 'Kevin', 0.87), person('sarah', 'Sarah', 0.92)];
  return hostPlays ? [ME, ...base.slice(0, 3)] : base;
};

// ── Une case de la grille : elle se retourne pour montrer sa couleur ──
function Tile({
  ch,
  mark,
  delay,
  w,
  h,
  hint,
  given,
  cursor,
}: {
  ch: string;
  mark: Mark | null;
  delay?: number;
  w: number;
  h: number;
  hint: boolean;
  given: boolean;
  cursor: boolean;
}) {
  const flip = useRef(new Animated.Value(mark ? 1 : 0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState<Mark | null>(mark);
  useEffect(() => {
    if (!mark) {
      flip.setValue(0);
      setShown(null);
      return;
    }
    if (delay == null) {
      flip.setValue(1);
      setShown(mark);
      return;
    }
    flip.setValue(0);
    setShown(null);
    Animated.timing(flip, { toValue: 0.5, duration: 160, delay, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setShown(mark);
      Animated.timing(flip, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
  }, [mark, delay, flip]);
  useEffect(() => {
    if (!ch || mark || hint || given) return;
    pop.setValue(1.15);
    Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  }, [ch, mark, hint, given, pop]);
  const rotateX = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '0deg'] });
  const bg = shown === 'ok' ? GREEN : shown === 'near' ? YELLOW : shown === 'no' ? GREY : '#14112E';
  return (
    <Animated.View
      style={[
        styles.tile,
        {
          width: w,
          height: h,
          borderRadius: Math.round(Math.min(w, h) * 0.2),
          backgroundColor: bg,
          transform: [{ perspective: 500 }, { rotateX }, { scale: pop }],
        },
        shown && styles.tileDone,
        cursor && styles.tileCursor,
        given && styles.tileGiven,
      ]}
    >
      {!!ch && (
        <Text
          style={[
            styles.tileText,
            { fontSize: Math.round(Math.min(w * 0.6, h * 0.62)) },
            hint && { color: given ? 'rgba(243,210,122,0.55)' : 'rgba(255,255,255,0.28)' },
            shown === 'near' && { color: '#2A1A00' },
          ]}
        >
          {ch}
        </Text>
      )}
    </Animated.View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

function Key({ label, mark, wide, ok, onPress }: { label: string; mark?: Mark; wide?: boolean; ok?: boolean; onPress: () => void }) {
  const bg = ok ? undefined : mark === 'ok' ? GREEN : mark === 'near' ? YELLOW : mark === 'no' ? '#2A2836' : 'rgba(255,255,255,0.12)';
  const inner =
    label === '⌫' ? (
      <Ionicons name="backspace-outline" size={26} color="#fff" />
    ) : (
      <Text
        style={[
          styles.keyText,
          ok && { color: INK, fontSize: 16 },
          mark === 'near' && { color: '#2A1A00' },
          mark === 'no' && { color: 'rgba(255,255,255,0.4)' },
        ]}
      >
        {label}
      </Text>
    );
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: wide ? 1.7 : ok ? 2.3 : 1 }, pressed && { opacity: 0.6, transform: [{ scale: 0.94 }] }]}>
      {ok ? (
        <LinearGradient colors={goldGradient} style={styles.key}>
          {inner}
        </LinearGradient>
      ) : (
        <View style={[styles.key, { backgroundColor: bg }]}>{inner}</View>
      )}
    </Pressable>
  );
}

function ActiveGlow() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View pointerEvents="none" style={[styles.activeGlow, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }]} />;
}

function Progress({ levelIdx, started }: { levelIdx: number; started: boolean }) {
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progress}>
        {LEVELS.map((L, i) => {
          const done = started && i < levelIdx;
          const cur = started && i === levelIdx;
          return (
            <View key={L} style={{ flex: 1, alignItems: 'center' }}>
              {i > 0 && <View style={[styles.progLine, (done || cur) && { backgroundColor: done ? GREEN : GOLD2 }]} />}
              <View style={[styles.progDot, done && { backgroundColor: GREEN, borderColor: GREEN }, cur && styles.progDotCur]}>
                <Ionicons
                  name={done ? 'checkmark' : cur ? 'chevron-down' : 'lock-closed'}
                  size={done ? 14 : 12}
                  color={done ? '#fff' : cur ? GOLD : 'rgba(255,255,255,0.6)'}
                />
              </View>
              <Text style={[styles.progText, cur && { color: GOLD, fontWeight: '900' }]}>{L} lettres</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MenuRow({ icon, text, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; text: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.menuRow}>
      <Ionicons name={icon} size={20} color={danger ? RED : GOLD} />
      <Text style={[styles.menuText, danger && { color: RED }]}>{text}</Text>
    </Pressable>
  );
}

function Cover({ top, children }: { top: number; children: React.ReactNode }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,4,20,0.72)', zIndex: 30 }]}>
      <ScrollView contentContainerStyle={{ paddingTop: top, paddingHorizontal: 16, paddingBottom: 40 }}>
        <FadeIn style={styles.card}>{children}</FadeIn>
      </ScrollView>
    </View>
  );
}

// ── Avant de commencer : live ou entraînement, niveau, ton rôle, ta caméra ──
function Lobby({
  top,
  mode,
  setMode,
  level,
  setLevel,
  hostPlays,
  setHostPlays,
  players,
  onStart,
  onClose,
}: {
  top: number;
  mode: Mode;
  setMode: (m: Mode) => void;
  level: Level;
  setLevel: (l: Level) => void;
  hostPlays: boolean;
  setHostPlays: (b: boolean) => void;
  players: P[];
  onStart: () => void;
  onClose: () => void;
}) {
  const training = mode === 'training';
  const withCam = !training && hostPlays;
  return (
    <Cover top={top}>
      <Text style={styles.cardTitle}>Mot d’Or</Text>
      <Text style={styles.cardSub}>Trouve le mot caché en 6 essais, du mot de 4 lettres au mot de 9 lettres.</Text>

      <Text style={styles.formLabel}>Mode</Text>
      <View style={styles.choice}>
        {[
          { v: 'live' as Mode, t: '🎥 En live', d: '4 joueurs sur scène, des spectateurs' },
          { v: 'training' as Mode, t: '🎯 Entraînement', d: 'Toi contre l’ordinateur' },
        ].map((o) => (
          <Pressable key={o.v} onPress={() => setMode(o.v)} style={[styles.choiceCard, mode === o.v && styles.choiceOn]}>
            <Text style={[styles.choiceText, mode === o.v && { color: INK }]}>{o.t}</Text>
            <Text style={[styles.choiceDesc, mode === o.v && { color: INK }]}>{o.d}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.formLabel}>Niveau</Text>
      <View style={styles.choice}>
        {(['facile', 'difficile', 'expert'] as Level[]).map((l) => (
          <Pressable key={l} onPress={() => setLevel(l)} style={[styles.choiceBtn, level === l && styles.choiceOn]}>
            <Text style={[styles.choiceText, level === l && { color: INK }]}>
              {LEVEL_INFO[l].emoji} {LEVEL_LABEL[l]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.formHint}>{LEVEL_INFO[level].text}</Text>

      {!training && (
        <>
          <Text style={styles.formLabel}>Ton rôle</Text>
          <View style={styles.choice}>
            {[
              { v: true, t: 'Je joue', d: 'Tu prends une des 4 places sur scène' },
              { v: false, t: 'Je présente sans jouer', d: 'Tu animes et gères la liste d’attente' },
            ].map((o) => (
              <Pressable key={String(o.v)} onPress={() => setHostPlays(o.v)} style={[styles.choiceCard, hostPlays === o.v && styles.choiceOn]}>
                <Text style={[styles.choiceText, hostPlays === o.v && { color: INK }]}>{o.t}</Text>
                <Text style={[styles.choiceDesc, hostPlays === o.v && { color: INK }]}>{o.d}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {withCam && (
        <View style={styles.lobbyCam}>
          <Image source={DEENA_PHOTO} style={StyleSheet.absoluteFill} contentFit="cover" />
          <CameraPreview active style={StyleSheet.absoluteFill} />
          <Text style={styles.lobbyCamText}>{mediaAvailable ? '📷 Ta caméra' : 'Aperçu dans l’app installée'}</Text>
        </View>
      )}

      <Text style={styles.formLabel}>{training ? 'Tes adversaires' : 'Montent sur scène'}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {players.map((p, i) => (
          <View key={p.id} style={{ flex: 1, alignItems: 'center' }}>
            <Image source={p.photo} style={[styles.upAv, p.me && { borderColor: GOLD }]} />
            <Text style={styles.upName} numberOfLines={1}>
              {training ? nameOf(p) : `${i + 1}. ${nameOf(p)}`}
            </Text>
          </View>
        ))}
      </View>
      <Pressable onPress={onStart}>
        <LinearGradient colors={goldGradient} style={styles.cta}>
          <Ionicons name={withCam ? 'videocam' : 'play'} size={18} color={INK} />
          <Text style={styles.ctaText}>{training ? 'Commencer l’entraînement' : withCam ? 'Je suis prêt, on commence !' : 'Lancer la partie'}</Text>
        </LinearGradient>
      </Pressable>
      <Pressable onPress={onClose} style={{ alignSelf: 'center', marginTop: 12, padding: 6 }}>
        <Text style={styles.quit}>Annuler</Text>
      </Pressable>
    </Cover>
  );
}

function LevelEnd({
  s,
  players,
  results,
  totals,
  top,
}: {
  s: Summary;
  players: P[];
  results: Record<string, Res>;
  totals: Record<string, number>;
  top: number;
}) {
  const shown = players.filter((p) => s.qualified.includes(p.id) || s.eliminated.includes(p.id));
  return (
    <Cover top={top}>
      <Text style={styles.cardTitle}>{s.title}</Text>
      <Text style={styles.cardSub}>{s.note}</Text>
      {shown.map((p) => {
        const r = results[p.id];
        const ok = s.qualified.includes(p.id);
        return (
          <View key={p.id} style={[styles.resRow, ok ? styles.resOk : { opacity: 0.6 }]}>
            <Image source={p.photo} style={styles.resAv} />
            <View style={{ flex: 1 }}>
              <Text style={styles.resName}>{nameOf(p)}</Text>
              <Text style={styles.resSub}>
                {r
                  ? r.found
                    ? `Trouvé en ${r.tries} essai${r.tries > 1 ? 's' : ''} · +${r.points} pts`
                    : `Pas trouvé · ${r.greens} lettre${r.greens > 1 ? 's' : ''} bien placée${r.greens > 1 ? 's' : ''}`
                  : '—'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.resTag, { color: ok ? GREEN : RED }]}>{ok ? 'Qualifié' : 'Éliminé'}</Text>
              <Text style={styles.resTotal}>{totals[p.id] ?? 0} pts</Text>
            </View>
          </View>
        );
      })}
    </Cover>
  );
}

function ChampionCard({
  top,
  champ,
  streak,
  ranking,
  totals,
  accepted,
  pending,
  onInvite,
  onChoose,
  onStart,
  training,
  onReplay,
  onLobby,
  onClose,
}: {
  training: boolean;
  onReplay: () => void;
  onLobby: () => void;
  onClose: () => void;
  top: number;
  champ: P;
  streak: number;
  ranking: P[];
  totals: Record<string, number>;
  accepted: P[];
  pending: P[];
  onInvite: () => void;
  onChoose: () => void;
  onStart: () => void;
}) {
  const ready = accepted.length >= 3;
  return (
    <Cover top={top}>
      <Text style={{ fontSize: 46, textAlign: 'center' }}>👑</Text>
      <Text style={styles.cardTitle}>{champ.me ? 'Tu es champion !' : `${champ.name} est champion !`}</Text>
      <Text style={styles.cardSub}>
        {training
          ? champ.me
            ? 'Bravo, tu as battu l’ordinateur !'
            : 'Entraîne-toi encore, tu vas y arriver !'
          : `${streak > 1 ? `${nameOf(champ)} — Champion, ${streak} victoires consécutives. ` : ''}Le champion reste sur scène.`}
      </Text>
      {ranking.map((p, i) => (
        <View key={p.id} style={[styles.resRow, p.id === champ.id && styles.resOk]}>
          <Text style={styles.rankPos}>{i + 1}</Text>
          <Image source={p.photo} style={styles.resAv} />
          <Text style={[styles.resName, { flex: 1 }]}>{nameOf(p)}</Text>
          <Text style={styles.resTotal}>{totals[p.id] ?? 0} pts</Text>
        </View>
      ))}
      {training ? (
        <View>
          <Pressable onPress={onReplay}>
            <LinearGradient colors={goldGradient} style={styles.cta}>
              <Ionicons name="refresh" size={18} color={INK} />
              <Text style={styles.ctaText}>Rejouer</Text>
            </LinearGradient>
          </Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 12 }}>
            <Pressable onPress={onLobby} style={{ padding: 6 }}>
              <Text style={styles.quit}>Changer de niveau</Text>
            </Pressable>
            <Pressable onPress={onClose} style={{ padding: 6 }}>
              <Text style={styles.quit}>Quitter</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.hostBox}>
          <Text style={styles.hostTitle}>
            {ready
              ? '3 joueurs prêts à monter'
              : `${3 - accepted.length} place${3 - accepted.length > 1 ? 's' : ''} disponible${3 - accepted.length > 1 ? 's' : ''}`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            {[0, 1, 2].map((i) => {
              const p = accepted[i] ?? pending[i - accepted.length];
              const ok = i < accepted.length;
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                  {p ? (
                    <Image source={p.photo} style={[styles.upAv, { borderColor: ok ? GREEN : GOLD2, opacity: ok ? 1 : 0.6 }]} />
                  ) : (
                    <View style={[styles.upAv, styles.upEmpty]} />
                  )}
                  <Text style={styles.upName} numberOfLines={1}>
                    {p ? nameOf(p) : 'Libre'}
                  </Text>
                  <Text style={[styles.upState, { color: ok ? GREEN : GOLD }]}>{p ? (ok ? 'a accepté' : 'invité…') : ''}</Text>
                </View>
              );
            })}
          </View>
          {ready ? (
            <Pressable onPress={onStart}>
              <LinearGradient colors={goldGradient} style={styles.cta}>
                <Ionicons name="play" size={18} color={INK} />
                <Text style={styles.ctaText}>Démarrer une nouvelle partie</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={onInvite} style={{ flex: 1 }}>
                <LinearGradient colors={goldGradient} style={styles.cta}>
                  <Text style={[styles.ctaText, { fontSize: 13.5 }]}>Inviter les 3 prochains</Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={onChoose} style={[styles.cta, styles.ctaGhost]}>
                <Text style={[styles.ctaText, { color: GOLD, fontSize: 13.5 }]}>Choisir</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </Cover>
  );
}

// ── Liste d'attente : tiroir qui s'ouvre depuis la droite ──
function QueueDrawer({
  open,
  onClose,
  queue,
  top,
  requestsOpen,
  meOnStage,
  playing,
  onToggleRequests,
  onInvite,
  onInviteNext,
  onRemove,
  onRefuse,
  onAsk,
  onLeave,
}: {
  open: boolean;
  onClose: () => void;
  queue: QItem[];
  top: number;
  requestsOpen: boolean;
  meOnStage: boolean;
  playing: boolean;
  onToggleRequests: () => void;
  onInvite: (id: string) => void;
  onInviteNext: () => void;
  onRemove: (id: string) => void;
  onRefuse: (id: string) => void;
  onAsk: () => void;
  onLeave: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const W = Math.round(width * 0.84);
  const x = useRef(new Animated.Value(W)).current;
  const [shown, setShown] = useState(open);
  useEffect(() => {
    if (open) setShown(true);
    Animated.timing(x, { toValue: open ? 0 : W, duration: open ? 260 : 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => finished && !open && setShown(false),
    );
  }, [open, W, x]);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx > 12 && Math.abs(g.dy) < 20,
        onPanResponderMove: (_, g) => x.setValue(Math.max(0, g.dx)),
        onPanResponderRelease: (_, g) => {
          if (g.dx > 80) onClose();
          else Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [x, onClose],
  );
  if (!shown) return null;
  const list = queue.filter((x2) => x2.status !== 'declined' || true);
  const mine = queue.findIndex((q) => q.p.me);
  const medal = (i: number) => ['🥇', '🥈', '🥉'][i] ?? '👤';
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={onClose} />
      <Animated.View
        {...pan.panHandlers}
        style={[styles.drawer, { width: W, paddingTop: top + 8, paddingBottom: insets.bottom + 10, transform: [{ translateX: x }] }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.drawerTitle}>PROCHAINS JOUEURS</Text>
            <Text style={styles.drawerSub}>
              {list.length} personne{list.length > 1 ? 's' : ''} attende{list.length > 1 ? 'nt' : ''} de monter sur scène
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={styles.roundBtn}>
            <Ionicons name="close" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* commandes de l'hôte */}
        <View style={styles.hostTools}>
          <Pressable onPress={onInviteNext} style={{ flex: 1 }}>
            <LinearGradient colors={goldGradient} style={styles.toolBtn}>
              <Text style={styles.toolText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                Inviter les 3 prochains
              </Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={onToggleRequests} style={[styles.toolBtn, styles.toolGhost]}>
            <Text style={[styles.toolText, { color: GOLD }]}>{requestsOpen ? 'Fermer' : 'Rouvrir'}</Text>
          </Pressable>
        </View>
        {playing && <Text style={styles.drawerNote}>Partie en cours : les invités monteront à la prochaine partie.</Text>}

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          {list.length === 0 && <Text style={styles.drawerEmpty}>Personne dans la liste pour l’instant.</Text>}
          {list.map((q, i) => (
            <View key={q.p.id} style={[styles.qRow, q.p.me && { borderColor: GOLD2, borderWidth: 1 }]}>
              <Text style={styles.qPos}>{i + 1}</Text>
              <Text style={{ fontSize: 15 }}>{medal(i)}</Text>
              <Image source={q.p.photo} style={styles.qAv} />
              <View style={{ flex: 1 }}>
                <Text style={styles.qName} numberOfLines={1}>
                  {nameOf(q.p)}
                </Text>
                <Text
                  style={[
                    styles.qState,
                    q.status === 'accepted' && { color: GREEN },
                    q.status === 'invited' && { color: GOLD },
                    q.status === 'declined' && { color: RED },
                  ]}
                >
                  {q.status === 'waiting' ? 'En attente' : q.status === 'invited' ? 'Invité…' : q.status === 'accepted' ? 'A accepté ✓' : 'A refusé'}
                </Text>
              </View>
              {!q.p.me && q.status === 'waiting' && (
                <>
                  <Pressable onPress={() => onInvite(q.p.id)} hitSlop={4} style={styles.qAction}>
                    <Ionicons name="arrow-up-circle" size={22} color={GOLD} />
                  </Pressable>
                  <Pressable onPress={() => onRefuse(q.p.id)} hitSlop={4} style={styles.qAction}>
                    <Ionicons name="close-circle" size={22} color="rgba(255,255,255,0.5)" />
                  </Pressable>
                </>
              )}
              {!q.p.me && q.status !== 'waiting' && q.status !== 'declined' && (
                <Pressable onPress={() => onRemove(q.p.id)} hitSlop={4} style={styles.qAction}>
                  <Ionicons name="trash-outline" size={19} color="rgba(255,255,255,0.5)" />
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>

        {/* toi, comme spectateur */}
        <View style={{ paddingHorizontal: 16 }}>
          {meOnStage ? (
            <Text style={styles.drawerMe}>🎤 Tu es sur scène</Text>
          ) : mine >= 0 ? (
            <>
              <Text style={[styles.drawerMe, { color: GREEN }]}>✓ Tu es dans la liste — Position {mine + 1}</Text>
              <Pressable onPress={onLeave} style={{ alignSelf: 'center', padding: 6 }}>
                <Text style={styles.quit}>Quitter la liste</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={onAsk} disabled={!requestsOpen}>
              <LinearGradient colors={requestsOpen ? goldGradient : ['#3A2E18', '#2A2010']} style={styles.cta}>
                <Text style={[styles.ctaText, !requestsOpen && { color: GOLD }]}>{requestsOpen ? '🙋 Demander à jouer' : 'Demandes fermées'}</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const glow = { shadowColor: '#FFB347', shadowOpacity: 0.7, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } };

const styles = StyleSheet.create({
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
  title: { color: GOLD, fontSize: 18, fontWeight: '900', fontStyle: 'italic', fontFamily: 'Georgia' },
  titleZembo: { color: '#fff', fontSize: 12, fontStyle: 'normal', fontWeight: '900', letterSpacing: 1.5 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  liveBadge: { backgroundColor: '#FF2D55', paddingHorizontal: 9, height: 20, borderRadius: 6, justifyContent: 'center' },
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
  queueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: GOLD2,
    backgroundColor: 'rgba(12,10,40,0.85)',
  },
  queueBtnText: { color: GOLD, fontSize: 13, fontWeight: '900' },

  infoRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, marginTop: 10 },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: GOLD2,
    backgroundColor: 'rgba(10,10,40,0.85)',
  },
  infoText: { color: '#fff', fontSize: 13.5, fontWeight: '900' },
  infoBig: { color: GOLD, fontSize: 17, fontWeight: '900' },

  boardWrap: { paddingHorizontal: 12, marginTop: 6 },
  board: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: GOLD2,
    backgroundColor: NAVY,
    ...glow,
  },
  side: { width: 88, gap: 8, justifyContent: 'center' },
  levelBox: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: GOLD2,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  levelSmall: { color: '#fff', fontSize: 12, fontWeight: '800' },
  levelBig: { color: GOLD, fontSize: 15, fontWeight: '900' },
  legend: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(233,185,73,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 9,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: '700' },
  legendLine: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 6 },
  gridRow: { flexDirection: 'row', marginVertical: 2.5 },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(233,185,73,0.32)',
  },
  tileDone: { borderColor: 'rgba(255,255,255,0.25)' },
  tileCursor: { borderColor: GOLD, borderWidth: 2 },
  tileGiven: { borderColor: GOLD2 },
  tileText: { color: '#fff', fontWeight: '900' },
  banner: {
    position: 'absolute',
    left: 6,
    right: 6,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(10,8,34,0.95)',
    borderWidth: 1.5,
    borderColor: PURPLE,
  },
  bannerWin: { borderColor: GOLD, ...glow },
  bannerAv: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: GOLD, marginBottom: 6 },
  bannerText: { color: '#fff', fontSize: 20, fontWeight: '900', fontFamily: 'Georgia', textAlign: 'center' },
  bannerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontWeight: '700', marginTop: 3 },
  bannerPts: { color: GOLD, fontSize: 16, fontWeight: '900', marginTop: 6 },
  solTile: { width: 26, height: 30, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  solText: { color: '#fff', fontSize: 16, fontWeight: '900' },

  players: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginTop: 10 },
  cam: {
    height: 122,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#9B6BFF',
    backgroundColor: '#15114A',
  },
  camMe: { borderColor: GOLD2 },
  activeGlow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16, borderWidth: 3, borderColor: GOLD, ...glow },
  crown: { position: 'absolute', top: 3, left: 5, flexDirection: 'row', alignItems: 'center' },
  crownN: { color: GOLD, fontSize: 12, fontWeight: '900', marginLeft: 1 },
  mic: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myMicBtn: {
    position: 'absolute',
    top: 30,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camBottom: { position: 'absolute', left: 0, right: 0, bottom: 6, alignItems: 'center' },
  camName: { color: '#fff', fontSize: 14, fontWeight: '900', maxWidth: '92%' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1, maxWidth: '94%' },
  statusText: { fontSize: 11.5, fontWeight: '800' },
  triesPill: { marginTop: 4, paddingHorizontal: 10, height: 20, borderRadius: 10, justifyContent: 'center', backgroundColor: GOLD2 },
  triesEmpty: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderColor: 'rgba(233,185,73,0.5)' },
  triesText: { color: INK, fontSize: 11.5, fontWeight: '900' },

  progressWrap: { paddingHorizontal: 12, marginTop: 10 },
  progress: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(233,185,73,0.7)',
    backgroundColor: 'rgba(10,10,40,0.85)',
  },
  progLine: { position: 'absolute', top: 12, right: '50%', width: '100%', height: 2.5, backgroundColor: 'rgba(255,255,255,0.18)' },
  progDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: '#1C1940',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progDotCur: { borderColor: GOLD, borderWidth: 2.5, backgroundColor: '#2A2050' },
  progText: { color: 'rgba(255,255,255,0.8)', fontSize: 10.5, fontWeight: '700', marginTop: 3 },

  chatWrap: { flex: 1, paddingHorizontal: 12, marginTop: 6, marginBottom: 6 },
  chat: { flex: 1, justifyContent: 'flex-end', overflow: 'hidden' },
  msg: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 27 },
  msgWho: { flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: 120 },
  msgAv: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: GOLD2 },
  msgName: { flexShrink: 1, color: '#C9B8FF', fontSize: 13.5, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  msgText: { flex: 1, color: '#fff', fontSize: 13.5, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 3 },

  keyboard: { paddingHorizontal: 4, marginTop: 8, gap: 6 },
  kbInfo: { color: GOLD, fontSize: 12, fontWeight: '800', textAlign: 'center', marginBottom: 2 },
  kbRow: { flexDirection: 'row', gap: 4 },
  key: { height: 52, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  keyText: { color: '#fff', fontSize: 23, fontWeight: '900' },

  bottomBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 2 },
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
  sendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', marginRight: -8 },

  card: { borderRadius: 22, borderWidth: 2, borderColor: GOLD2, backgroundColor: 'rgba(14,16,52,0.97)', padding: 16, ...glow },
  cardTitle: { color: GOLD, fontSize: 22, fontWeight: '900', textAlign: 'center', fontFamily: 'Georgia' },
  cardSub: { color: '#fff', fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 12, lineHeight: 18 },
  choice: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  choiceBtn: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: GOLD2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceOn: { backgroundColor: GOLD },
  choiceText: { color: GOLD, fontSize: 13.5, fontWeight: '900' },
  choiceCard: {
    flex: 1,
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: GOLD2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  choiceDesc: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  formLabel: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 0.5, marginBottom: 6 },
  formHint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center', marginTop: -6, marginBottom: 12 },
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
  lobbyCam: {
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
  lobbyCamText: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 5,
    textAlign: 'center',
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sectionTitle: { color: GOLD, fontSize: 14, fontWeight: '900', marginBottom: 8 },
  upAv: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: PURPLE },
  upEmpty: { borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.05)' },
  upName: { color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 4 },
  upState: { fontSize: 10.5, fontWeight: '800', marginTop: 1 },
  cta: { marginTop: 14, height: 48, borderRadius: 24, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  ctaGhost: { borderWidth: 1.5, borderColor: GOLD2 },
  ctaText: { color: INK, fontSize: 16, fontWeight: '900' },
  quit: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '800' },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 6 },
  resOk: { backgroundColor: 'rgba(233,185,73,0.16)', borderWidth: 1, borderColor: GOLD2 },
  resAv: { width: 38, height: 38, borderRadius: 19 },
  resName: { color: '#fff', fontSize: 14.5, fontWeight: '900' },
  resSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },
  resTag: { fontSize: 12.5, fontWeight: '900' },
  resTotal: { color: GOLD, fontSize: 14, fontWeight: '900' },
  rankPos: { width: 20, textAlign: 'center', color: '#fff', fontSize: 15, fontWeight: '900' },
  hostBox: { marginTop: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(233,185,73,0.5)', backgroundColor: 'rgba(0,0,0,0.25)' },
  hostTitle: { color: GOLD, fontSize: 14.5, fontWeight: '900', textAlign: 'center' },

  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: '#0E0B2C',
    borderLeftWidth: 1.5,
    borderLeftColor: GOLD2,
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
  },
  drawerTitle: { color: GOLD, fontSize: 17, fontWeight: '900', letterSpacing: 1 },
  drawerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, marginTop: 2 },
  hostTools: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginTop: 12 },
  toolBtn: { height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  toolGhost: { borderWidth: 1.5, borderColor: GOLD2 },
  toolText: { color: INK, fontSize: 12.5, fontWeight: '900' },
  drawerNote: { color: 'rgba(255,255,255,0.65)', fontSize: 11.5, paddingHorizontal: 16, marginTop: 8 },
  drawerEmpty: { color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 20 },
  qRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginTop: 8,
  },
  qPos: { width: 18, textAlign: 'center', color: GOLD, fontSize: 13, fontWeight: '900' },
  qAv: { width: 36, height: 36, borderRadius: 18 },
  qName: { color: '#fff', fontSize: 14, fontWeight: '900' },
  qState: { color: 'rgba(255,255,255,0.65)', fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  qAction: { padding: 2 },
  drawerMe: { color: GOLD, fontSize: 14, fontWeight: '900', textAlign: 'center', paddingVertical: 10 },

  popWrap: { backgroundColor: 'rgba(5,4,20,0.7)', zIndex: 60, justifyContent: 'center', paddingHorizontal: 24 },
  pop: { borderRadius: 22, borderWidth: 2, borderColor: GOLD2, backgroundColor: 'rgba(14,16,52,0.98)', padding: 18, ...glow },
  popPlace: { color: '#fff', fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 6 },
  popRule: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(233,185,73,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(233,185,73,0.5)',
  },
  popRuleText: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  menuText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  rules: { color: '#fff', fontSize: 13.5, lineHeight: 22 },
});
