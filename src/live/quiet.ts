import { useEffect } from 'react';
import * as Haptics from 'expo-haptics';

// Aperçu silencieux d'un live dans le fil d'accueil : pas de vibrations tant qu'il est à l'écran
// (les jeux vibrent aussi quand les joueurs simulés jouent).

let quiet = 0;

export const hx = {
  notificationAsync: (t?: Haptics.NotificationFeedbackType) => (quiet > 0 ? Promise.resolve() : Haptics.notificationAsync(t)),
  impactAsync: (s?: Haptics.ImpactFeedbackStyle) => (quiet > 0 ? Promise.resolve() : Haptics.impactAsync(s)),
  selectionAsync: () => (quiet > 0 ? Promise.resolve() : Haptics.selectionAsync()),
};

/** Coupe les vibrations tant que le composant qui l'appelle est affiché */
export function useQuiet(on?: boolean) {
  useEffect(() => {
    if (!on) return;
    quiet += 1;
    return () => {
      quiet -= 1;
    };
  }, [on]);
}
