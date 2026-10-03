import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookMeta, ReadingProgress } from '../lib/book/types';
import { processEpub, type ProcessStatus } from '../lib/book/process';
import * as db from '../lib/storage/db';
import { useObjectUrl } from '../hooks/misc';
import { ThemeSwitch } from './ThemeSwitch';
import { Logo } from './Logo';

const PHASE_LABEL: Record<ProcessStatus['phase'], string> = {
  reading: 'Reading file',
  parsing: 'Extracting text',
  tokenizing: 'Preparing words',
  saving: 'Saving to this device',
};

function isEpub(file: File) {
  return /\.epub$/i.test(file.name) || file.type === 'application/epub+zip';
}

export function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [books, setBooks] = useState<BookMeta[] | null>(null);
  const [progress, setProgress] = useState<Map<string, ReadingProgress>>(new Map());
  const [status, setStatus] = useState<(ProcessStatus & { name: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([db.listBooks(), db.listProgress()]);
      setBooks(b);
      setProgress(p);
    } catch (e) {
      setBooks([]);
      setError('Local storage is unavailable in this browser (private mode?). Books cannot be saved.');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const importFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!isEpub(file)) {
        setError(`“${file.name}” isn’t an EPUB file.`);
        return;
      }
      setStatus({ phase: 'reading', fraction: 0, name: file.name });
      try {
        const { meta } = await processEpub(file, (s) => setStatus({ ...s, name: file.name }));
        await refresh();
        setStatus(null);
        onOpen(meta.id);
      } catch (e) {
        console.error(e);
        setStatus(null);
        setError(`Couldn’t open “${file.name}”. ${e instanceof Error ? e.message : ''}`.trim());
      }
    },
    [onOpen, refresh],
  );

  // Whole-window drag and drop.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) importFile(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [importFile]);

  const choose = () => inputRef.current?.click();
  const empty = books !== null && books.length === 0;

  return (
    <div className="min-h-full flex flex-col">
      <input
        ref={inputRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) importFile(f);
        }}
      />

      <header className="mx-auto w-full max-w-5xl px-5 sm:px-8 pt-8 pb-6 flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2.5 font-serif text-[1.35rem] tracking-tight whitespace-nowrap">
          <Logo size={26} />
          <span>
            RSVP <span className="text-muted">Reader</span>
          </span>
        </h1>
        <div className="flex items-center gap-3">
          <ThemeSwitch />
          {!empty && books && (
            <button onClick={choose} className="h-9 px-4 rounded-full border border-line text-sm whitespace-nowrap hover:bg-faint transition-colors">
              Import<span className="hidden sm:inline"> EPUB</span>
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 sm:px-8 flex-1 flex flex-col">
        {error && (
          <div role="alert" className="mb-6 text-sm text-accent flex items-start justify-between gap-4 animate-in">
            <span>{error}</span>
            <button className="text-muted hover:text-fg shrink-0" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}

        {status ? (
          <Processing status={status} />
        ) : empty ? (
          <EmptyState onChoose={choose} active={dragging} />
        ) : books ? (
          <>
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-xs uppercase tracking-[0.18em] text-muted">Library</h2>
              <span className="text-xs text-subtle">Stored only on this device</span>
            </div>
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10 pb-16">
              {books.map((b) => (
                <BookCard
                  key={b.id}
                  book={b}
                  progress={progress.get(b.id)}
                  onOpen={() => onOpen(b.id)}
                  onRemove={async () => {
                    await db.deleteBook(b.id);
                    refresh();
                  }}
                />
              ))}
            </ul>
          </>
        ) : null}
      </main>

      {dragging && !empty && (
        <div className="fixed inset-0 z-50 bg-bg/90 backdrop-blur-sm flex items-center justify-center pointer-events-none animate-in">
          <div className="border border-dashed border-muted rounded-2xl px-16 py-14 text-center">
            <p className="font-serif text-2xl">Drop to import</p>
            <p className="text-sm text-muted mt-2">The book stays on this device.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onChoose, active }: { onChoose: () => void; active: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center pb-[12vh]">
      <button
        onClick={onChoose}
        className={`group w-full max-w-xl aspect-[16/10] sm:aspect-[16/9] rounded-2xl border border-dashed select-none transition-colors flex flex-col items-center justify-center text-center px-6 ${
          active ? 'border-accent bg-faint/60' : 'border-subtle/60 hover:border-muted'
        }`}
      >
        <FocalGlyph />
        <p className="font-serif text-2xl sm:text-[1.7rem] mt-7">Drop an EPUB here</p>
        <p className="text-sm text-muted mt-2">
          or <span className="underline decoration-subtle underline-offset-4 group-hover:decoration-fg">choose a file</span>
        </p>
        <p className="text-xs text-subtle mt-10 max-w-xs leading-relaxed">
          Books are parsed in your browser and never leave this device.
        </p>
      </button>
    </div>
  );
}

/** A tiny rendering of the reader's focal point, used as the empty-state mark. */
function FocalGlyph() {
  // Same symmetric `1fr auto 1fr` grid as the reader, so the ticks sit on the centre of the pivot letter.
  return (
    <div className="w-40 font-serif text-[2rem] leading-none select-none" aria-hidden="true">
      <div className="mx-auto h-3 w-px bg-accent/80 mb-2" />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)' }}>
        <span className="text-muted text-right">re</span>
        <span className="text-accent text-center">a</span>
        <span className="text-muted text-left">d</span>
      </div>
      <div className="mx-auto h-3 w-px bg-accent/80 mt-2" />
    </div>
  );
}

function Processing({ status }: { status: ProcessStatus & { name: string } }) {
  const pct = Math.round(status.fraction * 100);
  return (
    <div className="flex-1 flex items-center justify-center pb-[12vh]" aria-live="polite">
      <div className="w-full max-w-sm text-center animate-in">
        <p className="font-serif text-xl truncate">{status.name.replace(/\.epub$/i, '')}</p>
        <p className="text-sm text-muted mt-2 h-5">
          {PHASE_LABEL[status.phase]}
          {status.detail ? <span className="text-subtle"> · {status.detail}</span> : null}
        </p>
        <div className="mt-6 h-px bg-faint relative overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="absolute inset-y-0 left-0 bg-fg transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-subtle mt-3 tabular">{pct}%</p>
      </div>
    </div>
  );
}

function BookCard({ book, progress, onOpen, onRemove }: { book: BookMeta; progress?: ReadingProgress; onOpen: () => void; onRemove: () => void }) {
  const cover = useObjectUrl(book.cover);
  const [confirming, setConfirming] = useState(false);
  const pct = progress ? Math.round(progress.progress * 100) : 0;
  const started = progress && progress.token > 0;

  return (
    <li className="group flex flex-col select-none animate-in">
      <button onClick={onOpen} className="relative block aspect-[2/3] w-full rounded-[3px] overflow-hidden bg-faint shadow-[0_1px_2px_rgb(0_0_0/0.08),0_8px_24px_-12px_rgb(0_0_0/0.35)] transition-transform duration-300 group-hover:-translate-y-0.5" aria-label={`Open ${book.title}`}>
        {cover ? (
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-between p-4 text-left bg-raised border border-line">
            <span className="font-serif text-[1.05rem] leading-snug line-clamp-5">{book.title}</span>
            <span className="text-xs text-muted line-clamp-2">{book.author}</span>
          </div>
        )}
        {started && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/25">
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        )}
      </button>
      <div className="mt-3 min-w-0">
        <p className="font-serif text-[0.98rem] leading-snug line-clamp-2" title={book.title}>
          {book.title}
        </p>
        <p className="text-[0.8rem] text-muted mt-0.5 truncate">{book.author}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2 text-[0.8rem]">
          {confirming ? (
            <span className="flex items-center gap-3 animate-in">
              <button className="text-accent hover:underline underline-offset-4" onClick={onRemove}>
                Remove
              </button>
              <button className="text-muted hover:text-fg" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          ) : (
            <>
              <button onClick={onOpen} className="text-left whitespace-nowrap truncate text-fg hover:text-accent transition-colors">
                {started ? (pct >= 100 ? 'Read again' : 'Continue reading') : 'Start reading'}
              </button>
              <span className="flex items-center gap-2 shrink-0 text-subtle tabular">
                {started && <span>{pct}%</span>}
                <button
                  onClick={() => setConfirming(true)}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:text-fg transition-opacity"
                  aria-label={`Remove ${book.title} from library`}
                  title="Remove from library"
                >
                  ✕
                </button>
              </span>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
