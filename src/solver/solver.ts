import { canExit } from '../core/rules';
import type { Level } from '../core/types';

export interface SolveResult {
  solvable: boolean;
  /** rounds[i] = ids that can leave at the start of round i. */
  rounds: number[][];
  /** Ids that never become free (empty when solvable). */
  stuck: number[];
}

export function solve(level: Level): SolveResult {
  const alive = new Set(level.pieces.map((p) => p.id));
  const rounds: number[][] = [];
  while (alive.size > 0) {
    const free = [...alive].filter((id) => canExit(level, id, alive)).sort((a, b) => a - b);
    if (free.length === 0) return { solvable: false, rounds, stuck: [...alive].sort((a, b) => a - b) };
    rounds.push(free);
    for (const id of free) alive.delete(id);
  }
  return { solvable: true, rounds, stuck: [] };
}
