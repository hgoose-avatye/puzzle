import { describe, expect, it } from 'vitest';
import { createGame, isCleared, isFailed, tap } from './game';
import type { Level } from './types';

const level: Level = {
  width: 5,
  height: 5,
  pieces: [
    { id: 1, cells: [{ x: 2, y: 2 }, { x: 1, y: 2 }] },
    { id: 2, cells: [{ x: 4, y: 2 }, { x: 3, y: 2 }] },
  ],
};

describe('tap', () => {
  it('a blocked tap leaves the pieces in place and reports the blockers', () => {
    const s0 = createGame(level);
    const { state, event } = tap(s0, 1);
    expect(event).toEqual({ type: 'blocked', id: 1, blockers: [2] });
    expect([...state.alive].sort()).toEqual([1, 2]);
    expect(state.blockedTaps).toBe(1);
    expect(state.taps).toBe(1);
  });
  it('exiting pieces in order clears the level', () => {
    const a = tap(createGame(level), 2);
    expect(a.event).toEqual({ type: 'exited', id: 2 });
    const b = tap(a.state, 1);
    expect(b.event).toEqual({ type: 'exited', id: 1 });
    expect(isCleared(b.state)).toBe(true);
    expect(b.state.taps).toBe(2);
  });
  it('ignores removed or unknown pieces without changing state', () => {
    const a = tap(createGame(level), 2).state;
    for (const id of [2, 99]) {
      const r = tap(a, id);
      expect(r.event).toEqual({ type: 'ignored', id });
      expect(r.state.taps).toBe(a.taps);
      expect([...r.state.alive]).toEqual([...a.alive]);
    }
  });
  it('does not mutate the previous state', () => {
    const s0 = createGame(level);
    tap(s0, 2);
    expect(s0.alive.size).toBe(2);
    expect(s0.taps).toBe(0);
  });
});

describe('hearts', () => {
  it('without hearts, blocked taps never fail the level', () => {
    let s = createGame(level);
    for (let i = 0; i < 5; i++) s = tap(s, 1).state;
    expect(isFailed(s)).toBe(false);
    expect(s.hearts).toBeUndefined();
  });
  it('each blocked tap costs a heart and the level fails at zero', () => {
    let s = createGame(level, { hearts: 2 });
    s = tap(s, 1).state;
    expect(s.hearts).toBe(1);
    expect(isFailed(s)).toBe(false);
    s = tap(s, 1).state;
    expect(s.hearts).toBe(0);
    expect(isFailed(s)).toBe(true);
    const after = tap(s, 2);
    expect(after.event).toEqual({ type: 'ignored', id: 2 });
    expect(after.state.alive.size).toBe(2);
  });
  it('exiting pieces costs no hearts and clearing is not a failure', () => {
    let s = createGame(level, { hearts: 1 });
    s = tap(tap(s, 2).state, 1).state;
    expect(isCleared(s)).toBe(true);
    expect(s.hearts).toBe(1);
    expect(isFailed(s)).toBe(false);
  });
});
