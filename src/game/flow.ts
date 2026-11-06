import { createGame, isCleared, isFailed, tap, type GameState, type TapEvent } from '../core/game';
import type { Level, Piece } from '../core/types';
import { TapInput } from './input';
import { exitPath } from './path';
import { smoothPath, type Track } from './smooth';
import { Traffic, type TrafficEvent } from './traffic';

/** Radius of the bend where a run turns on an arrow tile, in cells. */
const CORNER_RADIUS = 0.3;

/** The line an animal runs along on its way out, and where its head starts on it. */
export interface Route {
  track: Track;
  bodyLen: number;
  headStart: number;
}

export function routeOf(level: Level, piece: Piece): Route {
  const track = smoothPath(exitPath(level, piece), CORNER_RADIUS);
  return { track, bodyLen: piece.cells.length, headStart: track.vertexU[piece.cells.length - 1] };
}

/**
 * One level in play, without the screen (docs/rules.md): the rules decide every tap at once, the animals sent out run
 * through traffic afterwards, and touch input is guarded. The game draws what this says; tests drive it frame by frame.
 * A retry is a new PlayFlow.
 */
export class PlayFlow {
  readonly traffic = new Traffic();
  readonly input = new TapInput();
  private current: GameState;
  private readonly routes = new Map<number, Route>();
  /** Bump rule: cells each animal has moved along its way out (its route stays the one from the start). */
  readonly advance = new Map<number, number>();
  /** Taps that changed the board, in order: an undo replays all but the last on a fresh flow. */
  readonly log: number[] = [];

  constructor(readonly level: Level, hearts?: number, bump = true) {
    this.current = createGame(level, { ...(hearts === undefined ? {} : { hearts }), bump });
    for (const piece of level.pieces) this.routes.set(piece.id, routeOf(level, piece));
  }

  /** Head arc length on its route of an animal that moved `advance` cells. */
  headAt(id: number): number {
    const route = this.routes.get(id)!;
    return route.track.vertexU[route.bodyLen - 1 + (this.advance.get(id) ?? 0)];
  }

  get state(): GameState {
    return this.current;
  }

  /** A tap at `now` (ms). Null when it repeats a tap on an animal still shaking from being blocked (rules R1). */
  tap(id: number, now: number): TapEvent | null {
    const result = tap(this.current, id);
    const ev = result.event;
    if (ev.type === 'blocked') {
      if (this.input.isBlockedRepeat(id, now)) return null;
      // a push waits for a still board: the rules see runners as gone, so the animal could run through one on screen
      if (ev.moved && this.traffic.runners.length) return null;
      this.input.noteBlocked(id, now);
    }
    this.current = result.state;
    // only taps that changed the board: an undo of a bump that did not move would show nothing
    if (ev.type === 'exited' || (ev.type === 'blocked' && ev.moved)) this.log.push(id);
    if (ev.type === 'blocked' && ev.moved) this.advance.set(id, (this.advance.get(id) ?? 0) + ev.moved);
    const route = this.routes.get(id);
    if (ev.type === 'exited' && route) this.traffic.add(id, route.track, route.bodyLen, this.headAt(id));
    return ev;
  }

  /** Move the runners on by `dt` seconds. Never changes the rules state. */
  step(dt: number, speed: number): TrafficEvent[] {
    return this.traffic.step(dt, speed);
  }

  /** Every animal is out by the rules and off the screen: time to show the win. */
  get won(): boolean {
    return isCleared(this.current) && this.traffic.runners.length === 0;
  }

  get lost(): boolean {
    return isFailed(this.current);
  }
}
