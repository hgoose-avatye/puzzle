import { describe, expect, it } from 'vitest';
import { createGame, tap } from './game';
import { canExit, crateCracks, crateStanding, validateLevel } from './rules';
import type { Level } from './types';
import { solve } from '../solver/solver';
import { nextTapToward, winnable } from '../solver/plan';
import { createRng } from './rng';
import { generateLevel } from '../generator/generate';
import { traceExit } from './rules';

// 1 heads right along row 2 and meets the crate at (3,2); 2 and 3 sit next to the crate and leave upwards
const level: Level = {
  width: 7, height: 5,
  pieces: [
    { id: 1, cells: [{ x: 1, y: 2 }], dir: 'right' },
    { id: 2, cells: [{ x: 3, y: 1 }], dir: 'up' },
    { id: 3, cells: [{ x: 3, y: 3 }], dir: 'down' },
  ],
  crates: [{ x: 3, y: 2, hits: 2 }],
};
const all = new Set([1, 2, 3]);

describe('crates', () => {
  it('block like an animal until enough neighbours have left', () => {
    expect(canExit(level, 1, all)).toBe(false);
    expect(crateCracks(level, level.crates![0], new Set([1, 3]))).toBe(1);
    expect(canExit(level, 1, new Set([1, 3]))).toBe(false); // one crack is not enough
    expect(crateStanding(level, level.crates![0], new Set([1]))).toBe(false);
    expect(canExit(level, 1, new Set([1]))).toBe(true);
  });

  it('a tap blocked by a crate says so, and the game plays through once it breaks', () => {
    let s = createGame(level);
    const r = tap(s, 1);
    expect(r.event).toMatchObject({ type: 'blocked', crates: 1, blockers: [] });
    s = tap(tap(s, 2).state, 3).state;
    expect(tap(s, 1).event.type).toBe('exited');
  });

  it('solver, planner and the exhaustive check all understand crates', () => {
    expect(solve(level).solvable).toBe(true);
    expect([2, 3]).toContain(nextTapToward(level, all, 1));
    expect(winnable(level)).toBe(true);
    const stuck: Level = { ...level, crates: [{ x: 3, y: 2, hits: 3 }] };
    expect(validateLevel(stuck).some((e) => e.includes('can never break'))).toBe(true);
  });

  it('the generator puts every crate on somebody’s way out and the level stays solvable', () => {
    let made = 0;
    for (let seed = 0; seed < 12; seed++) {
      const l = generateLevel({ width: 8, height: 11, pieceCount: 18, minLength: 1, maxLength: 3, crateCount: 2, arrowCount: 1 }, createRng(seed));
      if (!l) continue;
      made++;
      expect(validateLevel(l)).toEqual([]);
      expect(solve(l).solvable).toBe(true);
      expect(l.crates).toHaveLength(2);
      const onPaths = new Set(l.pieces.flatMap((p) => traceExit(l, p).cells.map((c) => `${c.x},${c.y}`)));
      for (const k of l.crates!) expect(onPaths.has(`${k.x},${k.y}`)).toBe(true);
    }
    expect(made).toBeGreaterThan(5);
  });

  it('on a teaching level the crate is the only thing in its owner’s way', () => {
    for (let seed = 0; seed < 8; seed++) {
      const l = generateLevel({ width: 6, height: 9, pieceCount: 9, minLength: 1, maxLength: 2, crateCount: 1, teach: true }, createRng(seed));
      if (!l) continue;
      const everyone = new Set(l.pieces.map((p) => p.id));
      const k = l.crates![0];
      const owners = l.pieces.filter((p) => traceExit(l, p).cells.some((c) => c.x === k.x && c.y === k.y));
      // removing just the crate frees at least one owner
      const noCrate = { ...l, crates: [] };
      expect(owners.some((p) => !canExit(l, p.id, everyone) && canExit(noCrate, p.id, everyone))).toBe(true);
    }
  });
});
