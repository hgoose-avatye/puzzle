import { describe, expect, it } from 'vitest';
import { isCleared } from '../core/game';
import { canExit } from '../core/rules';
import { createRng, type Rng } from '../core/rng';
import type { Level, Piece } from '../core/types';
import { buildGameLevel } from '../curve/curve';
import { BLOCKED_REPEAT_MS } from './input';
import { PlayFlow } from './flow';
import { trackAt } from './smooth';
import { MIN_GAP } from './traffic';

const SPEED = 7.5;
const DT = 1 / 60;
/** Sweeps are sampled every 0.05 cells, so a gap can come out a hair under MIN_GAP (see traffic.test). */
const GAP_OK = MIN_GAP - 0.005;
/** A runner closer than this to a standing animal's cell centre would be inside that cell. */
const INSIDE_CELL = 0.5;
/** Simulated seconds after the last tap within which every runner must be off the board. */
const DRAIN_LIMIT = 60;

interface Gaps { runners: number; standing: number }

/** Closest blocks right now: between two runners, and between a runner and an animal still standing. */
function measure(flow: PlayFlow, gaps: Gaps): void {
  const bodies = flow.traffic.runners.map((r) => Array.from({ length: r.bodyLen }, (_, i) => trackAt(r.track, r.s - i)));
  for (let a = 0; a < bodies.length; a++) for (let b = a + 1; b < bodies.length; b++)
    for (const p of bodies[a]) for (const q of bodies[b]) gaps.runners = Math.min(gaps.runners, Math.hypot(p.x - q.x, p.y - q.y));
  const standing = flow.level.pieces.filter((p) => flow.state.alive.has(p.id)).flatMap((p) => p.cells);
  for (const body of bodies) for (const p of body) for (const c of standing) gaps.standing = Math.min(gaps.standing, Math.hypot(p.x - c.x, p.y - c.y));
}

/** Step `seconds` of frames; the rules state must not change while animals run, wait and resume. */
function run(flow: PlayFlow, seconds: number, gaps: Gaps, waits: Set<number>): void {
  for (let t = 0; t < seconds; t += DT) {
    const before = flow.state;
    for (const e of flow.step(DT, SPEED)) if (e.type === 'wait') waits.add(e.id);
    expect(flow.state).toBe(before);
    measure(flow, gaps);
  }
}

/**
 * A player tapping at random: mostly animals that can leave, sometimes blocked ones, sometimes the same animal again
 * at once, with short random pauses so later runners catch up with earlier ones. Checks every tap against the rules.
 */
function playRandom(level: Level, hearts: number | undefined, rng: Rng, gaps: Gaps, waits: Set<number>): PlayFlow {
  const flow = new PlayFlow(level, hearts);
  let now = 0;
  for (let guard = 0; guard < 400 && !flow.lost && !isCleared(flow.state); guard++) {
    const before = flow.state;
    const alive = level.pieces.filter((p) => before.alive.has(p.id));
    const free = alive.filter((p) => canExit(level, p.id, before.alive));
    const pool: Piece[] = rng.next() < 0.15 ? alive : free.length ? free : alive;
    const pick = pool[rng.int(0, pool.length - 1)];
    const ev = flow.tap(pick.id, now);
    const after = flow.state;
    const bombsLeft = Object.keys(before.fuses).filter((id) => before.alive.has(Number(id)) && Number(id) !== pick.id);
    if (ev === null || ev.type === 'ignored') {
      expect(after).toBe(before);
    } else if (ev.type === 'blocked') {
      if (before.hearts !== undefined) expect(after.hearts).toBe(before.hearts - 1);
      expect(after.fuses).toEqual(before.fuses);
      expect(after.alive).toEqual(before.alive);
    } else {
      expect(after.hearts).toBe(before.hearts);
      for (const id of bombsLeft) expect(after.fuses[Number(id)]).toBe(before.fuses[Number(id)] - 1);
      expect(after.alive.has(pick.id)).toBe(false);
      expect(flow.traffic.get(pick.id)).toBeDefined();
    }
    // a quick double tap now and then: the same tap, or an animal that has already left
    if (rng.next() < 0.1) {
      const settled = flow.state;
      const again = flow.tap(pick.id, now + 50);
      // swallowed as the same tap, or ignored because that blocked tap already lost the level
      if (ev?.type === 'blocked') expect(flow.lost ? again?.type : again).toBe(flow.lost ? 'ignored' : null);
      if (ev?.type === 'exited') expect(again?.type).toBe('ignored');
      expect(flow.state).toBe(settled);
    }
    const pause = rng.next() < 0.5 ? rng.next() * 0.15 : rng.next() * 0.6;
    run(flow, pause, gaps, waits);
    now += pause * 1000 + BLOCKED_REPEAT_MS * rng.next();
  }
  return flow;
}

