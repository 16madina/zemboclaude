// Données de démonstration pour Découvrir, Messages et Profil
import { avatar, clip, FEED, u, type Post, type User } from './feed';
import { photoUrl } from '../table/data';

export const ME: User & { bio: string; following: number; followers: number; likes: number } = {
  handle: 'deena.zembo',
  name: 'Deena',
  avatar: photoUrl('Deena', 300),
  verified: true,
  bio: 'Hôte de la Zembo Table 💛\nDébats, rires et vraies conversations · tous les soirs à 21h',
  following: 128,
  followers: 24600,
  likes: 312000,
};

const mine = (id: string, video: number, caption: string, views: number, extra: Partial<Post> = {}): Post => ({
  id,
  kind: 'video',
  video: clip(video),
  user: ME,
  caption,
  hashtags: ['zembotable', 'zembo'],
  sound: 'son original - deena.zembo',
  likes: Math.round(views * 0.11),
  comments: Math.round(views * 0.004),
  saves: Math.round(views * 0.01),
  shares: Math.round(views * 0.003),
  views,
  ...extra,
});

// Vidéos publiées par l'utilisatrice
export const MY_POSTS: Post[] = [
  mine('m1', 34563, 'Le meilleur moment de la Zembo Table d’hier soir 😂', 182000, { pinned: true }),
  mine('m2', 1232, 'Ce soir 21h : « L’amour et l’argent ». Vous serez là ?', 64300),
  mine('m3', 39770, 'Mon look pour animer le live 👑', 41200),
  mine('m4', 34404, 'Les coulisses avant le direct', 12800),
  mine('m5', 34564, 'Petite pause au soleil avant la table de ce soir', 9400),
  mine('m6', 39767, 'Le son qui ouvre chaque Zembo Table 🎧', 23900),
  mine('m7', 34421, 'POV : quelqu’un monte à la table sans micro', 51700),
  mine('m8', 34565, 'On se motive pour la semaine 💪', 7300),
  mine('m9', 1234, 'Merci pour les 20K 🙏🏾💛', 98100),
];

export const LIKED: Post[] = [FEED[3], FEED[0], FEED[7], FEED[5], FEED[1], FEED[6]];
export const SAVED: Post[] = [FEED[4], FEED[8], FEED[5], FEED[7]];

// Découvrir
export const TRENDING_TAGS = ['zembochallenge', 'zembotable', 'danse', 'cuisine', 'mode', 'voyage', 'humour', 'musique'];

export const LIVE_NOW = [
  { name: 'Dakar Vibes', avatar: avatar(33), title: 'Soirée chill & questions', viewers: 2340, table: false },
  { name: 'Aïcha', avatar: photoUrl('Aïcha'), title: 'Zembo Table · Mariage', viewers: 812, table: true },
  { name: 'Kofi Beats', avatar: avatar(12), title: 'Studio en direct', viewers: 530, table: false },
  { name: 'Marc', avatar: photoUrl('Marc'), title: 'Zembo Table · Business', viewers: 1204, table: true },
  { name: 'Léna', avatar: avatar(5), title: 'Cours de danse', viewers: 3120, table: false },
  { name: 'Chef Moussa', avatar: avatar(59), title: 'On cuisine ensemble', viewers: 960, table: false },
];

export const SUGGESTED: (User & { reason: string })[] = [
  { ...u('binta.art', 'Binta', 41, true), reason: 'Suivi par Fatou' },
  { ...u('oumar.dk', 'Oumar', 52), reason: 'Populaire près de toi' },
  { ...u('sofia.rose', 'Sofia', 31), reason: 'Ami·e de Jules' },
  { ...u('leo.trn', 'Léo', 60, true), reason: 'Nouveau sur Zembo' },
  { ...u('mariam.b', 'Mariam', 20), reason: 'Suivi par Nadia' },
];

