import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

const take = (seed: number, n: number) => {
  const r = createRng(seed);
  return Array.from({ length: n }, () => r.next());
};

describe('createRng', () => {
  it('same seed gives the same sequence', () => {
    expect(take(7, 10)).toEqual(take(7, 10));
  });
  it('different seeds give different sequences', () => {
    expect(take(7, 10)).not.toEqual(take(8, 10));
  });
  it('int is inclusive on both ends', () => {
    const r = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect(seen.has(2)).toBe(true);
    expect(seen.has(5)).toBe(true);
  });
});
