import { describe, expect, it } from 'vitest';
import { orpOffset, splitOrp } from './orp';

describe('orp', () => {
  it('follows the length table', () => {
    expect([1, 2, 5, 6, 9, 10, 13, 14, 20].map(orpOffset)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it('splits words around the pivot', () => {
    expect(splitOrp('reading')).toEqual({ left: 're', pivot: 'a', right: 'ding' });
    expect(splitOrp('I')).toEqual({ left: '', pivot: 'I', right: '' });
    expect(splitOrp('quickly')).toEqual({ left: 'qu', pivot: 'i', right: 'ckly' });
  });
  it('ignores leading and trailing punctuation when placing the pivot', () => {
    expect(splitOrp('“Hello,')).toEqual({ left: '“H', pivot: 'e', right: 'llo,' });
    expect(splitOrp('(a)')).toEqual({ left: '(', pivot: 'a', right: ')' });
  });
  it('handles astral characters as single code points', () => {
    expect(splitOrp('𝒜bc').pivot).toBe('b');
  });
});
