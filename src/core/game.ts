import { blockersOf, canExit, isAsleep, lockedBy } from './rules';
import type { Level } from './types';

export interface GameState {
  readonly level: Level;
  readonly alive: ReadonlySet<number>;
  readonly taps: number;
  readonly blockedTaps: number;
  /** Hearts left; undefined means the level has no heart limit. */
  readonly hearts?: number;
  /** Remaining fuse per alive bomb piece id. */
  readonly fuses: Readonly<Record<number, number>>;
  readonly exploded: boolean;
}

export type TapEvent =
  | { type: 'exited'; id: number }
  | { type: 'blocked'; id: number; blockers: number[]; lockedBy?: number; asleep?: boolean }
  | { type: 'ignored'; id: number };

export function createGame(level: Level, options: { hearts?: number } = {}): GameState {
  const fuses: Record<number, number> = {};
  for (const p of level.pieces) if (p.fuse !== undefined) fuses[p.id] = p.fuse;
  return { level, alive: new Set(level.pieces.map((p) => p.id)), taps: 0, blockedTaps: 0, hearts: options.hearts, fuses, exploded: false };
}

/** Every counted tap burns one fuse step; a bomb still on the board at zero explodes. */
function burnFuses(state: GameState): GameState {
  const fuses: Record<number, number> = {};
  let exploded = state.exploded;
  for (const [id, left] of Object.entries(state.fuses)) {
    if (!state.alive.has(Number(id))) continue;
    fuses[Number(id)] = left - 1;
    if (left - 1 <= 0) exploded = true;
  }
  return { ...state, fuses, exploded };
}

export function tap(state: GameState, id: number): { state: GameState; event: TapEvent } {
  const piece = state.level.pieces.find((p) => p.id === id);
  if (!piece || !state.alive.has(id) || isFailed(state)) return { state, event: { type: 'ignored', id } };
  if (!canExit(state.level, id, state.alive)) {
    const blockers = blockersOf(state.level, piece, state.alive);
    const lock = lockedBy(state.level, piece, state.alive);
    const asleep = isAsleep(state.level, piece, state.alive);
    const counted: GameState = {
      ...state,
      taps: state.taps + 1,
      blockedTaps: state.blockedTaps + 1,
      hearts: state.hearts === undefined ? undefined : state.hearts - 1,
    };
    return {
      state: burnFuses(counted),
      event: { type: 'blocked', id, blockers, ...(lock !== undefined ? { lockedBy: lock } : {}), ...(asleep ? { asleep } : {}) },
    };
  }
  const alive = new Set(state.alive);
  alive.delete(id);
  return { state: burnFuses({ ...state, alive, taps: state.taps + 1 }), event: { type: 'exited', id } };
}

export function isCleared(state: GameState): boolean {
  return state.alive.size === 0;
}

export function isFailed(state: GameState): boolean {
  return ((state.hearts !== undefined && state.hearts <= 0) || state.exploded) && !isCleared(state);
}
