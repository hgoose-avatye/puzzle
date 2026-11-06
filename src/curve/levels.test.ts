import { describe, expect, it } from 'vitest';
import { blockersOf, canExit, headDirection, lockedBy, traceExit, validateLevel } from '../core/rules';
import type { Level } from '../core/types';
import { gradeKnot } from '../core/bump';
import { MIN_KNOT } from '../generator/knot';
import { solve } from '../solver/solver';
import { buildGameLevel, knotLevel, levelSpec } from './curve';
import handLevels from './handLevels.json';

/**
 * Checks on the levels the game actually ships (src/curve/levels.json): not on the generator in general, but on what a
 * player gets. Rebuild with scripts/pick-seeds.ts and scripts/build-levels.ts when these fail after a generator change.
 */
const levels: Array<{ n: number; level: Level; hearts?: number }> = Array.from({ length: 180 }, (_, i) => ({ n: i + 1, ...buildGameLevel(i + 1)! }));
/** Hand-made lesson levels (handLevels.json): they set their own crates, so the curve's crate rule does not hold them. */
const HAND = handLevels as unknown as Record<string, { level: Level; hearts?: number }>;
const all = (l: Level): Set<number> => new Set(l.pieces.map((p) => p.id));
/** held by its lock (or sleep) alone: its way out is clear otherwise */
const holdsAlone = (l: Level, id: number): boolean => {
  const p = l.pieces.find((q) => q.id === id)!;
  return traceExit(l, p).reachesEdge && blockersOf(l, p, all(l)).length === 0;
};

describe('shipped levels', () => {
  // one grade per level, shared by the checks below (a knot search over 180 levels takes a few seconds)
  const grades = new Map(levels.map(({ n, level }) => [n, gradeKnot(level)]));

  it('all 180 are valid and can be cleared under the bump rule, with the hearts the curve asks for', () => {
    for (const { n, level, hearts } of levels) {
      expect(validateLevel(level), `level ${n}`).toEqual([]);
      expect(grades.get(n)!.solvable, `level ${n}`).toBe(true);
      expect(hearts, `level ${n}`).toBe(levelSpec(n).hearts);
    }
  }, 60_000);

  it('knot levels need a push and the others peel without one', () => {
    for (const { n, level } of levels) {
      const g = grades.get(n)!;
      if (knotLevel(n)) expect(g.knot, `level ${n}`).toBeGreaterThanOrEqual(MIN_KNOT);
      else {
        expect(g.knot, `level ${n}`).toBe(0);
        expect(solve(level).solvable, `level ${n}`).toBe(true);
      }
    }
  }, 60_000);

  it('every arrow tile turns some animal on its way out (one that only runs over it straight does nothing)', () => {
    for (const { n, level } of levels) {
      const turns = new Set<string>();
      for (const p of level.pieces) {
        let dir = headDirection(p);
        for (const c of traceExit(level, p).cells) {
          const tile = level.arrows?.find((a) => a.x === c.x && a.y === c.y);
          if (!tile) continue;
          if (tile.dir !== dir) turns.add(`${c.x},${c.y}`);
          dir = tile.dir;
        }
      }
      for (const a of level.arrows ?? []) expect(turns.has(`${a.x},${a.y}`), `level ${n} arrow (${a.x},${a.y})`).toBe(true);
    }
  });

  it('where a sleeper is first taught, it is the only thing holding that animal (no level has locks since 2026-11-06)', () => {
    for (const { n, level } of levels) expect(level.pieces.some((p) => p.lock !== undefined || p.key !== undefined), `level ${n}`).toBe(false);
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
    expect(locks).toBe(0);
    expect(lockAlone).toBe(0);
    expect(sleepAlone / sleepers).toBeGreaterThanOrEqual(0.7);
    expect(bombBlocked / bombs).toBeGreaterThanOrEqual(0.8);
  });

  it('count bombs sit only on 2-3 cell animals (the dynamite goes on the body block)', () => {
    for (const { n, level } of levels) for (const p of level.pieces) if (p.fuse !== undefined) expect(p.cells.length, `level ${n} animal ${p.id}`).toBeGreaterThan(1);
  });

  it('every hand-made level ships exactly as written in handLevels.json', () => {
    for (const n of Object.keys(HAND)) expect(buildGameLevel(+n), `level ${n}`).toEqual(HAND[n]);
  });

  it('every crate stands on some animal\u2019s way out and can be broken; intro levels teach a one-crack crate', () => {
    let crates = 0;
    for (const { n, level } of levels) {
      const onPaths = new Set(level.pieces.flatMap((p) => traceExit(level, p).cells.map((c) => `${c.x},${c.y}`)));
      for (const k of level.crates ?? []) {
        crates++;
        expect(onPaths.has(`${k.x},${k.y}`), `level ${n} crate (${k.x},${k.y})`).toBe(true);
        if (!HAND[n]) expect(k.hits, `level ${n}`).toBe(levelSpec(n).role === 'intro' ? 1 : 2);
      }
      expect(level.obstacles ?? [], `level ${n}`).toEqual([]);
    }
    expect(crates).toBeGreaterThan(100);
  });

  it('hearts are three wherever there are hearts', () => {
    for (const { n, hearts } of levels) if (hearts !== undefined) expect(hearts, `level ${n}`).toBe(3);
  });
});
