import { describe, expect, it } from 'vitest';
import { generateLevelFor, levelSpec } from './curve';

describe('levelSpec', () => {
  it('assigns roles on a 30-level chapter', () => {
    expect(levelSpec(1).role).toBe('intro');
    expect(levelSpec(5).role).toBe('rest');
    expect(levelSpec(10).role).toBe('tough');
    expect(levelSpec(15).role).toBe('rest');
    expect(levelSpec(20).role).toBe('tough');
    expect(levelSpec(30).role).toBe('finale');
  });
  it('wraps to the next chapter and rejects level numbers below 1', () => {
    expect(levelSpec(31).role).toBe(levelSpec(1).role);
    expect(() => levelSpec(0)).toThrow();
  });
  it('gives every level a board that can hold its pieces and a non-empty target', () => {
    for (let n = 1; n <= 30; n++) {
      const { params, target } = levelSpec(n);
      expect(params.pieceCount).toBeLessThan(params.width * params.height);
      expect(target.rounds).toBeDefined();
    }
  });
  it('asks for deeper chains on tough levels than on intro levels', () => {
    expect(levelSpec(10).target.rounds![0]).toBeGreaterThan(levelSpec(1).target.rounds![1]);
  });
});

describe('generateLevelFor', () => {
  it('is deterministic and meets the level target', () => {
    for (const n of [1, 5, 12]) {
      const a = generateLevelFor(n, 7);
      const b = generateLevelFor(n, 7);
      expect(a).not.toBeNull();
      expect(a!.level).toEqual(b!.level);
      const [lo, hi] = levelSpec(n).target.rounds!;
      expect(a!.metrics.rounds).toBeGreaterThanOrEqual(lo);
      expect(a!.metrics.rounds).toBeLessThanOrEqual(hi);
    }
  });
  it('accepts parameter overrides such as obstacles and arrows', () => {
    const r = generateLevelFor(1, 1, { obstacleCount: 3, arrowCount: 2 });
    expect(r).not.toBeNull();
    expect(r!.level.obstacles).toHaveLength(3);
    expect(r!.level.arrows).toHaveLength(2);
  });
});

describe('fixtures and hearts on the curve', () => {
  const arrows = (n: number): number => levelSpec(n).params.arrowCount ?? 0;
  it('introduces direction arrows gradually and relieves them on rest levels', () => {
    for (const n of [1, 2, 3, 4, 5, 15, 25]) expect(arrows(n)).toBe(0);
    expect(arrows(6)).toBeGreaterThanOrEqual(1);
    expect(arrows(8)).toBeGreaterThan(arrows(6));
    expect(arrows(10)).toBeGreaterThanOrEqual(5);
    expect(arrows(30)).toBeGreaterThanOrEqual(5);
  });
  it('gives hearts from the first tough level on, but not on rest levels', () => {
    for (const n of [1, 6, 9, 15, 25]) expect(levelSpec(n).hearts).toBeUndefined();
    for (const n of [10, 12, 20, 29, 30]) expect(levelSpec(n).hearts).toBe(3);
  });
  it('generated levels carry the requested number of arrow tiles', () => {
    const r = generateLevelFor(8, 1);
    expect(r).not.toBeNull();
    expect(r!.level.arrows).toHaveLength(levelSpec(8).params.arrowCount!);
  });
});
