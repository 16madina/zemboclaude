import { useEffect, useMemo, useState } from 'react';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

// La scène partagée d'un live (Zembo Table, Talk Show) : tout le monde voit la même chose.
// - lives/{salle} : l'hôte, les places (stage : un uid par place, '' = place libre),
//   les pseudos des personnes sur scène, les micros coupés par l'hôte, le passage en cours (perf) ;
// - lives/{salle}/requests/{uid} : les demandes pour monter, en attente de l'hôte.
// Être sur scène donne le droit d'envoyer sa caméra et son micro (le serveur le donne et le retire).

export type StageRole = 'host' | 'stage' | 'requested' | 'viewer';
export type StageRequest = { uid: string; pseudo: string; at: number; slot?: Omit<QueueSlot, 'uid' | 'pseudo'> };
/** Passage sur scène (Mic d'Or Thérapie) : tout le monde suit le même chrono et la même mélodie */
export type Perf = {
  uid: string;
  pseudo: string;
  title: string;
  mood?: string;
  melody?: string | null;
  lyrics?: string | null;
  duration: number;
  /** début du passage (ms) ; 0 = décompte pas encore lancé */
  startAt: number;
};

/** Une personne dans la file d'attente de Mic d'Or Thérapie */
export type QueueSlot = { uid: string; pseudo: string; title: string; mood: string; sound: string | null; duration: 1 | 3; lyrics?: string | null };

type LiveDoc = {
  queue?: QueueSlot[];
  host?: string;
  stage?: string[];
  names?: Record<string, string>;
  muted?: string[];
  capacity?: number;
  perf?: Perf | null;
  since?: Timestamp;
};

const ms = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : 0);

/**
 * `slots` : nombre de places à côté de l'hôte (Table : places - 1, Micro Ouvert : 4, Mic d'Or : 1).
 * Côté hôte, la scène est remise à zéro à l'ouverture.
 */
