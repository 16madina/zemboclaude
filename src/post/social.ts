import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Post } from '../data/feed';
import { toPost } from './posts';

// Réactions des membres sur les publications :
// - j'aime : posts/{id}/likes/{uid} + users/{uid}/likes/{id}
// - enregistrer : users/{uid}/saved/{id}
// - commentaires : posts/{id}/comments/{cid}
// - abonnements : users/{cible}/followers/{moi} + users/{moi}/following/{cible}
// Les compteurs sont tenus par le serveur (functions/index.js).

/** Vrai si le document existe, en temps réel (null tant qu'on ne sait pas) */
function useExists(path: string | null) {
  const [state, setState] = useState<{ path: string; on: boolean } | null>(null);
  useEffect(() => {
    if (!path) return;
    return onSnapshot(
      doc(db, path),
      (s) => setState({ path, on: s.exists() }),
      () => setState({ path, on: false }),
    );
  }, [path]);
  return path && state?.path === path ? state.on : false;
}

// ── J'aime ──

export function useLiked(me: string | null | undefined, post: Post) {
  return useExists(me && post.uid ? `posts/${post.id}/likes/${me}` : null);
}

export async function setLike(me: string, postId: string, on: boolean) {
  const b = writeBatch(db);
  const a = doc(db, 'posts', postId, 'likes', me);
  const mine = doc(db, 'users', me, 'likes', postId);
  if (on) {
    b.set(a, { createdAt: serverTimestamp() });
    b.set(mine, { createdAt: serverTimestamp() });
  } else {
    b.delete(a);
    b.delete(mine);
  }
  await b.commit();
}

// ── Enregistrer ──

export function useSaved(me: string | null | undefined, post: Post) {
  return useExists(me && post.uid ? `users/${me}/saved/${post.id}` : null);
}

export async function setSaved(me: string, postId: string, on: boolean) {
  const ref = doc(db, 'users', me, 'saved', postId);
  if (on) {
    const b = writeBatch(db);
    b.set(ref, { createdAt: serverTimestamp() });
    await b.commit();
  } else await deleteDoc(ref);
}

// ── Abonnements ──

export function useFollows(me: string | null | undefined, target: string | null | undefined) {
  return useExists(me && target && me !== target ? `users/${me}/following/${target}` : null);
}

export async function setFollow(me: string, target: string, on: boolean) {
  if (me === target) return;
  const b = writeBatch(db);
  const theirs = doc(db, 'users', target, 'followers', me);
  const mine = doc(db, 'users', me, 'following', target);
  if (on) {
    b.set(theirs, { createdAt: serverTimestamp() });
    b.set(mine, { createdAt: serverTimestamp() });
  } else {
    b.delete(theirs);
    b.delete(mine);
  }
  await b.commit();
}

/** Les ids d'une sous-collection de users/{uid} (following, likes, saved), plus récents d'abord */
function useIdList(uid: string | null | undefined, sub: 'following' | 'likes' | 'saved') {
  const [state, setState] = useState<{ uid: string; ids: string[] } | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'users', uid, sub), orderBy('createdAt', 'desc'), limit(300)),
      (s) => setState({ uid, ids: s.docs.map((d) => d.id) }),
      () => setState({ uid, ids: [] }),
    );
  }, [uid, sub]);
  return useMemo(() => (uid && state?.uid === uid ? state.ids : []), [uid, state]);
}

export const useFollowingIds = (me: string | null | undefined) => useIdList(me, 'following');

/** Statistiques publiques d'un membre (tenues par le serveur) */
export type Stats = { followers: number; following: number; likes: number };
export function useStats(uid: string | null | undefined): Stats {
  const [state, setState] = useState<{ uid: string; s: Stats } | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'profiles', uid),
      (snap) => {
        const d = snap.data() ?? {};
        setState({ uid, s: { followers: Math.max(0, d.followers ?? 0), following: Math.max(0, d.following ?? 0), likes: Math.max(0, d.likes ?? 0) } });
      },
      () => {},
    );
  }, [uid]);
  return uid && state?.uid === uid ? state.s : { followers: 0, following: 0, likes: 0 };
}

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Publications dont l'id ou l'auteur est dans la liste (paquets de 30, limite de Firestore) */
function usePostsWhere(field: 'id' | 'uid', values: string[], keepOrder: boolean) {
  const key = values.join(',');
  const [state, setState] = useState<{ key: string; posts: Post[] } | null>(null);
  useEffect(() => {
    if (!values.length) return;
    const parts = chunks(values, 30);
    const found: Record<number, Post[]> = {};
    const push = () => {
      const all = Object.values(found).flat();
      if (keepOrder) {
        const at = new Map(values.map((v, i) => [v, i]));
        all.sort((a, b) => (at.get(field === 'id' ? a.id : a.uid ?? '') ?? 0) - (at.get(field === 'id' ? b.id : b.uid ?? '') ?? 0));
      } else all.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setState({ key, posts: all });
    };
    const offs = parts.map((part, i) =>
      onSnapshot(
        query(collection(db, 'posts'), where(field === 'id' ? documentId() : 'uid', 'in', part), limit(field === 'id' ? 30 : 60)),
        (s) => {
          found[i] = s.docs.map((d) => toPost(d.id, d.data()));
          push();
        },
        () => {},
      ),
    );
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, field, keepOrder]);
  return values.length && state?.key === key ? state.posts : [];
}

/** Fil « Suivis » : publications des membres que je suis */
export function useFollowingFeed(me: string | null | undefined) {
  const ids = useFollowingIds(me);
  return usePostsWhere('uid', ids, false);
}

/** Onglets du profil : publications que j'ai aimées / enregistrées */
export function useMyLikedPosts(me: string | null | undefined) {
  return usePostsWhere('id', useIdList(me, 'likes'), true);
}
export function useMySavedPosts(me: string | null | undefined) {
  return usePostsWhere('id', useIdList(me, 'saved'), true);
}

// ── Commentaires ──

export type RealComment = { id: string; uid: string; pseudo: string; name: string; text: string; createdAt: number };

export function useComments(post: Post | null) {
  const postId = post?.uid ? post.id : null;
  const [state, setState] = useState<{ postId: string; items: RealComment[]; ready: boolean } | null>(null);
  useEffect(() => {
    if (!postId) return;
    return onSnapshot(
      query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'desc'), limit(200)),
      (s) =>
        setState({
          postId,
          ready: true,
          items: s.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              uid: x.uid,
              pseudo: x.pseudo ?? '',
              name: x.name ?? '',
              text: x.text ?? '',
              createdAt: x.createdAt?.toMillis?.() ?? Date.now(),
            };
          }),
        }),
      () => setState({ postId, items: [], ready: true }),
    );
  }, [postId]);
  return postId && state?.postId === postId ? state : { items: [] as RealComment[], ready: !postId };
}

export async function addComment(postId: string, me: { uid: string; pseudo: string; name: string }, text: string) {
  await addDoc(collection(db, 'posts', postId, 'comments'), {
    uid: me.uid,
    pseudo: me.pseudo,
    name: me.name,
    text: text.trim().slice(0, 500),
    createdAt: serverTimestamp(),
  });
}

export function deleteComment(postId: string, cid: string) {
  return deleteDoc(doc(db, 'posts', postId, 'comments', cid));
}

/** « à l'instant », « 5 min », « 3 h », « 2 j », « 12/10 » */
export function ago(ms: number) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} j`;
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
