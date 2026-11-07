import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

// Une partie de jeu à plusieurs (Mot d'Or, Lettres d'Or).
// - Le téléphone de l'hôte est l'arbitre : il fait tourner la partie et publie son état
//   dans lives/{salle}/game/state (lisible par tous les membres, écrit seulement par l'hôte).
// - Chaque joueur envoie ce qu'il fait dans lives/{salle}/moves/{son uid} (lu seulement par l'hôte).
// Les identifiants de joueurs sont les uid Zembo ; « me » ne circule jamais.

/** L'hôte publie l'état de la partie */
export function publishGame(room: string, state: Record<string, unknown>) {
  return setDoc(doc(db, 'lives', room, 'game', 'state'), { ...state, at: serverTimestamp() });
}

/** L'état de la partie, en direct (pour les joueurs et les spectateurs) */
export function useGameState<T>(room: string | null) {
  const [state, setState] = useState<T | null>(null);
  useEffect(() => {
    if (!room) return;
    return onSnapshot(
      doc(db, 'lives', room, 'game', 'state'),
      (s) => setState(s.exists() ? (s.data() as T) : null),
      () => {},
    );
  }, [room]);
  return state;
}

export type Move = { uid: string; seq: number; [k: string]: unknown };

/** Un joueur envoie son action à l'hôte (chaque nouvelle action a un numéro qui augmente) */
export function sendMove(room: string, move: Record<string, unknown>) {
  const uid = auth.currentUser?.uid;
  if (!uid) return Promise.resolve();
  return setDoc(doc(db, 'lives', room, 'moves', uid), { ...move, at: serverTimestamp() });
}

/** Côté hôte : chaque nouvelle action des joueurs, une seule fois */
export function useMoves(room: string | null, onMove: (m: Move) => void) {
  const seen = useRef<Record<string, number>>({});
  const cb = useRef(onMove);
  cb.current = onMove;
  useEffect(() => {
    if (!room) return;
    seen.current = {};
    let first = true;
    return onSnapshot(
      collection(db, 'lives', room, 'moves'),
      (snap) => {
        for (const d of snap.docs) {
          const m = { uid: d.id, ...(d.data() as { seq?: number }) } as Move;
          const seq = Number(m.seq ?? 0);
          // à l'ouverture, on ignore les actions d'une ancienne partie
          if (first || seq <= (seen.current[d.id] ?? -1)) {
            seen.current[d.id] = Math.max(seq, seen.current[d.id] ?? -1);
            continue;
          }
          seen.current[d.id] = seq;
          cb.current(m);
        }
        first = false;
      },
      () => {},
    );
  }, [room]);
}

/** Passe d'un identifiant local (« me » = moi) à un uid partagé, et inversement */
export const toShared = (id: string, myUid: string) => (id === 'me' ? myUid : id);
export const toLocal = (id: string, myUid: string) => (id === myUid ? 'me' : id);
export const mapKeys = <V,>(o: Record<string, V> | undefined, f: (k: string) => string) =>
  Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [f(k), v])) as Record<string, V>;

/**
 * Pour publier un état riche (tables, classements…) : « me » devient l'uid de l'hôte, les photos locales
 * (images de l'app) deviennent null, les Map sont retirées. Le tout part en JSON.
 */
export function shareDeep(v: unknown, uid: string, myName?: string): unknown {
  if (v instanceof Map) return undefined;
  if (Array.isArray(v)) return v.map((x) => shareDeep(x, uid, myName));
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === 'me' && typeof val === 'boolean') continue;
      if (val instanceof Map || val === undefined) continue;
      if (k === 'photo' && typeof val === 'number') {
        o[k] = null;
        continue;
      }
      o[k === 'me' ? uid : k] = shareDeep(val, uid, myName);
    }
    // l'hôte lui-même : une vraie personne, sous son pseudo (et pas « Toi »)
    if ((v as { id?: unknown }).id === 'me') {
      o.real = true;
      if (myName) o.name = myName;
    }
    return o;
  }
  return v === 'me' ? uid : v;
}

/** L'inverse chez un joueur : mon uid redevient « me », les photos manquantes sont retrouvées */
export function unshareDeep(v: unknown, uid: string, photoOf: (id: string, name: string) => number | string): unknown {
  if (Array.isArray(v)) return v.map((x) => unshareDeep(x, uid, photoOf));
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) o[k === uid ? 'me' : k] = unshareDeep(val, uid, photoOf);
    if (o.id === 'me') o.me = true;
    if ('photo' in o && o.photo == null && typeof o.id === 'string') o.photo = photoOf(o.id, String(o.name ?? ''));
    return o;
  }
  return v === uid ? 'me' : v;
}