export function useStage(room: string | null, opts: { host: boolean; slots: number; pseudo?: string; capacity?: number }) {
  const me = auth.currentUser?.uid ?? '';
  const [live, setLive] = useState<LiveDoc | null>(null);
  const [requests, setRequests] = useState<StageRequest[]>([]);
  const [ready, setReady] = useState(false);
  const [hands, setHands] = useState<string[]>([]);

  useEffect(() => {
    if (!room || !me) return;
    return onSnapshot(
      query(collection(db, 'lives', room, 'hands'), orderBy('createdAt', 'asc')),
      (snap) => setHands(snap.docs.map((d) => d.id)),
      () => setHands([]),
    );
  }, [room, me]);

  // l'hôte ouvre (ou rouvre) sa scène : places vides, plus de demandes en attente
  useEffect(() => {
    if (!room || !opts.host || !me) return;
    const ref = doc(db, 'lives', room);
    (async () => {
      await setDoc(
        ref,
        {
          host: me,
          stage: Array(opts.slots).fill(''),
          names: { [me]: opts.pseudo ?? '' },
          muted: [],
          capacity: opts.capacity ?? opts.slots + 1,
          perf: null,
          queue: [],
          since: serverTimestamp(),
        },
        { merge: true },
      );
      const old = [...(await getDocs(collection(db, 'lives', room, 'requests'))).docs, ...(await getDocs(collection(db, 'lives', room, 'hands'))).docs];
      await Promise.all(old.map((d) => deleteDoc(d.ref).catch(() => {})));
    })()
      .catch(() => {})
      .finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, opts.host, me]);

  useEffect(() => {
    if (!room) return;
    return onSnapshot(
      doc(db, 'lives', room),
      (s) => setLive(s.exists() ? (s.data() as LiveDoc) : null),
      () => {},
    );
  }, [room]);

  // l'hôte voit toutes les demandes ; un spectateur voit seulement la sienne
  useEffect(() => {
    if (!room || !me) return;
    if (opts.host) {
      return onSnapshot(
        query(collection(db, 'lives', room, 'requests'), orderBy('createdAt', 'asc')),
        (snap) =>
          setRequests(
            snap.docs.map((d) => ({ uid: d.id, pseudo: String(d.data().pseudo ?? ''), at: ms(d.data().createdAt) || Date.now(), slot: d.data().slot ?? undefined })),
          ),
        () => {},
      );
    }
    return onSnapshot(
      doc(db, 'lives', room, 'requests', me),
      (d) => setRequests(d.exists() ? [{ uid: me, pseudo: String(d.data().pseudo ?? ''), at: ms(d.data().createdAt) || Date.now() }] : []),
      () => setRequests([]),
    );
  }, [room, me, opts.host]);

  const stage = useMemo(() => {
    const s = live?.stage ?? [];
    // l'hôte décide du nombre de places ; les spectateurs suivent la scène telle qu'elle est
    const n = opts.host || !live?.stage ? opts.slots : s.length;
    return Array.from({ length: n }, (_, i) => s[i] ?? '');
  }, [live?.stage, opts.slots, opts.host]);
  const hostUid = live?.host ?? (room ? room.slice(room.indexOf('-') + 1) : '');
  const names = live?.names ?? {};
  const muted = live?.muted ?? [];
  const onStage = !!me && stage.includes(me);
  const requested = !onStage && requests.some((r) => r.uid === me);
  const role: StageRole = opts.host || (me && me === hostUid) ? 'host' : onStage ? 'stage' : requested ? 'requested' : 'viewer';

  const ref = () => doc(db, 'lives', room!);

  /** Demander à monter (spectateur) */
  const request = async (pseudo: string, slot?: Omit<QueueSlot, 'uid' | 'pseudo'>) => {
    if (!room || !me) return;
    await setDoc(doc(db, 'lives', room, 'requests', me), {
      pseudo: pseudo.slice(0, 40),
      createdAt: serverTimestamp(),
      ...(slot ? { slot: { ...slot, title: slot.title.slice(0, 80), lyrics: (slot.lyrics ?? '').slice(0, 3000) || null } } : {}),
    });
  };
  const cancelRequest = async () => {
    if (!room || !me) return;
    await deleteDoc(doc(db, 'lives', room, 'requests', me));
  };

  /** L'hôte fait monter quelqu'un (à la place donnée, sinon à la première place libre) */
  const accept = async (uid: string, pseudo: string, opt: { slot?: number; muted?: boolean } = {}) => {
    if (!room) return false;
    const i = opt.slot !== undefined && stage[opt.slot] === '' ? opt.slot : stage.indexOf('');
    if (i < 0) return false;
    const next = [...stage];
    next[i] = uid;
    await updateDoc(ref(), {
      stage: next,
      [`names.${uid}`]: pseudo.slice(0, 40),
      ...(opt.muted ? { muted: arrayUnion(uid) } : {}),
    });
    await deleteDoc(doc(db, 'lives', room, 'requests', uid)).catch(() => {});
    return true;
  };
  const decline = async (uid: string) => {
    if (!room) return;
    await deleteDoc(doc(db, 'lives', room, 'requests', uid));
  };

  /** L'hôte fait descendre quelqu'un : il redevient spectateur */
  const remove = async (uid: string) => {
    if (!room) return;
    await updateDoc(ref(), { stage: stage.map((x) => (x === uid ? '' : x)), muted: arrayRemove(uid) });
  };

  /** Je descends de la scène */
  const leave = async () => {
    if (!room || !me || !onStage) return;
    await updateDoc(ref(), { stage: stage.map((x) => (x === me ? '' : x)) });
  };

  /** L'hôte coupe (ou rend) le micro de quelqu'un */
  const toggleMute = async (uid: string) => {
    if (!room) return;
    await updateDoc(ref(), { muted: muted.includes(uid) ? arrayRemove(uid) : arrayUnion(uid) });
  };

  /** L'hôte change le passage en cours (Mic d'Or Thérapie) */
  const setPerf = async (perf: Perf | null) => {
    if (!room) return;
    await updateDoc(ref(), { perf });
  };

  // ── file d'attente de Mic d'Or Thérapie (tenue par l'hôte) ──
  const queue = live?.queue ?? [];
  const setQueue = async (q: QueueSlot[]) => {
    if (!room) return;
    await updateDoc(ref(), { queue: q });
  };
  /** L'hôte accepte une demande : la personne entre dans la file */
  const enqueue = async (r: StageRequest) => {
    if (!room || !r.slot) return;
    if (!queue.some((x) => x.uid === r.uid)) await setQueue([...queue, { uid: r.uid, pseudo: r.pseudo, ...r.slot }]);
    await deleteDoc(doc(db, 'lives', room, 'requests', r.uid)).catch(() => {});
  };
  /** Le passage commence (après le décompte) : la personne monte sur scène avec caméra et micro */
  const startPerf = async (s: QueueSlot, countdown: number) => {
    if (!room) return;
    const perf: Perf = { uid: s.uid, pseudo: s.pseudo, title: s.title, mood: s.mood, melody: s.sound, lyrics: s.lyrics ?? null, duration: s.duration, startAt: Date.now() + countdown * 1000 };
    await updateDoc(ref(), { perf, stage: [s.uid], queue: queue.filter((x) => x.uid !== s.uid), [`names.${s.uid}`]: s.pseudo });
  };
  /** Fin du passage : retour en spectateur */
  const endPerf = async () => {
    if (!room) return;
    await updateDoc(ref(), { perf: null, stage: [''] });
  };

  // mains levées des personnes sur scène (Micro Ouvert : « demander à parler »)
  const raiseHand = async (up: boolean) => {
    if (!room || !me) return;
    const h = doc(db, 'lives', room, 'hands', me);
    if (up) await setDoc(h, { createdAt: serverTimestamp() });
    else await deleteDoc(h);
  };
  const lowerHand = async (uid: string) => {
    if (!room) return;
    await deleteDoc(doc(db, 'lives', room, 'hands', uid));
  };

  return {
    ready: opts.host ? ready : !!live,
    hands,
    raiseHand,
    lowerHand,
    exists: live !== null,
    hostUid,
    stage,
    names,
    muted,
    capacity: live?.capacity ?? opts.slots + 1,
    perf: live?.perf ?? null,
    requests,
    me,
    role,
    request,
    cancelRequest,
    accept,
    decline,
    remove,
    leave,
    toggleMute,
    setPerf,
    queue,
    setQueue,
    enqueue,
    startPerf,
    endPerf,
  };
}

export type Stage = ReturnType<typeof useStage>;