describe('play flow: taps decided at once, runners move afterwards (docs/rules.md 9)', () => {
  it('holds every rule on all 180 levels with random taps', () => {
    const gaps: Gaps = { runners: Infinity, standing: Infinity };
    const waits = new Set<number>();
    let waitedLevels = 0;
    let wins = 0;
    for (let n = 1; n <= 180; n++) {
      const built = buildGameLevel(n)!;
      for (let seed = 0; seed < 2; seed++) {
        const levelWaits = new Set<number>();
        const flow = playRandom(built.level, built.hearts, createRng(n * 101 + seed), gaps, levelWaits);
        const endState = flow.state;
        if (levelWaits.size) waitedLevels++;
        // the win waits for the screen: decided by the rules, shown only once every runner is off
        if (isCleared(endState) && flow.traffic.runners.length) expect(flow.won, `level ${n} seed ${seed}`).toBe(false);
        run(flow, DRAIN_LIMIT, gaps, waits);
        expect(flow.traffic.runners.length, `level ${n} seed ${seed}: runners never got off`).toBe(0);
        if (isCleared(endState)) { expect(flow.won).toBe(true); wins++; }
        // after a fail nothing changes any more
        if (flow.lost) for (const p of built.level.pieces) expect(flow.tap(p.id, 1e9)).toEqual({ type: 'ignored', id: p.id });
      }
    }
    expect(gaps.runners).toBeGreaterThanOrEqual(GAP_OK);
    expect(gaps.standing).toBeGreaterThanOrEqual(INSIDE_CELL);
    // the random player has to exercise waiting and winning, or the checks above prove little
    expect(waitedLevels).toBeGreaterThan(30);
    expect(wins).toBeGreaterThan(100);
  }, 120_000);
});

