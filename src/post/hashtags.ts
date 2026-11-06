import { createContext, useContext, useEffect, useState } from 'react';
import { collection, documentId, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { EXPLORE_FEED, FEED, FOLLOWING_FEED, type Post } from '../data/feed';
import { toPost } from './posts';

// Hashtags : hashtags/{tag}.count (tenu par le serveur) + publications qui contiennent le hashtag

export type TagCount = { tag: string; count: number };

/** Hashtags qui commencent par `prefix` (les plus utilisés d'abord), ou les tendances si prefix est vide */
export function useTagSuggestions(prefix: string | null) {
  const p = prefix?.toLowerCase() ?? null;
  const [state, setState] = useState<{ p: string; tags: TagCount[] } | null>(null);
  useEffect(() => {
    if (p === null) return;
    const q = p
      ? query(collection(db, 'hashtags'), orderBy(documentId()), where(documentId(), '>=', p), where(documentId(), '<', `${p}`), limit(30))
      : query(collection(db, 'hashtags'), orderBy('count', 'desc'), limit(12));
    return onSnapshot(
      q,
      (s) =>
        setState({
          p,
          tags: s.docs
            .map((d) => ({ tag: d.id, count: Math.max(0, d.data().count ?? 0) }))
            .filter((t) => t.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 8),
        }),
      () => setState({ p, tags: [] }),
    );
  }, [p]);
  return p !== null && state?.p === p ? state.tags : [];
}

/** Nombre de publications pour un hashtag */
export function useTagCount(tag: string | null) {
  const [state, setState] = useState<{ tag: string; n: number } | null>(null);
  useEffect(() => {
    if (!tag) return;
    return onSnapshot(
      query(collection(db, 'hashtags'), where(documentId(), '==', tag), limit(1)),
      (s) => setState({ tag, n: Math.max(0, s.docs[0]?.data().count ?? 0) }),
      () => {},
    );
  }, [tag]);
  return tag && state?.tag === tag ? state.n : 0;
}

const DEMO = [...FEED, ...FOLLOWING_FEED, ...EXPLORE_FEED].filter((p) => p.kind !== 'live');

/** Publications avec ce hashtag : vraies d'abord (plus récentes), puis exemples */
export function useTagPosts(tag: string | null) {
  const [state, setState] = useState<{ tag: string; posts: Post[]; ready: boolean } | null>(null);
  useEffect(() => {
    if (!tag) return;
    return onSnapshot(
      query(collection(db, 'posts'), where('hashtags', 'array-contains', tag), limit(120)),
      (s) =>
        setState({
          tag,
          ready: true,
          posts: s.docs.map((d) => toPost(d.id, d.data())).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
        }),
      () => setState({ tag, posts: [], ready: true }),
    );
  }, [tag]);
  const real = tag && state?.tag === tag ? state.posts : [];
  const seen = new Set<string>();
  const demo = tag ? DEMO.filter((p) => p.hashtags.includes(tag) && !seen.has(p.id) && seen.add(p.id)) : [];
  return { posts: [...real, ...demo], realCount: real.length, ready: !tag || state?.tag === tag };
}

/** Le mot en cours de frappe s'il commence par # (sinon null) */
export function currentTag(text: string) {
  const m = text.match(/#([\p{L}\p{N}_]*)$/u);
  return m ? m[1].toLowerCase() : null;
}

// ── Ouvrir une page hashtag depuis n'importe quelle publication ──
// Chaque écran qui affiche des publications (accueil, lecteur plein écran) fournit cette fonction.
export const OpenHashtagContext = createContext<(tag: string) => void>(() => {});
export const useOpenHashtag = () => useContext(OpenHashtagContext);
