import { memo, useCallback, useRef, useState } from 'react';

interface Props {
  index: number;
  total: number;
  /** Token positions of top-level chapters, for tick marks. */
  ticks: number[];
  labelAt: (token: number) => string;
  onScrubStart: () => void;
  onScrubEnd: (token: number) => void;
}

/** Whole-book progress scrubber. Seeks on release; shows a chapter preview while dragging. */
export const Scrubber = memo(function Scrubber({ index, total, ticks, labelAt, onScrubStart, onScrubEnd }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const fractionAt = useCallback((clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  }, []);

  const max = Math.max(1, total - 1);
  const shown = drag ?? index / max;
  const preview = drag ?? hover;
  const toToken = (f: number) => Math.round(f * max);

  return (
    <div
      className="relative h-8 flex items-center cursor-pointer touch-none group"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        onScrubStart();
        setDrag(fractionAt(e.clientX));
      }}
      onPointerMove={(e) => {
        const f = fractionAt(e.clientX);
        if (drag !== null) setDrag(f);
        else if (e.pointerType === 'mouse') setHover(f);
      }}
      onPointerLeave={() => setHover(null)}
      onPointerUp={(e) => {
        if (drag === null) return;
        const f = fractionAt(e.clientX);
        setDrag(null);
        onScrubEnd(toToken(f));
      }}
      onPointerCancel={() => {
        if (drag === null) return;
        const f = drag;
        setDrag(null);
        onScrubEnd(toToken(f));
      }}
      role="slider"
      aria-label="Position in book"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(shown * 100)}
      aria-valuetext={`${Math.round(shown * 100)}%`}
    >
      <div ref={trackRef} className="relative w-full h-[3px] rounded-full bg-faint transition-[height] group-hover:h-[5px]">
        {ticks.map((t) => (
          <span key={t} className="absolute top-0 h-full w-px bg-bg/70" style={{ left: `${(t / max) * 100}%` }} />
        ))}
        <div className="absolute inset-y-0 left-0 rounded-full bg-muted" style={{ width: `${shown * 100}%` }} />
        <div
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg transition-[width,height] ${drag !== null ? 'h-4 w-4' : 'h-3 w-3'}`}
          style={{ left: `${shown * 100}%` }}
        />
      </div>
      {preview !== null && (
        <div
          className="absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-raised border border-line px-2.5 py-1 text-xs shadow-sm pointer-events-none max-w-[60vw] truncate"
          style={{ left: `clamp(4rem, ${preview * 100}%, calc(100% - 4rem))` }}
        >
          <span className="tabular text-muted">{Math.round(preview * 100)}%</span>
          <span className="mx-1.5 text-subtle">·</span>
          {labelAt(toToken(preview))}
        </div>
      )}
    </div>
  );
});
