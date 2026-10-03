/** Index of the last element in a sorted array that is <= value (or -1). */
export function floorIndex(sorted: ArrayLike<number>, value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function sentenceIndexAt(sentenceStarts: Uint32Array, token: number): number {
  return Math.max(0, floorIndex(sentenceStarts, token));
}

export function sentenceRange(sentenceStarts: Uint32Array, total: number, s: number): [number, number] {
  const start = sentenceStarts[s] ?? 0;
  const end = s + 1 < sentenceStarts.length ? sentenceStarts[s + 1] : total;
  return [start, end];
}

/**
 * Previous-sentence target. Like a music player's "previous track": if we're
 * already a little way into a sentence, restart it; otherwise go back one.
 */
export function previousSentenceTarget(sentenceStarts: Uint32Array, token: number, restartThreshold = 2): number {
  if (sentenceStarts.length === 0) return 0;
  const s = sentenceIndexAt(sentenceStarts, token);
  if (token - sentenceStarts[s] > restartThreshold || s === 0) return sentenceStarts[s];
  return sentenceStarts[s - 1];
}

export function nextSentenceTarget(sentenceStarts: Uint32Array, token: number, total: number): number {
  if (sentenceStarts.length === 0) return token;
  const s = sentenceIndexAt(sentenceStarts, token);
  return s + 1 < sentenceStarts.length ? sentenceStarts[s + 1] : Math.max(0, total - 1);
}
