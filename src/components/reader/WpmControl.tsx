import { useState } from 'react';
import { IconMinus, IconPlus } from '../icons';

const PRESETS = [200, 300, 400, 500, 600, 800];

export function WpmControl({ wpm, onChange, min, max }: { wpm: number; onChange: (v: number) => void; min: number; max: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center gap-1">
      <button onClick={() => onChange(wpm - 25)} onMouseDown={(e) => e.preventDefault()} className="h-8 w-8 rounded-full text-muted hover:text-fg hover:bg-faint flex items-center justify-center" aria-label="Slower" title="Slower (↓)">
        <IconMinus size={15} />
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        onMouseDown={(e) => e.preventDefault()}
        className="h-8 min-w-[6.5rem] px-3 rounded-full text-sm tabular hover:bg-faint transition-colors"
        aria-expanded={open}
        aria-label={`${wpm} words per minute. Change speed`}
      >
        <span className="text-fg">{wpm}</span> <span className="text-muted text-xs tracking-wider">WPM</span>
      </button>
      <button onClick={() => onChange(wpm + 25)} onMouseDown={(e) => e.preventDefault()} className="h-8 w-8 rounded-full text-muted hover:text-fg hover:bg-faint flex items-center justify-center" aria-label="Faster" title="Faster (↑)">
        <IconPlus size={15} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 w-[17rem] rounded-xl bg-raised border border-line shadow-[0_12px_40px_-12px_rgb(0_0_0/0.35)] p-4 animate-in" role="dialog" aria-label="Reading speed">
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                  className={`h-9 rounded-lg text-sm tabular transition-colors ${p === wpm ? 'bg-fg text-bg' : 'bg-faint text-fg hover:bg-line'}`}
                >
                  {p}
                </button>
              ))}
            </div>
            <input type="range" min={min} max={max} step={10} value={wpm} onChange={(e) => onChange(Number(e.target.value))} className="w-full mt-4 accent-[var(--accent)]" aria-label="Words per minute" />
            <div className="flex justify-between text-[0.7rem] text-subtle tabular">
              <span>{min}</span>
              <span>{max}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
