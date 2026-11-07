import { useCallback, useEffect, useRef } from 'react';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { mediaAvailable } from '../live/media';

// ── Effets sonores (créés pour Mot d'Or) ──
export const SFX = {
  key: require('../../assets/sounds/motdor/key.wav'),
  ok: require('../../assets/sounds/motdor/ok.wav'),
  near: require('../../assets/sounds/motdor/near.wav'),
  no: require('../../assets/sounds/motdor/no.wav'),
  win: require('../../assets/sounds/motdor/win.wav'),
  fail: require('../../assets/sounds/motdor/fail.wav'),
  turn: require('../../assets/sounds/motdor/turn.wav'),
  tick: require('../../assets/sounds/motdor/tick.wav'),
  bad: require('../../assets/sounds/motdor/bad.wav'),
};
export type Sfx = keyof typeof SFX;
/** Joue un effet sonore (rien quand `on` est faux) */
export function useSfx(on: boolean) {
  const players = useRef<Partial<Record<Sfx, AudioPlayer>>>({});
  const onRef = useRef(on);
  onRef.current = on;
  useEffect(() => {
    if (!mediaAvailable) setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    for (const k of Object.keys(SFX) as Sfx[]) players.current[k] = createAudioPlayer(SFX[k]);
    const all = players.current;
    return () => Object.values(all).forEach((p) => p?.remove());
  }, []);
  return useCallback((k: Sfx) => {
    if (!onRef.current) return;
    const p = players.current[k];
    if (!p) return;
    p.seekTo(0).catch(() => {});
    p.play();
  }, []);
}
