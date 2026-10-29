import { describe, expect, it } from 'vitest';
import { blockersOf, canExit, exitCell, exitRay, headDirection, traceExit, validateLevel } from './rules';
import type { Cell, Level, Piece } from './types';

const c = (x: number, y: number): Cell => ({ x, y });
const p = (id: number, ...cells: [number, number][]): Piece => ({ id, cells: cells.map(([x, y]) => c(x, y)) });
const lvl = (width: number, height: number, ...pieces: Piece[]): Level => ({ width, height, pieces });

describe('headDirection', () => {
  it('points from cells[1] to cells[0]', () => {
    expect(headDirection(p(1, [3, 2], [2, 2]))).toBe('right');
    expect(headDirection(p(1, [1, 1], [1, 2]))).toBe('up');
  });
  it('throws for a single-cell piece', () => {
    expect(() => headDirection(p(1, [1, 1]))).toThrow();
  });
});

describe('exit ray, exit cell, blockers', () => {
  const a = p(1, [3, 2], [2, 2]); // faces right, ray [(4,2)]
  const b = p(2, [4, 2], [4, 3]); // sits on a's ray, faces up
  const edge = p(3, [4, 2], [3, 2]); // head already on the edge, faces right
  it('exitRay lists cells from after the head to the board edge', () => {
    expect(exitRay(lvl(5, 5, a), a)).toEqual([c(4, 2)]);
    expect(exitRay(lvl(5, 5, edge), edge)).toEqual([]);
  });
  it('exitCell is the last in-bounds cell of head + ray', () => {
    expect(exitCell(lvl(5, 5, a), a)).toEqual(c(4, 2));
    expect(exitCell(lvl(5, 5, edge), edge)).toEqual(c(4, 2));
  });
  it('blockersOf only counts alive pieces on the ray', () => {
    const level = lvl(5, 5, a, b);
    expect(blockersOf(level, a, new Set([1, 2]))).toEqual([2]);
    expect(blockersOf(level, a, new Set([1]))).toEqual([]);
  });
  it('canExit follows blockers', () => {
    const level = lvl(5, 5, a, b);
    expect(canExit(level, 1, new Set([1, 2]))).toBe(false);
    expect(canExit(level, 1, new Set([1]))).toBe(true);
  });
});

describe('validateLevel', () => {
  it('accepts a valid level', () => {
    expect(validateLevel(lvl(5, 5, p(1, [3, 2], [2, 2]), p(2, [0, 0], [0, 1])))).toEqual([]);
  });
  it('rejects out-of-bounds, overlapping, non-contiguous and one-cell pieces without throwing', () => {
    expect(validateLevel(lvl(3, 3, p(1, [3, 0], [2, 0]))).length).toBeGreaterThan(0);
    expect(validateLevel(lvl(5, 5, p(1, [1, 1], [0, 1]), p(2, [1, 1], [1, 2]))).length).toBeGreaterThan(0);
    expect(validateLevel(lvl(5, 5, p(1, [0, 0], [2, 0]))).length).toBeGreaterThan(0);
    expect(validateLevel(lvl(5, 5, p(1, [0, 0]))).length).toBeGreaterThan(0);
  });
  it('straightOnly rejects an L piece, length limits are enforced', () => {
    const l = lvl(5, 5, p(1, [2, 0], [1, 0], [1, 1]));
    expect(validateLevel(l)).toEqual([]);
    expect(validateLevel(l, { straightOnly: true }).length).toBeGreaterThan(0);
    const line = lvl(6, 1, p(1, [5, 0], [4, 0], [3, 0], [2, 0], [1, 0], [0, 0]));
    expect(validateLevel(line, { minLength: 2, maxLength: 5 }).length).toBeGreaterThan(0);
  });
});

