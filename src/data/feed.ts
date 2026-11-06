// Données de démonstration. Plus tard, elles viendront du backend Zembo.
import type { PostEdit } from '../post/edit';

export type User = {
  handle: string;
  name: string;
  avatar: string | number; // URL ou image locale
  verified?: boolean;
};

export type Post = {
  id: string;
  kind: 'video' | 'live' | 'photo';
  video: string;
  /** photo publiée (kind = 'photo') */
  image?: string;
  /** miniature envoyée avec la publication */
  thumb?: string;
  /** auteur (publications réelles) */
  uid?: string;
  createdAt?: number;
  /** montage appliqué à la lecture (coupe, son, musique, textes, filtre) */
  edit?: PostEdit;
  user: User;
  caption: string;
  hashtags: string[];
  sound: string;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  viewers?: number; // pour les LIVE
  liveTitle?: string;
  views?: number; // vues (grilles du profil)
  pinned?: boolean;
};

// Vidéos verticales libres de droits (Mixkit)
export const clip = (id: number) => `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`;
export const avatar = (n: number) => `https://i.pravatar.cc/150?img=${n}`;

export const u = (handle: string, name: string, img: number, verified = false): User => ({
  handle,
  name,
  avatar: avatar(img),
  verified,
});

export const FEED: Post[] = [
  {
    id: 'p1',
    kind: 'video',
    video: clip(1232),
    user: u('aminata.style', 'Aminata', 47, true),
    caption: 'Les néons de la ville ce soir ✨ Qui sort avec moi ?',
    hashtags: ['nightlife', 'zembo', 'pourtoi'],
    sound: 'son original - aminata.style',
    likes: 128400,
    comments: 2318,
    saves: 9120,
    shares: 4210,
  },
  {
    id: 'p2',
    kind: 'video',
    video: clip(39767),
    user: u('kofi_beats', 'Kofi Beats', 12),
    caption: 'Nouveau son en préparation, dites-moi ce que vous en pensez 🎧',
    hashtags: ['musique', 'beatmaker', 'studio'],
    sound: "Lumière d'Or - Kofi Beats",
    likes: 45200,
    comments: 870,
    saves: 2300,
    shares: 1104,
  },
  {
    id: 'live1',
    kind: 'live',
    video: clip(34487),
    user: u('dakar.vibes', 'Dakar Vibes', 33, true),
    caption: 'On discute de tout et de rien, venez !',
    hashtags: ['live', 'discussion'],
    sound: 'LIVE',
    likes: 12400,
    comments: 0,
    saves: 0,
    shares: 312,
    viewers: 2340,
    liveTitle: 'Soirée chill & questions 💛',
  },
  {
    id: 'p3',
    kind: 'video',
    video: clip(34563),
    user: u('lena.danse', 'Léna', 5),
    caption: 'Essayez cette chorégraphie et identifiez-moi 💃',
    hashtags: ['danse', 'challenge', 'zembochallenge'],
    sound: 'Rythme Doré - DJ Sahel',
    likes: 902300,
    comments: 15400,
    saves: 61200,
    shares: 33100,
  },
  {
    id: 'p4',
    kind: 'video',
    video: clip(34404),
    user: u('chef.moussa', 'Chef Moussa', 59, true),
    caption: 'Le secret de ma sauce en 30 secondes 🔥 Partie 1',
    hashtags: ['cuisine', 'recette', 'foodtok'],
    sound: 'son original - chef.moussa',
    likes: 67800,
    comments: 1920,
    saves: 18400,
    shares: 5600,
  },
  {
    id: 'p5',
    kind: 'video',
    video: clip(34421),
    user: u('abidjan.night', 'Abidjan Night', 15),
    caption: 'POV : tu arrives à la soirée et c\'est ton son qui passe',
    hashtags: ['pov', 'soirée', 'humour'],
    sound: 'Ambiance - Les Étoiles',
    likes: 23100,
    comments: 642,
    saves: 1200,
    shares: 890,
  },
  {
    id: 'p6',
    kind: 'video',
    video: clip(34564),
    user: u('sarah.travel', 'Sarah', 44),
    caption: 'Ce coucher de soleil valait le voyage 🌅',
    hashtags: ['voyage', 'travel', 'sunset'],
    sound: 'Horizon - Nala',
    likes: 312000,
    comments: 4100,
    saves: 28700,
    shares: 9900,
  },
  {
    id: 'p7',
    kind: 'video',
    video: clip(34565),
    user: u('yann.fit', 'Yann Fit', 68),
    caption: '5 minutes par jour suffisent. Pas d\'excuses 💪',
    hashtags: ['sport', 'motivation', 'fitness'],
    sound: 'son original - yann.fit',
    likes: 8900,
    comments: 210,
    saves: 1500,
    shares: 140,
  },
  {
    id: 'p8',
    kind: 'video',
    video: clip(39770),
    user: u('mode.awa', 'Awa Mode', 26, true),
    caption: 'Look du jour, doré de la tête aux pieds 👑',
    hashtags: ['mode', 'ootd', 'gold'],
    sound: 'Couronne - Awa',
    likes: 154000,
    comments: 3200,
    saves: 12800,
    shares: 2700,
  },
  {
    id: 'p9',
    kind: 'video',
    video: clip(1234),
    user: u('theo.cine', 'Théo', 53),
    caption: 'Plan séquence improvisé en pleine rue 🎬',
    hashtags: ['cinéma', 'filmmaking'],
    sound: 'Suspense - Théo',
    likes: 4100,
    comments: 98,
    saves: 340,
    shares: 77,
  },
];

