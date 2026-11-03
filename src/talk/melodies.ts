// ─────────────────────────────────────────────────────────────────────────────
// Catalogue des mélodies « Zembo Sounds » de Mic d'Or Thérapie
//
// POUR AJOUTER UN MORCEAU (créé avec Suno) :
//   1. Mets le fichier MP3 dans le dossier  assets/melodies/
//      (nom simple, sans espaces ni accents, ex. : renaissance-3min.mp3)
//   2. Ajoute une ligne dans la liste MELODIES ci-dessous, par exemple :
//      { name: 'Renaissance', mood: 'piano', duration: 3, file: require('../../assets/melodies/renaissance-3min.mp3') },
//
//   mood     = l'ambiance : piano, guitare, lofi, emotion, melancolique, motivante, afro
//   duration = 1 ou 3 (minutes) — c'est la règle de la scène
//   file     = le fichier. Sans « file », le morceau s'affiche mais l'aperçu dit « Bientôt ».
//
// Les 3 fichiers « demo-… » sont des mélodies de test (32 s, jouées en boucle)
// générées en attendant les vrais morceaux. Tu peux les supprimer quand les tiens sont prêts.
// ─────────────────────────────────────────────────────────────────────────────

export type Melody = {
  name: string;
  mood: string;
  duration: 1 | 3;
  file?: number;
};

const DEMO_PIANO = require('../../assets/melodies/demo-renaissance.m4a');
const DEMO_LOFI = require('../../assets/melodies/demo-nuit-calme.m4a');
const DEMO_AFRO = require('../../assets/melodies/demo-mama.m4a');

export const MELODIES: Melody[] = [
  // Piano
  { name: 'Renaissance', mood: 'piano', duration: 1, file: DEMO_PIANO },
  { name: 'Renaissance', mood: 'piano', duration: 3, file: DEMO_PIANO },
  { name: 'Cicatrices', mood: 'piano', duration: 1 },
  { name: 'Cicatrices', mood: 'piano', duration: 3 },
  { name: 'Nouveau départ', mood: 'piano', duration: 3 },
  // Guitare
  { name: 'Je me relève', mood: 'guitare', duration: 1 },
  { name: 'Racines', mood: 'guitare', duration: 1 },
  { name: 'Racines', mood: 'guitare', duration: 3 },
  { name: 'Douce lumière', mood: 'guitare', duration: 3 },
  // Lo-fi
  { name: 'Nuit calme', mood: 'lofi', duration: 1, file: DEMO_LOFI },
  { name: 'Nuit calme', mood: 'lofi', duration: 3, file: DEMO_LOFI },
  { name: 'Respire', mood: 'lofi', duration: 1 },
  { name: 'Chambre 4', mood: 'lofi', duration: 3 },
  // Émotion
  { name: 'Larmes sèches', mood: 'emotion', duration: 1 },
  { name: 'Silence plein', mood: 'emotion', duration: 3 },
  { name: "Ce que j'ai tu", mood: 'emotion', duration: 3 },
  // Mélancolique
  { name: 'Pluie de mars', mood: 'melancolique', duration: 1 },
  { name: 'Absence', mood: 'melancolique', duration: 3 },
  { name: 'Vieux carnet', mood: 'melancolique', duration: 3 },
  // Motivante
  { name: 'Debout', mood: 'motivante', duration: 1 },
  { name: 'Plus fort', mood: 'motivante', duration: 3 },
  { name: 'Ma revanche', mood: 'motivante', duration: 3 },
  // Afro douce
  { name: 'Mama', mood: 'afro', duration: 1, file: DEMO_AFRO },
  { name: 'Mama', mood: 'afro', duration: 3, file: DEMO_AFRO },
  { name: 'Sankofa', mood: 'afro', duration: 1 },
  { name: 'Terre chaude', mood: 'afro', duration: 3 },
];

/** Fichier audio d'un morceau (par son nom), s'il existe */
export function melodyFile(name: string | null | undefined, duration?: 1 | 3): number | undefined {
  if (!name) return undefined;
  const all = MELODIES.filter((m) => m.name === name && m.file);
  return (all.find((m) => m.duration === duration) ?? all[0])?.file;
}
