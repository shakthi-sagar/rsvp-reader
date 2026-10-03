import { describe, expect, it } from 'vitest';
import { PlaybackEngine, type Clock } from './engine';
import { TIMING } from './timing';

/** Manual clock: timers only fire when time is advanced. */
class FakeClock implements Clock {
  t = 0;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 1;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  };
  clearTimeout = (id: unknown) => {
    this.timers = this.timers.filter((x) => x.id !== id);
  };
  /** Advance time, firing due timers in order; `lag` delays each firing (simulates jitter). */
  advance(ms: number, lag = 0) {
    const end = this.t + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers[0];
      if (!next || next.at + lag > end) break;
      this.timers.shift();
      this.t = Math.max(this.t, next.at + lag);
      next.fn();
    }
    this.t = end;
  }
  /** Simulate a throttled tab: no timers fire for `ms`, then one late wake-up. */
  freeze(ms: number) {
    this.t += ms;
    this.timers.sort((a, b) => a.at - b.at);
    const next = this.timers.shift();
    next?.fn();
  }
}

const flat = (n: number) => new Float32Array(n).fill(1);
const noRamp = TIMING.rampWords; // words to skip past the ease-in

function setup(n = 1000, wpm = 600) {
  const clock = new FakeClock();
  const engine = new PlaybackEngine({ multipliers: flat(n), sentenceStarts: Uint32Array.from([0, 10, 20, 30]), wpm, clock });
  return { clock, engine };
}

describe('PlaybackEngine', () => {
  it('advances on deadlines, with the ease-in ramp first', () => {
    const { clock, engine } = setup();
    engine.play();
    let rampTime = 0;
    for (let k = 0; k < noRamp; k++) rampTime += engine.durationOf(k, k);
    clock.advance(rampTime);
    expect(engine.getState().index).toBe(noRamp);
    clock.advance(100 * 10); // 600 wpm = 100ms/word
    expect(engine.getState().index).toBe(noRamp + 10);
  });

  it('stays accurate under small timer jitter', () => {
    const { clock, engine } = setup(10000, 600);
    engine.seek(0);
    engine.play();
    clock.advance(60_000, 7);
    // ~600 words in a minute minus the ramp overhead; jitter must not accumulate.
    const ramp = Array.from({ length: noRamp }, (_, k) => engine.durationOf(0, k) - 100).reduce((a, b) => a + b, 0);
    const expected = Math.floor((60_000 - ramp) / 100);
    expect(Math.abs(engine.getState().index - expected)).toBeLessThanOrEqual(1);
  });

  it('never skips a burst of words after a long stall', () => {
    const { clock, engine } = setup();
    engine.play();
    clock.advance(2000);
    const before = engine.getState().index;
    clock.freeze(30_000);
    expect(engine.getState().index).toBe(before + 1);
    clock.advance(100);
    expect(engine.getState().index).toBe(before + 2);
  });

  it('applies WPM changes to the current word immediately', () => {
    const { clock, engine } = setup(1000, 100); // 600ms/word
    engine.seek(50);
    engine.play();
    clock.advance(2000); // past the ramp of the first word? keep simple: just check speed-up
    const i = engine.getState().index;
    engine.setWpm(1000);
    clock.advance(TIMING.rampStart * 60 + 1);
    expect(engine.getState().index).toBeGreaterThan(i);
  });

  it('pauses, resumes, and navigates sentences', () => {
    const { clock, engine } = setup();
    engine.seek(15);
    engine.previousSentence();
    expect(engine.getState().index).toBe(10);
    engine.previousSentence();
    expect(engine.getState().index).toBe(0);
    engine.nextSentence();
    expect(engine.getState().index).toBe(10);
    engine.play();
    engine.pause();
    clock.advance(10_000);
    expect(engine.getState().index).toBe(10);
  });

  it('finishes at the end of the book', () => {
    const { clock, engine } = setup(3);
    engine.play();
    clock.advance(10_000);
    expect(engine.getState()).toMatchObject({ index: 2, playing: false, finished: true });
  });
});
