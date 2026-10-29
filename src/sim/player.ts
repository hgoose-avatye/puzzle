import { createGame, isCleared, isFailed, tap, type GameState } from '../core/game';
import type { Rng } from '../core/rng';
import { blockersOf, canExit, isAsleep, lockedBy, traceExit } from '../core/rules';
import { nextTapToward } from '../solver/plan';
import type { Level, Piece } from '../core/types';

/**
 * A simulated player who misreads paths now and then. Every number here is an assumption, not a measurement: the model
 * is for comparing levels with each other (spotting spikes and odd ones), not for predicting real fail rates.
 */
export interface Profile {
  name: string;
  /** chance of taking a blocked animal for free when the blocker sits right in front of it */
  misread: number;
  /** extra misread chance per cell between the head and the blocker */
  perCell: number;
  /** extra misread chance per arrow turn before the blocker */
  perTurn: number;
  /** misread chance when a badge (lock, Zzz) shows why it cannot move */
  badge: number;
  /** chance of rescuing a free bomb before anything else */
  bombAware: number;
  /** chance, per tap, of working towards a bomb that is still blocked (clearing what is in its way) */
  bombPlan: number;
}

export const PROFILES: Profile[] = [
  { name: 'careful', misread: 0.02, perCell: 0.01, perTurn: 0.06, badge: 0.02, bombAware: 0.9, bombPlan: 0.8 },
  { name: 'average', misread: 0.05, perCell: 0.02, perTurn: 0.1, badge: 0.06, bombAware: 0.7, bombPlan: 0.5 },
  { name: 'hasty', misread: 0.12, perCell: 0.035, perTurn: 0.15, badge: 0.15, bombAware: 0.4, bombPlan: 0.2 },
];

const MAX_MISREAD = 0.6;

export type BlockReason = 'free' | 'piece' | 'wall' | 'lock' | 'sleep';

/** Why a piece cannot leave right now, how far along its path the problem is and how many turns come before it. */
export function readPiece(level: Level, piece: Piece, alive: ReadonlySet<number>): { reason: BlockReason; distance: number; turns: number } {
  if (lockedBy(level, piece, alive) !== undefined) return { reason: 'lock', distance: 0, turns: 0 };
  if (isAsleep(level, piece, alive)) return { reason: 'sleep', distance: 0, turns: 0 };
  const trace = traceExit(level, piece);
  const arrows = new Set((level.arrows ?? []).map((a) => `${a.x},${a.y}`));
  const owner = new Map<string, number>();
  for (const q of level.pieces) if (q.id !== piece.id && alive.has(q.id)) for (const c of q.cells) owner.set(`${c.x},${c.y}`, q.id);
  let turns = 0;
  for (let i = 0; i < trace.cells.length; i++) {
    const k = `${trace.cells[i].x},${trace.cells[i].y}`;
    if (owner.has(k)) return { reason: 'piece', distance: i + 1, turns };
    if (arrows.has(k)) turns++;
  }
  if (!trace.reachesEdge) return { reason: 'wall', distance: trace.cells.length + 1, turns };
  return { reason: 'free', distance: 0, turns };
}

/** Chance that this player taps the piece believing it can leave. Free pieces are always recognised once looked at. */
export function believesFree(p: Profile, r: ReturnType<typeof readPiece>): number {
  if (r.reason === 'free') return 1;
  if (r.reason === 'lock' || r.reason === 'sleep') return p.badge;
  return Math.min(MAX_MISREAD, p.misread + p.perCell * (r.distance - 1) + p.perTurn * r.turns);
}

export interface PlayResult {
  cleared: boolean;
  /** out of hearts, a bomb went off, or stuck */
  failed: boolean;
  taps: number;
  blocked: number;
  /** animals looked at in total, a stand-in for search effort */
  looks: number;
}

/** Play one level to the end (cleared or failed). */
export function playOnce(level: Level, profile: Profile, rng: Rng, hearts?: number): PlayResult {
  let state: GameState = createGame(level, hearts === undefined ? {} : { hearts });
  let looks = 0;
  const byId = new Map(level.pieces.map((p) => [p.id, p]));
  for (let guard = 0; guard < 2000 && !isCleared(state) && !isFailed(state); guard++) {
    const alive = [...state.alive];
    if (!alive.some((id) => canExit(level, id, state.alive))) break; // unsolvable from here: stop instead of tapping forever
    let pick: number | undefined;
    const bombs = alive.filter((id) => byId.get(id)!.fuse !== undefined && canExit(level, id, state.alive));
    if (bombs.length && rng.next() < profile.bombAware) pick = bombs[0];
    if (pick === undefined && rng.next() < profile.bombPlan) {
      // the bomb closest to going off, worked on by clearing its way
      const urgent = alive.filter((id) => byId.get(id)!.fuse !== undefined).sort((a, b) => state.fuses[a] - state.fuses[b])[0];
      if (urgent !== undefined) pick = nextTapToward(level, state.alive, urgent) ?? undefined;
    }
    // scan in random order until something looks free; a full pass with nothing believed starts over
    for (let pass = 0; pick === undefined && pass < 20; pass++) {
      for (let i = alive.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [alive[i], alive[j]] = [alive[j], alive[i]];
      }
      for (const id of alive) {
        looks++;
        if (rng.next() < believesFree(profile, readPiece(level, byId.get(id)!, state.alive))) { pick = id; break; }
      }
    }
    if (pick === undefined) break;
    state = tap(state, pick).state;
  }
  return { cleared: isCleared(state), failed: !isCleared(state), taps: state.taps, blocked: state.blockedTaps, looks };
}

export interface LevelStats {
  failRate: number;
  blockedPerRun: number;
  /** looks per rescued animal */
  effort: number;
}

export function simulate(level: Level, profile: Profile, rng: Rng, runs: number, hearts?: number): LevelStats {
  let fails = 0;
  let blocked = 0;
  let looks = 0;
  let rescued = 0;
  for (let r = 0; r < runs; r++) {
    const res = playOnce(level, profile, rng, hearts);
    if (res.failed) fails++;
    blocked += res.blocked;
    looks += res.looks;
    rescued += res.taps - res.blocked;
  }
  return { failRate: fails / runs, blockedPerRun: blocked / runs, effort: rescued ? looks / rescued : 0 };
}

