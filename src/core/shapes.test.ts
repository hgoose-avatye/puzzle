import { describe, expect, it } from 'vitest';
import { canExit, onBoard, traceExit, validateLevel } from './rules';
import { BOARD_SHAPES, isOrthogonallyConvex, shapeVoids } from './shapes';
import type { Level } from './types';

describe('board shapes', () => {
  it('every shape on the game board size is orthogonally convex and keeps most of the box', () => {
    for (const shape of BOARD_SHAPES) {
      const voids = shapeVoids(shape, 8, 12);
      expect(isOrthogonallyConvex(8, 12, voids), shape).toBe(true);
      expect(96 - voids.length, shape).toBeGreaterThanOrEqual(70);
    }
    expect(shapeVoids('rect', 8, 12)).toEqual([]);
  });

  it('shapes really differ from each other', () => {
    const keys = BOARD_SHAPES.map((s) => shapeVoids(s, 8, 12).map((c) => `${c.x},${c.y}`).join(' '));
    expect(new Set(keys).size).toBe(BOARD_SHAPES.length);
  });

  it('detects a row broken in two', () => {
    expect(isOrthogonallyConvex(5, 3, [{ x: 2, y: 1 }])).toBe(false);
    expect(isOrthogonallyConvex(5, 3, [{ x: 0, y: 0 }])).toBe(true);
  });
});

describe('rules on a shaped board', () => {
  // 6x6 with the top-left 2x2 corner cut off
  const voids = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];

  it('a void cell is not on the board', () => {
    const l: Level = { width: 6, height: 6, voids, pieces: [] };
    expect(onBoard(l, 0, 0)).toBe(false);
    expect(onBoard(l, 2, 0)).toBe(true);
    expect(onBoard(l, 6, 0)).toBe(false);
  });

  it('stepping onto a void leaves the board: the exit sits at the cut, not at the box edge', () => {
    const l: Level = { width: 6, height: 6, voids, pieces: [{ id: 1, cells: [{ x: 4, y: 1 }], dir: 'left' }] };
    const t = traceExit(l, l.pieces[0]);
    expect(t.reachesEdge).toBe(true);
    expect(t.cells).toEqual([{ x: 3, y: 1 }, { x: 2, y: 1 }]);
  });

  it('a piece behind the cut is still blocked by a piece in front of it', () => {
    const l: Level = { width: 6, height: 6, voids, pieces: [{ id: 1, cells: [{ x: 4, y: 1 }], dir: 'left' }, { id: 2, cells: [{ x: 2, y: 1 }], dir: 'up' }] };
    expect(canExit(l, 1, new Set([1, 2]))).toBe(false);
    expect(canExit(l, 1, new Set([1]))).toBe(true);
  });

  it('validation rejects pieces and fixtures on voids, and a broken outline', () => {
    const onVoid: Level = { width: 6, height: 6, voids, pieces: [{ id: 1, cells: [{ x: 0, y: 0 }], dir: 'up' }], obstacles: [{ x: 1, y: 1 }] };
    const errors = validateLevel(onVoid);
    expect(errors.some((e) => e.includes('piece 1') && e.includes('out of bounds'))).toBe(true);
    expect(errors.some((e) => e.includes('fixture (1,1)'))).toBe(true);
    const broken: Level = { width: 5, height: 3, voids: [{ x: 2, y: 1 }], pieces: [] };
    expect(validateLevel(broken)).toContain('board outline is not orthogonally convex');
  });
});
