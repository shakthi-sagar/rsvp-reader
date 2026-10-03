import type { IngestedBook } from '../epub/ingest';
import { tokenize, type TokenizeResult } from '../text/tokenizer';
import type { BookContent, BookMeta, Section, TextBlock, TocEntry } from './types';
import { PROCESSOR_VERSION } from './types';
import * as db from '../storage/db';

/** Import pipeline: hash → parse (epub.js) → extract → tokenize (worker) → map TOC → persist. */

export type ProcessPhase = 'reading' | 'parsing' | 'tokenizing' | 'saving';
export interface ProcessStatus {
  phase: ProcessPhase;
  /** 0..1 */
  fraction: number;
  detail?: string;
}

async function hashId(data: ArrayBuffer, file: File): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `f-${file.size}-${file.lastModified}-${file.name}`.replace(/[^\w-]/g, '_');
  }
}

function tokenizeInWorker(blocks: TextBlock[]): Promise<TokenizeResult> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../text/tokenizer.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(tokenize(blocks));
      return;
    }
    const fallback = () => {
      worker.terminate();
      resolve(tokenize(blocks));
    };
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data?.ok) resolve(e.data.result);
      else fallback();
    };
    worker.onerror = fallback;
    worker.postMessage({ blocks });
  });
}

function buildSections(hrefs: string[], tk: TokenizeResult, blocks: TextBlock[]): Section[] {
  const total = tk.words.length;
  const firstBlock = new Array<number>(hrefs.length).fill(-1);
  blocks.forEach((b, i) => {
    if (firstBlock[b.section] === -1) firstBlock[b.section] = i;
  });
  const starts = new Array<number>(hrefs.length);
  // Walk backwards so empty sections inherit the next section's start.
  let next = total;
  for (let s = hrefs.length - 1; s >= 0; s--) {
    if (firstBlock[s] >= 0) next = tk.blockStart[firstBlock[s]];
    starts[s] = next;
  }
  return hrefs.map((href, s) => ({ href, start: starts[s], end: s + 1 < hrefs.length ? starts[s + 1] : total }));
}

function buildToc(raw: IngestedBook, sections: Section[], tk: TokenizeResult): TocEntry[] {
  const total = tk.words.length;
  const out: TocEntry[] = [];
  const seen = new Set<string>();
  for (const e of raw.toc) {
    if (e.section < 0) continue;
    let token = sections[e.section].start;
    if (e.fragment) {
      const block = raw.anchors.get(`${e.section}#${e.fragment}`);
      if (block !== undefined && raw.blocks[block]?.section === e.section) token = tk.blockStart[block];
    }
    if (token >= total) continue;
    const key = `${token}|${e.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: e.label, depth: e.depth, token });
  }
  if (out.length > 0) return out;

  // No usable TOC: one entry per non-empty section, titled by its first heading.
  sections.forEach((s, i) => {
    if (s.end <= s.start) return;
    const heading = raw.blocks.find((b) => b.section === i && b.kind === 'h');
    out.push({ label: heading?.text.slice(0, 80) ?? `Section ${out.length + 1}`, depth: 0, token: s.start });
  });
  return out;
}

export async function processEpub(
  file: Blob & { name?: string; lastModified?: number },
  onStatus: (s: ProcessStatus) => void,
  knownId?: string,
): Promise<{ meta: BookMeta; content: BookContent; duplicate: boolean }> {
  onStatus({ phase: 'reading', fraction: 0 });
  const data = await file.arrayBuffer();
  const id = knownId ?? (await hashId(data, file as File));

  if (!knownId) {
    const existing = await db.getBook(id);
    const existingContent = existing && existing.version === PROCESSOR_VERSION ? await db.getContent(id) : undefined;
    if (existing && existingContent) return { meta: existing, content: existingContent, duplicate: true };
  }

  onStatus({ phase: 'parsing', fraction: 0.02 });
  // epub.js is only needed while importing, so it's loaded on demand.
  const { ingestEpub } = await import('../epub/ingest');
  const raw = await ingestEpub(data, (done, total) =>
    onStatus({ phase: 'parsing', fraction: 0.02 + 0.78 * (total ? done / total : 1), detail: `Section ${Math.min(done + 1, total)} of ${total}` }),
  );

  onStatus({ phase: 'tokenizing', fraction: 0.82 });
  const tk = await tokenizeInWorker(raw.blocks);
  if (tk.words.length === 0) throw new Error('No readable text was found in this EPUB.');

  const sections = buildSections(raw.sectionHrefs, tk, raw.blocks);
  const toc = buildToc(raw, sections, tk);

  const content: BookContent = {
    id,
    version: PROCESSOR_VERSION,
    words: tk.words,
    flags: tk.flags,
    paragraph: tk.paragraph,
    paragraphSection: tk.paragraphSection,
    sentenceStarts: tk.sentenceStarts,
    sections,
    toc,
  };
  const previous = knownId ? await db.getBook(id) : undefined;
  const meta: BookMeta = {
    id,
    title: raw.title,
    author: raw.author,
    cover: raw.cover,
    totalWords: tk.words.length,
    addedAt: previous?.addedAt ?? Date.now(),
    lastOpenedAt: previous?.lastOpenedAt,
    version: PROCESSOR_VERSION,
  };

  onStatus({ phase: 'saving', fraction: 0.95 });
  await db.saveBook(meta, content, knownId ? undefined : file);
  onStatus({ phase: 'saving', fraction: 1 });
  return { meta, content, duplicate: false };
}

/** Load a book's content, transparently reprocessing it if it was stored by an older processor version. */
export async function loadContent(
  id: string,
  onStatus: (s: ProcessStatus) => void,
): Promise<{ meta: BookMeta; content: BookContent }> {
  const meta = await db.getBook(id);
  if (!meta) throw new Error('This book is no longer in your library.');
  const content = await db.getContent(id);
  if (content && content.version === PROCESSOR_VERSION) return { meta, content };
  const file = await db.getFile(id);
  if (!file) {
    if (content) return { meta, content };
    throw new Error('The stored book data is missing. Please import the EPUB again.');
  }
  const r = await processEpub(file, onStatus, id);
  return { meta: r.meta, content: r.content };
}
