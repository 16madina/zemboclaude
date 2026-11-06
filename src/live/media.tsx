import { useEffect, useReducer, useRef, useState } from 'react';
import { NativeModules, TurboModuleRegistry, type ViewStyle } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { LocalVideoTrack, Participant, Room } from 'livekit-client';
import type { VideoTrackProps } from '@livekit/react-native';
import { app, auth } from '../lib/firebase';

// Caméras et micros des lives (LiveKit).
// La vidéo en direct demande du code natif qu'Expo Go n'a pas : dans Expo Go, l'app marche
// normalement mais sans vraie caméra (on garde les photos). Il faut une version installable
// de l'app (build de développement) pour les vraies caméras.

const hasWebRTC = (() => {
  try {
    return !!(TurboModuleRegistry.get('WebRTCModule') ?? NativeModules.WebRTCModule);
  } catch {
    return false;
  }
})();
export const mediaAvailable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && hasWebRTC;

type RN = typeof import('@livekit/react-native');
type LK = typeof import('livekit-client');
type RTC = typeof import('@livekit/react-native-webrtc');
let rn: RN | null = null;
let lk: LK | null = null;
let rtc: RTC | null = null;
if (mediaAvailable) {
  rn = require('@livekit/react-native') as RN;
  lk = require('livekit-client') as LK;
  rtc = require('@livekit/react-native-webrtc') as RTC;
  rn.registerGlobals();
}

const functions = getFunctions(app, 'europe-west1');
type TokenReply = { url: string; token: string; onStage: boolean; host: boolean };
export type TrackRef = NonNullable<VideoTrackProps['trackRef']>;
export type MediaStatus = 'off' | 'connecting' | 'on' | 'error';

/**
 * Salle vidéo d'un live. Se connecte quand `room` est donné, puis :
 * - `publish` : ta caméra est diffusée (tu es sur scène) ;
 * - `mic` : ton micro est ouvert (coupé pendant le chrono, par exemple).
 */
