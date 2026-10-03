import { TokenFlag, type TextBlock } from '../book/types';

/**
 * Turns extracted text blocks into RSVP tokens.
 *
 * Pure and DOM-free so it can run in a Web Worker and be unit tested.
 */

export interface TokenizeResult {
  words: string[];
  flags: Uint8Array;
  paragraph: Uint32Array;
  paragraphSection: Uint32Array;
  sentenceStarts: Uint32Array;
  /** First token index of each input block (blocks with no tokens point at the next token). */
  blockStart: Uint32Array;
}

interface Piece {
  text: string;
  start: number;
  end: number;
}

const HAS_WORD = /[\p{L}\p{N}]/u;
const OPENERS = new Set(['"', '“', '‘', "'", '(', '[', '{', '«', '‹', '¿', '¡', '„', '‚']);
const DASH = /[—–]|--/;
/** Words longer than this (letters) are split at existing hyphens. */
const HYPHEN_SPLIT_MIN = 13;

/** Abbreviations that are (almost) never sentence-final. Lowercase, without the trailing dot. */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'mx', 'dr', 'prof', 'st', 'sr', 'jr', 'rev', 'hon', 'gen', 'col', 'capt', 'cpt', 'lt',
  'sgt', 'cmdr', 'adm', 'gov', 'sen', 'rep', 'pres', 'fr', 'mt', 'ft', 'vs', 'v', 'no', 'nos', 'vol', 'vols',
  'fig', 'figs', 'ch', 'chap', 'p', 'pp', 'ed', 'eds', 'approx', 'cf', 'e.g', 'i.e', 'viz', 'al', 'inc',
  'ltd', 'co', 'corp', 'dept', 'univ', 'ave', 'blvd', 'rd', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug',
  'sep', 'sept', 'oct', 'nov', 'dec', 'a.m', 'p.m', 'messrs', 'mme', 'mlle',
]);

const TRAILING_CLOSERS = /[”’"'»›)\]}*]+$/u;
const LEADING_OPENERS = /^[“‘"'«‹(\[{¿¡„‚]+/u;

/** Split a block's text into whitespace-separated pieces, keeping character offsets. */
function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/** "word—word" → "word—", "word". The dash stays with the left word, which is where the pause belongs. */
function splitDashes(p: Piece): Piece[] {
  if (!DASH.test(p.text)) return [p];
  const out: Piece[] = [];
  const re = /(?:[—–]+|-{2,})/g;
  let from = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p.text))) {
    const cut = m.index + m[0].length;
    if (cut >= p.text.length) break;
    out.push({ text: p.text.slice(from, cut), start: p.start + from, end: p.start + cut });
    from = cut;
  }
  out.push({ text: p.text.slice(from), start: p.start + from, end: p.end });
  return out.filter((x) => x.text.length > 0);
}

/** Very long hyphenated compounds are easier to read in parts: "self-|consciousness". */
function splitLongHyphenated(p: Piece): Piece[] {
  const letters = p.text.replace(/[^\p{L}\p{N}]/gu, '').length;
  if (letters < HYPHEN_SPLIT_MIN || !/\p{L}-\p{L}/u.test(p.text)) return [p];
  const parts: Piece[] = [];
  let from = 0;
  for (let i = 1; i < p.text.length - 1; i++) {
    if (p.text[i] === '-' && /\p{L}/u.test(p.text[i - 1]) && /\p{L}/u.test(p.text[i + 1])) {
      parts.push({ text: p.text.slice(from, i + 1), start: p.start + from, end: p.start + i + 1 });
      from = i + 1;
    }
  }
  parts.push({ text: p.text.slice(from), start: p.start + from, end: p.end });
  // Re-join fragments that are too short to stand alone ("x-", "re-").
  const merged: Piece[] = [];
  for (const part of parts) {
    const prev = merged[merged.length - 1];
    if (prev && (prev.text.length <= 3 || part.text.length <= 2)) {
      prev.text += part.text;
      prev.end = part.end;
    } else merged.push({ ...part });
  }
  return merged;
}

