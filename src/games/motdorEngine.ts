import { isWord } from './engine';
import { SECRETS } from './motdorWords';

// Moteur de « Mot d'Or » : mots à trouver, couleurs des lettres, points et joueurs simulés.

export type Mark = 'ok' | 'near' | 'no';
export type Row = { guess: string; marks: Mark[] };

export const LEVELS = [4, 5, 6, 7, 8, 9];
export const MAX_TRIES = 6;
/** Temps par joueur pour trouver son mot, en secondes (réglable) */
export const TURN_TIME: Record<number, number> = { 4: 60, 5: 75, 6: 90, 7: 105, 8: 120, 9: 135 };
/** Lettres données d'avance : la première, et les deux premières pour 9 lettres */
export const givenCount = (len: number) => (len >= 9 ? 2 : 1);

let pools: Record<number, string[]> | null = null;
export function pool(len: number) {
  if (!pools) {
    pools = {};
    for (const [k, v] of Object.entries(SECRETS)) pools[Number(k)] = v.split(' ');
  }
  return pools[len] ?? [];
}

/** Tire des mots différents, de même longueur, jamais déjà joués dans la partie */
export function pickWords(len: number, count: number, used: Set<string>) {
  const list = pool(len).filter((w) => !used.has(w));
  const out: string[] = [];
  while (out.length < count && list.length) out.push(list.splice(Math.floor(Math.random() * list.length), 1)[0]);
  return out;
}

/**
 * Couleurs d'une proposition. Les lettres répétées sont comptées :
 * si le mot n'a qu'un A et qu'on en propose deux, un seul A peut être coloré.
 */
export function markGuess(guess: string, secret: string): Mark[] {
  const marks: Mark[] = Array(secret.length).fill('no');
  const left: Record<string, number> = {};
  for (let i = 0; i < secret.length; i++) {
    if (guess[i] === secret[i]) marks[i] = 'ok';
    else left[secret[i]] = (left[secret[i]] ?? 0) + 1;
  }
  for (let i = 0; i < secret.length; i++) {
    if (marks[i] === 'ok') continue;
    const c = guess[i];
    if (left[c] > 0) {
      marks[i] = 'near';
      left[c] -= 1;
    }
  }
  return marks;
}

/** Ce que le joueur sait déjà, case par case : lettres données et lettres bien placées */
export function knownLetters(secret: string, rows: Row[]) {
  const known: (string | null)[] = Array(secret.length).fill(null);
  for (let i = 0; i < givenCount(secret.length); i++) known[i] = secret[i];
  for (const r of rows) r.marks.forEach((m, i) => m === 'ok' && (known[i] = r.guess[i]));
  return known;
}

/** Vérifie une proposition avant de la colorer */
export function checkGuess(guess: string, secret: string): string | null {
  if (guess.length !== secret.length) return `Il faut ${secret.length} lettres`;
  const g = givenCount(secret.length);
  if (guess.slice(0, g) !== secret.slice(0, g)) return `Le mot commence par ${secret.slice(0, g)}`;
  if (!isWord(guess) && !pool(secret.length).includes(guess)) return 'Ce mot n’est pas dans le dictionnaire';
  return null;
}

/** Points d'un mot trouvé : longueur × 10, bonus selon les essais, petit bonus de rapidité */
const TRY_BONUS = [0, 30, 25, 20, 15, 10, 5];
export function wordPoints(len: number, tries: number, timeLeftRatio: number) {
  return len * 10 + (TRY_BONUS[tries] ?? 0) + Math.round(Math.max(0, Math.min(1, timeLeftRatio)) * 10);
}

const same = (a: Mark[], b: Mark[]) => a.every((m, i) => m === b[i]);

/**
 * Proposition d'un joueur simulé. Un joueur fort ne propose que des mots compatibles avec
 * toutes les couleurs déjà vues ; un joueur moins sûr se trompe parfois et ne garde que les lettres vertes.
 */
export function botGuess(secret: string, rows: Row[], sharpness: number, canFind = true) {
  const len = secret.length;
  const g = givenCount(len);
  const tried = new Set(rows.map((r) => r.guess));
  // un joueur qui « sèche » sur ce mot ne tombera jamais dessus
  const words = pool(len).filter((w) => w.slice(0, g) === secret.slice(0, g) && !tried.has(w) && (canFind || w !== secret));
  const fits = words.filter((w) => rows.every((r) => same(markGuess(r.guess, w), r.marks)));
  const known = knownLetters(secret, rows);
  const greensOnly = words.filter((w) => known.every((k, i) => !k || w[i] === k));
  const sharp = Math.random() < sharpness;
  const list = sharp && fits.length ? fits : greensOnly.length ? greensOnly : words;
  if (!list.length) return canFind ? secret : null; // plus rien à proposer
  return list[Math.floor(Math.random() * list.length)];
}

/** Chance qu'un joueur simulé trouve son mot : baisse avec la longueur du mot */
export const botFindChance = (skill: number, len: number) => Math.max(0.25, Math.min(0.95, skill - (len - 4) * 0.09));
