import type { Pt } from './path';

export interface Track {
  /** Dense samples of the smoothed path, tail first. */
  pts: Pt[];
  /** Arc length from the first sample to each sample. */
  cum: number[];
  length: number;
  /** Arc-length position of every vertex of the original path (corner vertices sit at the arc midpoint). */
  vertexU: number[];
}

const ARC_STEPS = 10;

/**
 * Rounds every 90° corner of a cell-center polyline with a quarter circle of radius `radius` (at most half a cell, so the
 * path stays inside the corner cell and the half-cells next to it). Positions are then measured in arc length of the
 * rounded path itself, so a body spanning `d` cells is `d` long whether it is straight or in the middle of a turn.
 */
export function smoothPath(path: Pt[], radius = 0.5): Track {
  const pts: Pt[] = [{ ...path[0] }];
  const vertexPoint: number[] = [0];
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1];
    const p = path[i];
    const b = path[i + 1];
    const inX = Math.sign(p.x - a.x);
    const inY = Math.sign(p.y - a.y);
    const outX = Math.sign(b.x - p.x);
    const outY = Math.sign(b.y - p.y);
    const turns = inX * outX + inY * outY === 0;
    if (!turns) {
      pts.push({ ...p });
      vertexPoint.push(pts.length - 1);
      continue;
    }
    const r = Math.min(radius, Math.hypot(p.x - a.x, p.y - a.y) / 2, Math.hypot(b.x - p.x, b.y - p.y) / 2);
    const entry = { x: p.x - inX * r, y: p.y - inY * r };
    const exit = { x: p.x + outX * r, y: p.y + outY * r };
    const center = { x: entry.x + outX * r, y: entry.y + outY * r };
    const a0 = Math.atan2(entry.y - center.y, entry.x - center.x);
    let delta = Math.atan2(exit.y - center.y, exit.x - center.x) - a0;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const first = pts.length;
    for (let k = 0; k <= ARC_STEPS; k++) {
      const t = a0 + (delta * k) / ARC_STEPS;
      pts.push({ x: center.x + Math.cos(t) * r, y: center.y + Math.sin(t) * r });
    }
    vertexPoint.push(first + ARC_STEPS / 2);
  }
  pts.push({ ...path[path.length - 1] });
  vertexPoint.push(pts.length - 1);

  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, length: cum[cum.length - 1], vertexU: vertexPoint.map((i) => cum[i]) };
}

/** Position and heading (angle = atan2(dx, dy)) at arc length `u`; extrapolates straight beyond both ends. */
export function trackAt(track: Track, u: number): Pt & { angle: number } {
  const { pts, cum } = track;
  const last = pts.length - 1;
  const clamped = Math.max(0, Math.min(track.length, u));
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= clamped) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[lo + 1];
  const seg = cum[lo + 1] - cum[lo] || 1;
  const angle = Math.atan2(b.x - a.x, b.y - a.y);
  const over = u - clamped;
  const t = (clamped - cum[lo]) / seg;
  const dx = (b.x - a.x) / seg;
  const dy = (b.y - a.y) / seg;
  return { x: a.x + (b.x - a.x) * t + dx * over, y: a.y + (b.y - a.y) * t + dy * over, angle };
}
