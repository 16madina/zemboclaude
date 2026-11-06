import { faceOf } from '../talk/LiveKit';
import { findPerson } from '../world/data';
import type { BotLevel } from './engine';
import type { Level } from './motdorEngine';

// Adversaires de l'ordinateur pour le mode Entraînement (Lettres d'Or et Mot d'Or) :
// 4 joueurs différents par niveau, du plus détendu au plus redoutable.

export type Bot = {
  id: string;
  name: string;
  photo: number | string;
  about: string;
  /** Mot d'Or : chance de trouver son mot et justesse des propositions */
  skill: number;
  /** Lettres d'Or : précision au compte est bon et longueur des mots trouvés */
  letters: BotLevel;
};

const world = (id: string) => findPerson(id)?.photo;

const FACILE: BotLevel = { exact: 0.2, slack: [1, 2, 2, 3, 4] };
const DIFFICILE: BotLevel = { exact: 0.45, slack: [0, 1, 1, 2] };
const EXPERT: BotLevel = { exact: 0.75, slack: [0, 0, 0, 1] };

export const BOTS: Record<Level, Bot[]> = {
  facile: [
    { id: 'bot-awa', name: 'Awa', photo: world('awa') ?? faceOf('Awa', 300), about: 'Dakar · joue pour le plaisir', skill: 0.62, letters: FACILE },
    { id: 'bot-chloe', name: 'Chloé', photo: world('chloe') ?? faceOf('Chloé', 300), about: 'Paris · débute aux jeux de mots', skill: 0.6, letters: FACILE },
    { id: 'bot-tom', name: 'Tom', photo: faceOf('Tom', 300), about: 'Lyon · aime les mots courts', skill: 0.58, letters: FACILE },
    { id: 'bot-bintou', name: 'Bintou', photo: faceOf('Bintou', 300), about: 'Bamako · toujours de bonne humeur', skill: 0.64, letters: FACILE },
  ],
  difficile: [
    { id: 'bot-moussa', name: 'Moussa', photo: world('moussa') ?? faceOf('Moussa', 300), about: 'Abidjan · fan de Scrabble', skill: 0.84, letters: DIFFICILE },
    { id: 'bot-elena', name: 'Elena', photo: world('elena') ?? faceOf('Elena', 300), about: 'Santorin · joue chaque soir', skill: 0.82, letters: DIFFICILE },
    { id: 'bot-karim', name: 'Karim', photo: faceOf('Karim', 300), about: 'Marseille · calcule vite', skill: 0.86, letters: DIFFICILE },
    { id: 'bot-sophie', name: 'Sophie', photo: faceOf('Sophie', 300), about: 'Montréal · professeure de français', skill: 0.85, letters: DIFFICILE },
  ],
  expert: [
    { id: 'bot-kenji', name: 'Kenji', photo: world('kenji') ?? faceOf('Kenji', 300), about: 'Tokyo · champion de calcul mental', skill: 1.02, letters: EXPERT },
    { id: 'bot-aissatou', name: 'Aïssatou', photo: faceOf('Aïssatou', 300), about: 'Conakry · connaît tout le dictionnaire', skill: 1.0, letters: EXPERT },
    { id: 'bot-elias', name: 'Elias', photo: faceOf('Elias', 300), about: 'Bruxelles · ancien finaliste', skill: 1.04, letters: EXPERT },
    { id: 'bot-vanessa', name: 'Vanessa', photo: faceOf('QueenVee', 300), about: 'Douala · ne rate jamais un mot', skill: 1.0, letters: EXPERT },
  ],
};

export const LEVEL_INFO: Record<Level, { emoji: string; text: string }> = {
  facile: { emoji: '🌱', text: 'Mots très courants, plus de temps.' },
  difficile: { emoji: '🔥', text: 'Mots courants, temps normal.' },
  expert: { emoji: '👑', text: 'Mots rares, moins de temps.' },
};
