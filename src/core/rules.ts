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

const inBounds = (level: Level, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < level.width && y < level.height;

export function exitRay(level: Level, piece: Piece): Cell[] {
  const v = directionVector(headDirection(piece));
  const ray: Cell[] = [];
  let x = piece.cells[0].x + v.x;
  let y = piece.cells[0].y + v.y;
  while (inBounds(level, x, y)) {
    ray.push({ x, y });
    x += v.x;
    y += v.y;
  }
  return ray;
}

export function exitCell(level: Level, piece: Piece): Cell {
  const ray = exitRay(level, piece);
  return ray.length > 0 ? ray[ray.length - 1] : piece.cells[0];
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

export function canExit(level: Level, id: number, alive: ReadonlySet<number>): boolean {
  const piece = level.pieces.find((q) => q.id === id);
  return piece !== undefined && blockersOf(level, piece, alive).length === 0;
}

export interface ValidateOptions {
  straightOnly?: boolean;
  minLength?: number;
  maxLength?: number;
}

export function validateLevel(level: Level, options: ValidateOptions = {}): string[] {
  const errors: string[] = [];
  const ids = new Set<number>();
  const owner = new Map<string, number>();
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
  return errors;
}
