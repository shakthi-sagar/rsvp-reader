import { useEffect, useRef } from 'react';
import type { TocEntry } from '../../lib/book/types';
import { IconClose } from '../icons';

interface Props {
  open: boolean;
  title: string;
  author: string;
  toc: TocEntry[];
  current: number;
  total: number;
  onClose: () => void;
  onSelect: (token: number) => void;
}

export function ChapterDrawer({ open, title, author, toc, current, total, onClose, onSelect }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: 'center' });
  }, [open]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/25 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed z-50 inset-y-0 left-0 w-[min(22rem,88vw)] bg-raised border-r border-line flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!open}
        aria-label="Table of contents"
        {...(!open ? { inert: true } : {})}
      >
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4 border-b border-line">
          <div className="min-w-0">
            <p className="font-serif text-lg leading-snug line-clamp-2">{title}</p>
            <p className="text-sm text-muted mt-0.5 truncate">{author}</p>
          </div>
          <button onClick={onClose} className="p-1.5 -mr-1.5 text-muted hover:text-fg" aria-label="Close contents">
            <IconClose size={18} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          <ol>
            {toc.map((e, i) => {
              const active = i === current;
              return (
                <li key={`${e.token}-${i}`}>
                  <button
                    ref={active ? activeRef : undefined}
                    onClick={() => onSelect(e.token)}
                    className={`w-full text-left flex items-baseline gap-3 py-2 pr-6 hover:bg-faint transition-colors ${active ? 'text-fg' : 'text-muted hover:text-fg'}`}
                    style={{ paddingLeft: `${1.5 + Math.min(e.depth, 4) * 0.9}rem` }}
                    aria-current={active ? 'location' : undefined}
                  >
                    <span className={`shrink-0 h-1.5 w-1.5 rounded-full translate-y-[-1px] ${active ? 'bg-accent' : 'bg-transparent'}`} />
                    <span className={`flex-1 min-w-0 ${e.depth === 0 ? 'text-[0.95rem]' : 'text-sm'}`}>{e.label}</span>
                    <span className="text-xs text-subtle tabular">{Math.round((e.token / Math.max(1, total - 1)) * 100)}%</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </aside>
    </>
  );
}
