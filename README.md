# Zembo

Application mobile native (Expo / React Native), version or de l'expérience « fil vidéo + lives ».

## Ce qu'il y a dedans

- **Accueil** : vidéos verticales plein écran (j'aime, commentaires, partage), onglets Explorer / Suivis / Pour toi, lives.
- **Découvrir, Messages, Profil** : recherche et tendances, boîte de réception et conversations, profil avec grille de vidéos.
- **Zembo Table** : un live autour d'une table de 2 à 8 personnes, avec chat, spectateurs et demandes en attente.
- **Talk Show** : Mic d'Or Thérapie (scène ouverte, file d'attente, 1 ou 3 minutes, mode Paroles façon karaoké) et Micro Ouvert (l'hôte + 4 invités).
- **Lettres d'Or** (nom provisoire) : le jeu des lettres et des chiffres en live. 4 joueurs sur scène, réponses cachées, chrono qui s'arrête quand tout le monde a répondu, révélation. Deux modes au lancement :
  - **Tournoi** : le dernier descend à chaque tour (4 → 3 → finale à 2), le gagnant prend une couronne et reste, 3 joueurs de la file montent. 5 manches.
  - **Groupe · Championnat** : 12, 16 ou 20 joueurs, tables de 4, points au classement général (4, 3, 2, 1), tables refaites d'après le classement à chaque ronde (système suisse), grande finale à 4. Environ 1 h. Les joueurs qui attendent voient leur table et le temps restant ; ils sont appelés (« Prépare-toi », « Je suis prêt ») avant de monter, sinon ils sont absents (0 point, la table joue à 3).
  Pour l'instant : toi contre des joueurs simulés.
- **Zembo Meet** : profil en 7 étapes, découverte, Hello mutuel, rencontre vidéo de 60 secondes, connexions et messages.

Les données sont encore des exemples (pas de base de données branchée). Play & Fun, Storytime et Stand-Up sont mis de côté pour plus tard.

## Lancer l'app

```bash
npm install
npx expo start
```

Puis scanner le QR code avec l'app Expo Go sur l'iPhone.

## Crédits

La liste de mots de Lettres d'Or (`src/games/words.ts`) vient de [Lexique 3.83](http://www.lexique.org) (New, Pallier et al.), sous licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

- **Mot d'Or** : trouver le mot caché en 6 essais (vert = bien placée, jaune = mal placée, gris = absente). 4 joueurs jouent chacun leur tour, chacun son mot, de 4 à 9 lettres. Ceux qui trouvent passent au niveau suivant, les autres descendent ; le champion reste sur scène et 3 joueurs de la liste d'attente montent (sur invitation de l'hôte). Sons originaux dans `assets/sounds/motdor/`. Pour l'instant : joueurs simulés.

- **Niveaux et entraînement** (les deux jeux) : au lancement, niveau Facile, Difficile ou Expert (Mot d'Or : mots plus ou moins rares et temps ; Lettres d'Or : chrono). Le mode **Entraînement** fait jouer contre l'ordinateur, sans live, avec 4 adversaires différents par niveau (`src/games/bots.ts`). Toucher la case d'un joueur ouvre sa fiche : cadeau, applaudir, profil (`src/games/PlayerSheet.tsx`).

## Caméras et micros (LiveKit)

Les lives utilisent [LiveKit](https://livekit.io) (projet « Zembo Natif ») pour la vidéo en direct.

- `src/live/media.tsx` : connexion à la salle, caméra et micro. Les joueurs sur scène diffusent, les autres regardent. Dans Lettres d'Or, les micros se coupent pendant le chrono.
- `functions/index.js` : fonction Firebase `livekitToken`, qui donne à un membre connecté son code d'accès (sur scène ou spectateur). Les clés LiveKit sont des secrets Firebase (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`), jamais dans l'app.
- Expo Go n'a pas le module vidéo : l'app y marche sans vraie caméra. Pour les vraies caméras, il faut une version installable : `npx eas-cli build --profile development`.

