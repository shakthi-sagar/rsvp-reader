import { describe, expect, it } from 'vitest';
import { TIMING, computeTimings, punctuationMultiplier, remainingMs, rampMultiplier } from './timing';
import { tokenize } from '../text/tokenizer';

describe('timing', () => {
  it('weights punctuation', () => {
    expect(punctuationMultiplier('word')).toBe(1);
    expect(punctuationMultiplier('word,')).toBe(TIMING.comma);
    expect(punctuationMultiplier('word;')).toBe(TIMING.semicolon);
    expect(punctuationMultiplier('end.”')).toBe(TIMING.sentenceEnd);
    expect(punctuationMultiplier('so…')).toBe(TIMING.ellipsis);
  });
  it('pauses longer at paragraph ends and for long words', () => {
    const r = tokenize([
      { text: 'Short words here, then incomprehensibilities', section: 0, kind: 'p' },
      { text: 'Next.', section: 0, kind: 'p' },
    ]);
    const { multipliers, prefix } = computeTimings(r.words, r.flags);
    expect(multipliers[0]).toBeCloseTo(TIMING.sectionStart);
    expect(multipliers[1]).toBe(1);
    expect(multipliers[2]).toBeCloseTo(TIMING.comma);
    expect(multipliers[4]).toBeGreaterThanOrEqual(TIMING.paragraphEnd);
    expect(prefix[prefix.length - 1]).toBeCloseTo(multipliers.reduce((a, b) => a + b, 0));
    expect(remainingMs(prefix, 1, 2, 300)).toBeCloseTo(200);
  });
  it('eases in after play', () => {
    expect(rampMultiplier(0)).toBe(TIMING.rampStart);
    expect(rampMultiplier(TIMING.rampWords)).toBe(1);
  });
});
