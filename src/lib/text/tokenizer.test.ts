import { describe, expect, it } from 'vitest';
import { endsSentence, tokenize, tokenizeBlock } from './tokenizer';
import { TokenFlag } from '../book/types';

const words = (s: string) => tokenizeBlock(s).map((t) => t.text);

describe('tokenizeBlock', () => {
  it('splits on whitespace and keeps attached punctuation', () => {
    expect(words('Hello, world! It’s “fine.”')).toEqual(['Hello,', 'world!', 'It’s', '“fine.”']);
  });
  it('splits em dashes, keeping the dash on the left', () => {
    expect(words('wait—what')).toEqual(['wait—', 'what']);
    expect(words('wait -- what')).toEqual(['wait --', 'what']);
  });
  it('glues free-standing punctuation to neighbours', () => {
    expect(words('and … then')).toEqual(['and …', 'then']);
    expect(words('he said “ hello ”')).toEqual(['he', 'said', '“hello”']);
    expect(words('end —')).toEqual(['end —']);
  });
  it('splits long hyphenated compounds', () => {
    expect(words('a well-known fact')).toEqual(['a', 'well-known', 'fact']);
    expect(words('extraordinarily-complicated')).toEqual(['extraordinarily-', 'complicated']);
  });
});

describe('endsSentence', () => {
  it('detects ordinary boundaries', () => {
    expect(endsSentence('done.', 'Then')).toBe(true);
    expect(endsSentence('really?”', 'She')).toBe(true);
    expect(endsSentence('wait...', 'And')).toBe(true);
  });
  it('ignores abbreviations and initials', () => {
    expect(endsSentence('Mr.', 'Smith')).toBe(false);
    expect(endsSentence('J.', 'Smith')).toBe(false);
    expect(endsSentence('e.g.', 'apples')).toBe(false);
    expect(endsSentence('etc.', 'and')).toBe(false);
  });
  it('treats lowercase continuations as non-boundaries', () => {
    expect(endsSentence('“Why?”', 'she')).toBe(false);
  });
});

describe('tokenize', () => {
  it('produces flags, paragraphs and sentence starts', () => {
    const r = tokenize([
      { text: 'Chapter One', section: 0, kind: 'h' },
      { text: 'It was late. Mr. Brown slept.', section: 0, kind: 'p', emphasis: [[7, 11]] },
      { text: 'Next part.', section: 1, kind: 'p' },
    ]);
    expect(r.words).toEqual(['Chapter', 'One', 'It', 'was', 'late.', 'Mr.', 'Brown', 'slept.', 'Next', 'part.']);
    expect(Array.from(r.sentenceStarts)).toEqual([0, 2, 5, 8]);
    expect(Array.from(r.paragraph)).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 2, 2]);
    expect(Array.from(r.blockStart)).toEqual([0, 2, 8]);
    expect(r.flags[0] & TokenFlag.Heading).toBeTruthy();
    expect(r.flags[0] & TokenFlag.SectionStart).toBeTruthy();
    expect(r.flags[8] & TokenFlag.SectionStart).toBeTruthy();
    expect(r.flags[2] & TokenFlag.ParagraphStart).toBeTruthy();
    expect(r.flags[4] & TokenFlag.Emphasis).toBeTruthy();
    expect(r.flags[3] & TokenFlag.Emphasis).toBeFalsy();
    const d = tokenize([{ text: 'night—darker night— dark', section: 0, kind: 'p' }]);
    expect(Array.from(d.flags, (f) => (f & TokenFlag.Joined ? 1 : 0))).toEqual([0, 1, 0, 0]);
  });
});
