import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { validateLevel } from '../core/rules';
import { solve } from '../solver/solver';
import { tapsToExit } from '../solver/plan';
import { generateLevel } from './generate';

describe('generateLevel with keys, sleepers and bombs', () => {
  it('adds the requested mechanics while staying valid and solvable', () => {
    for (let seed = 0; seed < 15; seed++) {
      const level = generateLevel(
        { width: 8, height: 12, pieceCount: 20, minLength: 1, maxLength: 3, lockCount: 2, sleepCount: 2, bombCount: 2 },
        createRng(seed),
      );
      expect(level).not.toBeNull();
      expect(validateLevel(level!, { straightOnly: true, minLength: 1, maxLength: 3 })).toEqual([]);
      expect(solve(level!).solvable).toBe(true);
      expect(level!.pieces.filter((p) => p.lock !== undefined)).toHaveLength(2);
      expect(level!.pieces.filter((p) => p.key !== undefined)).toHaveLength(2);
      expect(level!.pieces.filter((p) => p.sleeping)).toHaveLength(2);
      const bombs = level!.pieces.filter((p) => p.fuse !== undefined);
      expect(bombs).toHaveLength(2);
      for (const b of bombs) expect(b.fuse!).toBeGreaterThanOrEqual(tapsToExit(level!, b.id)!);
    }
  });
});
