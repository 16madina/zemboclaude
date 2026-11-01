// Slam Thérapie : données reprises de zembolounge (talk-show.slam-therapie.tsx, lib/zembo-sounds.ts)

import { DEENA_PHOTO } from '../table/data';

export const SLAM_STAGE = require('../../assets/talk/slam-stage.jpg');

export type SlamDuration = 1 | 3;
export type Mood = { id: string; label: string; emoji: string };

export const MOODS: Mood[] = [
  { id: 'piano', label: 'Piano', emoji: '🎹' },
  { id: 'guitare', label: 'Guitare', emoji: '🎸' },
  { id: 'lofi', label: 'Lo-fi', emoji: '🎧' },
  { id: 'emotion', label: 'Émotion', emoji: '〰' },
  { id: 'melancolique', label: 'Mélancolique', emoji: '🌧' },
  { id: 'motivante', label: 'Motivante', emoji: '⚡' },
  { id: 'afro', label: 'Afro douce', emoji: '🥁' },
  { id: 'aucune', label: 'Sans musique', emoji: '🔇' },
];

// « Zembo Sounds » : mélodies de remplacement (les vraies pistes arriveront plus tard)
const NAMES: Record<string, string[]> = {
  piano: ['Renaissance', 'Cicatrices', 'Nouveau départ'],
  guitare: ['Je me relève', 'Racines', 'Douce lumière'],
  lofi: ['Nuit calme', 'Respire', 'Chambre 4'],
  emotion: ['Larmes sèches', 'Silence plein', "Ce que j'ai tu"],
  melancolique: ['Pluie de mars', 'Absence', 'Vieux carnet'],
  motivante: ['Debout', 'Plus fort', 'Ma revanche'],
  afro: ['Sankofa', 'Terre chaude', 'Mama'],
};

export type Sound = { id: string; name: string; mood: string; duration: SlamDuration };

export const soundsFor = (mood: string | null, duration: SlamDuration | null): Sound[] => {
  if (!mood || mood === 'aucune' || !duration) return [];
  return (NAMES[mood] ?? []).map((name) => ({ id: `${mood}-${name}-${duration}`, name, mood, duration }));
};
export const moodOf = (id: string): Mood => MOODS.find((m) => m.id === id) ?? MOODS[0];
export const fmtDur = (d: SlamDuration) => (d === 1 ? '01:00' : '03:00');

export type Slot = {
  id: number;
  name: string;
  title: string;
  mood: string;
  sound: string | null;
  duration: SlamDuration;
  me?: boolean;
};

export const QUEUE0: Slot[] = [
  { id: 1, name: 'Moussa', title: 'Les blessures invisibles', mood: 'piano', sound: 'Renaissance', duration: 3 },
  { id: 2, name: 'Sarah', title: 'Je me suis choisie', mood: 'guitare', sound: 'Racines', duration: 1 },
  { id: 3, name: 'Kevin', title: 'Père absent', mood: 'emotion', sound: 'Silence plein', duration: 3 },
];
export const REQUESTS0: Slot[] = [
  { id: 51, name: 'Aïssatou', title: 'Ma renaissance', mood: 'afro', sound: 'Mama', duration: 1 },
  { id: 52, name: 'Lina', title: "Ce que je n'ai jamais dit", mood: 'melancolique', sound: 'Absence', duration: 3 },
];
export const STAGE0: Slot = { id: 0, name: 'Deena', title: 'Je me suis relevée', mood: 'piano', sound: 'Renaissance', duration: 3 };

export type SlamMsg = { id: number; user: string; text: string; tint: string; me?: boolean };
export const TINTS = ['#E9C46A', '#C9A0F0', '#7FD8A8', '#8DB8F2', '#F28DB2'];
export const CHAT0: SlamMsg[] = [
  { id: 1, user: 'Sarah', text: 'Waaaw 😍 tellement puissant !', tint: TINTS[4] },
  { id: 2, user: 'Kevin', text: "Les mots touchent l'âme 🙏", tint: TINTS[3] },
  { id: 3, user: 'Aïssatou', text: 'Tu as du talent ! 🔥', tint: TINTS[0] },
  { id: 4, user: 'Lina', text: 'Ça me parle énormément… ❤️', tint: TINTS[1] },
  { id: 5, user: 'Yann', text: 'Respect ! 👏', tint: TINTS[2] },
  { id: 6, user: 'Fatou', text: "Zembo c'est une vraie famille 🤍", tint: TINTS[1] },
];
export const AUTO: [string, string][] = [
  ['Momo', 'Cette strophe… 😮‍💨'],
  ['Nadia', "J'ai la chair de poule ✨"],
  ['Ben', 'Vas-y 🔥'],
  ['Leïla', 'Merci pour ces mots 🤍'],
  ['QueenVee', 'On guérit en écoutant 🙏'],
];

export const SLAM_GIFTS = [
  { emoji: '🌹', name: 'Rose', cost: 5 },
  { emoji: '👏', name: 'Applaudissements', cost: 10 },
  { emoji: '🔥', name: 'Flamme', cost: 20 },
  { emoji: '💎', name: 'Diamant', cost: 50 },
  { emoji: '👑', name: 'Couronne', cost: 100 },
  { emoji: '🎤', name: "Micro d'or", cost: 250 },
  { emoji: '🦋', name: 'Papillon', cost: 30 },
  { emoji: '🤍', name: 'Cœur pur', cost: 15 },
  { emoji: '🚀', name: 'Fusée', cost: 500 },
];
export const ZEM_AMOUNTS = [50, 100, 250, 500, 1000, 2500];

// Photo de chaque personne (homme/femme cohérent avec le prénom)
const MOUSSA = require('../../assets/world/moussa.jpg');
const FACES: Record<string, number> = {
  Sarah: 9,
  Lina: 20,
  Aïssatou: 47,
  Fatou: 41,
  Nadia: 38,
  Leïla: 31,
  QueenVee: 23,
  Kevin: 11,
  Yann: 12,
  Momo: 52,
  Ben: 14,
};
export const avatarOf = (name: string, size = 96): number | string => {
  if (name === 'Moussa') return MOUSSA;
  if (name === 'Deena') return DEENA_PHOTO;
  const img = FACES[name];
  return img ? `https://i.pravatar.cc/${size}?img=${img}` : `https://i.pravatar.cc/${size}?u=zembo-${encodeURIComponent(name)}`;
};
