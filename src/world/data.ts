// Zembo Meet : données et règles reprises de zembolounge (src/lib/world-*.ts)

export const DECOR = require('../../assets/world/hello-decor.jpg');
export const GLOBE = require('../../assets/world/globe.png');
// Portraits verticaux (Elena : repo zembolounge ; les autres : Unsplash, licence gratuite)
const ELENA = require('../../assets/world/elena.jpg');
const MOUSSA = require('../../assets/world/moussa.jpg');
const AWA = require('../../assets/world/awa-dakar.jpg');
const CHLOE = require('../../assets/world/chloe.jpg');
const KENJI = require('../../assets/world/kenji.jpg');

const moment = (id: number) => `https://assets.mixkit.co/videos/${id}/${id}-thumb-720-0.jpg`;

export type WorldPerson = {
  id: string;
  name: string;
  age: number;
  flag: string;
  city: string;
  country: string;
  distanceKm: string;
  intent: string;
  quote: string;
  interests: string[];
  sunday: string;
  redFlag: string;
  travel: string;
  photo: number | string; // image locale (require) ou URL
  moments: string[]; // autres photos de la galerie
};

export const PEOPLE: WorldPerson[] = [
  {
    id: 'elena',
    name: 'Elena',
    age: 27,
    flag: '🇬🇷',
    city: 'Santorin',
    country: 'Grèce',
    distanceKm: '7 523',
    intent: '💜 Rencontre sérieuse',
    quote: 'Bonne énergie, belles discussions et grands projets.',
    interests: ['✈️ Voyage', '🍴 Cuisine', '🏋 Fitness', '📷 Photographie', '🧭 Découverte'],
    sunday: 'Plage, bon repas et coucher de soleil',
    redFlag: 'Le manque de communication',
    travel: 'Le Japon',
    photo: ELENA,
    moments: [moment(34564), moment(1232)],
  },
  {
    id: 'moussa',
    name: 'Moussa',
    age: 34,
    flag: '🇨🇮',
    city: 'Abidjan',
    country: "Côte d'Ivoire",
    distanceKm: '8 140',
    intent: '👥 Amitié',
    quote: 'Je crois aux vraies conversations, pas aux petits jeux.',
    interests: ['🎧 Musique', '⚽ Foot', '🍽 Maquis', '🧑‍💻 Tech', '🌍 Voyage'],
    sunday: "Plage + musique jusqu'au coucher du soleil",
    redFlag: 'Le mensonge, même petit',
    travel: 'Zanzibar, sans hésiter',
    photo: MOUSSA,
    moments: [moment(39767), moment(34421)],
  },
  {
    id: 'chloe',
    name: 'Chloé',
    age: 28,
    flag: '🇫🇷',
    city: 'Paris',
    country: 'France',
    distanceKm: '5 512',
    intent: '💬 Discussion',
    quote: 'Curieuse de tout, surtout des gens.',
    interests: ['📚 Lecture', '🎬 Cinéma', '☕ Cafés', '🚲 Vélo', '🖼 Expos'],
    sunday: 'Brunch tardif et marché aux livres',
    redFlag: "Ceux qui n'écoutent jamais",
    travel: 'Un train de nuit vers Lisbonne',
    photo: CHLOE,
    moments: [moment(1234), moment(34565)],
  },
  {
    id: 'awa',
    name: 'Awa',
    age: 26,
    flag: '🇸🇳',
    city: 'Dakar',
    country: 'Sénégal',
    distanceKm: '6 380',
    intent: '❤️ Rencontre sérieuse',
    quote: "La douceur, l'humour et la famille avant tout.",
    interests: ['🌊 Océan', '🍲 Cuisine', '💃 Danse', '🎨 Art', '🧭 Découverte'],
    sunday: 'Thiéboudienne en famille puis Corniche',
    redFlag: 'Le manque de respect envers sa mère',
    travel: 'Bali, pour apprendre à surfer',
    photo: AWA,
    moments: [moment(34563), moment(39770)],
  },
  {
    id: 'kenji',
    name: 'Kenji',
    age: 30,
    flag: '🇯🇵',
    city: 'Tokyo',
    country: 'Japon',
    distanceKm: '10 402',
    intent: '♾ Peu importe',
    quote: 'Un bon ramen et une longue marche, ça suffit à mon bonheur.',
    interests: ['🍜 Ramen', '📷 Photographie', '🎮 Jeux', '🚉 Trains', '🏯 Histoire'],
    sunday: 'Café de quartier puis vélo au bord de la rivière',
    redFlag: "L'impatience",
    travel: 'La Patagonie',
    photo: KENJI,
    moments: [moment(34404), moment(34487)],
  },
];

export const findPerson = (id: string) => PEOPLE.find((p) => p.id === id);
export const thumbOf = (p: WorldPerson) => (typeof p.photo === 'string' ? p.photo.replace('/900?', '/200?') : p.photo);

/** Ces profils répondent Hello en retour (Hello mutuel). */
export const MUTUAL_IDS = ['elena', 'moussa', 'awa'];

