import { blockersOf, canExit } from './rules';
import type { Level } from './types';

export interface GameState {
  readonly level: Level;
  readonly alive: ReadonlySet<number>;
  readonly taps: number;
  readonly blockedTaps: number;
  /** Hearts left; undefined means the level has no heart limit. */
  readonly hearts?: number;
}

export type TapEvent =
  | { type: 'exited'; id: number }
  | { type: 'blocked'; id: number; blockers: number[] }
  | { type: 'ignored'; id: number };

export function createGame(level: Level, options: { hearts?: number } = {}): GameState {
  return { level, alive: new Set(level.pieces.map((p) => p.id)), taps: 0, blockedTaps: 0, hearts: options.hearts };
}

export function tap(state: GameState, id: number): { state: GameState; event: TapEvent } {
  const piece = state.level.pieces.find((p) => p.id === id);
  if (!piece || !state.alive.has(id) || isFailed(state)) return { state, event: { type: 'ignored', id } };
  const blockers = blockersOf(state.level, piece, state.alive);
  if (blockers.length > 0 || !canExit(state.level, id, state.alive)) {
    return {
      state: {
        ...state,
        taps: state.taps + 1,
        blockedTaps: state.blockedTaps + 1,
        hearts: state.hearts === undefined ? undefined : state.hearts - 1,
      },
      event: { type: 'blocked', id, blockers },
    };
  }
  const alive = new Set(state.alive);
  alive.delete(id);
  return { state: { ...state, alive, taps: state.taps + 1 }, event: { type: 'exited', id } };
}

export function isCleared(state: GameState): boolean {
  return state.alive.size === 0;
}

export function isFailed(state: GameState): boolean {
  return state.hearts !== undefined && state.hearts <= 0 && !isCleared(state);
}
