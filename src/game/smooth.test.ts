import { describe, expect, it } from 'vitest';
import type { Direction, Level, Piece } from '../core/types';
import { exitPath, type Pt } from './path';
import { smoothPath, trackAt } from './smooth';

const STEP: Record<Direction, Pt> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

function straightLevel(dir: Direction): { level: Level; piece: Piece } {
  const v = STEP[dir];
  // 3-cell animal in the middle of an 8x8 board, head first in `dir`
  const cells = [0, -1, -2].map((k) => ({ x: 4 + v.x * k, y: 4 + v.y * k }));
  const piece: Piece = { id: 1, cells };
  return { level: { width: 8, height: 8, pieces: [piece] }, piece };
}

/** Arc length between two positions on the smoothed track, integrated in small steps. */
function arc(track: ReturnType<typeof smoothPath>, u0: number, u1: number): number {
  let sum = 0;
  let prev = trackAt(track, u0);
  const n = 400;
  for (let i = 1; i <= n; i++) {
    const p = trackAt(track, u0 + ((u1 - u0) * i) / n);
    sum += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return sum;
}

describe('straight exits', () => {
  const heading: Record<Direction, number> = { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 };
  for (const dir of ['up', 'down', 'left', 'right'] as const) {
    it(`${dir}: heading, body length and exit`, () => {
      const { level, piece } = straightLevel(dir);
      const track = smoothPath(exitPath(level, piece));
      const head0 = track.vertexU[2];
      const p = trackAt(track, head0);
      expect(p.x).toBeCloseTo(piece.cells[0].x);
      expect(p.y).toBeCloseTo(piece.cells[0].y);
      expect(Math.cos(trackAt(track, head0).angle - heading[dir])).toBeCloseTo(1);
      const tail = trackAt(track, head0 - 2);
      expect(tail.x).toBeCloseTo(piece.cells[2].x);
      expect(tail.y).toBeCloseTo(piece.cells[2].y);
      // body length stays 2 cells all along the run, and the head ends beyond the board edge
      for (let u = head0; u < track.length; u += 0.37) expect(Math.hypot(trackAt(track, u).x - trackAt(track, u - 2).x, trackAt(track, u).y - trackAt(track, u - 2).y)).toBeCloseTo(2, 6);
      const end = trackAt(track, track.length);
      expect(end.x < -0.5 || end.x > 7.5 || end.y < -0.5 || end.y > 7.5).toBe(true);
    });
  }
});

describe('L-shaped exit', () => {
  // head at (1,5) going up, arrow at (1,3) sends it right
  const piece: Piece = { id: 1, cells: [{ x: 1, y: 5 }, { x: 1, y: 6 }, { x: 1, y: 7 }] };
  const level: Level = { width: 8, height: 10, pieces: [piece], arrows: [{ x: 1, y: 3, dir: 'right' }] };
  const track = smoothPath(exitPath(level, piece));
  const head0 = track.vertexU[2];

  it('keeps the arc length between body parts exact through the corner', () => {
    for (let u = head0; u < track.length; u += 0.11) {
      expect(arc(track, u - 1, u)).toBeCloseTo(1, 2);
      expect(arc(track, u - 2, u)).toBeCloseTo(2, 2);
    }
  });

  it('turns smoothly: no heading jump between nearby points', () => {
    let prev = trackAt(track, 0).angle;
    for (let u = 0.02; u < track.length; u += 0.02) {
      const a = trackAt(track, u).angle;
      const d = Math.abs(Math.atan2(Math.sin(a - prev), Math.cos(a - prev)));
      expect(d).toBeLessThan(0.2);
      prev = a;
    }
  });

  it('rounds the corner without leaving the cells of the original path', () => {
    const original = exitPath(level, piece);
    for (let u = 0; u < track.length; u += 0.05) {
      const p = trackAt(track, u);
      let best = Infinity;
      for (let i = 1; i < original.length; i++) {
        const a = original[i - 1];
        const b = original[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
        best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
      }
      expect(best).toBeLessThan(0.16);
    }
  });

  it('the head start and every original vertex map to increasing positions', () => {
    for (let i = 1; i < track.vertexU.length; i++) expect(track.vertexU[i]).toBeGreaterThan(track.vertexU[i - 1]);
    expect(track.vertexU[2]).toBeCloseTo(2);
  });
});
