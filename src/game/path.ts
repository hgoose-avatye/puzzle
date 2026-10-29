import { traceExit } from '../core/rules';
import type { Level, Piece } from '../core/types';

export interface Pt {
  x: number;
  y: number;
}

/**
 * Cells a piece travels, tail first: its own body (tail to head), then the traced exit path, then `extra`
 * cells beyond the edge in the final direction so the whole body can leave the board.
 */
export function exitPath(level: Level, piece: Piece, extra = piece.cells.length + 2): Pt[] {
  const trace = traceExit(level, piece);
  const pts: Pt[] = [...piece.cells].reverse().map((c) => ({ x: c.x, y: c.y }));
  pts.push(...trace.cells.map((c) => ({ x: c.x, y: c.y })));
  const v = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[trace.endDir];
  const last = pts[pts.length - 1];
  for (let k = 1; k <= extra; k++) pts.push({ x: last.x + v.x * k, y: last.y + v.y * k });
  return pts;
}

/** Point at distance `s` (in cells) along the polyline, with heading angle = atan2(dx, dy) in grid coordinates. */
export function pointAt(pts: Pt[], s: number): Pt & { angle: number } {
  const clamped = Math.max(0, Math.min(pts.length - 1, s));
  const i = Math.min(pts.length - 2, Math.floor(clamped));
  const a = pts[i];
  const b = pts[i + 1];
  const t = clamped - i;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.x - a.x, b.y - a.y) };
}

/** Like `pointAt`, but extrapolates straight along the end tangents instead of clamping. */
export function pointAlong(pts: Pt[], s: number): Pt & { angle: number } {
  const last = pts.length - 1;
  if (s >= 0 && s <= last) return pointAt(pts, s);
  const [a, b, over] = s < 0 ? [pts[0], pts[1], s] : [pts[last - 1], pts[last], s - last];
  const angle = Math.atan2(b.x - a.x, b.y - a.y);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const k = over / len;
  const base = s < 0 ? pts[0] : pts[last];
  return { x: base.x + (b.x - a.x) * k, y: base.y + (b.y - a.y) * k, angle };
}

/** Shortest distance (in cells) from point (px, py) to the polyline through `pts`. */
export function distanceToPolyline(pts: Pt[], px: number, py: number): number {
  let best = Math.hypot(px - pts[0].x, py - pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy)));
  }
  return best;
}
