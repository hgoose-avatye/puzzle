import { describe, expect, it } from 'vitest';
import { blockersOf, canExit, exitCell, exitRay, headDirection, validateLevel } from './rules';
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