describe('play flow: scenarios', () => {
  // 9x9: 1 (3 cells) runs right along row 4; bomb 2 drops down column 5 and must wait for 1; 4 queues behind 2; 3 is free
  const cross = (fuse?: number): Level => ({
    width: 9, height: 9,
    pieces: [
      { id: 1, cells: [{ x: 2, y: 4 }, { x: 1, y: 4 }, { x: 0, y: 4 }] },
      { id: 2, cells: [{ x: 5, y: 1 }], dir: 'down', ...(fuse ? { fuse } : {}) },
      { id: 3, cells: [{ x: 7, y: 5 }], dir: 'up' },
      { id: 4, cells: [{ x: 5, y: 0 }], dir: 'down' },
    ],
  });
  const noGaps = (): Gaps => ({ runners: Infinity, standing: Infinity });

  it('a follower runs up as far as it can, waits, and goes on by itself; fuses stay put meanwhile', () => {
    const flow = new PlayFlow(cross(9), 3);
    flow.tap(3, 0);
    flow.tap(1, 0);
    flow.tap(2, 0);
    flow.tap(4, 0);
    const start = flow.traffic.get(2)!.s;
    let waitedAt = -1;
    let resumed = false;
    for (let t = 0; t < 10 && flow.traffic.runners.length; t += DT) {
      for (const e of flow.step(DT, SPEED)) {
        if (e.type === 'wait' && e.id === 2) waitedAt = flow.traffic.get(2)!.s;
        if (e.type === 'resume' && e.id === 2) resumed = true;
      }
    }
    expect(waitedAt).toBeGreaterThan(start + 0.5);
    expect(resumed).toBe(true);
    expect(flow.traffic.runners).toHaveLength(0);
  });

  it('tapping animals one after another burns each fuse once per exit, never again while they wait', () => {
    const flow = new PlayFlow(cross(9), 3);
    flow.tap(1, 0);
    flow.tap(3, 10);
    expect(flow.state.fuses[2]).toBe(7);
    flow.tap(4, 15);
    expect(flow.state.fuses[2]).toBe(7);
    const fuses = { ...flow.state.fuses };
    run(flow, 3, noGaps(), new Set());
    expect(flow.state.fuses).toEqual(fuses);
    expect(flow.state.taps).toBe(3);
  });

  it('the bomb waiting behind a runner is already safe: it left by the rules when tapped', () => {
    const flow = new PlayFlow(cross(2), 3);
    flow.tap(1, 0);
    expect(flow.state.fuses[2]).toBe(1);
    flow.tap(2, 10);
    flow.tap(3, 20);
    expect(flow.state.exploded).toBe(false);
    run(flow, 5, noGaps(), new Set());
    expect(flow.state.exploded).toBe(false);
  });

  it('at fuse 1, bomb then another: saved even though the bomb still waits behind a runner', () => {
    const flow = new PlayFlow(cross(2), 3);
    flow.tap(1, 0);
    flow.tap(2, 10);
    flow.tap(3, 20);
    const waits = new Set<number>();
    run(flow, 10, noGaps(), waits);
    expect(waits.has(2)).toBe(true);
    expect(flow.lost).toBe(false);
    expect(flow.traffic.runners).toHaveLength(0);
  });

  it('at fuse 1, another then bomb: it blows on the other tap, the bomb tap is ignored, runners still finish', () => {
    const flow = new PlayFlow(cross(2), 3);
    flow.tap(1, 0);
    flow.tap(3, 10);
    expect(flow.lost).toBe(true);
    expect(flow.state.exploded).toBe(true);
    expect(flow.tap(2, 20)).toEqual({ type: 'ignored', id: 2 });
    expect(flow.traffic.get(2)).toBeUndefined();
    run(flow, 10, noGaps(), new Set());
    expect(flow.traffic.runners).toHaveLength(0);
    expect(flow.state.alive.has(2)).toBe(true);
    expect(flow.won).toBe(false);
  });

  it('the win shows only after the last runner is off the board', () => {
    const flow = new PlayFlow(cross(), 3);
    for (const id of [1, 2, 3, 4]) flow.tap(id, 0);
    expect(isCleared(flow.state)).toBe(true);
    expect(flow.won).toBe(false);
    let frames = 0;
    while (!flow.won && frames++ < 1000) {
      flow.step(DT, SPEED);
      if (!flow.won) expect(flow.traffic.runners.length).toBeGreaterThan(0);
    }
    expect(flow.won).toBe(true);
  });

  it('a fail while others still run stops the rules but lets the runners finish', () => {
    const flow = new PlayFlow(cross(), 1);
    flow.tap(1, 0);
    flow.tap(4, 0);
    expect(flow.lost).toBe(true);
    expect(flow.tap(3, 1000)).toEqual({ type: 'ignored', id: 3 });
    run(flow, 5, noGaps(), new Set());
    expect(flow.traffic.runners).toHaveLength(0);
    expect(flow.won).toBe(false);
  });

  it('a retry is a new flow: start state, empty queue, no guards carried over', () => {
    const old = new PlayFlow(cross(5), 3);
    old.tap(1, 0);
    old.tap(4, 0);
    const fresh = new PlayFlow(cross(5), 3);
    expect(fresh.state.hearts).toBe(3);
    expect(fresh.state.fuses).toEqual({ 2: 5 });
    expect(fresh.state.alive.size).toBe(4);
    expect(fresh.traffic.runners).toHaveLength(0);
    expect(fresh.tap(4, 0)?.type).toBe('blocked');
  });
});
