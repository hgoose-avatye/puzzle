import { describe, expect, it } from 'vitest';
import type { Level } from '../core/types';
import { solve } from './solver';

export const chain: Level = {
  width: 7,
  height: 1,
  pieces: [
    { id: 1, cells: [{ x: 5, y: 0 }, { x: 4, y: 0 }] },
    { id: 2, cells: [{ x: 3, y: 0 }, { x: 2, y: 0 }] },
    { id: 3, cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }] },
  ],
};

describe('solve', () => {
  it('peels a chain into one piece per round', () => {
    expect(solve(chain)).toEqual({ solvable: true, rounds: [[1], [2], [3]], stuck: [] });
  });
  it('reports mutually blocking pieces as stuck instead of throwing', () => {
    const level: Level = {
      width: 5,
      height: 1,
      pieces: [
        { id: 1, cells: [{ x: 1, y: 0 }, { x: 0, y: 0 }] },
        { id: 2, cells: [{ x: 3, y: 0 }, { x: 4, y: 0 }] },
      ],
    };
    const r = solve(level);
    expect(r.solvable).toBe(false);
    expect(r.stuck).toEqual([1, 2]);
  });
  it('an empty level is solved with zero rounds', () => {
    expect(solve({ width: 3, height: 3, pieces: [] })).toEqual({ solvable: true, rounds: [], stuck: [] });
  });
});