// Ordres différents pour les onglets du haut
export const FOLLOWING_FEED: Post[] = [FEED[3], FEED[7], FEED[0], FEED[5]];
export const EXPLORE_FEED: Post[] = [FEED[5], FEED[8], FEED[1], FEED[6], FEED[4]];

// Commentaires de démonstration
const COMMENT_POOL = [
  'Incroyable 😍😍',
  "C'est exactement ce dont j'avais besoin aujourd'hui",
  'Le son est trop bien, il sort quand ?',
  'Je regarde ça en boucle depuis 10 minutes 😂',
  'Partie 2 svp !!',
  "Qui est là en 2026 ? 🙋🏾‍♀️",
  'Trop de talent 🔥🔥🔥',
  'Tu peux faire un tuto ?',
  'Mon algorithme me connaît trop bien',
  "J'ai identifié ma sœur 😭",
  'La qualité de la vidéo 👌🏾',
  'Zembo > tout le reste 💛',
];
const NAMES = ['fatou.k', 'jules_92', 'mariam.b', 'ibra.officiel', 'chloe.lsr', 'oumar.dk', 'nadia_m', 'kev_officiel', 'sofia.rose', 'binta.art', 'leo.trn', 'aicha_d'];
const TIMES = ['2 min', '14 min', '1 h', '3 h', '5 h', '1 j', '2 j', '4 j'];

export type Comment = {
  id: string;
  user: string;
  avatar: string;
  text: string;
  time: string;
  likes: number;
  replies: number;
  byCreator?: boolean;
};

export function commentsFor(post: Post): Comment[] {
  const seed = post.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return Array.from({ length: 14 }, (_, i) => {
    const k = (seed + i * 7) % COMMENT_POOL.length;
    return {
      id: `${post.id}-c${i}`,
      user: NAMES[(seed + i) % NAMES.length],
      avatar: avatar(((seed + i * 3) % 60) + 1),
      text: COMMENT_POOL[k],
      time: TIMES[i % TIMES.length],
      likes: Math.max(0, Math.round((post.likes / 40) / (i + 1))),
      replies: i % 3 === 0 ? (seed % 20) + i : 0,
    };
  });
}

export const CONTACTS = [
  { name: 'Fatou', avatar: avatar(9) },
  { name: 'Jules', avatar: avatar(11) },
  { name: 'Mariam', avatar: avatar(20) },
  { name: 'Ibra', avatar: avatar(14) },
  { name: 'Chloé', avatar: avatar(23) },
  { name: 'Oumar', avatar: avatar(52) },
  { name: 'Nadia', avatar: avatar(38) },
];

// Miniature d'une vidéo Mixkit (même identifiant que la vidéo)
export function thumbOf(post: Post) {
  if (post.thumb) return post.thumb;
  if (post.image) return post.image;
  const id = post.video.match(/videos\/(\d+)\//)?.[1];
  return id ? `https://assets.mixkit.co/videos/${id}/${id}-thumb-360-0.jpg` : post.user.avatar;
}
