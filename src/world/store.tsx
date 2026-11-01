import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  DEFAULT_HELLOS,
  EMPTY_PROFILE,
  findPerson,
  firstMessages,
  PREVIEWS,
  type HelloState,
  type WorldMsg,
  type WorldPerson,
  type WorldProfile,
} from './data';

// État partagé de World Room (en mémoire pour l'instant ; plus tard : Supabase, table world_profiles)

type Ctx = {
  profile: WorldProfile;
  setProfile: (p: WorldProfile | ((p: WorldProfile) => WorldProfile)) => void;
  resetProfile: () => void;
  hellos: HelloState;
  pending: WorldPerson[];
  sent: WorldPerson[];
  connections: WorldPerson[];
  sendHello: (id: string) => void;
  cancelHello: (id: string) => void;
  ignoreHello: (id: string) => void;
  acceptHello: (id: string) => void;
  addConnection: (id: string) => void;
  endMeeting: (id: string) => void;
  resetHellos: () => void;
  threads: Record<string, WorldMsg[]>;
  unread: Record<string, number>;
  sendMessage: (id: string, text: string) => void;
  markRead: (id: string) => void;
  toast: string | null;
  showToast: (t: string) => void;
};

const WorldCtx = createContext<Ctx | null>(null);

export const tap = () => void Haptics.selectionAsync().catch(() => {});

const people = (ids: string[]) => ids.map(findPerson).filter((p): p is WorldPerson => !!p);
const REPLIES = ['Trop content de ce Hello mutuel 🙌', 'Haha exactement 😄', 'Raconte-moi plus !', 'On se refait une rencontre bientôt ?', '🌍💛'];

export function WorldProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<WorldProfile>(EMPTY_PROFILE);
  const [hellos, setHellos] = useState<HelloState>(DEFAULT_HELLOS);
  const [threads, setThreads] = useState<Record<string, WorldMsg[]>>({});
  const [unread, setUnread] = useState<Record<string, number>>(() =>
    Object.fromEntries(Object.entries(PREVIEWS).map(([k, v]) => [k, v.unread])),
  );
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((t: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  }, []);

  const add = (xs: string[], id: string) => (xs.includes(id) ? xs : [...xs, id]);
  const del = (xs: string[], id: string) => xs.filter((x) => x !== id);

  const sendMessage = useCallback((id: string, text: string) => {
    const p = findPerson(id);
    if (!p) return;
    setThreads((t) => ({ ...t, [id]: [...(t[id] ?? firstMessages(p)), { id: String(Date.now()), me: true, text }] }));
    setTimeout(() => {
      const reply = REPLIES[Math.floor(Math.random() * REPLIES.length)];
      setThreads((t) => ({ ...t, [id]: [...(t[id] ?? []), { id: String(Date.now() + 1), me: false, text: reply }] }));
    }, 1400);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      profile,
      setProfile,
      resetProfile: () => setProfile(EMPTY_PROFILE),
      hellos,
      pending: people(hellos.pending.filter((id) => !hellos.ignored.includes(id))),
      sent: people(hellos.sent.filter((id) => !hellos.connections.includes(id))),
      connections: people(hellos.connections),
      sendHello: (id) => setHellos((s) => ({ ...s, sent: add(s.sent, id) })),
      cancelHello: (id) => setHellos((s) => ({ ...s, sent: del(s.sent, id) })),
      ignoreHello: (id) => setHellos((s) => ({ ...s, pending: del(s.pending, id), ignored: add(s.ignored, id) })),
      acceptHello: (id) => setHellos((s) => ({ ...s, pending: del(s.pending, id), mutual: add(s.mutual, id) })),
      addConnection: (id) =>
        setHellos((s) => ({ ...s, connections: add(s.connections, id), mutual: del(s.mutual, id), sent: del(s.sent, id), pending: del(s.pending, id) })),
      endMeeting: (id) => setHellos((s) => ({ ...s, mutual: del(s.mutual, id) })),
      resetHellos: () => setHellos(DEFAULT_HELLOS),
      threads,
      unread,
      sendMessage,
      markRead: (id) => setUnread((u) => (u[id] ? { ...u, [id]: 0 } : u)),
      toast,
      showToast,
    }),
    [profile, hellos, threads, unread, sendMessage, toast, showToast],
  );

  return <WorldCtx.Provider value={value}>{children}</WorldCtx.Provider>;
}

export function useWorld() {
  const c = useContext(WorldCtx);
  if (!c) throw new Error('useWorld hors de WorldProvider');
  return c;
}