export const DISCOVER_POSTS: Post[] = [...FEED.filter((p) => p.kind === 'video'), MY_POSTS[0], MY_POSTS[6]];

// Messages
export type ChatItem = { id: string; mine: boolean; text: string; time: string; post?: Post };
export type Conversation = {
  id: string;
  name: string;
  avatar: string;
  online?: boolean;
  unread: number;
  time: string;
  messages: ChatItem[];
};

export const STORIES = [
  { name: 'Fatou', avatar: avatar(9), online: true },
  { name: 'Jules', avatar: avatar(11), online: true },
  { name: 'Mariam', avatar: avatar(20) },
  { name: 'Ibra', avatar: avatar(14), online: true },
  { name: 'Chloé', avatar: avatar(23) },
  { name: 'Oumar', avatar: avatar(52) },
  { name: 'Nadia', avatar: avatar(38), online: true },
];

export const ACTIVITY = [
  { id: 'followers', icon: 'people' as const, title: 'Nouveaux abonnés', sub: 'binta.art a commencé à te suivre', badge: 3 },
  { id: 'activity', icon: 'notifications' as const, title: 'Activité', sub: 'kofi_beats et 12 autres ont aimé ta vidéo', badge: 2 },
  { id: 'system', icon: 'shield-checkmark' as const, title: 'Notifications système', sub: 'Zembo : ta Zembo Table a battu un record 🎉', badge: 0 },
];

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    name: 'Fatou',
    avatar: avatar(9),
    online: true,
    unread: 2,
    time: '2 min',
    messages: [
      { id: '1', mine: false, text: 'Coucou ! Tu fais la Zembo Table ce soir ?', time: '20:41' },
      { id: '2', mine: true, text: 'Oui à 21h, le thème c’est l’amour et l’argent 😄', time: '20:43' },
      { id: '3', mine: false, text: 'Regarde ça, ça va te faire rire', time: '20:45', post: FEED[4] },
      { id: '4', mine: false, text: 'Garde-moi une place à la table 🙏🏾', time: '20:46' },
    ],
  },
  {
    id: 'c2',
    name: 'Jules',
    avatar: avatar(11),
    online: true,
    unread: 1,
    time: '18 min',
    messages: [
      { id: '1', mine: true, text: 'Merci pour hier, c’était top', time: '19:02' },
      { id: '2', mine: false, text: 'Avec plaisir ! On refait ça samedi ?', time: '19:30' },
    ],
  },
  {
    id: 'c3',
    name: 'Mariam',
    avatar: avatar(20),
    unread: 0,
    time: '1 h',
    messages: [
      { id: '1', mine: false, text: 'Ta dernière vidéo est trop belle 😍', time: '18:10' },
      { id: '2', mine: true, text: 'Merci ma belle 💛', time: '18:12' },
    ],
  },
  {
    id: 'c4',
    name: 'Ibra',
    avatar: avatar(14),
    online: true,
    unread: 1,
    time: '3 h',
    messages: [{ id: '1', mine: false, text: 'Je peux être invité à la table demain ?', time: '16:20' }],
  },
  {
    id: 'c5',
    name: 'Chloé',
    avatar: avatar(23),
    unread: 0,
    time: 'hier',
    messages: [
      { id: '1', mine: false, text: 'Tu utilises quel micro pour tes lives ?', time: 'hier' },
      { id: '2', mine: true, text: 'Juste les écouteurs du téléphone haha', time: 'hier' },
    ],
  },
  {
    id: 'c6',
    name: 'Oumar',
    avatar: avatar(52),
    unread: 0,
    time: 'lun.',
    messages: [{ id: '1', mine: true, text: 'À la prochaine !', time: 'lun.' }],
  },
];

export const REPLIES = ['Haha trop bien 😂', 'Grave !', 'Je suis d’accord 💛', 'On en parle ce soir à la table ?', 'Ok ça marche 👍🏾', 'Trop drôle'];
