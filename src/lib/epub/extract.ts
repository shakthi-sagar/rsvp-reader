import type { TextBlock } from '../book/types';

/**
 * Extracts readable text blocks from an EPUB content document, in reading order.
 *
 * Inline formatting (em, strong, span, a…) is flattened into the surrounding
 * paragraph; block elements start new paragraphs. Navigation, footnote bodies,
 * note reference markers, page-break markers, scripts and media are skipped.
 */

const BLOCK = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'blockquote', 'pre', 'address',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hgroup', 'li', 'ul', 'ol', 'dl', 'dt', 'dd', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'hr', 'center', 'body', 'html', 'details',
  'summary', 'fieldset', 'legend', 'form',
]);

const SKIP = new Set([
  'head', 'script', 'style', 'nav', 'svg', 'math', 'rt', 'rp', 'img', 'image', 'audio', 'video', 'object',
  'embed', 'iframe', 'canvas', 'button', 'input', 'select', 'textarea', 'noscript', 'template', 'map', 'link', 'meta',
]);

const HEADING = /^h[1-6]$/;
const EMPHASIS = new Set(['em', 'i', 'strong', 'b', 'cite', 'dfn']);
const SKIP_EPUB_TYPES = /\b(footnote|endnote|endnotes|rearnote|rearnotes|noteref|pagebreak|page-list|toc|landmarks|annoref)\b/;
const SKIP_ROLES = /\b(doc-footnote|doc-endnote|doc-endnotes|doc-noteref|doc-pagebreak|doc-toc|navigation|presentation)\b/;
const NOTE_MARKER = /^\s*[[(]?\s*(\d{1,3}|[*†‡§¶]{1,3}|[a-z])\s*[\])]?\s*$/i;

const WHITESPACE = /[\s\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g;
const INVISIBLE = /[\u00ad\u200b-\u200d\u2060\ufeff]/g;

export interface ExtractResult {
  blocks: TextBlock[];
  /** element id → index into `blocks` (relative to this document). */
  anchors: Map<string, number>;
}

function epubType(el: Element): string {
  return (
    el.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ||
    el.getAttribute('epub:type') ||
    ''
  );
}

function shouldSkip(el: Element, tag: string): boolean {
  if (SKIP.has(tag)) return true;
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
  const style = el.getAttribute('style');
  if (style && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)) return true;
  if (SKIP_EPUB_TYPES.test(epubType(el))) return true;
  const role = el.getAttribute('role');
  if (role && SKIP_ROLES.test(role)) return true;
  // Footnote reference markers like <sup><a href="#fn3">3</a></sup> or <a href="#n1"><sup>[1]</sup></a>.
  if ((tag === 'sup' || tag === 'sub' || tag === 'a') && NOTE_MARKER.test(el.textContent ?? '')) {
    if (tag === 'a' && (el.getAttribute('href') ?? '').length > 0) return true;
    if (tag !== 'a' && el.querySelector('a[href]')) return true;
  }
  return false;
}

export function extractBlocks(doc: Document, section: number): ExtractResult {
  const blocks: TextBlock[] = [];
  const anchors = new Map<string, number>();
  let text = '';
  let kind: TextBlock['kind'] = 'p';
  let emphasis: [number, number][] = [];
  let headingDepth = 0;
  let emphasisDepth = 0;
  let emphasisStart = -1;

  const flush = () => {
    if (emphasisStart >= 0 && text.length > emphasisStart) emphasis.push([emphasisStart, text.length]);
    const trimmed = text.trim();
    if (/[\p{L}\p{N}]/u.test(trimmed)) {
      const lead = text.length - text.trimStart().length;
      const ranges = emphasis
        .map(([a, b]) => [Math.max(0, a - lead), Math.min(trimmed.length, b - lead)] as [number, number])
        .filter(([a, b]) => b > a);
      blocks.push({ text: trimmed, section, kind, ...(ranges.length ? { emphasis: ranges } : {}) });
    }
    text = '';
    emphasis = [];
    emphasisStart = emphasisDepth > 0 ? 0 : -1;
    kind = headingDepth > 0 ? 'h' : 'p';
  };

  const append = (raw: string) => {
    let s = raw.replace(INVISIBLE, '').replace(WHITESPACE, ' ');
    if (text.length === 0 || text.endsWith(' ')) s = s.trimStart();
    text += s;
  };

  const walk = (node: Node) => {
    if (node.nodeType === 3 /* TEXT */ || node.nodeType === 4 /* CDATA */) {
      append(node.nodeValue ?? '');
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.localName.toLowerCase();
    if (shouldSkip(el, tag)) return;

    if (tag === 'br') {
      append(' ');
      return;
    }

    const isBlock = BLOCK.has(tag);
    const isHeading = HEADING.test(tag);
    const isEm = EMPHASIS.has(tag);
    if (isBlock) flush();
    // After flushing, blocks.length is the index of the block this element's text lands in.
    const id = el.getAttribute('id');
    if (id && !anchors.has(id)) anchors.set(id, blocks.length);
    if (isHeading) {
      headingDepth++;
      kind = 'h';
    }
    if (isEm && emphasisDepth++ === 0) emphasisStart = text.length;

    for (let c = el.firstChild; c; c = c.nextSibling) walk(c);

    if (isEm && --emphasisDepth === 0 && emphasisStart >= 0) {
      if (text.length > emphasisStart) emphasis.push([emphasisStart, text.length]);
      emphasisStart = -1;
    }
    if (isHeading) headingDepth--;
    if (isBlock) {
      flush();
    } else if (tag === 'td' || tag === 'th') append(' ');
  };

  walk(doc.body ?? doc.documentElement);
  flush();

  // Anchors recorded for a block that ended up empty point at the next real block.
  for (const [k, v] of anchors) anchors.set(k, Math.min(v, Math.max(0, blocks.length - 1)));
  return { blocks, anchors };
}
