import { describe, expect, it } from 'vitest';
import type { Level } from '../core/types';
import { solve } from './solver';

describe('solve with one-cell pieces', () => {
  it('orders one-cell pieces by blocking', () => {
    const level: Level = {
      width: 5,
      height: 1,
      pieces: [
        { id: 1, cells: [{ x: 1, y: 0 }], dir: 'right' },
        { id: 2, cells: [{ x: 3, y: 0 }], dir: 'right' },
      ],
    };
    expect(solve(level)).toEqual({ solvable: true, rounds: [[2], [1]], stuck: [] });
  });
});
