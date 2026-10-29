import { describe, expect, it } from 'vitest';
import type { Direction, Level, Piece } from '../core/types';
import { canExit } from '../core/rules';
import { createRng } from '../core/rng';
import { buildGameLevel } from '../curve/curve';
import { exitPath } from './path';
import { smoothPath, trackAt } from './smooth';
import { MIN_GAP, Traffic } from './traffic';

const SPEED = 7.5;
const DT = 1 / 60;
/** Sweeps are sampled every 0.05 cells, so a gap can come out a hair under MIN_GAP: far below anything visible. */
const GAP_OK = MIN_GAP - 0.005;

const piece = (id: number, cells: Array<[number, number]>, dir?: Direction): Piece => ({ id, cells: cells.map(([x, y]) => ({ x, y })), ...(dir ? { dir } : {}) });
const level = (pieces: Piece[], extra: Partial<Level> = {}): Level => ({ width: 10, height: 10, pieces, ...extra });

/** Send pieces out in order, as taps would: each must have a clear path among the ones still standing. */
function sendAll(t: Traffic, l: Level, pieces: Piece[] = l.pieces): void {
  const standing = new Set(l.pieces.map((p) => p.id));
  for (const p of pieces) {
    expect(canExit(l, p.id, standing), `piece ${p.id} must be tappable`).toBe(true);
    standing.delete(p.id);
    send(t, l, p);
  }
}

function send(t: Traffic, l: Level, p: Piece): void {
  const track = smoothPath(exitPath(l, p), 0.3);
  t.add(p.id, track, p.cells.length, track.vertexU[p.cells.length - 1]);
}

/** Smallest center distance between blocks of different runners right now. */
function minGap(t: Traffic): number {
  let best = Infinity;
  const bodies = t.runners.map((r) => Array.from({ length: r.bodyLen }, (_, i) => trackAt(r.track, r.s - i)));
  for (let a = 0; a < bodies.length; a++) for (let b = a + 1; b < bodies.length; b++)
    for (const p of bodies[a]) for (const q of bodies[b]) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
  return best;
}

/** Run until everyone is gone; records events, the smallest gap and how far each runner got before its first wait. */
function run(t: Traffic, schedule: Array<[number, () => void]> = [], limit = 30) {
  const log: Array<{ time: number; id: number; type: string; quiet?: boolean }> = [];
  let gap = Infinity;
  let time = 0;
  const todo = [...schedule];
  while ((t.runners.length || todo.length) && time < limit) {
    while (todo.length && todo[0][0] <= time) todo.shift()![1]();
    for (const e of t.step(DT, SPEED)) log.push({ time, ...e });
    gap = Math.min(gap, minGap(t));
    time += DT;
  }
  return { log, gap, time, left: t.runners.length };
}

