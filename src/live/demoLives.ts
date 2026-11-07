import type { OnAirLive } from './onair';

// Lives d'exemple affichés dans le fil d'accueil, pour voir à quoi il ressemblera quand des membres
// seront en direct. Ils ouvrent la démonstration de chaque format. À retirer avant le lancement,
// comme les vidéos d'exemple.

const t = Date.now();
const demo = (l: Omit<OnAirLive, 'demo' | 'startedAt' | 'aliveAt' | 'uid'>, minutesAgo: number): OnAirLive => ({
  ...l,
  uid: `demo-${l.room}`,
  demo: true,
  startedAt: t - minutesAgo * 60_000,
  aliveAt: t,
});

export const DEMO_LIVES: OnAirLive[] = [
  demo(
    {
      room: 'demo-table',
      format: 'table',
      title: "L'amour et l'argent : peut-on tout partager ?",
      pseudo: 'aminata.style',
      name: 'Aminata',
      viewers: 1840,
      cover: require('../../assets/create/table.jpg'),
      face: 'https://i.pravatar.cc/150?img=47',
    },
    18,
  ),
  demo(
    {
      room: 'demo-slam',
      format: 'slam',
      title: 'Des mots pour guérir · Je me suis relevée',
      pseudo: 'moussa.slam',
      name: 'Moussa',
      viewers: 1215,
      cover: require('../../assets/talk/slam-stage.jpg'),
      face: require('../../assets/world/moussa.jpg'),
    },
    42,
  ),
  demo(
    {
      room: 'demo-lettres',
      format: 'lettres',
      title: 'Championnat du soir · 4 joueurs sur scène',
      pseudo: 'elena.jeux',
      name: 'Elena',
      viewers: 932,
      cover: require('../../assets/create/lettres.jpg'),
      face: require('../../assets/world/elena.jpg'),
    },
    9,
  ),
  demo(
    {
      room: 'demo-openmic',
      format: 'openmic',
      title: "Amour, amitié ou argent : qu'est-ce qui rend vraiment heureux ?",
      pseudo: 'nadia.talk',
      name: 'Nadia',
      viewers: 325,
      cover: require('../../assets/talk/micro-host.jpg'),
      face: require('../../assets/talk/micro-face.jpg'),
    },
    73,
  ),
  demo(
    {
      room: 'demo-motdor',
      format: 'motdor',
      title: 'Le champion reste sur scène · mots de 6 lettres',
      pseudo: 'kenji.words',
      name: 'Kenji',
      viewers: 604,
      cover: require('../../assets/create/motdor.jpg'),
      face: require('../../assets/world/kenji.jpg'),
    },
    25,
  ),
];

