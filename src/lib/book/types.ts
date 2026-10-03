/** Bump when extraction/tokenization changes so stored books get reprocessed. */
export const PROCESSOR_VERSION = 4;

/** Per-token bit flags. */
export const TokenFlag = {
  ParagraphStart: 1 << 0,
  SentenceStart: 1 << 1,
  SentenceEnd: 1 << 2,
  Heading: 1 << 3,
  SectionStart: 1 << 4,
  Emphasis: 1 << 5,
  /** Was attached to the previous token without whitespace (e.g. after an em dash). */
  Joined: 1 << 6,
} as const;

/** A block of readable text extracted from a spine section (paragraph, heading, list item…). */
export interface TextBlock {
  text: string;
  /** Spine section index (into ProcessedBook.sections). */
  section: number;
  kind: 'p' | 'h';
  /** Character ranges within `text` that were italic/bold. */
  emphasis?: [number, number][];
}

export interface Section {
  /** Absolute path inside the EPUB archive, e.g. /OEBPS/ch01.xhtml */
  href: string;
  /** First token index of this section. */
  start: number;
  /** One past the last token index. */
  end: number;
}

export interface TocEntry {
  label: string;
  depth: number;
  /** Token index this entry points to. */
  token: number;
}

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  cover?: Blob;
  totalWords: number;
  addedAt: number;
  lastOpenedAt?: number;
  version: number;
}

/** Compact, IndexedDB-friendly processed text. */
export interface BookContent {
  id: string;
  version: number;
  words: string[];
  flags: Uint8Array;
  /** Token → global paragraph (block) index. */
  paragraph: Uint32Array;
  /** Paragraph → spine section index. */
  paragraphSection: Uint32Array;
  /** First token index of every sentence, ascending. */
  sentenceStarts: Uint32Array;
  sections: Section[];
  toc: TocEntry[];
}

export interface ReadingProgress {
  bookId: string;
  token: number;
  /** Fraction 0..1 of the whole book. */
  progress: number;
  wpm: number;
  updatedAt: number;
}
