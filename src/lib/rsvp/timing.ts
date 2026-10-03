import { TokenFlag } from '../book/types';
import { stripWrapping } from '../text/tokenizer';

/**
 * Display-time multipliers. A token is shown for `60000 / wpm * multiplier` ms.
 * Punctuation multipliers don't stack; the strongest one applies, then the
 * word-length factor is multiplied on top.
 */
export const TIMING = {
  comma: 1.45,
  semicolon: 1.65,
  colon: 1.6,
  dash: 1.4,
  sentenceEnd: 2.2,
  ellipsis: 2.4,
  paragraphEnd: 2.7,
  heading: 2.2,
  headingEnd: 3.2,
  sectionStart: 1.6,
  number: 1.3,
  /** Words with more letters than this get progressively longer. */
  longWordThreshold: 7,
  longWordPerLetter: 0.05,
  longWordMax: 1.6,
  /** Words read right after pressing play are slower, easing the eye in. */
  rampWords: 5,
  rampStart: 1.9,
  minWpm: 100,
  maxWpm: 1000,
} as const;

export function clampWpm(wpm: number): number {
  return Math.round(Math.min(TIMING.maxWpm, Math.max(TIMING.minWpm, wpm)));
}

export function baseDelay(wpm: number): number {
  return 60000 / clampWpm(wpm);
}

export function punctuationMultiplier(word: string): number {
  const core = word.replace(/[”’"'»›)\]}*]+$/u, '');
  if (/(…|\.\.\.)$/.test(core)) return TIMING.ellipsis;
  if (/[.!?‽]$/.test(core)) return TIMING.sentenceEnd;
  if (/[;]$/.test(core)) return TIMING.semicolon;
  if (/[:]$/.test(core)) return TIMING.colon;
  if (/[—–]$|--$/.test(core)) return TIMING.dash;
  if (/[,]$/.test(core)) return TIMING.comma;
  return 1;
}

export function lengthMultiplier(word: string): number {
  const letters = stripWrapping(word).replace(/[^\p{L}\p{N}]/gu, '').length;
  if (letters <= TIMING.longWordThreshold) return 1;
  return Math.min(TIMING.longWordMax, 1 + (letters - TIMING.longWordThreshold) * TIMING.longWordPerLetter);
}

/** Multiplier for token `i`, independent of WPM. `nextFlags` is the following token's flags (0 at end). */
export function tokenMultiplier(word: string, flags: number, nextFlags: number, isLast: boolean): number {
  let m = punctuationMultiplier(word);
  const paragraphEnd = isLast || (nextFlags & TokenFlag.ParagraphStart) !== 0;
  if (flags & TokenFlag.Heading) m = Math.max(m, paragraphEnd ? TIMING.headingEnd : TIMING.heading);
  else if (paragraphEnd) m = Math.max(m, TIMING.paragraphEnd);
  if (flags & TokenFlag.SectionStart) m = Math.max(m, TIMING.sectionStart);
  if (/^\p{N}/u.test(stripWrapping(word))) m = Math.max(m, TIMING.number);
  return m * lengthMultiplier(word);
}

/** Precompute multipliers and their prefix sums (for exact time-remaining estimates). */
export function computeTimings(words: string[], flags: Uint8Array): { multipliers: Float32Array; prefix: Float64Array } {
  const n = words.length;
  const multipliers = new Float32Array(n);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    multipliers[i] = tokenMultiplier(words[i], flags[i], i + 1 < n ? flags[i + 1] : 0, i === n - 1);
    prefix[i + 1] = prefix[i] + multipliers[i];
  }
  return { multipliers, prefix };
}

/** Extra slow-down for the k-th word after playback (re)starts. */
export function rampMultiplier(k: number): number {
  if (k >= TIMING.rampWords) return 1;
  return 1 + (TIMING.rampStart - 1) * (1 - k / TIMING.rampWords);
}

/** Milliseconds needed to read tokens [from, to) at `wpm`. */
export function remainingMs(prefix: Float64Array, from: number, to: number, wpm: number): number {
  return Math.max(0, prefix[to] - prefix[from]) * baseDelay(wpm);
}
