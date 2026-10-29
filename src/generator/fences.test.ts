import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { headDirection, traceExit, validateLevel } from '../core/rules';
import { solve } from '../solver/solver';
import { generateLevel } from './generate';

describe('generateLevel with obstacles and direction arrows', () => {
  it('places the fixtures, keeps every piece able to exit, and bends some paths', () => {
    let bent = 0;
    for (let seed = 0; seed < 20; seed++) {
      const level = generateLevel(
        { width: 8, height: 12, pieceCount: 20, minLength: 1, maxLength: 3, obstacleCount: 6, arrowCount: 4 },
        createRng(seed),
      );
      expect(level).not.toBeNull();
      expect(level!.obstacles).toHaveLength(6);
      expect(level!.arrows).toHaveLength(4);
      expect(validateLevel(level!, { straightOnly: true, minLength: 1, maxLength: 3 })).toEqual([]);
      expect(solve(level!).solvable).toBe(true);
      for (const piece of level!.pieces) if (traceExit(level!, piece).endDir !== headDirection(piece)) bent++;
    }
    expect(bent).toBeGreaterThan(0);
  });
});
