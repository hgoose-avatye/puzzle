import { blockersOf } from './rules';
import type { Level } from './types';

export interface GameState {
  readonly level: Level;
  readonly alive: ReadonlySet<number>;
  readonly taps: number;
  readonly blockedTaps: number;
}

export type TapEvent =
  | { type: 'exited'; id: number }
  | { type: 'blocked'; id: number; blockers: number[] }
  | { type: 'ignored'; id: number };

export function createGame(level: Level): GameState {
  return { level, alive: new Set(level.pieces.map((p) => p.id)), taps: 0, blockedTaps: 0 };
}

export function tap(state: GameState, id: number): { state: GameState; event: TapEvent } {
  const piece = state.level.pieces.find((p) => p.id === id);
  if (!piece || !state.alive.has(id)) return { state, event: { type: 'ignored', id } };
  const blockers = blockersOf(state.level, piece, state.alive);
  if (blockers.length > 0) {
    return {
      state: { ...state, taps: state.taps + 1, blockedTaps: state.blockedTaps + 1 },
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
