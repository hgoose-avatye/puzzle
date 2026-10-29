import type { Cell } from './types';

/**
 * Board outlines. A board is its bounding box minus `voids` (cells outside the board). Every shape is orthogonally
 * convex: each row and each column of the board is one unbroken run. That keeps the exit rule simple: a path that
 * steps off the board is outside for good and can never come back onto another part of it.
 */
export type BoardShape = 'rect' | 'rounded' | 'octagon' | 'plus' | 'ellipse' | 'hexagon' | 'tee';

export const BOARD_SHAPES: BoardShape[] = ['rect', 'rounded', 'octagon', 'plus', 'ellipse', 'hexagon', 'tee'];

/** Cells of the w x h bounding box that are not part of a board with this shape. */
export function shapeVoids(shape: BoardShape, w: number, h: number): Cell[] {
  const out: Cell[] = [];
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = Math.min(x, w - 1 - x); // distance to the nearest side, 0 on the edge
      const fy = Math.min(y, h - 1 - y);
      let inside = true;
      if (shape === 'rounded') inside = fx + fy >= 1; // one corner cell off
      else if (shape === 'octagon') inside = fx + fy >= 2;
      else if (shape === 'plus') inside = fx >= 2 || fy >= 3; // a fat cross: 2x3 blocks off each corner
      else if (shape === 'ellipse') inside = ((x - cx) / (w / 2)) ** 2 + ((y - cy) / (h / 2)) ** 2 <= 1.08;
      else if (shape === 'hexagon') inside = fy >= 3 || fx >= 3 - fy; // straight sides, pointed top and bottom
      else if (shape === 'tee') inside = y < 4 || fx >= 1; // full-width top bar, stem one cell narrower each side
      if (!inside) out.push({ x, y });
    }
  }
  return out;
}

/** Each row and each column of the board (box minus voids) is one unbroken run and nothing is empty. */
export function isOrthogonallyConvex(w: number, h: number, voids: Cell[]): boolean {
  const off = new Set(voids.map((c) => `${c.x},${c.y}`));
  const on = (x: number, y: number): boolean => !off.has(`${x},${y}`);
  const oneRun = (cells: boolean[]): boolean => {
    const first = cells.indexOf(true);
    const last = cells.lastIndexOf(true);
    return first >= 0 && cells.slice(first, last + 1).every(Boolean);
  };
  for (let y = 0; y < h; y++) if (!oneRun(Array.from({ length: w }, (_, x) => on(x, y)))) return false;
  for (let x = 0; x < w; x++) if (!oneRun(Array.from({ length: h }, (_, y) => on(x, y)))) return false;
  return true;
}
