import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

// Lives en cours, visibles sur l'accueil.
// - onAir/{salle} : le live (format, titre, hôte), tenu par l'hôte tant que son live est ouvert ;
// - onAir/{salle}/chat : les messages du chat, en temps réel ;
// - onAir/{salle}/viewers/{uid} : qui regarde (le serveur compte les spectateurs).
// L'hôte « signe » toutes les 30 s : un live qui ne signe plus depuis 90 s n'est plus montré
// (téléphone éteint, app fermée de force…).

export type LiveFormat = 'table' | 'slam' | 'openmic' | 'lettres' | 'motdor';

export const FORMAT_LABEL: Record<LiveFormat, string> = {
  table: 'Zembo Table',
  slam: 'Mic d’Or Thérapie',
  openmic: 'Micro Ouvert',
  lettres: 'Lettres d’Or',
  motdor: 'Mot d’Or',
};

export type OnAirLive = {
  room: string;
  uid: string;
  format: LiveFormat;
  title: string;
  pseudo: string;
  name: string;
  viewers: number;
  startedAt: number;
  aliveAt: number;
};

export type LiveChatMsg = { id: string; uid: string; pseudo: string; text: string; at: number };

const BEAT = 30_000;
const STALE = 90_000;

/** Nom de la salle d'un live : format + identifiant de l'hôte (ex. table-abc123) */
export const roomOf = (format: LiveFormat, uid: string) => `${format}-${uid}`;

const ms = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : 0);

function toLive(room: string, d: Record<string, unknown>): OnAirLive {
  return {
    room,
    uid: String(d.uid ?? ''),
    format: (d.format as LiveFormat) ?? 'table',
    title: String(d.title ?? ''),
    pseudo: String(d.pseudo ?? ''),
    name: String(d.name ?? d.pseudo ?? ''),
    viewers: Math.max(0, Number(d.viewers ?? 0)),
    startedAt: ms(d.startedAt),
    aliveAt: ms(d.aliveAt) || Date.now(), // date du serveur pas encore arrivée : c'est tout frais
  };
}

/** Les lives en cours (les plus récents d'abord), en temps réel */
export function useOnAirLives() {
  const [lives, setLives] = useState<OnAirLive[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const since = Timestamp.fromMillis(Date.now() - 6 * 3600_000);
    return onSnapshot(
      query(collection(db, 'onAir'), where('aliveAt', '>', since), orderBy('aliveAt', 'desc'), limit(30)),
      (snap) => setLives(snap.docs.map((s) => toLive(s.id, s.data()))),
      () => {},
    );
  }, []);
  // on revérifie régulièrement les lives qui ne donnent plus signe de vie
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => lives.filter((l) => now - l.aliveAt < STALE).sort((a, b) => b.startedAt - a.startedAt), [lives, now]);
}

/** Un live précis, en temps réel (null quand il est terminé, undefined tant qu'on ne sait pas) */
export function useOnAirLive(room: string | null) {
  const [live, setLive] = useState<OnAirLive | null | undefined>(undefined);
  useEffect(() => {
    if (!room) return;
    setLive(undefined);
    return onSnapshot(
      doc(db, 'onAir', room),
      (s) => setLive(s.exists() ? toLive(s.id, s.data()) : null),
      () => setLive(null),
    );
  }, [room]);
  return live;
}

/** Les derniers messages du chat d'un live, en temps réel */
export function useLiveChatFeed(room: string | null, max = 40) {
  const [msgs, setMsgs] = useState<LiveChatMsg[]>([]);
  useEffect(() => {
    if (!room) return setMsgs([]);
    return onSnapshot(
      query(collection(db, 'onAir', room, 'chat'), orderBy('createdAt', 'desc'), limit(max)),
      (snap) =>
        setMsgs(
          snap.docs
            .map((s) => {
              const d = s.data();
              return { id: s.id, uid: d.uid, pseudo: d.pseudo, text: d.text, at: ms(d.createdAt) || Date.now() };
            })
            .reverse(),
        ),
      () => {},
    );
  }, [room, max]);
  return msgs;
}

/** Envoie un message dans le chat d'un live */
export async function sendLiveMessage(room: string, pseudo: string, text: string) {
  const uid = auth.currentUser?.uid;
  const t = text.trim().slice(0, 200);
  if (!uid || !t) return;
  await addDoc(collection(db, 'onAir', room, 'chat'), { uid, pseudo, text: t, createdAt: serverTimestamp() });
}

/** Je regarde ce live : je compte parmi les spectateurs tant que l'écran est ouvert */
export function useWatching(room: string | null) {
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!room || !uid) return;
    const ref = doc(db, 'onAir', room, 'viewers', uid);
    setDoc(ref, { createdAt: serverTimestamp() }).catch(() => {});
    return () => void deleteDoc(ref).catch(() => {});
  }, [room]);
}

/**
 * Côté hôte : met le live sur l'accueil tant que `active` est vrai, puis l'en retire.
 * Les messages des spectateurs arrivent par `onMessage` (une seule fois chacun), pour les
 * mêler au chat de l'écran du live ; `send` envoie le message de l'hôte à tous.
 */
export function useHostOnAir(
  format: LiveFormat,
  opts: { active: boolean; title: string; pseudo?: string; name?: string; onMessage?: (m: LiveChatMsg) => void },
) {
  const uid = auth.currentUser?.uid ?? null;
  const room = opts.active && uid ? roomOf(format, uid) : null;
  const live = useOnAirLive(room);
  const titleRef = useRef(opts.title);
  titleRef.current = opts.title;

  // mise à l'antenne, signe de vie toutes les 30 s, retrait à la fermeture
  useEffect(() => {
    if (!room || !uid) return;
    const ref = doc(db, 'onAir', room);
    setDoc(ref, {
      uid,
      format,
      title: (titleRef.current || FORMAT_LABEL[format]).slice(0, 80),
      pseudo: opts.pseudo ?? '',
      name: (opts.name || opts.pseudo || '').slice(0, 40),
      startedAt: serverTimestamp(),
      aliveAt: serverTimestamp(),
    }).catch(() => {});
    const t = setInterval(() => updateDoc(ref, { aliveAt: serverTimestamp() }).catch(() => {}), BEAT);
    return () => {
      clearInterval(t);
      void deleteDoc(ref).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // le titre peut changer pendant le live
  useEffect(() => {
    if (!room || !opts.title) return;
    updateDoc(doc(db, 'onAir', room), { title: opts.title.slice(0, 80) }).catch(() => {});
  }, [room, opts.title]);

  // messages des spectateurs (pas les miens : l'écran du live les affiche déjà)
  const msgs = useLiveChatFeed(room, 20);
  const seen = useRef(new Set<string>());
  const started = useRef(0);
  useEffect(() => {
    if (room) started.current = Date.now();
    seen.current = new Set();
  }, [room]);
  const onMessage = useRef(opts.onMessage);
  onMessage.current = opts.onMessage;
  useEffect(() => {
    for (const m of msgs) {
      if (seen.current.has(m.id)) continue;
      seen.current.add(m.id);
      if (m.uid !== uid && m.at >= started.current - 5000) onMessage.current?.(m);
    }
  }, [msgs, uid]);

  const send = (text: string) => {
    if (room) void sendLiveMessage(room, opts.pseudo ?? '', text).catch(() => {});
  };

  return { room, viewers: live?.viewers ?? 0, send };
}
