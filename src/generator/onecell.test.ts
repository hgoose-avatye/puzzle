import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { validateLevel } from '../core/rules';
import { solve } from '../solver/solver';
import { generateLevel } from './generate';

describe('generateLevel with one-cell pieces', () => {
  it('produces valid, solvable portrait levels where every one-cell piece has a dir', () => {
    let singles = 0;
    for (let seed = 0; seed < 20; seed++) {
      const level = generateLevel({ width: 8, height: 12, pieceCount: 22, minLength: 1, maxLength: 3 }, createRng(seed));
      expect(level).not.toBeNull();
      expect(validateLevel(level!, { straightOnly: true, minLength: 1, maxLength: 3 })).toEqual([]);
      expect(solve(level!).solvable).toBe(true);
      for (const piece of level!.pieces) if (piece.cells.length === 1) { singles++; expect(piece.dir).toBeDefined(); }
    }
    expect(singles).toBeGreaterThan(0);
  });
});