/** Punctuation-only pieces ("—", "…", "“") are glued to a neighbour instead of flashing alone. */
function mergeOrphans(list: Piece[]): Piece[] {
  const out: Piece[] = [];
  let carry: Piece | null = null;
  for (const p of list) {
    if (HAS_WORD.test(p.text)) {
      if (carry) {
        out.push({ text: carry.text + p.text, start: carry.start, end: p.end });
        carry = null;
      } else out.push({ ...p });
      continue;
    }
    const isOpener = OPENERS.has(p.text[p.text.length - 1]) && !(out.length && /[”’"']$/.test(p.text));
    const prev = out[out.length - 1];
    if (isOpener || !prev) {
      carry = carry ? { text: carry.text + p.text, start: carry.start, end: p.end } : { ...p };
    } else {
      // Attach closing punctuation / dashes / ellipses to the previous word. A space is kept
      // before free-standing dashes and ellipses so "and … then" reads "and …".
      const spaced = /^([—–…]|\.\.\.|--)/.test(p.text);
      prev.text += (spaced ? ' ' : '') + p.text;
      prev.end = p.end;
    }
  }
  if (carry) {
    const prev = out[out.length - 1];
    if (prev) {
      prev.text += carry.text;
      prev.end = carry.end;
    } else if (carry.text.trim()) out.push(carry);
  }
  return out;
}

export function tokenizeBlock(text: string): Piece[] {
  const expanded: Piece[] = [];
  for (const p of pieces(text)) for (const d of splitDashes(p)) expanded.push(...splitLongHyphenated(d));
  return mergeOrphans(expanded);
}

/** Strip wrapping quotes/brackets: `“Hello!”` → `Hello!` */
export function stripWrapping(word: string): string {
  return word.replace(LEADING_OPENERS, '').replace(TRAILING_CLOSERS, '');
}

/** Does `word` end a sentence, given the following word (if any, within the same block)? */
export function endsSentence(word: string, next: string | undefined): boolean {
  const core = stripWrapping(word);
  if (/[!?‽]$/.test(core) || /(…|\.\.\.)$/.test(core)) {
    return next === undefined || !startsLowercase(next);
  }
  if (!core.endsWith('.')) return false;
  const body = core.slice(0, -1);
  const bare = body.replace(LEADING_OPENERS, '').toLowerCase();
  if (ABBREVIATIONS.has(bare)) return false;
  // Initials ("J.", "U.S.") are rarely sentence-final.
  if (/^(\p{Lu}\.)*\p{Lu}$/u.test(body)) return next === undefined;
  if (next === undefined) return true;
  // "etc." / unknown abbreviation followed by lower case: not a boundary.
  return !startsLowercase(next);
}

function startsLowercase(word: string): boolean {
  const s = word.replace(LEADING_OPENERS, '');
  return /^\p{Ll}/u.test(s);
}

function overlapsEmphasis(p: Piece, ranges: [number, number][] | undefined): boolean {
  if (!ranges) return false;
  const mid = (p.start + p.end) / 2;
  for (const [a, b] of ranges) if (mid >= a && mid < b) return true;
  return false;
}

export function tokenize(blocks: TextBlock[]): TokenizeResult {
  const words: string[] = [];
  const flags: number[] = [];
  const paragraph: number[] = [];
  const paragraphSection = new Uint32Array(blocks.length);
  const sentenceStarts: number[] = [];
  const blockStart = new Uint32Array(blocks.length);
  let lastSection = -1;

  blocks.forEach((block, bi) => {
    paragraphSection[bi] = block.section;
    blockStart[bi] = words.length;
    const toks = tokenizeBlock(block.text);
    let sentenceOpen = false;
    toks.forEach((t, i) => {
      let f = 0;
      if (i === 0) f |= TokenFlag.ParagraphStart;
      if (!sentenceOpen) {
        f |= TokenFlag.SentenceStart;
        sentenceStarts.push(words.length);
        sentenceOpen = true;
      }
      if (block.kind === 'h') f |= TokenFlag.Heading;
      if (block.section !== lastSection) {
        f |= TokenFlag.SectionStart;
        lastSection = block.section;
      }
      if (overlapsEmphasis(t, block.emphasis)) f |= TokenFlag.Emphasis;
      if (i > 0 && toks[i - 1].end === t.start) f |= TokenFlag.Joined;
      const next = toks[i + 1]?.text;
      if (next === undefined || (block.kind !== 'h' && endsSentence(t.text, next))) {
        f |= TokenFlag.SentenceEnd;
        sentenceOpen = false;
      }
      words.push(t.text);
      flags.push(f);
      paragraph.push(bi);
    });
  });

  return {
    words,
    flags: Uint8Array.from(flags),
    paragraph: Uint32Array.from(paragraph),
    paragraphSection,
    sentenceStarts: Uint32Array.from(sentenceStarts),
    blockStart,
  };
}
