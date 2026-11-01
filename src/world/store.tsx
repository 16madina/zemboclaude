import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { deleteDoc, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useSession } from '../lib/session';
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

// État partagé de World Room. Le profil World est enregistré dans Firestore (worldProfiles/{uid}) ;
// les Hellos, connexions et messages sont encore des données de démonstration.

type Ctx = {
  profile: WorldProfile;
  /** le profil enregistré a fini de charger */
  loaded: boolean;
  setProfile: (p: WorldProfile | ((p: WorldProfile) => WorldProfile)) => void;
  /** enregistre le profil dans la base (pseudo World unique) */
  saveProfile: (p: WorldProfile) => Promise<void>;
  resetProfile: () => Promise<void>;
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
  const { user } = useSession();
  const [profile, setProfile] = useState<WorldProfile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);

  // charge le profil World du compte connecté
  useEffect(() => {
    let active = true;
    setLoaded(false);
    if (!user) {
      setProfile(EMPTY_PROFILE);
      setLoaded(true);
      return;
    }
    getDoc(doc(db, 'worldProfiles', user.uid))
      .then((snap) => {
        if (!active) return;
        setProfile(snap.exists() ? { ...EMPTY_PROFILE, ...(snap.data() as Partial<WorldProfile>) } : EMPTY_PROFILE);
      })
      .catch(() => active && setProfile(EMPTY_PROFILE))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [user]);

  const saveProfile = useCallback(
    async (p: WorldProfile) => {
      if (!user) throw new Error('non-connecte');
      const name = p.username.trim();
      await runTransaction(db, async (tx) => {
        const profRef = doc(db, 'worldProfiles', user.uid);
        const old = await tx.get(profRef);
        const oldName = old.exists() ? (old.data().username as string | undefined) : undefined;
        const nameRef = doc(db, 'worldUsernames', name);
        const owner = await tx.get(nameRef);
        if (owner.exists() && owner.data().uid !== user.uid) throw new Error('pseudo-world-pris');
        if (!owner.exists()) tx.set(nameRef, { uid: user.uid });
        if (oldName && oldName !== name) tx.delete(doc(db, 'worldUsernames', oldName));
        tx.set(profRef, { ...p, username: name, updatedAt: serverTimestamp() });
      });
      setProfile(p);
    },
    [user],
  );

  const resetProfile = useCallback(async () => {
    const name = profile.username;
    setProfile(EMPTY_PROFILE);
    if (!user) return;
    await Promise.allSettled([deleteDoc(doc(db, 'worldProfiles', user.uid)), name ? deleteDoc(doc(db, 'worldUsernames', name)) : Promise.resolve()]);
  }, [user, profile.username]);
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
      loaded,
      setProfile,
      saveProfile,
      resetProfile,
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
    [profile, loaded, saveProfile, resetProfile, hellos, threads, unread, sendMessage, toast, showToast],
  );

  return <WorldCtx.Provider value={value}>{children}</WorldCtx.Provider>;
}

export function useWorld() {
  const c = useContext(WorldCtx);
  if (!c) throw new Error('useWorld hors de WorldProvider');
  return c;
}
