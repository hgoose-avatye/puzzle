import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import type { Level } from '../core/types';
import { computeMetrics, randomWasteRatio } from './metrics';
import { chain } from './solver.test';

const free: Level = {
  width: 5,
  height: 2,
  pieces: [
    { id: 1, cells: [{ x: 2, y: 0 }, { x: 1, y: 0 }] },
    { id: 2, cells: [{ x: 2, y: 1 }, { x: 1, y: 1 }] },
  ],
};

describe('computeMetrics', () => {
  it('measures a three-piece chain', () => {
    const m = computeMetrics(chain);
    expect(m.rounds).toBe(3);
    expect(m.roundSizes).toEqual([1, 1, 1]);
    expect(m.initialFreeRatio).toBeCloseTo(1 / 3);
    expect(m.avgBlockers).toBeCloseTo(1);
    expect(m.surge).toBeCloseTo(1 / 3);
    expect(m.pieceCount).toBe(3);
  });
  it('throws for an unsolvable level', () => {
    const level: Level = {
      width: 5,
      height: 1,
      pieces: [
        { id: 1, cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }] },
        { id: 2, cells: [{ x: 3, y: 0 }, { x: 4, y: 0 }] },
      ],
    };
    expect(() => computeMetrics(level)).toThrow();
  });
  it('handles an empty level without dividing by zero', () => {
    expect(computeMetrics({ width: 3, height: 3, pieces: [] })).toEqual({
      pieceCount: 0, rounds: 0, roundSizes: [], initialFreeRatio: 1, avgBlockers: 0, surge: 0,
    });
  });
});

describe('randomWasteRatio', () => {
  it('is deterministic for a seed', () => {
    expect(randomWasteRatio(chain, createRng(3))).toBe(randomWasteRatio(chain, createRng(3)));
  });
  it('is 0 when nothing blocks anything', () => {
    expect(randomWasteRatio(free, createRng(1))).toBe(0);
  });
  it('is strictly between 0 and 1 for a chain', () => {
    const r = randomWasteRatio(chain, createRng(1));
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(1);
  });
});
