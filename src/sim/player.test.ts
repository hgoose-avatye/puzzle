import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import type { Direction, Level, Piece } from '../core/types';
import { believesFree, playOnce, PROFILES, readPiece, simulate } from './player';

const piece = (id: number, cells: Array<[number, number]>, dir?: Direction, extra: Partial<Piece> = {}): Piece => ({ id, cells: cells.map(([x, y]) => ({ x, y })), ...(dir ? { dir } : {}), ...extra });
const level = (pieces: Piece[], extra: Partial<Level> = {}): Level => ({ width: 8, height: 8, pieces, ...extra });
const [careful, average, hasty] = PROFILES;
const all = (l: Level) => new Set(l.pieces.map((p) => p.id));

describe('readPiece', () => {
  it('free, blocked by a piece at a distance, blocked behind a turn, locked and asleep', () => {
    const l = level([
      piece(1, [[0, 0]], 'right'), // blocked by 2 three cells ahead
      piece(2, [[3, 0]], 'up'), // free
      piece(3, [[5, 5]], 'up'), // turns right at (5,3), then hits 4
      piece(4, [[7, 3]], 'down'),
      piece(5, [[0, 7]], 'up', { lock: 1 }),
      piece(6, [[2, 7]], 'down', { key: 1 }),
    ], { arrows: [{ x: 5, y: 3, dir: 'right' }] });
    const a = all(l);
    expect(readPiece(l, l.pieces[0], a)).toEqual({ reason: 'piece', distance: 3, turns: 0 });
    expect(readPiece(l, l.pieces[1], a).reason).toBe('free');
    expect(readPiece(l, l.pieces[2], a)).toEqual({ reason: 'piece', distance: 4, turns: 1 });
    expect(readPiece(l, l.pieces[4], a).reason).toBe('lock');
  });

  it('a facing arrow is a wall', () => {
    const l = level([piece(1, [[0, 0]], 'right')], { arrows: [{ x: 2, y: 0, dir: 'left' }] });
    expect(readPiece(l, l.pieces[0], all(l))).toMatchObject({ reason: 'wall', distance: 2 });
  });
});

describe('believesFree', () => {
  it('far and bent blocks fool the player more; badges rarely do; hasty misreads more than careful', () => {
    const near = { reason: 'piece' as const, distance: 1, turns: 0 };
    const far = { reason: 'piece' as const, distance: 6, turns: 0 };
    const bent = { reason: 'piece' as const, distance: 6, turns: 2 };
    expect(believesFree(average, far)).toBeGreaterThan(believesFree(average, near));
    expect(believesFree(average, bent)).toBeGreaterThan(believesFree(average, far));
    expect(believesFree(average, { reason: 'lock', distance: 0, turns: 0 })).toBeLessThan(believesFree(average, far));
    expect(believesFree(hasty, near)).toBeGreaterThan(believesFree(careful, near));
    expect(believesFree(hasty, { reason: 'piece', distance: 40, turns: 9 })).toBeLessThanOrEqual(0.6);
  });
});

describe('playOnce / simulate', () => {
  it('a board where everything is free is cleared without a single mistake', () => {
    const l = level([piece(1, [[0, 0]], 'up'), piece(2, [[3, 3]], 'left'), piece(3, [[7, 7]], 'down')]);
    const r = playOnce(l, hasty, createRng(1));
    expect(r).toMatchObject({ cleared: true, failed: false, blocked: 0, taps: 3 });
  });

  it('every run ends cleared or failed, and the same seed gives the same numbers', () => {
    const l = level([piece(1, [[0, 3]], 'right'), piece(2, [[6, 3]], 'up'), piece(3, [[6, 1]], 'left'), piece(4, [[1, 1]], 'down')]);
    const a = simulate(l, average, createRng(7), 100, 3);
    const b = simulate(l, average, createRng(7), 100, 3);
    expect(a).toEqual(b);
    for (let s = 0; s < 50; s++) {
      const r = playOnce(l, hasty, createRng(s), 3);
      expect(r.cleared || r.failed).toBe(true);
    }
  });

  it('a hasty player makes more mistakes than a careful one on a level with hidden blocks', () => {
    // three animals blocked from far away by one that is free
    const l = level([
      piece(1, [[0, 0]], 'right'), piece(2, [[7, 0]], 'up'),
      piece(3, [[0, 7]], 'right'), piece(4, [[6, 7]], 'up'),
      piece(5, [[0, 4]], 'right'), piece(6, [[7, 4]], 'down'),
    ]);
    const c = simulate(l, careful, createRng(3), 300);
    const h = simulate(l, hasty, createRng(3), 300);
    expect(h.blockedPerRun).toBeGreaterThan(c.blockedPerRun);
  });

  it('a player who plans clears the way to a blocked bomb in time more often than one who does not', () => {
    // bomb 2 is behind 1; fuse leaves room for exactly the focused plan plus one spare tap; 3..6 are free distractions
    const l = level([
      piece(1, [[3, 2]], 'up'), piece(2, [[3, 5]], 'up', { fuse: 3 }),
      piece(3, [[0, 0]], 'left'), piece(4, [[7, 0]], 'right'), piece(5, [[0, 7]], 'left'), piece(6, [[7, 7]], 'right'),
    ]);
    const planner = { ...average, bombPlan: 1 };
    const drifter = { ...average, bombPlan: 0 };
    expect(simulate(l, planner, createRng(5), 200).failRate).toBe(0);
    expect(simulate(l, drifter, createRng(5), 200).failRate).toBeGreaterThan(0.3);
  });
});
