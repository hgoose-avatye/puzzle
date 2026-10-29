import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { validateLevel } from '../core/rules';
import { solve } from '../solver/solver';
import { generateLevel, generateMatching, type GenParams } from './generate';

const params: GenParams = { width: 10, height: 10, pieceCount: 12, minLength: 2, maxLength: 4 };

describe('generateLevel', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    expect(generateLevel(params, createRng(5))).toEqual(generateLevel(params, createRng(5)));
    expect(generateLevel(params, createRng(5))).not.toEqual(generateLevel(params, createRng(6)));
  });
  it('always produces valid, solvable levels with the requested piece count', () => {
    let produced = 0;
    for (let seed = 0; seed < 50; seed++) {
      const level = generateLevel(params, createRng(seed));
      if (!level) continue;
      produced++;
      expect(validateLevel(level, { straightOnly: true, minLength: 2, maxLength: 4 })).toEqual([]);
      expect(solve(level).solvable).toBe(true);
      expect(level.pieces).toHaveLength(12);
    }
    expect(produced).toBeGreaterThan(0);
  });
  it('returns null for impossible parameters', () => {
    expect(generateLevel({ width: 3, height: 3, pieceCount: 20, minLength: 2, maxLength: 4 }, createRng(1))).toBeNull();
  });
});

describe('generateMatching', () => {
  it('returns a level whose metrics fall inside the target', () => {
    const r = generateMatching(params, { rounds: [2, 8] }, createRng(2));
    expect(r).not.toBeNull();
    expect(r!.metrics.rounds).toBeGreaterThanOrEqual(2);
    expect(r!.metrics.rounds).toBeLessThanOrEqual(8);
  });
  it('returns null when the target cannot be met', () => {
    expect(generateMatching(params, { rounds: [100, 200] }, createRng(2), 20)).toBeNull();
  });
});
