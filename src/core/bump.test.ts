import { describe, expect, it } from 'vitest';
import { advancePiece, bumpAdvance, gradeKnot, peel, pickPush, solvableBump } from './bump';
import { createGame, tap } from './game';
import type { Level } from './types';

const everyone = (l: Level): Set<number> => new Set(l.pieces.map((p) => p.id));

/** 5x5: 1 (right) has two empty cells before 2; 3 is locked, 4 sleeps next to 2, 5 carries 3's key. It peels. */
const room: Level = {
  width: 5,
  height: 5,
  pieces: [
    { id: 1, cells: [{ x: 0, y: 2 }], dir: 'right' },
    { id: 2, cells: [{ x: 3, y: 2 }], dir: 'up' },
    { id: 3, cells: [{ x: 0, y: 4 }], dir: 'right', lock: 7 },
    { id: 4, cells: [{ x: 4, y: 2 }], dir: 'up', sleeping: true },
    { id: 5, cells: [{ x: 2, y: 0 }], dir: 'left', key: 7 },
  ],
};

/** A ring of four, each blocked by the next: 1 → 2 → 3 → 4 → 1. Pushing 1 or 3 opens it; 2 and 4 cannot move. */
const ring: Level = {
  width: 5,
  height: 5,
  pieces: [
    { id: 1, cells: [{ x: 1, y: 2 }], dir: 'right' },
    { id: 2, cells: [{ x: 3, y: 2 }], dir: 'down' },
    { id: 3, cells: [{ x: 3, y: 3 }], dir: 'left' },
    { id: 4, cells: [{ x: 1, y: 3 }], dir: 'up' },
  ],
};

/** Two animals nose to nose: neither can leave nor move. */
const dead: Level = {
  width: 5,
  height: 5,
  pieces: [
    { id: 1, cells: [{ x: 1, y: 2 }], dir: 'right' },
    { id: 2, cells: [{ x: 2, y: 2 }], dir: 'left' },
  ],
};

describe('a push', () => {
  it('runs up to the cell before what stops it; locked and sleeping animals stay', () => {
    const all = everyone(room);
    expect(bumpAdvance(room, room.pieces[0], all)).toBe(2);
    expect(bumpAdvance(room, room.pieces[2], all)).toBe(0);
    expect(bumpAdvance(room, room.pieces[3], all)).toBe(0);
  });
  it('moves the body along the way out and keeps the way it faces', () => {
    const moved = advancePiece(room, room.pieces[0], 2);
    expect(moved.cells).toEqual([{ x: 2, y: 2 }]);
    expect(moved.dir).toBe('right');
    const snake: Level = { width: 6, height: 3, pieces: [{ id: 1, cells: [{ x: 2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 1 }] }, { id: 2, cells: [{ x: 5, y: 1 }], dir: 'up' }] };
    expect(advancePiece(snake, snake.pieces[0], 2).cells).toEqual([{ x: 4, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 1 }]);
  });
  it('turns with an arrow tile it stops on', () => {
    const bent: Level = { width: 5, height: 5, pieces: [{ id: 1, cells: [{ x: 0, y: 2 }], dir: 'right' }, { id: 2, cells: [{ x: 2, y: 0 }], dir: 'left' }], arrows: [{ x: 2, y: 2, dir: 'up' }] };
    // 1 runs right onto the tile at (2,2), turns up, and is stopped by 2 at (2,0): it stands on (2,1) facing up
    const moved = advancePiece(bent, bent.pieces[0], bumpAdvance(bent, bent.pieces[0], everyone(bent)));
    expect(moved.cells).toEqual([{ x: 2, y: 1 }]);
    expect(moved.dir).toBe('up');
  });
  it('is what a blocked tap does: the board changes, nothing else is spent', () => {
    const { state, event } = tap(createGame(room), 1);
    expect(event).toMatchObject({ type: 'blocked', id: 1, blockers: [2, 4], moved: 2 });
    expect(state.level.pieces.find((p) => p.id === 1)!.cells).toEqual([{ x: 2, y: 2 }]);
    expect(state.alive.size).toBe(5);
    expect(state.hearts).toBeUndefined();
    expect(state.blockedTaps).toBe(1);
  });
  it('does not happen under the old rule', () => {
    const { state, event } = tap(createGame(room, { bump: false }), 1);
    expect(event).toEqual({ type: 'blocked', id: 1, blockers: [2, 4] });
    expect(state.level).toEqual(room);
  });
});

describe('gradeKnot', () => {
  it('reads a board that peels as no knot at all', () => {
    const g = gradeKnot(room);
    expect(g.knot).toBe(0);
    expect(g.guessWin).toBe(1);
    expect(g.solvable).toBe(true);
    expect(g.line?.every((m) => m.kind === 'exit')).toBe(true);
  });
  it('finds the pushes that open a ring and counts the ways', () => {
    expect(peel(ring, everyone(ring)).size).toBe(4);
    const g = gradeKnot(ring);
    expect(g.knot).toBe(4);
    expect(g.solvable).toBe(true);
    expect(g.firstOptions).toBe(2);
    expect(g.firstGood).toBe(2);
    expect(g.guessWin).toBe(1);
    expect(g.answers).toBe(2);
    expect(g.line?.[0]).toEqual({ kind: 'push', id: expect.any(Number) });
    expect([1, 3]).toContain(pickPush(ring, everyone(ring)));
  });
  it('reads a board nobody can move on as knotted for good', () => {
    const g = gradeKnot(dead);
    expect(g.knot).toBe(2);
    expect(g.solvable).toBe(false);
    expect(g.guessWin).toBe(0);
    expect(solvableBump(dead, everyone(dead))).toBe(false);
    expect(pickPush(dead, everyone(dead))).toBeNull();
  });
  it('scores a push into a dead end as a loss', () => {
    // 3 and 4 face each other with room to run at one another; 2 (up) can run to (2,1). No push opens anything.
    const trap: Level = {
      width: 6,
      height: 4,
      pieces: [
        { id: 1, cells: [{ x: 0, y: 1 }], dir: 'right' },
        { id: 2, cells: [{ x: 2, y: 3 }], dir: 'up' },
        { id: 3, cells: [{ x: 2, y: 0 }], dir: 'right' },
        { id: 4, cells: [{ x: 5, y: 0 }], dir: 'left' },
      ],
    };
    const g = gradeKnot(trap);
    expect(g.knot).toBe(3);
    expect(g.solvable).toBe(false);
    expect(g.firstOptions).toBe(3);
    expect(g.firstGood).toBe(0);
    expect(g.guessWin).toBe(0);
    expect(solvableBump(trap, everyone(trap))).toBe(false);
  });
});