describe('traffic', () => {
  it('a runner alone never waits and leaves', () => {
    const l = level([piece(1, [[3, 3]], 'right')]);
    const t = new Traffic();
    sendAll(t, l);
    const r = run(t);
    expect(r.left).toBe(0);
    expect(r.log.filter((e) => e.type === 'wait')).toHaveLength(0);
  });

  it('a follower one cell behind on the same line runs with it and never waits', () => {
    const l = level([piece(1, [[4, 4]], 'right'), piece(2, [[3, 4]], 'right')]);
    const t = new Traffic();
    sendAll(t, l);
    const r = run(t);
    expect(r.log.filter((e) => e.type === 'wait')).toHaveLength(0);
    expect(r.gap).toBeGreaterThanOrEqual(GAP_OK);
  });

  it('crossing at the same moment: the later one moves up to the crossing, waits, then resumes by itself', () => {
    const l = level([piece(1, [[2, 4]], 'right'), piece(2, [[5, 1]], 'down')]);
    const t = new Traffic();
    sendAll(t, l);
    const r = run(t, [], 30);
    const wait = r.log.find((e) => e.id === 2 && e.type === 'wait');
    const resume = r.log.find((e) => e.id === 2 && e.type === 'resume');
    expect(wait).toBeDefined();
    expect(resume).toBeDefined();
    expect(resume!.time).toBeGreaterThan(wait!.time);
    expect(r.log.some((e) => e.id === 1 && e.type === 'wait')).toBe(false); // the earlier one is never held up
    expect(r.gap).toBeGreaterThanOrEqual(GAP_OK);
    expect(r.left).toBe(0);
  });

  it('the waiting runner first moves as far as is safe instead of stopping where it was', () => {
    const l = level([piece(1, [[2, 4]], 'right'), piece(2, [[5, 0]], 'down')]);
    const t = new Traffic();
    sendAll(t, l);
    const start = t.get(2)!.s;
    let at = start;
    for (let i = 0; i < 200 && t.get(2)!.state === 'moving'; i++) { t.step(DT, SPEED); at = t.get(2)!.s; }
    expect(t.get(2)!.state).toBe('waiting');
    expect(at - start).toBeGreaterThan(1.5); // came down most of the way: (5,0) -> just above row 4's sweep
    const head = trackAt(t.get(2)!.track, at);
    expect(head.y).toBeLessThanOrEqual(4 - MIN_GAP + 0.01); // within the sweep sampling error
  });

  it('head-on on one line can never be sent: the board rule already blocks both, so traffic never sees it', () => {
    const l = level([piece(1, [[2, 4]], 'right'), piece(2, [[7, 4]], 'left')]);
    const all = new Set([1, 2]);
    expect(canExit(l, 1, all)).toBe(false);
    expect(canExit(l, 2, all)).toBe(false);
  });

  it('opposite directions on neighbouring rows pass each other without waiting', () => {
    const l = level([piece(1, [[2, 4]], 'right'), piece(2, [[7, 5]], 'left')]);
    const t = new Traffic();
    sendAll(t, l);
    const r = run(t);
    expect(r.log.filter((e) => e.type === 'wait')).toHaveLength(0);
    expect(r.gap).toBeGreaterThanOrEqual(GAP_OK);
  });

  it('a 3-cell body crossing in front: the single animal waits for the whole body, tail included', () => {
    const l = level([piece(1, [[5, 5], [4, 5], [3, 5]]), piece(2, [[4, 3]], 'down')]);
    const t = new Traffic();
    sendAll(t, l);
    const r = run(t);
    expect(r.log.some((e) => e.id === 2 && e.type === 'wait')).toBe(true);
    expect(r.gap).toBeGreaterThanOrEqual(GAP_OK);
    expect(r.left).toBe(0);
  });

  it('a long animal turning a corner keeps its whole bent body clear of a waiting animal', () => {
    const l = level([piece(1, [[2, 6], [2, 7], [2, 8]]), piece(2, [[6, 2]], 'down')], { arrows: [{ x: 2, y: 4, dir: 'right' }] });
    const t = new Traffic();
    sendAll(t, l);
    const r = run(t);
    expect(r.log.some((e) => e.id === 2 && e.type === 'wait')).toBe(true);
    expect(r.gap).toBeGreaterThanOrEqual(GAP_OK);
    expect(r.left).toBe(0);
  });

  it('a queue behind a waiting runner drains front to back without anyone being tapped again', () => {
    // 1 crosses row 4; 2, 3, 4 come down column 5 one behind the other and all have to wait for it
    const l = level([piece(1, [[0, 4]], 'right'), piece(2, [[5, 2]], 'down'), piece(3, [[5, 1]], 'down'), piece(4, [[5, 0]], 'down')]);
    const t = new Traffic();
    sendAll(t, l);
    const r = run(t);
    const resumes = r.log.filter((e) => e.type === 'resume').map((e) => e.id);
    expect(r.left).toBe(0);
    expect(resumes[0]).toBe(2);
    expect(r.gap).toBeGreaterThanOrEqual(GAP_OK);
  });

  it('runners that never meet move at the same time without waiting', () => {
    const l = level([piece(1, [[1, 1]], 'up'), piece(2, [[8, 8]], 'down'), piece(3, [[1, 8]], 'left')]);
    const t = new Traffic();
    sendAll(t, l);
    const r = run(t);
    expect(r.log.filter((e) => e.type === 'wait')).toHaveLength(0);
  });

  it('clear() drops every runner (restart while someone is waiting)', () => {
    const l = level([piece(1, [[2, 4]], 'right'), piece(2, [[5, 1]], 'down')]);
    const t = new Traffic();
    sendAll(t, l);
    for (let i = 0; i < 20; i++) t.step(DT, SPEED);
    t.clear();
    expect(t.runners).toHaveLength(0);
    expect(t.step(DT, SPEED)).toEqual([]);
  });

  it('random rapid play on generated levels: everybody gets out, nobody overlaps, nobody waits forever', () => {
    let played = 0;
    let waits = 0;
    for (const n of [12, 20, 34, 50, 80]) {
      const gen = buildGameLevel(n);
      if (!gen) continue;
      played++;
      const l = gen.level;
      const rng = createRng(n);
      const alive = new Set(l.pieces.map((p) => p.id));
      const t = new Traffic();
      let gap = Infinity;
      let time = 0;
      while ((alive.size || t.runners.length) && time < 120) {
        if (alive.size && rng.next() < 0.3) {
          const free = l.pieces.filter((p) => alive.has(p.id) && canExit(l, p.id, alive));
          if (free.length) {
            const p = free[Math.floor(rng.next() * free.length)];
            alive.delete(p.id);
            send(t, l, p);
          }
        }
        waits += t.step(DT, SPEED).filter((e) => e.type === 'wait').length;
        gap = Math.min(gap, minGap(t));
        time += DT;
      }
      expect(alive.size, `level ${n}`).toBe(0);
      expect(t.runners.length, `level ${n}`).toBe(0);
      expect(gap, `level ${n}`).toBeGreaterThanOrEqual(GAP_OK);
    }
    expect(played).toBeGreaterThanOrEqual(4);
    expect(waits).toBeGreaterThan(0); // the run really exercised waiting
  });

  it('creeping behind a passing tail reports one hold-up, not a burst of new ones', () => {
    const l = level([piece(1, [[2, 4], [1, 4], [0, 4]]), piece(2, [[5, 1]], 'down'), piece(4, [[5, 0]], 'down')]);
    const t = new Traffic();
    sendAll(t, l, [l.pieces[0], l.pieces[1], l.pieces[2]]);
    const r = run(t);
    for (const id of [2, 4]) expect(r.log.filter((e) => e.id === id && e.type === 'wait' && !e.quiet).length, `runner ${id}`).toBeLessThanOrEqual(1);
    expect(r.left).toBe(0);
  });
});
