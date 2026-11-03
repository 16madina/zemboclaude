# Ajouter des mélodies à Mic d'Or Thérapie

Les mélodies (« Zembo Sounds ») sont les musiques que les utilisateurs choisissent quand ils demandent le mic.

## 1. Créer le morceau avec Suno

- Utilise un **abonnement payant** (Pro ou Premier) : sur le plan gratuit, Suno interdit l'usage commercial.
- Fais des **instrumentales** (sans voix), pour laisser la place à la personne au mic.
- Deux longueurs possibles : **1 minute** ou **3 minutes** (la règle de la scène).
- Télécharge en **MP3**.

## 2. Mettre le fichier dans le projet

Dépose le MP3 dans le dossier `assets/melodies/`, avec un nom simple, sans espaces ni accents :

```
assets/melodies/renaissance-3min.mp3
```

## 3. L'ajouter au catalogue

Ouvre `src/talk/melodies.ts` et ajoute une ligne dans la liste `MELODIES` :

```ts
{ name: 'Renaissance', mood: 'piano', duration: 3, file: require('../../assets/melodies/renaissance-3min.mp3') },
```

| Champ | Ce qu'il faut mettre |
|---|---|
| `name` | le nom affiché dans l'app |
| `mood` | l'ambiance : `piano`, `guitare`, `lofi`, `emotion`, `melancolique`, `motivante`, `afro` |
| `duration` | `1` ou `3` (minutes) |
| `file` | le chemin du fichier MP3 |

Un morceau **sans** `file` s'affiche quand même, avec « Bientôt » à la place de l'aperçu.

Les trois fichiers `demo-…` sont des mélodies de test générées automatiquement (32 secondes). Tu peux les supprimer quand tes morceaux sont prêts.

## Plus tard

Quand Firebase Storage sera activé, les mélodies pourront être ajoutées depuis un espace admin, sans mettre à jour l'app.