describe('one-cell pieces and explicit dir', () => {
  const single: Piece = { id: 1, cells: [c(2, 2)], dir: 'right' };
  it('uses dir for direction, exit ray and exit cell', () => {
    const level = lvl(5, 5, single);
    expect(headDirection(single)).toBe('right');
    expect(exitRay(level, single)).toEqual([c(3, 2), c(4, 2)]);
    expect(exitCell(level, single)).toEqual(c(4, 2));
  });
  it('validateLevel accepts a one-cell piece with dir, rejects it without dir', () => {
    expect(validateLevel(lvl(5, 5, single), { minLength: 1 })).toEqual([]);
    expect(validateLevel(lvl(5, 5, { id: 1, cells: [c(2, 2)] })).length).toBeGreaterThan(0);
  });
  it('rejects a dir that contradicts the body of a longer piece', () => {
    expect(validateLevel(lvl(5, 5, { id: 1, cells: [c(3, 2), c(2, 2)], dir: 'up' })).length).toBeGreaterThan(0);
  });
  it('a bent piece whose own tail lies ahead of its head is not blocked by itself', () => {
    const u = p(1, [1, 0], [0, 0], [0, 1], [1, 1], [2, 1], [2, 0]);
    const level = lvl(5, 5, u);
    expect(validateLevel(level)).toEqual([]);
    expect(blockersOf(level, u, new Set([1]))).toEqual([]);
  });
});

describe('direction arrows and obstacles', () => {
  const mover = p(1, [1, 2], [0, 2]); // faces right
  const withFixtures = (pieces: Piece[], extra: Partial<Level>): Level => ({ ...lvl(5, 5, ...pieces), ...extra });

  it('bends the exit path at an arrow tile and reports where the gate is', () => {
    const level = withFixtures([mover], { arrows: [{ x: 3, y: 2, dir: 'up' }] });
    const t = traceExit(level, mover);
    expect(t.reachesEdge).toBe(true);
    expect(t.cells).toEqual([c(2, 2), c(3, 2), c(3, 1), c(3, 0)]);
    expect(t.endDir).toBe('up');
    expect(exitCell(level, mover)).toEqual(c(3, 0));
  });
  it('blockers follow the bent path', () => {
    const other = p(2, [3, 1], [4, 1]);
    const level = withFixtures([mover, other], { arrows: [{ x: 3, y: 2, dir: 'up' }] });
    expect(blockersOf(level, mover, new Set([1, 2]))).toEqual([2]);
  });
  it('an arrow facing the incoming piece is a wall', () => {
    const level = withFixtures([mover], { arrows: [{ x: 3, y: 2, dir: 'left' }] });
    expect(traceExit(level, mover).reachesEdge).toBe(false);
    expect(canExit(level, 1, new Set([1]))).toBe(false);
  });
  it('an obstacle on the path means the piece can never exit', () => {
    const level = withFixtures([mover], { obstacles: [c(3, 2)] });
    expect(canExit(level, 1, new Set([1]))).toBe(false);
    expect(validateLevel(level).length).toBeGreaterThan(0);
  });
  it('a loop of arrows terminates and cannot exit', () => {
    const level = withFixtures([mover], {
      arrows: [{ x: 2, y: 2, dir: 'down' }, { x: 2, y: 3, dir: 'right' }, { x: 3, y: 3, dir: 'up' }, { x: 3, y: 2, dir: 'left' }],
    });
    expect(traceExit(level, mover).reachesEdge).toBe(false);
  });
  it('validateLevel rejects fixtures that overlap pieces, each other or leave the board', () => {
    expect(validateLevel(withFixtures([mover], { obstacles: [c(1, 2)] })).length).toBeGreaterThan(0);
    expect(validateLevel(withFixtures([mover], { obstacles: [c(4, 4)], arrows: [{ x: 4, y: 4, dir: 'up' }] })).length).toBeGreaterThan(0);
    expect(validateLevel(withFixtures([mover], { obstacles: [c(9, 9)] })).length).toBeGreaterThan(0);
  });
});
