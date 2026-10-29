import { createGame, isCleared, tap } from '../core/game';
import type { Rng } from '../core/rng';
import { blockersOf } from '../core/rules';
import type { Level } from '../core/types';
import { solve } from './solver';

export interface Metrics {
  pieceCount: number;
  /** Peeling rounds; equals the longest dependency chain. */
  rounds: number;
  roundSizes: number[];
  initialFreeRatio: number;
  avgBlockers: number;
  /** Share of pieces leaving in the last ceil(rounds/3) rounds. */
  surge: number;
}

export function computeMetrics(level: Level): Metrics {
  const result = solve(level);
  if (!result.solvable) throw new Error(`level is unsolvable; stuck pieces: ${result.stuck.join(',')}`);
  const n = level.pieces.length;
  const roundSizes = result.rounds.map((r) => r.length);
  if (n === 0) return { pieceCount: 0, rounds: 0, roundSizes, initialFreeRatio: 1, avgBlockers: 0, surge: 0 };
  const all = new Set(level.pieces.map((p) => p.id));
  const blockerTotal = level.pieces.reduce((sum, p) => sum + blockersOf(level, p, all).length, 0);
  const lastCount = Math.ceil(roundSizes.length / 3);
  const lastSum = roundSizes.slice(roundSizes.length - lastCount).reduce((a, b) => a + b, 0);
  return {
    pieceCount: n,
    rounds: roundSizes.length,
    roundSizes,
    initialFreeRatio: roundSizes[0] / n,
    avgBlockers: blockerTotal / n,
    surge: lastSum / n,
  };
}

/** Average share of blocked taps when a player taps random remaining pieces until clear. */
export function randomWasteRatio(level: Level, rng: Rng, trials = 50): number {
  if (!solve(level).solvable) throw new Error('level is unsolvable');
  let total = 0;
  for (let t = 0; t < trials; t++) {
    let state = createGame(level);
    while (!isCleared(state)) {
      const ids = [...state.alive];
      state = tap(state, ids[rng.int(0, ids.length - 1)]).state;
    }
    total += state.taps === 0 ? 0 : state.blockedTaps / state.taps;
  }
  return total / trials;
}
