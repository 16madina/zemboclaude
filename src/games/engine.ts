import { COMMON, RARE } from './words';

// Moteur de « Lettres d'Or » : tirages, dictionnaire, solveurs et joueurs simulés.

// ── Dictionnaire ──
let commonList: string[] | null = null;
let allSet: Set<string> | null = null;
let allList: string[] | null = null;

function dict() {
  if (!allSet || !commonList || !allList) {
    commonList = COMMON.split(' ');
    const rare = RARE.split(' ');
    allList = commonList.concat(rare);
    allSet = new Set(allList);
  }
  return { common: commonList, all: allList, set: allSet };
}

/** Met un mot tapé au format du dictionnaire (majuscules, sans accents) */
export function normWord(w: string) {
  return w
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

export const isWord = (w: string) => dict().set.has(normWord(w));

function counts(letters: string[] | string) {
  const c = new Array(26).fill(0);
  for (const ch of letters) c[ch.charCodeAt(0) - 65] += 1;
  return c;
}

/** Le mot peut-il s'écrire avec les lettres du tirage ? */
export function canMake(word: string, letters: string[]) {
  const c = counts(letters);
  for (const ch of normWord(word)) {
    const i = ch.charCodeAt(0) - 65;
    if (--c[i] < 0) return false;
  }
  return true;
}

/** Tous les mots possibles avec ce tirage, du plus long au plus court */
export function solveLetters(letters: string[]) {
  const base = counts(letters);
  const { common, set } = dict();
  const commonSet = new Set(common);
  const found: string[] = [];
  const c = new Array(26);
  for (const w of set) {
    if (w.length > letters.length) continue;
    for (let k = 0; k < 26; k++) c[k] = base[k];
    let ok = true;
    for (let k = 0; k < w.length; k++) {
      const i = w.charCodeAt(k) - 65;
      if (--c[i] < 0) {
        ok = false;
        break;
      }
    }
    if (ok) found.push(w);
  }
  found.sort((a, b) => b.length - a.length || a.localeCompare(b));
  return { words: found, common: found.filter((w) => commonSet.has(w)) };
}

// ── Tirage des lettres (fréquences proches du français) ──
const VOWELS: [string, number][] = [['A', 9], ['E', 15], ['I', 8], ['O', 6], ['U', 6], ['Y', 0.5]];
const CONSONANTS: [string, number][] = [
  ['B', 2], ['C', 3], ['D', 3], ['F', 2], ['G', 2], ['H', 1.5], ['J', 0.6], ['K', 0.3], ['L', 5], ['M', 3],
  ['N', 6], ['P', 2.5], ['Q', 0.6], ['R', 6], ['S', 6.5], ['T', 6], ['V', 1.8], ['W', 0.2], ['X', 0.5], ['Z', 0.4],
];

function pick(bag: [string, number][]) {
  const total = bag.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [l, w] of bag) if ((r -= w) <= 0) return l;
  return bag[0][0];
}

export const LETTER_COUNT = 10;

/** Tire 10 lettres jouables : 4 ou 5 voyelles, jamais plus de 3 fois la même, et au moins un mot de 7 lettres */
export function drawLetters() {
  for (let tries = 0; tries < 60; tries++) {
    const vowels = Math.random() < 0.5 ? 4 : 5;
    const out: string[] = [];
    while (out.length < LETTER_COUNT) {
      const l = pick(out.length < vowels ? VOWELS : CONSONANTS);
      if (out.filter((x) => x === l).length >= (out.length < vowels ? 3 : 2)) continue;
      out.push(l);
    }
    if (out.includes('Q') && !out.includes('U')) continue;
    // mélange
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    const sol = solveLetters(out);
    if ((sol.words[0]?.length ?? 0) >= 7 && (sol.common[0]?.length ?? 0) >= 6) return { letters: out, solution: sol };
  }
  const letters = 'ERAITSONLE'.split('');
  return { letters, solution: solveLetters(letters) };
}

