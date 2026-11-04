# Zembo

Application mobile native (Expo / React Native), version or de l'expérience « fil vidéo + lives ».

## Ce qu'il y a dedans

- **Accueil** : vidéos verticales plein écran (j'aime, commentaires, partage), onglets Explorer / Suivis / Pour toi, lives.
- **Découvrir, Messages, Profil** : recherche et tendances, boîte de réception et conversations, profil avec grille de vidéos.
- **Zembo Table** : un live autour d'une table de 2 à 8 personnes, avec chat, spectateurs et demandes en attente.
- **Talk Show** : Mic d'Or Thérapie (scène ouverte, file d'attente, 1 ou 3 minutes, mode Paroles façon karaoké) et Micro Ouvert (l'hôte + 4 invités).
- **Lettres d'Or** (nom provisoire) : le jeu des lettres et des chiffres en live. 4 joueurs sur scène, réponses cachées, chrono qui s'arrête quand tout le monde a répondu, révélation, 3 manches (Lettres, Lettres, Chiffres). Pour l'instant : toi contre 3 joueurs simulés.
- **World Room** : profil en 7 étapes, découverte, Hello mutuel, rencontre vidéo de 60 secondes, connexions et messages.

Les données sont encore des exemples (pas de base de données branchée). Play & Fun, Storytime et Stand-Up sont mis de côté pour plus tard.

## Lancer l'app

```bash
npm install
npx expo start
```

Puis scanner le QR code avec l'app Expo Go sur l'iPhone.

## Crédits

La liste de mots de Lettres d'Or (`src/games/words.ts`) vient de [Lexique 3.83](http://www.lexique.org) (New, Pallier et al.), sous licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
