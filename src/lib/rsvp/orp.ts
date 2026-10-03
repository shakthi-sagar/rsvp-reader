/**
 * Optimal Recognition Point.
 *
 * The eye recognises a word fastest when fixating slightly left of its centre.
 * This uses the widely used Spritz-style table keyed on the length of the
 * word's letters (leading/trailing punctuation is ignored for the length, and
 * leading punctuation is skipped when placing the pivot).
 */

const LETTER = /[\p{L}\p{N}]/u;

export function orpOffset(letterCount: number): number {
  if (letterCount <= 1) return 0;
  if (letterCount <= 5) return 1;
  if (letterCount <= 9) return 2;
  if (letterCount <= 13) return 3;
  return 4;
}

export interface OrpParts {
  left: string;
  pivot: string;
  right: string;
}

/** Split a display word into LEFT | PIVOT | RIGHT. Works on code points, not UTF-16 units. */
export function splitOrp(word: string): OrpParts {
  const chars = Array.from(word);
  if (chars.length === 0) return { left: '', pivot: '', right: '' };

  let first = 0;
  while (first < chars.length && !LETTER.test(chars[first])) first++;
  if (first === chars.length) {
    // Pure punctuation / symbols: pivot on the middle character.
    const mid = Math.floor((chars.length - 1) / 2);
    return { left: chars.slice(0, mid).join(''), pivot: chars[mid], right: chars.slice(mid + 1).join('') };
  }
  let last = chars.length - 1;
  while (last > first && !LETTER.test(chars[last])) last--;

  const core = last - first + 1;
  const idx = Math.min(first + orpOffset(core), last);
  return {
    left: chars.slice(0, idx).join(''),
    pivot: chars[idx],
    right: chars.slice(idx + 1).join(''),
  };
}
