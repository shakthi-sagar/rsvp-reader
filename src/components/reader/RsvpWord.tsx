import { memo, useMemo } from 'react';
import { splitOrp } from '../../lib/rsvp/orp';
import { FONT_STACKS, LETTER_SPACING, type FontChoice, type Spacing } from '../../lib/storage/prefs';
import { useElementWidth } from '../../hooks/misc';

/** Average advance width per character, in em, used to shrink very long words to fit. */
const CHAR_EM: Record<FontChoice, number> = { serif: 0.56, sans: 0.56, mono: 0.62 };

interface Props {
  word: string;
  heading: boolean;
  emphasis: boolean;
  font: FontChoice;
  fontSize: number;
  spacing: Spacing;
  dimmed?: boolean;
}

/**
 * Renders LEFT | PIVOT | RIGHT in a symmetric three-column grid
 * (`1fr auto 1fr`). The middle column is always centred, so the pivot
 * character's centre sits on the same x-coordinate for every word no matter
 * how wide the pivot glyph or the word is. The left column is a flex box
 * justified to the end, so overflowing text grows leftwards.
 */
export const RsvpWord = memo(function RsvpWord({ word, heading, emphasis, font, fontSize, spacing, dimmed }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { left, pivot, right } = useMemo(() => splitOrp(word), [word]);

  // Responsive size: never more than ~11% of the stage width, and shrink long words to fit.
  const base = width ? Math.min(fontSize, Math.max(28, width * 0.11)) : fontSize;
  const side = Math.max(Array.from(left).length, Array.from(right).length) + 0.6;
  const fit = width ? (width / 2 - 12) / (side * CHAR_EM[font] * base) : 1;
  const size = Math.max(14, base * Math.min(1, fit));

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: base * 2.6 }}>
      <FocalMarkers height={base * 2.6} />
      <div
        className={`absolute inset-x-0 top-1/2 -translate-y-1/2 grid items-baseline whitespace-pre text-left transition-opacity duration-200 ${dimmed ? 'opacity-40' : ''}`}
        style={{
          gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)',
          fontFamily: FONT_STACKS[font],
          fontSize: size,
          lineHeight: 1.15,
          letterSpacing: LETTER_SPACING[spacing],
          fontWeight: heading ? 600 : 420,
          fontStyle: emphasis ? 'italic' : 'normal',
          fontKerning: 'normal',
          fontVariantLigatures: 'none',
        }}
        aria-live="off"
      >
        <span className="flex justify-end overflow-visible">{left}</span>
        <span className="text-accent" style={{ fontWeight: heading ? 650 : 520 }}>
          {pivot}
        </span>
        <span className="overflow-visible text-left">{right}</span>
      </div>
    </div>
  );
});

/** Hairlines above and below the word with a notch at the focal column. */
function FocalMarkers({ height }: { height: number }) {
  const notch = Math.max(8, height * 0.1);
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="absolute left-1/2 -translate-x-1/2 top-0 w-[min(30rem,82%)] h-px bg-line" />
      <div className="absolute left-1/2 -translate-x-1/2 top-0 w-px bg-accent/55" style={{ height: notch }} />
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[min(30rem,82%)] h-px bg-line" />
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-px bg-accent/55" style={{ height: notch }} />
    </div>
  );
}
