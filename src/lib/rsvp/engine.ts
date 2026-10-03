import { baseDelay, clampWpm, rampMultiplier } from './timing';
import { nextSentenceTarget, previousSentenceTarget } from './navigation';

/**
 * RSVP playback engine.
 *
 * Framework-agnostic and deterministic: time comes from an injectable clock.
 *
 * Timing model: every token has an absolute deadline (`shownAt + duration`).
 * Timers are only a wake-up hint; when one fires we compare against the real
 * clock. Small scheduling lag is absorbed by anchoring the next word to the
 * previous *deadline* (so average WPM stays exact), but a large lag — e.g. a
 * throttled background tab — re-anchors to "now". The engine never advances
 * more than one token per wake-up, so it can't skip a burst of words.
 */

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (h) => window.clearTimeout(h as number),
};

export interface EngineState {
  index: number;
  playing: boolean;
  wpm: number;
  finished: boolean;
}

export interface EngineOptions {
  multipliers: Float32Array;
  sentenceStarts: Uint32Array;
  wpm: number;
  index?: number;
  clock?: Clock;
}

/** Lag beyond which we stop trying to stay on the original schedule. */
const MAX_CATCH_UP_MS = 80;
/** After a seek during playback, resume part-way up the ease-in ramp. */
const SEEK_RAMP_FROM = 3;

export class PlaybackEngine {
  private readonly multipliers: Float32Array;
  private readonly sentenceStarts: Uint32Array;
  private readonly clock: Clock;
  private readonly listeners = new Set<() => void>();
  private state: EngineState;
  private timer: unknown = null;
  private shownAt = 0;
  private deadline = 0;
  private wordsSinceStart = 0;

  constructor(opts: EngineOptions) {
    this.multipliers = opts.multipliers;
    this.sentenceStarts = opts.sentenceStarts;
    this.clock = opts.clock ?? realClock;
    this.state = {
      index: this.clampIndex(opts.index ?? 0),
      playing: false,
      wpm: clampWpm(opts.wpm),
      finished: false,
    };
  }

  get total(): number {
    return this.multipliers.length;
  }

  getState = (): EngineState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Display duration (ms) of the current token given current WPM and ramp position. */
  durationOf(index: number, wordsSinceStart = this.wordsSinceStart): number {
    return baseDelay(this.state.wpm) * (this.multipliers[index] ?? 1) * rampMultiplier(wordsSinceStart);
  }

  play(): void {
    if (this.state.playing || this.total === 0) return;
    // Pressing play after the last word restarts the book.
    const index = this.state.finished ? 0 : this.state.index;
    this.wordsSinceStart = 0;
    this.shownAt = this.clock.now();
    this.set({ playing: true, finished: false, index });
    this.schedule();
  }

  pause(): void {
    if (!this.state.playing) return;
    this.cancel();
    this.set({ playing: false });
  }

  toggle(): void {
    if (this.state.playing) this.pause();
    else this.play();
  }

  seek(index: number): void {
    const i = this.clampIndex(index);
    this.set({ index: i, finished: false });
    if (this.state.playing) {
      // Restart the clock for the new word; a short ramp helps re-orient the eye.
      this.wordsSinceStart = Math.min(this.wordsSinceStart, SEEK_RAMP_FROM);
      this.shownAt = this.clock.now();
      this.schedule();
    }
  }

  step(delta: number): void {
    this.seek(this.state.index + delta);
  }

  previousSentence(): void {
    this.seek(previousSentenceTarget(this.sentenceStarts, this.state.index));
  }

  nextSentence(): void {
    this.seek(nextSentenceTarget(this.sentenceStarts, this.state.index, this.total));
  }

  setWpm(wpm: number): void {
    const next = clampWpm(wpm);
    if (next === this.state.wpm) return;
    this.set({ wpm: next });
    // Takes effect immediately: the current word's deadline is recomputed from when it appeared.
    if (this.state.playing) this.schedule();
  }

  destroy(): void {
    this.cancel();
    this.listeners.clear();
  }

  // ---- internals ---------------------------------------------------------

  private clampIndex(i: number): number {
    return Math.max(0, Math.min(this.total - 1, Math.floor(i)));
  }

  private set(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private cancel(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    this.cancel();
    this.deadline = this.shownAt + this.durationOf(this.state.index);
    const wait = Math.max(0, this.deadline - this.clock.now());
    this.timer = this.clock.setTimeout(this.tick, wait);
  }

  private tick = (): void => {
    this.timer = null;
    if (!this.state.playing) return;
    const now = this.clock.now();
    if (now < this.deadline - 1) {
      // Woke early (timer clamping/coalescing): wait for the real deadline.
      this.timer = this.clock.setTimeout(this.tick, this.deadline - now);
      return;
    }
    if (this.state.index >= this.total - 1) {
      this.set({ playing: false, finished: true });
      return;
    }
    const lag = now - this.deadline;
    this.shownAt = lag > MAX_CATCH_UP_MS ? now : this.deadline;
    this.wordsSinceStart++;
    this.set({ index: this.state.index + 1 });
    this.schedule();
  };
}
