/**
 * The experiment's rules against the game's own (imported read-only): same exit trace, same blocked / out decision,
 * same run track, on levels made by the game's generator plus this experiment's scenes.
 * Run: npx vitest run --config experiments/2-5d-crocodile/vitest.config.ts
 */
import { describe, expect, it } from 'vitest';
import * as game from '../../../src/core/rules';
import { createRng } from '../../../src/core/rng';
import { generateLevel } from '../../../src/generator/generate';
import { routeOf as gameRoute } from '../../../src/game/flow';
import { trackAt as gameTrackAt } from '../../../src/game/smooth';
import * as mine from '../src/rules';
import { SCENES } from '../src/scenes';

const LEVELS = 300;

function levels(): mine.Level[] {
  const out: mine.Level[] = [];
  for (let seed = 1; out.length < LEVELS && seed < LEVELS * 4; seed++) {
    const rng = createRng(seed);
    const l = generateLevel({ width: 6 + (seed % 3), height: 8 + (seed % 4), pieceCount: 8 + (seed % 8), minLength: 1, maxLength: 3, obstacleCount: seed % 4, arrowCount: 1 + (seed % 4) }, rng);
    if (l && !l.crates?.length) out.push(l as mine.Level);
  }
  return [...out, ...Object.values(SCENES).map((s) => s.level)];
}

describe('experiment rules = game rules', () => {
  const all = levels();

  it(`same exit trace for every piece (${all.length} levels)`, () => {
    let n = 0;
    for (const l of all) for (const p of l.pieces) { expect(mine.traceExit(l, p)).toEqual(game.traceExit(l as never, p as never)); n++; }
    expect(n).toBeGreaterThan(2000);
  });

  it('same blocked / out decision with every animal on the board and with half of them gone', () => {
    for (const [k, l] of all.entries()) {
      const ids = l.pieces.map((p) => p.id);
      for (const alive of [new Set(ids), new Set(ids.filter((id, i) => (i + k) % 2 === 0))]) {
        for (const id of ids) {
          expect(mine.canExit(l, id, alive)).toBe(game.canExit(l as never, id, alive));
          const p = l.pieces.find((q) => q.id === id)!;
          expect(mine.blockersOf(l, p, alive)).toEqual(game.blockersOf(l as never, p as never, alive));
        }
      }
    }
  });

  it('same run track: every block at the same place and heading all along the run', () => {
    let worst = 0;
    for (const l of all) for (const p of l.pieces) {
      const a = mine.routeOf(l, p);
      const b = gameRoute(l as never, p as never);
      expect(a.headStart).toBeCloseTo(b.headStart, 9);
      expect(a.track.length).toBeCloseTo(b.track.length, 9);
      for (let s = a.headStart; s <= a.track.length; s += 0.07) for (let i = 0; i < p.cells.length; i++) {
        const q1 = mine.trackAt(a.track, s - i), q2 = gameTrackAt(b.track, s - i);
        worst = Math.max(worst, Math.hypot(q1.x - q2.x, q1.y - q2.y), Math.abs(q1.angle - q2.angle));
      }
    }
    expect(worst).toBeLessThan(1e-9);
  });
});
