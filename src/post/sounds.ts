import { createContext, useContext, useEffect, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Post } from '../data/feed';
import { toPost } from './posts';
import { trackOf } from './edit';

// Sons : chaque vidéo a un son (son propre son, une musique Zembo, ou un son repris d'une autre vidéo).
// « Utiliser ce son » : la nouvelle vidéo joue ce son à la place du sien.
// soundId : « post:{id} » (son original d'une vidéo) ou « track:{id} » (musique Zembo).

export type SoundRef = {
  id: string;
  title: string;
  /** son original d'une vidéo : son lien (le son est lu depuis la vidéo) */
  url?: string;
  /** à partir de quelle seconde (vidéo coupée) */
  start?: number;
  /** musique Zembo */
  trackId?: string;
  postId?: string;
  uid?: string;
  pseudo?: string;
  /** image du son (miniature de la vidéo d'origine) */
  cover?: string;
};

export type DuoRef = { postId: string; url: string; start?: number; pseudo: string; uid?: string };

/** Le son d'une publication (null pour une photo sans musique) */
export function soundOf(post: Post): SoundRef | null {
  if (post.soundRef) return post.soundRef;
  const track = trackOf(post.edit?.music?.id);
  if (track) return { id: `track:${track.id}`, title: `${track.name} · Zembo`, trackId: track.id };
  if (post.kind !== 'video' || !post.video) return null;
  return {
    id: `post:${post.id}`,
    title: `son original - ${post.user.handle}`,
    url: post.video,
    start: post.edit?.start,
    postId: post.id,
    uid: post.uid,
    pseudo: post.user.handle,
    cover: post.thumb,
  };
}

/** Vidéos faites avec ce son : la vidéo d'origine d'abord, puis les plus récentes */
export function useSoundPosts(sound: SoundRef | null, origin?: Post | null) {
  const id = sound?.id ?? null;
  const [state, setState] = useState<{ id: string; posts: Post[]; root: Post | null; ready: boolean } | null>(null);
  useEffect(() => {
    if (!id) return;
    let root: Post | null = origin && `post:${origin.id}` === id ? origin : null;
    let others: Post[] = [];
    const push = (ready: boolean) => setState({ id, posts: others, root, ready });
    // la vidéo d'origine (si c'est une vraie publication)
    if (!root && id.startsWith('post:')) {
      getDoc(doc(db, 'posts', id.slice(5)))
        .then((s) => {
          if (s.exists()) {
            root = toPost(s.id, s.data());
            push(true);
          }
        })
        .catch(() => {});
    }
    return onSnapshot(
      query(collection(db, 'posts'), where('soundId', '==', id), limit(120)),
      (s) => {
        others = s.docs.map((d) => toPost(d.id, d.data())).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        push(true);
      },
      () => push(true),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!id || state?.id !== id) return { posts: origin ? [origin] : [], ready: false };
  const list = state.root ? [state.root, ...state.posts.filter((p) => p.id !== state.root!.id)] : state.posts;
  return { posts: list, ready: state.ready };
}

// ── Actions sur une publication (page d'un son, Duo), fournies par l'écran qui affiche le fil ──

export type PostActions = { openSound: (post: Post) => void; startDuo: (post: Post) => void };
export const PostActionsContext = createContext<PostActions>({ openSound: () => {}, startDuo: () => {} });
export const usePostActions = () => useContext(PostActionsContext);
