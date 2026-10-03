import ePub from 'epubjs';
import type { TextBlock } from '../book/types';
import { extractBlocks } from './extract';

/**
 * EPUB ingestion via epub.js: metadata, cover, spine order, table of contents
 * and raw text blocks. Runs on the main thread (it needs DOMParser), yielding
 * between spine sections so the UI stays responsive.
 */

export interface RawTocEntry {
  label: string;
  depth: number;
  /** Spine section index, or -1 if it couldn't be resolved. */
  section: number;
  fragment: string;
}

export interface IngestedBook {
  title: string;
  author: string;
  cover?: Blob;
  sectionHrefs: string[];
  /** Global block list across all sections, in reading order. */
  blocks: TextBlock[];
  /** `${section}#${id}` → global block index. */
  anchors: Map<string, number>;
  toc: RawTocEntry[];
}

export type IngestProgress = (done: number, total: number) => void;

// Minimal shapes of the epub.js internals we use (its bundled typings are incomplete).
interface EpubSection {
  index: number;
  href: string;
  url: string;
  linear: boolean;
  properties?: string[];
  document?: Document;
  load(request: (path: string) => Promise<unknown>): Promise<Element>;
  unload(): void;
}
interface EpubNavItem {
  label: string;
  href: string;
  subitems?: EpubNavItem[];
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

function decode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i + 1) : '/';
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Resolve `rel` against directory `baseDir` (both archive paths). */
export function resolvePath(baseDir: string, rel: string): string {
  if (rel.startsWith('/')) return normalize(rel);
  return normalize(baseDir + rel);
}

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return '/' + out.join('/');
}

async function loadDocument(book: any, section: EpubSection): Promise<Document | null> {
  let doc: Document | undefined;
  try {
    await section.load(book.load.bind(book));
    doc = section.document;
  } catch {
    doc = undefined;
  }
  const broken = !doc || !doc.documentElement || doc.getElementsByTagName('parsererror').length > 0;
  if (broken) {
    // Malformed XHTML: retry leniently as HTML from the raw archive text.
    try {
      const raw: string = await book.archive.getText(section.url);
      doc = new DOMParser().parseFromString(raw, 'text/html');
    } catch {
      return null;
    }
  }
  return doc ?? null;
}

async function extractCover(book: any): Promise<Blob | undefined> {
  try {
    const url: string | null = await book.coverUrl();
    if (!url) return undefined;
    const blob = await (await fetch(url)).blob();
    return await downscale(blob, 480);
  } catch {
    return undefined;
  }
}

async function downscale(blob: Blob, maxWidth: number): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width <= maxWidth) {
      bitmap.close();
      return blob;
    }
    const scale = maxWidth / bitmap.width;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? blob), 'image/jpeg', 0.86));
  } catch {
    return blob;
  }
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

export async function ingestEpub(data: ArrayBuffer, onProgress?: IngestProgress): Promise<IngestedBook> {
  const book: any = ePub(data as any);
  try {
    await book.ready;
    const meta = book.packaging?.metadata ?? {};
    const cover = await extractCover(book);

    const spine: EpubSection[] = book.spine.spineItems ?? [];
    const sectionHrefs: string[] = [];
    const blocks: TextBlock[] = [];
    const anchors = new Map<string, number>();
    const pathToSection = new Map<string, number>();
    const basenameToSection = new Map<string, number>();

    for (let i = 0; i < spine.length; i++) {
      const item = spine[i];
      onProgress?.(i, spine.length);
      const path = normalize(decode(item.url || item.href));
      // Skip the EPUB 3 navigation document if it's in the spine — it's boilerplate.
      if (item.properties?.includes('nav')) continue;

      const doc = await loadDocument(book, item);
      const sectionIndex = sectionHrefs.length;
      sectionHrefs.push(path);
      pathToSection.set(path, sectionIndex);
      if (!basenameToSection.has(basename(path))) basenameToSection.set(basename(path), sectionIndex);

      if (doc) {
        const { blocks: b, anchors: a } = extractBlocks(doc, sectionIndex);
        const offset = blocks.length;
        for (const [id, bi] of a) anchors.set(`${sectionIndex}#${id}`, offset + bi);
        for (const block of b) blocks.push(block);
      }
      try {
        item.unload();
      } catch {
        /* ignore */
      }
      await yieldToUi();
    }
    onProgress?.(spine.length, spine.length);

    // Table of contents. Hrefs are relative to the nav/ncx document.
    const navRel: string = book.packaging?.navPath || book.packaging?.ncxPath || '';
    const navDir = navRel ? dirname(normalize(decode(book.resolve(navRel)))) : '/';
    const toc: RawTocEntry[] = [];
    const walk = (items: EpubNavItem[] | undefined, depth: number) => {
      for (const item of items ?? []) {
        const [hrefPath, fragment = ''] = (item.href ?? '').split('#');
        let section = -1;
        if (hrefPath) {
          const abs = resolvePath(navDir, decode(hrefPath));
          section = pathToSection.get(abs) ?? basenameToSection.get(basename(abs)) ?? -1;
        }
        const label = text(item.label);
        if (label) toc.push({ label, depth, section, fragment: decode(fragment) });
        walk(item.subitems, depth + 1);
      }
    };
    walk(book.navigation?.toc, 0);

    return {
      title: text(meta.title) || 'Untitled',
      author: text(meta.creator) || 'Unknown author',
      cover,
      sectionHrefs,
      blocks,
      anchors,
      toc,
    };
  } finally {
    try {
      book.destroy();
    } catch {
      /* ignore */
    }
  }
}