export function useLiveMedia(room: string | null, opts: { publish: boolean; mic: boolean; name?: string; audio?: boolean; camera?: boolean }) {
  const [status, setStatus] = useState<MediaStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const roomRef = useRef<Room | null>(null);
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const signedIn = !!auth.currentUser;

  useEffect(() => {
    if (!mediaAvailable || !rn || !lk || !room || !signedIn) return;
    const { Room: LKRoom, RoomEvent } = lk;
    const r = new LKRoom({ adaptiveStream: true, dynacast: true });
    roomRef.current = r;
    let alive = true;
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.ParticipantPermissionsChanged,
      RoomEvent.ParticipantNameChanged,
    ];
    events.forEach((e) => r.on(e, refresh));
    setStatus('connecting');
    setError(null);
    (async () => {
      await rn!.AudioSession.startAudioSession();
      const getToken = httpsCallable<{ room: string; name?: string }, TokenReply>(functions, 'livekitToken');
      const { data } = await getToken({ room, name: opts.name });
      if (!alive) return;
      // aperçu muet (fil d'accueil) : on ne reçoit que les images
      const videoOnly = opts.audio === false;
      if (videoOnly) {
        r.on(RoomEvent.TrackPublished, (pub) => {
          if (pub.kind === lk!.Track.Kind.Video) pub.setSubscribed(true);
        });
      }
      await r.connect(data.url, data.token, { autoSubscribe: !videoOnly });
      if (!alive) return;
      if (videoOnly) {
        r.remoteParticipants.forEach((p) =>
          p.trackPublications.forEach((pub) => {
            if (pub.kind === lk!.Track.Kind.Video) pub.setSubscribed(true);
          }),
        );
      }
      setStatus('on');
    })().catch((e: unknown) => {
      if (!alive) return;
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      alive = false;
      events.forEach((e) => r.off(e, refresh));
      void r.disconnect();
      roomRef.current = null;
      void rn!.AudioSession.stopAudioSession();
      setStatus('off');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, signedIn]);

  // caméra et micro suivent ta place : sur scène ou non, chrono en cours ou non
  // (quand l'hôte fait monter quelqu'un, le serveur lui donne le droit d'envoyer : on réessaie alors)
  const canPublish = status === 'on' && !!roomRef.current?.localParticipant.permissions?.canPublish;
  useEffect(() => {
    const r = roomRef.current;
    if (status !== 'on' || !r) return;
    const can = !!r.localParticipant.permissions?.canPublish;
    r.localParticipant.setCameraEnabled(can && opts.publish && opts.camera !== false).catch(() => {});
    r.localParticipant.setMicrophoneEnabled(can && opts.publish && opts.mic).catch(() => {});
  }, [status, canPublish, opts.publish, opts.mic, opts.camera]);

  /** Identifiants des personnes qui parlent en ce moment ('me' pour toi) */
  const speakers = (): Set<string> => {
    const r = roomRef.current;
    const out = new Set<string>();
    if (!r || status !== 'on') return out;
    for (const p of r.activeSpeakers) out.add(p === r.localParticipant ? 'me' : p.identity);
    return out;
  };

  /** La caméra d'un joueur ('me' pour toi, sinon son identifiant Zembo), ou null */
  const cameraOf = (who: string): TrackRef | null => {
    const r = roomRef.current;
    if (!lk || !r || status !== 'on') return null;
    const p: Participant | undefined = who === 'me' ? r.localParticipant : r.remoteParticipants.get(who);
    const pub = p?.getTrackPublication(lk.Track.Source.Camera);
    if (!p || !pub?.track || pub.isMuted) return null;
    return { participant: p, publication: pub, source: lk.Track.Source.Camera } as TrackRef;
  };

  /** Toutes les caméras allumées des autres personnes de la salle (pour les spectateurs) */
  const cameras = (): { id: string; name: string; track: TrackRef }[] => {
    const r = roomRef.current;
    if (!lk || !r || status !== 'on') return [];
    const out: { id: string; name: string; track: TrackRef }[] = [];
    r.remoteParticipants.forEach((p) => {
      const pub = p.getTrackPublication(lk!.Track.Source.Camera);
      if (pub?.track && !pub.isMuted) {
        out.push({ id: p.identity, name: p.name || '', track: { participant: p, publication: pub, source: lk!.Track.Source.Camera } as TrackRef });
      }
    });
    return out;
  };

  /** Passe de la caméra avant à la caméra arrière (et inversement) */
  const flipCamera = async () => {
    const r = roomRef.current;
    if (!lk || !r) return;
    const track = r.localParticipant.getTrackPublication(lk.Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    if (!track) return;
    const next = facing === 'user' ? 'environment' : 'user';
    try {
      await track.restartTrack({ facingMode: next });
      setFacing(next);
    } catch {
      // caméra indisponible : on garde la même
    }
  };

  return { status, error, cameraOf, cameras, speakers, flipCamera, facing };
}

/** Image d'une caméra du live (rien si elle n'est pas disponible) */
export function CameraFeed({ trackRef, mirror, style }: { trackRef: TrackRef | null; mirror?: boolean; style?: ViewStyle }) {
  if (!rn || !trackRef) return null;
  const Video = rn.VideoTrack;
  return <Video trackRef={trackRef} style={style} objectFit="cover" mirror={mirror} />;
}

/** Aperçu de ta caméra avant de monter sur scène, sans la diffuser */
export function CameraPreview({ active, style }: { active: boolean; style?: ViewStyle }) {
  const [track, setTrack] = useState<LocalVideoTrack | null>(null);
  useEffect(() => {
    if (!active || !lk) return;
    let alive = true;
    let t: LocalVideoTrack | null = null;
    lk
      .createLocalVideoTrack({ facingMode: 'user' })
      .then((v) => {
        if (!alive) return v.stop();
        t = v;
        setTrack(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
      t?.stop();
      setTrack(null);
    };
  }, [active]);
  const url = (track?.mediaStream as unknown as { toURL?: () => string } | undefined)?.toURL?.();
  if (!rtc || !url) return null;
  const View = rtc.RTCView;
  return <View streamURL={url} style={style} objectFit="cover" mirror />;
}
