import { bumpResult, burnOnCollision } from './bump';
import { blockersOf, canExit, cratesInWay, isAsleep, lockedBy } from './rules';
import type { Level } from './types';

export interface GameState {
  /** The board as it is now: under the bump rule a blocked animal's cells move. */
  readonly level: Level;
  /** The bump rule (the game's rule): a blocked animal runs up to what stops it and stays there (src/core/bump.ts). */
  readonly bump?: boolean;
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
  | { type: 'blocked'; id: number; blockers: number[]; lockedBy?: number; asleep?: boolean; crates?: number; moved?: number }
  | { type: 'ignored'; id: number };

/** `bump: false` is the old rule (a blocked animal stays put), kept for comparisons and the simulated player. */
export function createGame(level: Level, options: { hearts?: number; bump?: boolean } = {}): GameState {
  const fuses: Record<number, number> = {};
  for (const p of level.pieces) if (p.fuse !== undefined) fuses[p.id] = p.fuse;
  return {
    level,
    alive: new Set(level.pieces.map((p) => p.id)), taps: 0, blockedTaps: 0, hearts: options.hearts, fuses, exploded: false,
    ...(options.bump ?? true ? { bump: true } : {}),
  };
}

/**
 * The old rule's fuse (bump: false, read by the exit-based planner solver/plan.ts and the simulated player): every exit
 * takes one step off every bomb still on the board; one left at zero explodes. Under the bump rule the dynamite counts
 * its own collisions instead (burnOnCollision, docs/rules.md 5).
 */
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
    const crates = cratesInWay(state.level, piece, state.alive).length;
    const bump = state.bump ? bumpResult(state.level, piece, state.alive) : null;
    const moved = bump?.moved ?? 0;
    const counted: GameState = {
      ...state,
      ...(bump ? { level: bump.level } : {}),
      taps: state.taps + 1,
      blockedTaps: state.blockedTaps + 1,
      hearts: state.hearts === undefined ? undefined : state.hearts - 1,
    };
    // the dynamite counts its own collisions: the push of the bomb itself, or a push that stops against it
    const burnt = state.bump && bump ? burnOnCollision(state.fuses, state.alive, id, bump.stopper) : null;
    return {
      state: burnt ? { ...counted, fuses: burnt.fuses, exploded: counted.exploded || burnt.exploded } : counted,
      event: {
        type: 'blocked', id, blockers, ...(lock !== undefined ? { lockedBy: lock } : {}), ...(asleep ? { asleep } : {}), ...(crates ? { crates } : {}),
        ...(moved > 0 ? { moved } : {}),
      },
    };
  }
  const alive = new Set(state.alive);
  alive.delete(id);
  if (!state.bump) return { state: burnFuses({ ...state, alive, taps: state.taps + 1 }), event: { type: 'exited', id } };
  // a bomb that leaves takes its fuse with it; nothing else burns on an exit
  const { [id]: _gone, ...fuses } = state.fuses;
  return { state: { ...state, alive, fuses, taps: state.taps + 1 }, event: { type: 'exited', id } };
}

export function isCleared(state: GameState): boolean {
  return state.alive.size === 0;
}

export function isFailed(state: GameState): boolean {
  return ((state.hearts !== undefined && state.hearts <= 0) || state.exploded) && !isCleared(state);
}
