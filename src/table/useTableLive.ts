import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { CHAT0, LIVE_LINES, QUEUE0, SPECTATORS, initialSeats, now, type ChatMsg, type Seat, type TableConfig } from './data';
import type { TrackRef } from '../live/media';

export type QueueItem = { id: string; name: string; real?: boolean };

/** Ce que l'écran de la table utilise, que le live soit réel ou de démonstration */
export type TableLive = {
  config: TableConfig;
  seats: Seat[];
  queue: QueueItem[];
  speaking: number | null;
  chat: ChatMsg[];
  viewers: number;
  occupied: number;
  freeSeats: number;
  accept: (id: string) => void;
  decline: (id: string) => void;
  removeFromTable: (n: number) => void;
  toggleMute: (n: number) => void;
  isMuted: (s: Seat) => boolean;
  say: (text: string, gift?: boolean) => void;
  post: (msg: Omit<ChatMsg, 'id' | 'time'>) => void;
  /** 'demo' : live de démonstration (mode test sans compte) */
  role: 'host' | 'stage' | 'requested' | 'viewer' | 'demo';
  real: boolean;
  /** spectateurs à afficher (null : seulement le nombre) */
  spectators: string[] | null;
  camera?: (s: Seat) => TrackRef | null;
  request?: () => void;
  cancelRequest?: () => void;
  leave?: () => void;
  myCam?: boolean;
  toggleCam?: () => void;
  flip?: () => void;
  ended?: boolean;
  status?: string;
};

// Un live autour d'une table : qui parle, micros, demandes pour monter, chat
export function useTableLive(config: TableConfig) {
  const [seats, setSeats] = useState<Seat[]>(() => initialSeats(config.capacity));
  const [queue, setQueue] = useState(QUEUE0);
  const [muted, setMuted] = useState<Record<number, boolean>>({});
  const [speaking, setSpeaking] = useState<number | null>(0);
  const [chat, setChat] = useState<ChatMsg[]>(CHAT0);
  const [viewers, setViewers] = useState(SPECTATORS.length);

  const occupied = seats.filter((s) => s.name).length;
  const freeSeats = seats.length - occupied;

  // simulation de la parole : quelqu'un qui n'est pas en sourdine prend la parole
  useEffect(() => {
    const t = setInterval(() => {
      const candidates = seats.map((s, i) => (s.name && !muted[s.n] ? i : -1)).filter((i) => i >= 0);
      if (!candidates.length || Math.random() < 0.15) return setSpeaking(null);
      setSpeaking(candidates[Math.floor(Math.random() * candidates.length)]);
    }, 3800);
    return () => clearInterval(t);
  }, [seats, muted]);

  // le live vit : messages et spectateurs qui arrivent
  useEffect(() => {
    const t = setInterval(() => {
      const name = SPECTATORS[Math.floor(Math.random() * SPECTATORS.length)];
      const text = LIVE_LINES[Math.floor(Math.random() * LIVE_LINES.length)];
      setChat((c) => [...c.slice(-60), { id: `${Date.now()}`, name, time: now(), text }]);
      setViewers((v) => Math.max(5, v + Math.floor(Math.random() * 5) - 1));
    }, 4500);
    return () => clearInterval(t);
  }, []);

  const post = useCallback((msg: Omit<ChatMsg, 'id' | 'time'>) => {
    setChat((c) => [...c, { ...msg, id: `${Date.now()}-${Math.random()}`, time: now() }]);
  }, []);

  /** L'hôte accepte une demande : la personne s'assoit à la première place libre */
  const accept = (name: string) => {
    const free = seats.findIndex((s) => !s.name);
    if (free < 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSeats((ss) => ss.map((s, i) => (i === free ? { ...s, name } : s)));
    setQueue((q) => q.filter((x) => x !== name));
    post({ name, text: 'a rejoint la table 🎉', system: true });
  };

  const decline = (name: string) => {
    Haptics.selectionAsync();
    setQueue((q) => q.filter((x) => x !== name));
  };

  /** L'hôte fait descendre quelqu'un : il redevient spectateur */
  const removeFromTable = (n: number) => {
    const seat = seats.find((s) => s.n === n);
    if (!seat?.name || seat.host) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSeats((ss) => ss.map((s) => (s.n === n ? { ...s, name: null } : s)));
    setSpeaking(null);
    post({ name: seat.name, text: 'a quitté la table et rejoint les spectateurs', system: true });
  };

  const toggleMute = (n: number) => {
    Haptics.selectionAsync();
    setMuted((m) => ({ ...m, [n]: !m[n] }));
    setSpeaking((sp) => (sp !== null && seats[sp]?.n === n ? null : sp));
  };

  const say = (text: string, gift = false) => post({ name: 'Deena', text, gift });

  const isMuted = useCallback((s: Seat) => !!muted[s.n], [muted]);

  return useMemo<TableLive>(
    () => ({
      config,
      seats,
      queue: queue.map((name) => ({ id: name, name })),
      speaking,
      chat,
      viewers,
      occupied,
      freeSeats,
      accept,
      decline,
      removeFromTable,
      toggleMute,
      isMuted,
      say,
      post,
      role: 'demo',
      real: false,
      spectators: SPECTATORS,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, seats, queue, speaking, chat, viewers, occupied, freeSeats, isMuted],
  );
}

