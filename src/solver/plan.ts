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

/**
 * Tap at which each piece in `ids` leaves when a focused player rescues them one after another, quickest first
 * (fewest taps from the start), always tapping the first thing in the way. A piece that leaves as a side effect of
 * rescuing another is recorded then. Fuses are ignored. Null if one of them cannot be rescued.
 *
 * Bomb fuses must come from this shared schedule: taps spent on one bomb burn every other bomb's fuse too.
 */
export function rescueSchedule(level: Level, ids: number[]): Map<number, number> | null {
  const plain: Level = { ...level, pieces: level.pieces.map(({ fuse: _fuse, ...p }) => p) };
  const order: Array<[number, number]> = [];
  for (const id of ids) {
    const t = tapsToExit(plain, id);
    if (t === null) return null;
    order.push([id, t]);
  }
  order.sort((a, b) => a[1] - b[1]);
  let state = createGame(plain);
  let taps = 0;
  const leftAt = new Map<number, number>();
  for (const [id] of order) {
    for (let guard = 0; guard < plain.pieces.length * 3 + 5 && state.alive.has(id); guard++) {
      const t = nextTap(plain, state.alive, id, new Set());
      if (t === null) return null;
      state = tap(state, t).state;
      taps++;
      for (const other of ids) if (!leftAt.has(other) && !state.alive.has(other)) leftAt.set(other, taps);
    }
    if (state.alive.has(id)) return null;
  }
  return leftAt;
}

/**
 * Can the level be won at all, fuses included? Tries every order of free taps (blocked taps never help), remembering
 * dead ends by the set of animals left. Returns null when `budget` states are exhausted without an answer.
 */
export function winnable(level: Level, budget = 200_000): boolean | null {
  const dead = new Set<string>();
  let visited = 0;
  const go = (state: ReturnType<typeof createGame>): boolean | null => {
    if (state.alive.size === 0) return true;
    if (state.exploded) return false;
    const key = [...state.alive].sort((a, b) => a - b).join(',');
    if (dead.has(key)) return false;
    if (++visited > budget) return null;
    for (const id of state.alive) {
      if (!canExit(level, id, state.alive)) continue;
      const r = go(tap(state, id).state);
      if (r !== false) return r;
    }
    dead.add(key);
    return false;
  };
  return go(createGame(level));
}

/** The tap that gets piece `id` closer to leaving (the first thing in its way, or itself), or null if none helps. */
export function nextTapToward(level: Level, alive: ReadonlySet<number>, id: number): number | null {
  return nextTap(level, alive, id, new Set());
}
