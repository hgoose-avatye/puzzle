import { isOrthogonallyConvex } from './shapes';
import type { Cell, Direction, Level, Piece } from './types';

const VECTORS: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function directionVector(d: Direction): Cell {
  return VECTORS[d];
}

export function headDirection(piece: Piece): Direction {
  if (piece.cells.length === 0) throw new Error(`piece ${piece.id} has no cells`);
  if (piece.cells.length === 1) {
    if (!piece.dir) throw new Error(`piece ${piece.id}: a one-cell piece needs dir`);
    return piece.dir;
  }
  const dx = piece.cells[0].x - piece.cells[1].x;
  const dy = piece.cells[0].y - piece.cells[1].y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) throw new Error(`piece ${piece.id}: head and next cell are not adjacent`);
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  return dy === 1 ? 'down' : 'up';
}

const voidSets = new WeakMap<Level, Set<string>>();
const voidSet = (level: Level): Set<string> => {
  let s = voidSets.get(level);
  if (!s) { s = new Set((level.voids ?? []).map((c) => `${c.x},${c.y}`)); voidSets.set(level, s); }
  return s;
};

/** Is (x, y) a cell of the board: inside the box and not one of its voids? */
export const onBoard = (level: Level, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < level.width && y < level.height && (!level.voids?.length || !voidSet(level).has(`${x},${y}`));
const inBounds = onBoard;

const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export interface ExitTrace {
  /** Cells the piece passes after its head, in order, up to the edge (or up to the wall that stops it). */
  cells: Cell[];
  /** Direction of travel when it leaves the board. */
  endDir: Direction;
  /** False when an obstacle, a facing arrow or an arrow loop stops the piece for good. */
  reachesEdge: boolean;
}

export function traceExit(level: Level, piece: Piece): ExitTrace {
  const obstacles = new Set((level.obstacles ?? []).map((c) => `${c.x},${c.y}`));
  const arrows = new Map<string, Direction>((level.arrows ?? []).map((a) => [`${a.x},${a.y}`, a.dir]));
  let dir = headDirection(piece);
  let x = piece.cells[0].x;
  let y = piece.cells[0].y;
  const cells: Cell[] = [];
  const seen = new Set<string>();
  for (;;) {
    const v = directionVector(dir);
    x += v.x;
    y += v.y;
    if (!inBounds(level, x, y)) return { cells, endDir: dir, reachesEdge: true };
    const k = `${x},${y}`;
    if (obstacles.has(k)) return { cells, endDir: dir, reachesEdge: false };
    const tile = arrows.get(k);
    if (tile) {
      if (tile === OPPOSITE[dir]) return { cells, endDir: dir, reachesEdge: false };
      dir = tile;
    }
    const state = `${k},${dir}`;
    if (seen.has(state)) return { cells, endDir: dir, reachesEdge: false };
    seen.add(state);
    cells.push({ x, y });
  }
}

export function exitRay(level: Level, piece: Piece): Cell[] {
  return traceExit(level, piece).cells;
}

export function exitCell(level: Level, piece: Piece): Cell {
  const ray = exitRay(level, piece);
  return ray.length > 0 ? ray[ray.length - 1] : piece.cells[0];
}

export function exitDirection(level: Level, piece: Piece): Direction {
  return traceExit(level, piece).endDir;
}

export function blockersOf(level: Level, piece: Piece, alive: ReadonlySet<number>): number[] {
  const owner = new Map<string, number>();
  for (const other of level.pieces) {
    if (other.id === piece.id || !alive.has(other.id)) continue;
    for (const cell of other.cells) owner.set(`${cell.x},${cell.y}`, other.id);
  }
  const found = new Set<number>();
  for (const cell of exitRay(level, piece)) {
    const id = owner.get(`${cell.x},${cell.y}`);
    if (id !== undefined) found.add(id);
  }
  return [...found].sort((a, b) => a - b);
}

/** Ids of pieces with a cell directly next to one of this piece's cells. */
export function neighborsOf(level: Level, piece: Piece): number[] {
  const owner = new Map<string, number>();
  for (const q of level.pieces) for (const c of q.cells) owner.set(`${c.x},${c.y}`, q.id);
  const found = new Set<number>();
  for (const c of piece.cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const id = owner.get(`${c.x + dx},${c.y + dy}`);
      if (id !== undefined && id !== piece.id) found.add(id);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/** Id of the alive key carrier that still locks this piece, if any. */
export function lockedBy(level: Level, piece: Piece, alive: ReadonlySet<number>): number | undefined {
  if (piece.lock === undefined) return undefined;
  return level.pieces.find((q) => q.id !== piece.id && q.key === piece.lock && alive.has(q.id))?.id;
}

export function isAsleep(level: Level, piece: Piece, alive: ReadonlySet<number>): boolean {
  if (!piece.sleeping) return false;
  return !neighborsOf(level, piece).some((id) => !alive.has(id));
}

export function canExit(level: Level, id: number, alive: ReadonlySet<number>): boolean {
  const piece = level.pieces.find((q) => q.id === id);
  return (
    piece !== undefined &&
    traceExit(level, piece).reachesEdge &&
    blockersOf(level, piece, alive).length === 0 &&
    lockedBy(level, piece, alive) === undefined &&
    !isAsleep(level, piece, alive)
  );
}

export interface ValidateOptions {
  straightOnly?: boolean;
  minLength?: number;
  maxLength?: number;
}

export function validateLevel(level: Level, options: ValidateOptions = {}): string[] {
  const errors: string[] = [];
  if (level.voids?.length && !isOrthogonallyConvex(level.width, level.height, level.voids)) errors.push('board outline is not orthogonally convex');
  const ids = new Set<number>();
  const owner = new Map<string, number>();
  const fixtures = new Set<string>();
  for (const f of [...(level.obstacles ?? []), ...(level.arrows ?? [])]) {
    if (!inBounds(level, f.x, f.y)) errors.push(`fixture (${f.x},${f.y}) out of bounds`);
    const fk = `${f.x},${f.y}`;
    if (fixtures.has(fk)) errors.push(`fixture (${f.x},${f.y}) overlaps another fixture`);
    fixtures.add(fk);
  }
  for (const piece of level.pieces) {
    if (ids.has(piece.id)) errors.push(`duplicate piece id ${piece.id}`);
    ids.add(piece.id);
    const cells = piece.cells;
    if (cells.length === 0) errors.push(`piece ${piece.id}: has no cells`);
    if (cells.length === 1 && !piece.dir) errors.push(`piece ${piece.id}: a one-cell piece needs dir`);
    if (options.minLength !== undefined && cells.length < options.minLength) errors.push(`piece ${piece.id}: shorter than ${options.minLength}`);
    if (options.maxLength !== undefined && cells.length > options.maxLength) errors.push(`piece ${piece.id}: longer than ${options.maxLength}`);
    for (const cell of cells) {
      if (!inBounds(level, cell.x, cell.y)) errors.push(`piece ${piece.id}: cell (${cell.x},${cell.y}) out of bounds`);
      const key = `${cell.x},${cell.y}`;
      if (fixtures.has(key)) errors.push(`piece ${piece.id}: cell (${cell.x},${cell.y}) overlaps a fixture`);
      const other = owner.get(key);
      if (other !== undefined) errors.push(`cell (${cell.x},${cell.y}) shared by pieces ${other} and ${piece.id}`);
      else owner.set(key, piece.id);
    }
    for (let i = 1; i < cells.length; i++) {
      if (Math.abs(cells[i].x - cells[i - 1].x) + Math.abs(cells[i].y - cells[i - 1].y) !== 1) {
        errors.push(`piece ${piece.id}: cells ${i - 1} and ${i} are not adjacent`);
        break;
      }
    }
    if (cells.length >= 2 && piece.dir) {
      const dx = cells[0].x - cells[1].x;
      const dy = cells[0].y - cells[1].y;
      const derived: Direction | null = dx === 1 && dy === 0 ? 'right' : dx === -1 && dy === 0 ? 'left' : dy === 1 && dx === 0 ? 'down' : dy === -1 && dx === 0 ? 'up' : null;
      if (derived && derived !== piece.dir) errors.push(`piece ${piece.id}: dir ${piece.dir} contradicts the body (${derived})`);
    }
    if (options.straightOnly && cells.length >= 2 && !cells.every((q) => q.x === cells[0].x) && !cells.every((q) => q.y === cells[0].y)) {
      errors.push(`piece ${piece.id}: not a straight bar`);
    }
  }
  const keys = new Set(level.pieces.filter((q) => q.key !== undefined).map((q) => q.key));
  for (const piece of level.pieces) {
    if (piece.lock !== undefined && !keys.has(piece.lock)) errors.push(`piece ${piece.id}: lock ${piece.lock} has no key carrier`);
    if (piece.lock !== undefined && piece.key === piece.lock) errors.push(`piece ${piece.id}: carries the key to its own lock`);
    if (piece.sleeping && neighborsOf(level, piece).length === 0) errors.push(`piece ${piece.id}: a sleeper needs an adjacent piece to wake it`);
    if (piece.fuse !== undefined && (!Number.isInteger(piece.fuse) || piece.fuse < 1)) errors.push(`piece ${piece.id}: fuse must be a positive integer`);
  }
  for (const piece of level.pieces) {
    if (errors.some((e) => e.startsWith(`piece ${piece.id}:`))) continue;
    try {
      if (!traceExit(level, piece).reachesEdge) errors.push(`piece ${piece.id}: exit path never reaches the board edge`);
    } catch {
      /* geometry errors are already reported above */
    }
  }
  return errors;
}
