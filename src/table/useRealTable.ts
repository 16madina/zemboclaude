import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useSession } from '../lib/session';
import { useLiveMedia } from '../live/media';
import { roomOf, sendLiveMessage, useHostOnAir, useLiveChatFeed, useOnAirLive, useWatching } from '../live/onair';
import { useStage } from '../live/stage';
import { auth } from '../lib/firebase';
import { now, type ChatMsg, type Seat, type TableConfig } from './data';
import type { TableLive } from './useTableLive';

const SHIRTS = ['#8C6A2E', '#5B2335', '#2F4A3A', '#B9B2A4', '#7A3B1E', '#2C3A55', '#4B3B63', '#6E5A2A'];
const WELCOME: ChatMsg = { id: 'welcome', name: 'Zembo', time: '', text: 'Bienvenue à la table ! Respect et bienveillance, chacun son tour de parole.', system: true, at: 0 };

/**
 * Zembo Table en vrai : les places, les caméras et les micros sont partagés par tout le monde.
 * - hôte (`hostRoom` absent) : ouvre sa table, la met sur l'accueil, accepte les demandes ;
 * - spectateur (`hostRoom` = la salle de l'hôte) : regarde, demande à monter, parle une fois assis.
 */
export function useRealTable(config: TableConfig, hostRoom?: string): TableLive {
  const { profile } = useSession();
  const me = auth.currentUser?.uid ?? '';
  const isHost = !hostRoom;
  const room = hostRoom ?? (me ? roomOf('table', me) : null);
  const pseudo = profile?.pseudo ?? '';
  const stage = useStage(room, { host: isHost, slots: config.capacity - 1, pseudo, capacity: config.capacity });
  const onAirNow = useOnAirLive(room);

  // côté hôte : la table apparaît sur l'accueil
  const hostAir = useHostOnAir('table', {
    active: isHost,
    title: config.title,
    pseudo,
    name: [profile?.prenom, profile?.nom].filter(Boolean).join(' '),
  });
  // côté spectateur : je compte parmi les spectateurs
  useWatching(isHost ? null : room);

  const [myCam, setMyCam] = useState(true);
  const [myMic, setMyMic] = useState(true);
  const mutedByHost = stage.muted.includes(me);
  const onStage = stage.role === 'host' || stage.role === 'stage';
  const media = useLiveMedia(room, { publish: onStage, camera: myCam, mic: myMic && !mutedByHost, name: pseudo });

  // ── places : l'hôte en tête de table, puis les places de la scène ──
  const seats: Seat[] = useMemo(() => {
    const hostName = stage.names[stage.hostUid] || onAirNow?.pseudo || 'Hôte';
    const head: Seat = { n: 1, name: hostName, uid: stage.hostUid, host: true, you: stage.hostUid === me, real: true, shirt: SHIRTS[0] };
    return [
      head,
      ...stage.stage.map((uid, i) => ({
        n: i + 2,
        name: uid ? stage.names[uid] || 'Invité' : null,
        uid: uid || undefined,
        you: !!uid && uid === me,
        real: true,
        shirt: SHIRTS[(i + 1) % SHIRTS.length],
      })),
    ];
  }, [stage.stage, stage.names, stage.hostUid, me, onAirNow?.pseudo]);

  const speakers = media.speakers();
  const speakingIdx = seats.findIndex((s) => s.uid && (s.you ? speakers.has('me') : speakers.has(s.uid)));

  // ── chat : vrais messages + annonces (arrivées, départs) ──
  const feed = useLiveChatFeed(room, 60);
  const [notes, setNotes] = useState<ChatMsg[]>([]);
  const post = useCallback((m: Omit<ChatMsg, 'id' | 'time'>) => {
    setNotes((n) => [...n.slice(-20), { ...m, id: `n-${Date.now()}-${Math.random()}`, time: now(), at: Date.now() }]);
  }, []);
  const prevStage = useRef<string[] | null>(null);
  useEffect(() => {
    const cur = stage.stage.filter(Boolean);
    const prev = prevStage.current;
    prevStage.current = cur;
    if (!prev) return;
    cur.filter((u) => !prev.includes(u)).forEach((u) => post({ name: stage.names[u] || 'Invité', text: 'a rejoint la table 🎉', system: true }));
    prev.filter((u) => !cur.includes(u)).forEach((u) => post({ name: stage.names[u] || 'Invité', text: 'a quitté la table et rejoint les spectateurs', system: true }));
  }, [stage.stage, stage.names, post]);
  const chat: ChatMsg[] = useMemo(
    () =>
      [
        WELCOME,
        ...feed.map((m) => ({ id: m.id, name: m.pseudo, text: m.text, time: '', real: true, at: m.at })),
        ...notes,
      ].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)),
    [feed, notes],
  );

  const say = useCallback(
    (text: string) => {
      if (room && pseudo) sendLiveMessage(room, pseudo, text).catch(() => {});
    },
    [room, pseudo],
  );

  const seatOf = (n: number) => seats.find((s) => s.n === n);
  const tick = () => Haptics.selectionAsync().catch(() => {});

  const occupied = seats.filter((s) => s.name).length;
  const ended = !isHost && onAirNow === null;
  const status = !room
    ? 'Connecte-toi pour rejoindre la table.'
    : media.status === 'error'
      ? 'Connexion à la vidéo impossible pour le moment.'
      : media.status === 'connecting'
        ? 'Connexion au live…'
        : undefined;

  return {
    config: { title: config.title, capacity: (stage.stage.length + 1) as TableConfig['capacity'] },
    seats,
    queue: stage.requests.map((r) => ({ id: r.uid, name: r.pseudo || 'Invité', real: true })),
    speaking: speakingIdx >= 0 ? speakingIdx : null,
    chat,
    viewers: isHost ? hostAir.viewers : (onAirNow?.viewers ?? 0),
    occupied,
    freeSeats: seats.length - occupied,
    accept: (id) => {
      const r = stage.requests.find((x) => x.uid === id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      stage.accept(id, r?.pseudo ?? 'Invité').catch(() => {});
    },
    decline: (id) => {
      tick();
      stage.decline(id).catch(() => {});
    },
    removeFromTable: (n) => {
      const s = seatOf(n);
      if (!s?.uid || s.host) return;
      tick();
      stage.remove(s.uid).catch(() => {});
    },
    toggleMute: (n) => {
      const s = seatOf(n);
      if (!s?.uid) return;
      tick();
      if (s.you) setMyMic((v) => !v);
      else if (isHost) stage.toggleMute(s.uid).catch(() => {});
    },
    isMuted: (s) => !!s.uid && (stage.muted.includes(s.uid) || (!!s.you && !myMic)),
    say,
    post,
    role: stage.role,
    real: true,
    spectators: null,
    camera: (s) => (!s.uid ? null : s.you ? media.cameraOf('me') : media.cameraOf(s.uid)),
    request: () => {
      tick();
      stage
        .request(pseudo)
        .then(() => post({ name: 'Zembo', text: 'Ta demande est envoyée. L’hôte va te répondre.', system: true }))
        .catch(() => {});
    },
    cancelRequest: () => {
      tick();
      stage.cancelRequest().catch(() => {});
    },
    leave: () => {
      tick();
      stage.leave().catch(() => {});
    },
    myCam,
    toggleCam: () => {
      tick();
      setMyCam((v) => !v);
    },
    flip: () => void media.flipCamera(),
    ended,
    status,
  };
}
