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
  it('a push that stops against the dynamite burns it; exits and a tap that goes nowhere burn nothing', () => {
    let s = createGame(bombLevel);
    s = tap(s, 1).state; // 1 runs one cell and stops against the dynamite
    expect(s.fuses[2]).toBe(1);
    s = tap(s, 2).state; // the dynamite leaves: its number goes with it
    expect(s.fuses).toEqual({});
    const t = tap(createGame(fuseLevel(2)), 6).state; // 6 stands right behind the dynamite: no room, nothing burns
    expect(t.fuses[2]).toBe(2);
  });

  // 7x5: dynamite 2 (up) behind 1 with one cell of room; 3 free; 4 (left) runs five cells to 3; 6 right behind the
  // dynamite with no room; 7 (up) runs one cell and stops against the dynamite
  const fuseLevel = (fuse: number): Level => ({
    width: 7, height: 5,
    pieces: [
      { id: 1, cells: [{ x: 2, y: 0 }], dir: 'up' },
      { id: 2, cells: [{ x: 2, y: 2 }], dir: 'up', fuse },
      { id: 3, cells: [{ x: 0, y: 4 }], dir: 'left' },
      { id: 4, cells: [{ x: 6, y: 4 }], dir: 'left' },
      { id: 6, cells: [{ x: 3, y: 2 }], dir: 'left' },
      { id: 7, cells: [{ x: 2, y: 4 }], dir: 'up' },
    ],
  });

  it('only a collision with the dynamite burns its number: a push elsewhere, exits and ignored taps do not', () => {
    let s = createGame(fuseLevel(3));
    s = tap(s, 4).state; // 4 runs up to 3: a push that never touches the dynamite
    expect(s.fuses[2]).toBe(3);
    const hit = tap(s, 7); // 7 runs one cell and stops against the dynamite
    expect(hit.event).toMatchObject({ type: 'blocked', moved: 1 });
    s = hit.state;
    expect(s.fuses[2]).toBe(2);
    expect(tap(s, 7).state.fuses[2]).toBe(2); // no room left: no collision, no burn
    s = tap(s, 3).state; // an exit
    expect(s.fuses[2]).toBe(2);
    expect(tap(s, 3).event.type).toBe('ignored');
  });

  it('pushing the dynamite itself into something burns its number too', () => {
    const r = tap(createGame(fuseLevel(2)), 2);
    expect(r.event).toMatchObject({ type: 'blocked', moved: 1 });
    expect(r.state.fuses[2]).toBe(1);
    expect(isFailed(r.state)).toBe(false);
  });

  it('at number 1, the next collision sets it off; the dynamite leaving first is safe', () => {
    const one = tap(createGame(fuseLevel(2)), 7).state;
    expect(one.fuses[2]).toBe(1);
    const boom = tap(one, 2).state; // the dynamite pushed into 1: its last collision
    expect(boom.exploded).toBe(true);
    expect(isFailed(boom)).toBe(true);
    expect(tap(boom, 3).event.type).toBe('ignored');
    let safe = tap(one, 1).state; // 1 leaves, the dynamite's way is clear
    safe = tap(safe, 2).state;
    expect(safe.exploded).toBe(false);
    expect(safe.fuses).toEqual({});
  });

  it('a dynamite nobody touches never goes off, whatever else is pushed or leaves', () => {
    let s = createGame(fuseLevel(1));
    s = tap(s, 4).state;
    s = tap(s, 3).state;
    s = tap(s, 1).state;
    expect(s.exploded).toBe(false);
    expect(s.fuses[2]).toBe(1);
  });

  it('one collision burns both dynamites in it', () => {
    const level: Level = { ...fuseLevel(3), pieces: fuseLevel(3).pieces.map((p) => (p.id === 7 ? { ...p, fuse: 5 } : p)) };
    const s = tap(createGame(level), 7).state; // dynamite 7 pushed into dynamite 2
    expect(s.fuses).toEqual({ 2: 2, 7: 4 });
  });

  it('getting the dynamite out in time defuses it', () => {
    let s = createGame(bombLevel);
    s = tap(s, 1).state; // 1 pushed up against the dynamite: 2 -> 1
    expect(s.fuses[2]).toBe(1);
    s = tap(s, 2).state;
    s = tap(s, 1).state;
    expect(isCleared(s)).toBe(true);
    expect(isFailed(s)).toBe(false);
  });
});
