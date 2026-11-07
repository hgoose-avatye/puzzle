import { describe, expect, it } from 'vitest';
import { gradeKnot } from '../core/bump';
import { createRng } from '../core/rng';
import type { Level } from '../core/types';
import { countTraps, searchKnot, shapeScore, stuckAtOnce } from './knotSearch';

// 5 x 5, a three-cycle: 1 (right) is stopped by 2, 2 (down) by 3, 3 (left) by 1. Pushing 1 one cell frees nothing;
// the board is physically stuck only once nothing can move.
const cycle: Level = {
  width: 5, height: 5,
  pieces: [
    { id: 1, cells: [{ x: 1, y: 1 }], dir: 'right' },
    { id: 2, cells: [{ x: 3, y: 1 }], dir: 'down' },
    { id: 3, cells: [{ x: 3, y: 3 }], dir: 'left' },
    { id: 4, cells: [{ x: 1, y: 3 }], dir: 'up' },
  ],
};

describe('stuckAtOnce', () => {
  it('is false while something can leave or move, true when nothing can', () => {
    const all = new Set([1, 2, 3, 4]);
    expect(stuckAtOnce(cycle, all)).toBe(false);
    const jammed: Level = {
      width: 3, height: 3,
      pieces: [
        { id: 1, cells: [{ x: 0, y: 0 }], dir: 'right' },
        { id: 2, cells: [{ x: 1, y: 0 }], dir: 'down' },
        { id: 3, cells: [{ x: 1, y: 1 }], dir: 'left' },
        { id: 4, cells: [{ x: 0, y: 1 }], dir: 'up' },
      ],
    };
    expect(stuckAtOnce(jammed, all)).toBe(true);
    expect(stuckAtOnce(jammed, new Set([1, 2, 3]))).toBe(false); // 4 gone: 1 can still not leave, but 3 can
    expect(stuckAtOnce(jammed, new Set())).toBe(false); // an empty board is cleared, not stuck
  });
});

describe('countTraps and shapeScore', () => {
  it('counts the wrong pushes on the line and those seen at once; a board meeting its shape scores 0', () => {
    const g = gradeKnot(cycle);
    expect(g.solvable).toBe(true);
    const { traps, openTraps } = countTraps(cycle, g);
    expect(traps).toBeGreaterThanOrEqual(0);
    expect(openTraps).toBeLessThanOrEqual(traps);
    expect(shapeScore(g, { keyMoves: 0, answersMax: 200, knotMin: 3 }, 0, 0)).toBe(0);
    expect(shapeScore(g, { keyMoves: 3, answersMax: 200, knotMin: 3 }, 0, 0)).toBeGreaterThanOrEqual(300);
    expect(shapeScore({ ...g, solvable: false }, { keyMoves: 0, answersMax: 200, knotMin: 3 }, 0, 0)).toBe(1_000_000);
  });
});

describe('searchKnot', () => {
  // 7 x 9, eleven animals that all peel: the search must make a knot out of them
  const peels: Level = {
    width: 7, height: 9,
    pieces: [
      { id: 1, cells: [{ x: 0, y: 0 }], dir: 'up' }, { id: 2, cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }] }, { id: 3, cells: [{ x: 6, y: 1 }, { x: 5, y: 1 }] },
      { id: 4, cells: [{ x: 1, y: 3 }, { x: 2, y: 3 }] }, { id: 5, cells: [{ x: 4, y: 3 }], dir: 'down' }, { id: 6, cells: [{ x: 6, y: 4 }], dir: 'right' },
      { id: 7, cells: [{ x: 0, y: 5 }, { x: 1, y: 5 }] }, { id: 8, cells: [{ x: 3, y: 6 }, { x: 3, y: 5 }] }, { id: 9, cells: [{ x: 5, y: 6 }, { x: 5, y: 7 }] },
      { id: 10, cells: [{ x: 1, y: 8 }], dir: 'down' }, { id: 11, cells: [{ x: 6, y: 8 }], dir: 'right' },
    ],
  };
  it('turns a board that peels into a solvable knot of the size asked for, deterministically', () => {
    const shape = { keyMoves: 0, answersMax: 30, knotMin: 4 };
    const a = searchKnot(peels, createRng(7), shape, { evals: 150, minLength: 1, maxLength: 2 });
    expect(a).not.toBeNull();
    expect(a!.grade.solvable).toBe(true);
    expect(a!.grade.knot).toBeGreaterThanOrEqual(4);
    expect(a!.grade.answers).toBeLessThanOrEqual(30);
    expect(a!.score).toBe(0);
    const b = searchKnot(peels, createRng(7), shape, { evals: 150, minLength: 1, maxLength: 2 });
    expect(b!.level).toEqual(a!.level);
  }, 60_000);
});
