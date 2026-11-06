import { useEffect, useMemo, useState } from 'react';
import type { Post } from '../data/feed';
import { OpenHashtagContext } from './hashtags';
import { HashtagPage } from './HashtagPage';
import { PostActionsContext, soundOf } from './sounds';
import { CreateFlow, SoundPage, type SoundTarget } from './SoundPage';
import type { RecordMode } from './RecordScreen';

// Fournit aux publications affichées (fil, lecteur plein écran) :
// la page d'un hashtag, la page d'un son et le Duo.
export function PostActionsHost({ children, onBusy }: { children: React.ReactNode; onBusy?: (busy: boolean) => void }) {
  const [tag, setTag] = useState<string | null>(null);
  const [sound, setSound] = useState<SoundTarget | null>(null);
  const [duo, setDuo] = useState<RecordMode | null>(null);
  const busy = !!(tag || sound || duo);
  useEffect(() => onBusy?.(busy), [busy, onBusy]);

  const actions = useMemo(
    () => ({
      openSound: (post: Post) => {
        const s = soundOf(post);
        if (s) setSound({ sound: s, origin: s.postId === post.id ? post : undefined });
      },
      startDuo: (post: Post) => {
        if (post.kind !== 'video' || !post.video) return;
        setDuo({
          kind: 'duo',
          duo: { postId: post.id, url: post.video, start: post.edit?.start, pseudo: post.user.handle, uid: post.uid },
          sound: soundOf(post),
        });
      },
    }),
    [],
  );

  return (
    <OpenHashtagContext.Provider value={setTag}>
      <PostActionsContext.Provider value={actions}>
        {children}
        <HashtagPage tag={tag} onClose={() => setTag(null)} />
        <SoundPage target={sound} onClose={() => setSound(null)} />
        <CreateFlow mode={duo} onClose={() => setDuo(null)} />
      </PostActionsContext.Provider>
    </OpenHashtagContext.Provider>
  );
}