/** Profil de découverte Zembo Meet (séparé du compte Zembo). */
export type WorldProfile = {
  username: string;
  completed: boolean;
  photos: string[];
  age: string;
  bio: string;
  answerSunday: string;
  answerRedFlag: string;
  answerEscape: string;
  gender: 'femme' | 'homme' | 'autre' | '';
  orientation: string;
  showAge: boolean;
  country: string;
  city: string;
  languages: string[];
  intentions: string[];
};

export const EMPTY_PROFILE: WorldProfile = {
  username: '',
  completed: false,
  photos: [],
  age: '',
  bio: '',
  answerSunday: '',
  answerRedFlag: '',
  answerEscape: '',
  gender: '',
  orientation: '',
  showAge: true,
  country: 'Canada',
  city: '',
  languages: [],
  intentions: [],
};

// pseudos réservés (la disponibilité réelle est vérifiée dans la base)
export const TAKEN_USERNAMES = ['admin', 'zembo', 'worldroom', 'support', 'moderation'];

export function normalizeUsername(v: string) {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 20);
}

export type UsernameState = 'empty' | 'short' | 'taken' | 'ok';
export function checkUsername(v: string): UsernameState {
  const u = normalizeUsername(v);
  if (!u) return 'empty';
  if (u.length < 3) return 'short';
  return TAKEN_USERNAMES.includes(u) ? 'taken' : 'ok';
}

export function ageNumber(age: string): number | null {
  const n = Number.parseInt(age, 10);
  return Number.isFinite(n) && n >= 18 && n <= 99 ? n : null;
}

export const ORIENTATIONS = ['Hétérosexuel·le', 'Homosexuel·le', 'Bisexuel·le', 'Pansexuel·le', 'Autre', 'Préfère ne pas dire'];
export const COUNTRIES = [
  'Canada',
  'France',
  'Belgique',
  'Suisse',
  'Sénégal',
  "Côte d'Ivoire",
  'Cameroun',
  'Maroc',
  'États-Unis',
  'Royaume-Uni',
  'Espagne',
  'Brésil',
];
export const LANGUAGES = ['Français', 'English', 'Español', 'Português', 'Wolof', 'Arabe', 'Deutsch'];
export const INTENTIONS = [
  { key: 'amitie', icon: '👥', label: 'Amitié' },
  { key: 'discussion', icon: '💬', label: 'Discussion' },
  { key: 'serieuse', icon: '❤️', label: 'Rencontre sérieuse' },
  { key: 'legere', icon: '⚡', label: 'Rencontre sans prise de tête' },
  { key: 'peu-importe', icon: '♾', label: 'Peu importe' },
];
export const intentionLabels = (keys: string[]) =>
  keys.map((k) => INTENTIONS.find((i) => i.key === k)?.label).filter(Boolean) as string[];

export const ICEBREAKERS = [
  '💬 Quel endroit dans le monde rêves-tu de visiter ?',
  "💬 C'est quoi ton plus beau souvenir de voyage ?",
  '💬 Une passion que peu de gens connaissent chez toi ?',
  "💬 Si tu partais demain, tu emmènerais quoi ?",
  '💬 Ton rêve le plus fou, tu le dirais tout haut ?',
];
export const randomIcebreaker = (not?: string) => {
  const pool = ICEBREAKERS.filter((q) => q !== not);
  return pool[Math.floor(Math.random() * pool.length)];
};

export const PREVIEWS: Record<string, { last: string; time: string; unread: number }> = {
  moussa: { last: 'Trop cool cette rencontre !', time: '09:42', unread: 2 },
  elena: { last: 'Hâte de te reparler 😊', time: 'Hier', unread: 1 },
  awa: { last: 'Tu fais quoi ce week-end ?', time: 'Lun', unread: 0 },
  chloe: { last: "Ravie d'avoir discuté !", time: 'Mar', unread: 0 },
  kenji: { last: 'こんにちは 👋', time: 'Mer', unread: 0 },
};
export const HELLO_AGES: Record<string, string> = {
  moussa: 'il y a 12 min',
  awa: 'il y a 2 h',
  elena: 'il y a 1 j',
  chloe: 'il y a 5 h',
  kenji: 'il y a 1 j',
};

/** État des Hellos (même départ que la démo web). */
export type HelloState = {
  pending: string[]; // Hellos reçus en attente
  ignored: string[];
  sent: string[]; // Hellos envoyés en attente
  mutual: string[]; // Hello mutuel : rencontre 60 s possible
  connections: string[]; // connexion mutuelle : messagerie débloquée
};
export const DEFAULT_HELLOS: HelloState = {
  pending: ['moussa', 'awa'],
  ignored: [],
  sent: ['chloe', 'kenji'],
  mutual: [],
  connections: ['elena'],
};

export type WorldMsg = { id: string; me: boolean; text: string };
export function firstMessages(p: WorldPerson): WorldMsg[] {
  const male = p.id === 'moussa' || p.id === 'kenji';
  return [
    { id: '1', me: false, text: `Hello ! Ravi${male ? '' : 'e'} de te retrouver ici 👋` },
    { id: '2', me: true, text: 'Hello ! Nos 60 secondes sont passées trop vite 😄' },
    { id: '3', me: false, text: PREVIEWS[p.id]?.last ?? 'À toi de jouer !' },
  ];
}
