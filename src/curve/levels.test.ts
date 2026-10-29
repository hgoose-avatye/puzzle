import { describe, expect, it } from 'vitest';
import { blockersOf, canExit, lockedBy, traceExit, validateLevel } from '../core/rules';
import type { Level } from '../core/types';
import { solve } from '../solver/solver';
import { buildGameLevel, levelSpec } from './curve';

/**
 * Checks on the levels the game actually ships (src/curve/levels.json): not on the generator in general, but on what a
 * player gets. Rebuild with scripts/pick-seeds.ts and scripts/build-levels.ts when these fail after a generator change.
 */
const levels: Array<{ n: number; level: Level; hearts?: number }> = Array.from({ length: 180 }, (_, i) => ({ n: i + 1, ...buildGameLevel(i + 1)! }));
const all = (l: Level): Set<number> => new Set(l.pieces.map((p) => p.id));
/** held by its lock (or sleep) alone: its way out is clear otherwise */
const holdsAlone = (l: Level, id: number): boolean => {
  const p = l.pieces.find((q) => q.id === id)!;
  return traceExit(l, p).reachesEdge && blockersOf(l, p, all(l)).length === 0;
};

describe('shipped levels', () => {
  it('all 180 are valid and solvable, with the hearts the curve asks for', () => {
    for (const { n, level, hearts } of levels) {
      expect(validateLevel(level), `level ${n}`).toEqual([]);
      expect(solve(level).solvable, `level ${n}`).toBe(true);
      expect(hearts, `level ${n}`).toBe(levelSpec(n).hearts);
    }
  });

  it('every arrow tile lies on the way out of some animal', () => {
    for (const { n, level } of levels) {
      const onPaths = new Set(level.pieces.flatMap((p) => traceExit(level, p).cells.map((c) => `${c.x},${c.y}`)));
      for (const a of level.arrows ?? []) expect(onPaths.has(`${a.x},${a.y}`), `level ${n} arrow (${a.x},${a.y})`).toBe(true);
    }
  });

  it('where a lock or a sleeper is first taught, it is the only thing holding that animal', () => {
    for (const n of [61, 62, 63]) {
      const l = levels[n - 1].level;
      const locked = l.pieces.filter((p) => p.lock !== undefined && lockedBy(l, p, all(l)) !== undefined);
      expect(locked.some((p) => holdsAlone(l, p.id)), `level ${n}`).toBe(true);
    }
    for (const n of [91, 92, 93]) {
      const l = levels[n - 1].level;
      expect(l.pieces.some((p) => p.sleeping && holdsAlone(l, p.id)), `level ${n}`).toBe(true);
    }
  });

  it('most locks and sleepers matter, and most bombs start blocked', () => {
    let locks = 0, lockAlone = 0, sleepers = 0, sleepAlone = 0, bombs = 0, bombBlocked = 0;
    for (const { level: l } of levels) {
      for (const p of l.pieces) {
        if (p.lock !== undefined) { locks++; if (holdsAlone(l, p.id)) lockAlone++; }
        if (p.sleeping) { sleepers++; if (holdsAlone(l, p.id)) sleepAlone++; }
        if (p.fuse !== undefined) { bombs++; if (!canExit(l, p.id, all(l))) bombBlocked++; }
      }
    }
    expect(lockAlone / locks).toBeGreaterThanOrEqual(0.7);
    expect(sleepAlone / sleepers).toBeGreaterThanOrEqual(0.7);
    expect(bombBlocked / bombs).toBeGreaterThanOrEqual(0.8);
  });
});
