// Données de démonstration de la Zembo Table

export type Seat = {
  n: number; // numéro de place (1 = tête de table)
  name: string | null; // null = place libre
  you?: boolean;
  host?: boolean;
  /** vraie personne (live réel) : identifiant Zembo */
  uid?: string;
  real?: boolean;
  shirt: string; // couleur du haut du joueur en 3D
};

export type TableConfig = { title: string; capacity: 2 | 4 | 6 | 8 };

export const CAPACITIES = [2, 4, 6, 8] as const;
export const DEFAULT_TITLE = "L'amour et l'argent : peut-on tout partager ?";

// Photo de Deena (l'utilisatrice) : la même partout dans l'app
export const DEENA_PHOTO: number = require('../../assets/deena.jpg');

export const photoUrl = (name: string, size = 160): string | number =>
  name === 'Deena' ? DEENA_PHOTO : `https://i.pravatar.cc/${size}?u=zembo-${encodeURIComponent(name)}`;

const SHIRTS = ['#8C6A2E', '#5B2335', '#2F4A3A', '#B9B2A4', '#7A3B1E', '#2C3A55', '#4B3B63', '#6E5A2A'];

// Invités déjà assis au lancement (démo). Toi = hôte, en tête de table.
const GUESTS = ['Sarah', 'Leïla', 'Yann', 'Aïcha', 'Marc', 'Kader', 'Nadia'];

export function initialSeats(capacity: number): Seat[] {
  return Array.from({ length: capacity }, (_, i) => {
    // on laisse une place libre sur les grandes tables pour montrer les demandes
    const free = capacity >= 6 && i === capacity - 2;
    return {
      n: i + 1,
      name: i === 0 ? 'Deena' : free ? null : GUESTS[i - 1],
      you: i === 0,
      host: i === 0,
      shirt: SHIRTS[i % SHIRTS.length],
    };
  });
}

export const QUEUE0 = ['Moussa', 'Karim', 'Emma'];

export const SPECTATORS = [
  'Ben', 'Emma', 'Kader', 'Nadia', 'Ibrahim', 'Awa', 'Fatou', 'Moussa', 'Karim', 'Inès',
  'Salif', 'Chloé', 'Yasmine', 'Diallo', 'Mamadou', 'Céline', 'Ousmane', 'Lina', 'Bakary',
  'Amina', 'Théo', 'Rokia', 'Samir',
];

export type ChatMsg = { id: string; name: string; time: string; text: string; gift?: boolean; system?: boolean; real?: boolean; at?: number };

export const CHAT0: ChatMsg[] = [
  { id: 'c0', name: 'Zembo', time: '', text: 'Bienvenue à la table ! Respect et bienveillance, chacun son tour de parole.', system: true },
  { id: 'c1', name: 'Ben', time: '21:33', text: 'Le sujet du jour est trop bien 🔥' },
  { id: 'c2', name: 'Emma', time: '21:34', text: "Moi je ne mélange jamais l'argent et l'amour." },
  { id: 'c3', name: 'Kader', time: '21:35', text: "On a tous nos limites, et c'est OK." },
];

export const LIVE_LINES = [
  'Grave d’accord 👏🏾',
  'Non mais elle a raison 😂',
  'Sujet trop profond 🔥',
  'Leïla a tout dit',
  'Yann est trop calme ce soir 👀',
  'Faites-moi monter à la table 🙋🏾‍♀️',
  'Cette table est incroyable 💛',
  'Je partage le live à mes amis',
];

export const GIFTS = [
  { name: 'Rose', cost: 5, emoji: '🌹' },
  { name: 'Cœur', cost: 10, emoji: '💛' },
  { name: 'Étoile', cost: 25, emoji: '⭐' },
  { name: 'Flamme', cost: 50, emoji: '🔥' },
  { name: 'Couronne', cost: 99, emoji: '👑' },
  { name: 'Diamant', cost: 199, emoji: '💎' },
];

export const EMOJIS = ['😊', '😂', '🔥', '❤️', '👏🏾', '😮', '🙏🏾', '💯', '👀', '🎉', '😍', '🤔'];

export const REACTIONS = ['💛', '🔥', '👏🏾', '😂', '💯'];

export const now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
