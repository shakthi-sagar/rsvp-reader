# RSVP Reader

A local-first RSVP (Rapid Serial Visual Presentation) speed reader for EPUB books.
Books are parsed in the browser and stored in IndexedDB; nothing is uploaded.

**Live:** https://reader.shadster.dev

Words appear one at a time at a fixed focal point, with the Optimal Recognition Point letter
locked in place, punctuation-aware timing, chapter navigation, a whole-book scrubber,
context view (off / when paused / always), light, sepia and dark themes, and keyboard shortcuts.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (tokenizer, ORP, timing, playback engine)
npm run build
npm run deploy     # build + deploy to Cloudflare Workers (reader.shadster.dev)
node scripts/make-fixture.mjs   # regenerate fixtures/sample.epub and fixtures/large.epub
```

## Architecture

| Module | Responsibility |
| --- | --- |
| `src/lib/epub/ingest.ts` | epub.js: metadata, cover, spine order, TOC (hrefs resolved relative to the nav doc), per-section loading with an HTML fallback for malformed XHTML |
| `src/lib/epub/extract.ts` | DOM → text blocks. Flattens inline formatting, records emphasis ranges and element ids, skips nav, footnote bodies, note markers, page breaks and media |
| `src/lib/text/tokenizer.ts` | Blocks → tokens with flags (paragraph/sentence/heading/section/emphasis/joined). Dash splitting, orphan punctuation merging, long-compound splitting, abbreviation-aware sentence detection. Runs in a Web Worker |
| `src/lib/rsvp/orp.ts` | Optimal Recognition Point (length table, ignores wrapping punctuation) |
| `src/lib/rsvp/timing.ts` | `TIMING` multipliers (all tunable), per-token multipliers, prefix sums for exact time-remaining |
| `src/lib/rsvp/engine.ts` | Framework-free playback engine with an injectable clock. Deadline-based scheduling, anchored to previous deadlines for small lag and re-anchored after large stalls; never advances more than one word per wake-up |
| `src/lib/book/process.ts` | Import pipeline and transparent reprocessing when `PROCESSOR_VERSION` changes (the original EPUB blob is kept locally) |
| `src/lib/storage/db.ts` / `prefs.ts` | IndexedDB (books, content, progress, files) / localStorage preferences |
| `src/components/reader/*` | Reader UI: ORP word, context view, scrubber, chapter drawer, settings, shortcuts |

ORP alignment uses a symmetric `1fr auto 1fr` grid, so the pivot glyph's centre is always at the exact same x-coordinate regardless of word or glyph width.
