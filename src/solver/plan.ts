import { createGame, tap } from '../core/game';
import { blockersOf, canExit, isAsleep, lockedBy, neighborsOf, traceExit } from '../core/rules';
import type { Level } from '../core/types';

function nextTap(level: Level, alive: ReadonlySet<number>, id: number, seen: Set<number>): number | null {
  if (seen.has(id)) return null;
  seen.add(id);
  const piece = level.pieces.find((p) => p.id === id);
  if (!piece || !traceExit(level, piece).reachesEdge) return null;
  if (canExit(level, id, alive)) return id;
  const needs = [...blockersOf(level, piece, alive)];
  const key = lockedBy(level, piece, alive);
  if (key !== undefined) needs.push(key);
  if (isAsleep(level, piece, alive)) needs.push(...neighborsOf(level, piece).filter((n) => alive.has(n)));
  for (const n of needs) {
    const t = nextTap(level, alive, n, seen);
    if (t !== null) return t;
  }
  return null;
}

/**
 * Number of taps (including the final one) a focused player needs to get piece `id` off the board:
 * repeatedly tap the first thing that stands in its way. Fuses are ignored. Null if it cannot be done.
 */
export function tapsToExit(level: Level, id: number): number | null {
  const plain: Level = { ...level, pieces: level.pieces.map(({ fuse: _fuse, ...p }) => p) };
  let state = createGame(plain);
  let taps = 0;
  for (let guard = 0; guard < plain.pieces.length * 3 + 5 && state.alive.has(id); guard++) {
    const t = nextTap(plain, state.alive, id, new Set());
    if (t === null) return null;
    state = tap(state, t).state;
    taps++;
  }
  return state.alive.has(id) ? null : taps;
}