// ── Le compte est bon ──
export const PLAQUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 25, 50, 75, 100];

export function drawNumbers() {
  const bag = [...PLAQUES];
  const plaques: number[] = [];
  for (let i = 0; i < 6; i++) plaques.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  const target = 101 + Math.floor(Math.random() * 899);
  return { plaques, target };
}

export type Op = '+' | '−' | '×' | '÷';
export const OPS: Op[] = ['+', '−', '×', '÷'];

export function applyOp(a: number, op: Op, b: number): number | null {
  if (op === '+') return a + b;
  if (op === '×') return a * b;
  if (op === '−') return a > b ? a - b : null;
  return b !== 0 && a % b === 0 ? a / b : null;
}

/** Calcule tous les résultats atteignables, avec un chemin de calcul pour chacun */
export function solveNumbers(plaques: number[], target: number) {
  const reach = new Map<number, string[]>();
  const seen = new Set<string>();
  const record = (v: number, steps: string[]) => {
    const cur = reach.get(v);
    if (!cur || cur.length > steps.length) reach.set(v, steps);
  };
  for (const p of plaques) record(p, []);

  const dfs = (nums: number[], steps: string[]) => {
    const key = [...nums].sort((x, y) => x - y).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    for (let i = 0; i < nums.length; i++)
      for (let j = i + 1; j < nums.length; j++) {
        const a = Math.max(nums[i], nums[j]);
        const b = Math.min(nums[i], nums[j]);
        const rest = nums.filter((_, k) => k !== i && k !== j);
        for (const op of OPS) {
          if ((op === '×' || op === '÷') && b === 1) continue;
          const r = applyOp(a, op, b);
          if (r === null || r === 0 || r === b) continue;
          const s = [...steps, `${a} ${op} ${b} = ${r}`];
          record(r, s);
          if (rest.length) dfs([...rest, r], s);
        }
      }
  };
  dfs(plaques, []);

  let best = plaques[0];
  for (const v of reach.keys()) if (Math.abs(v - target) < Math.abs(best - target)) best = v;
  return { best, steps: reach.get(best) ?? [], reach };
}

// ── Joueurs simulés ──
export type BotLevel = { exact: number; slack: number[] };

export const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Le mot d'un joueur simulé : souvent un peu moins long que le meilleur */
export function botWord(sol: { words: string[]; common: string[] }, level: BotLevel) {
  const pool = sol.common.length ? sol.common : sol.words;
  if (!pool.length) return '';
  const best = pool[0].length;
  const k = level.slack[Math.floor(Math.random() * level.slack.length)];
  const len = Math.max(2, best - k);
  const choices = pool.filter((w) => w.length === len);
  const list = choices.length ? choices : pool.filter((w) => w.length <= len);
  return (list.length ? list : pool)[Math.floor(Math.random() * Math.min(12, (list.length ? list : pool).length))];
}

/** Le compte d'un joueur simulé : parfois exact, sinon proche */
export function botCount(reach: Map<number, string[]>, target: number, level: BotLevel) {
  const exact = reach.get(target);
  if (exact && Math.random() < level.exact) return { value: target, steps: exact };
  const k = level.slack[Math.floor(Math.random() * level.slack.length)];
  const gap = 1 + k * 3 + Math.floor(Math.random() * 4);
  const near = [...reach.keys()].filter((v) => v !== target && Math.abs(v - target) >= Math.min(gap, 3) && Math.abs(v - target) <= gap + 6);
  if (!near.length) {
    let best = [...reach.keys()][0];
    for (const v of reach.keys()) if (v !== target && Math.abs(v - target) < Math.abs(best - target)) best = v;
    return { value: best, steps: reach.get(best) ?? [] };
  }
  near.sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
  const v = near[Math.floor(Math.random() * Math.min(3, near.length))];
  return { value: v, steps: reach.get(v) ?? [] };
}
