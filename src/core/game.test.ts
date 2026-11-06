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
  it('a blocked tap reports the blockers and, stopped at once, leaves the pieces in place', () => {
    const s0 = createGame(level);
    const { state, event } = tap(s0, 1);
    expect(event).toEqual({ type: 'blocked', id: 1, blockers: [2] });
    expect(state.level).toEqual(level);
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

describe('locks, sleepers and bombs', () => {
  it('reports why a locked or sleeping piece did not move', () => {
    const lockedLevel: Level = {
      width: 5, height: 5,
      pieces: [
        { id: 1, cells: [{ x: 1, y: 2 }, { x: 0, y: 2 }], lock: 1 },
        { id: 2, cells: [{ x: 4, y: 0 }, { x: 3, y: 0 }], key: 1 },
      ],
    };
    expect(tap(createGame(lockedLevel), 1).event).toEqual({ type: 'blocked', id: 1, blockers: [], lockedBy: 2 });
    const sleepLevel: Level = {
      width: 5, height: 5,
      pieces: [
        { id: 1, cells: [{ x: 1, y: 2 }, { x: 0, y: 2 }], sleeping: true },
        { id: 2, cells: [{ x: 1, y: 3 }, { x: 0, y: 3 }] },
      ],
    };
    expect(tap(createGame(sleepLevel, { hearts: 2 }), 1)).toMatchObject({ event: { type: 'blocked', asleep: true }, state: { hearts: 1 } });
    const woken = tap(createGame(sleepLevel), 2).state;
    expect(tap(woken, 1).event).toEqual({ type: 'exited', id: 1 });
  });
  const bombLevel: Level = {
    width: 5, height: 5,
    pieces: [
      { id: 1, cells: [{ x: 1, y: 2 }, { x: 0, y: 2 }] },
      { id: 2, cells: [{ x: 4, y: 2 }, { x: 3, y: 2 }], fuse: 2 },
    ],
  };
  it('exits never burn a fuse; a blocked tap that goes nowhere burns nothing either', () => {
    let s = createGame(bombLevel);
    s = tap(s, 2).state; // 2 leaves: nothing burns
    expect(s.fuses).toEqual({});
    const t = tap(createGame(fuseLevel(2)), 6).state; // 6 stands right behind the bomb: no room, no burn
    expect(t.fuses[2]).toBe(2);
  });

  // 7x5: bomb 2 (up) behind 1 with one cell of room; 3 free; 4 (left) has five cells before 3; 6 right behind the bomb
  const fuseLevel = (fuse: number): Level => ({
    width: 7, height: 5,
    pieces: [
      { id: 1, cells: [{ x: 2, y: 0 }], dir: 'up' },
      { id: 2, cells: [{ x: 2, y: 2 }], dir: 'up', fuse },
      { id: 3, cells: [{ x: 0, y: 4 }], dir: 'left' },
      { id: 4, cells: [{ x: 6, y: 4 }], dir: 'left' },
      { id: 6, cells: [{ x: 3, y: 2 }], dir: 'left' },
    ],
  });

  it('each push burns the fuse exactly once; exits and ignored taps do not', () => {
    let s = createGame(fuseLevel(3));
    s = tap(s, 4).state; // 4 runs up to 3
    expect(s.fuses[2]).toBe(2);
    expect(tap(s, 4).event.type).toBe('blocked'); // no room left: no burn
    expect(tap(s, 4).state.fuses[2]).toBe(2);
    s = tap(s, 3).state; // an exit
    expect(s.fuses[2]).toBe(2);
    expect(tap(s, 3).event.type).toBe('ignored');
    expect(s.taps).toBe(2);
  });

  it('pushing the bomb itself burns its fuse too', () => {
    const r = tap(createGame(fuseLevel(2)), 2);
    expect(r.event).toMatchObject({ type: 'blocked', moved: 1 });
    expect(r.state.fuses[2]).toBe(1);
    expect(isFailed(r.state)).toBe(false);
  });

  it('at fuse 1, a push sets the bomb off; the bomb leaving first is safe', () => {
    const one = tap(createGame(fuseLevel(2)), 4).state;
    expect(one.fuses[2]).toBe(1);
    const boom = tap(one, 2).state; // the bomb pushed into 1: its last push
    expect(boom.exploded).toBe(true);
    expect(isFailed(boom)).toBe(true);
    expect(tap(boom, 3).event.type).toBe('ignored');
    let safe = tap(one, 1).state; // 1 leaves, the bomb's way is clear
    safe = tap(safe, 2).state;
    expect(safe.exploded).toBe(false);
    expect(safe.fuses).toEqual({});
    safe = tap(tap(tap(safe, 3).state, 6).state, 4).state; // 6 runs left and out once the bomb is gone? no: it is pushed, then leaves
    expect(isFailed(safe)).toBe(false);
  });

  it('a bomb that runs out of fuse with exits alone never explodes', () => {
    let s = createGame(fuseLevel(1));
    s = tap(s, 3).state;
    s = tap(s, 1).state;
    expect(s.exploded).toBe(false);
    expect(s.fuses[2]).toBe(1);
  });

  it('one push burns every bomb once', () => {
    const level: Level = { ...fuseLevel(3), pieces: fuseLevel(3).pieces.map((p) => (p.id === 3 ? { ...p, fuse: 5 } : p)) };
    const s = tap(createGame(level), 4).state;
    expect(s.fuses).toEqual({ 2: 2, 3: 4 });
    const t = tap(s, 3).state; // 3 leaves: its fuse goes with it, 2's stays
    expect(t.fuses).toEqual({ 2: 2 });
  });

  it('getting the bomb out in time defuses it', () => {
    let s = createGame(bombLevel);
    s = tap(s, 1).state; // 1 pushed up to the bomb: 2 -> 1
    expect(s.fuses[2]).toBe(1);
    s = tap(s, 2).state;
    s = tap(s, 1).state;
    expect(isCleared(s)).toBe(true);
    expect(isFailed(s)).toBe(false);
  });
});
