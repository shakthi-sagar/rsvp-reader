import { memo, useMemo } from 'react';
import type { BookContent } from '../../lib/book/types';
import { TokenFlag } from '../../lib/book/types';
import { sentenceIndexAt, sentenceRange } from '../../lib/rsvp/navigation';

const MAX_SPAN = 90;

/**
 * Previous / current / next sentence around the current token, shown while paused.
 * Each word is clickable to jump there.
 */
export const ContextView = memo(function ContextView({ content, index, onSeek }: { content: BookContent; index: number; onSeek: (i: number) => void }) {
  const paragraphs = useMemo(() => {
    const total = content.words.length;
    const s = sentenceIndexAt(content.sentenceStarts, index);
    const [curStart, curEnd] = sentenceRange(content.sentenceStarts, total, s);
    const from = Math.max(s > 0 ? sentenceRange(content.sentenceStarts, total, s - 1)[0] : curStart, index - MAX_SPAN);
    const to = Math.min(s + 1 < content.sentenceStarts.length ? sentenceRange(content.sentenceStarts, total, s + 1)[1] : curEnd, index + MAX_SPAN);

    const groups: { key: number; tokens: number[] }[] = [];
    for (let i = from; i < to; i++) {
      const p = content.paragraph[i];
      if (!groups.length || groups[groups.length - 1].key !== p) groups.push({ key: p, tokens: [] });
      groups[groups.length - 1].tokens.push(i);
    }
    return { groups, curStart, curEnd, clippedStart: from > 0 && from === index - MAX_SPAN };
  }, [content, index]);

  return (
    <div className="font-serif text-[0.95rem] sm:text-base leading-[1.75] text-subtle max-w-[38rem] mx-auto text-left space-y-3">
      {paragraphs.groups.map((g, gi) => (
        <p key={g.key} className={content.flags[g.tokens[0]] & TokenFlag.Heading ? 'font-semibold' : ''}>
          {gi === 0 && paragraphs.clippedStart && '… '}
          {g.tokens.map((i) => {
            const inCurrent = i >= paragraphs.curStart && i < paragraphs.curEnd;
            const isCurrent = i === index;
            const em = content.flags[i] & TokenFlag.Emphasis;
            const joinNext = i !== g.tokens[g.tokens.length - 1] && (content.flags[i + 1] & TokenFlag.Joined) !== 0;
            return (
              <span key={i}>
                <button
                  type="button"
                  tabIndex={-1}
                  data-current={isCurrent || undefined}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(i);
                  }}
                  className={`inline rounded-sm px-[1px] -mx-[1px] transition-colors hover:bg-faint hover:text-fg ${
                    isCurrent ? 'text-accent underline decoration-accent/60 underline-offset-[5px] decoration-[1.5px]' : inCurrent ? 'text-fg/85' : ''
                  } ${em ? 'italic' : ''}`}
                >
                  {content.words[i].replace(/ /g, ' ')}
                </button>
                {joinNext ? '' : ' '}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
});
