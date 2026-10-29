export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Cell {
  x: number;
  y: number;
}

/**
 * cells[0] is the head; the exit direction is cells[1] -> cells[0].
 * A one-cell piece has no body to read a direction from, so it must carry `dir`.
 * The body follows its own path out, so a piece is only ever blocked by its exit ray.
 */
export interface Piece {
  id: number;
  cells: Cell[];
  dir?: Direction;
}

/** A floor tile that bends a piece's exit path. A piece entering from the opposite side hits a wall. */
export interface ArrowTile {
  x: number;
  y: number;
  dir: Direction;
}

export interface Level {
  width: number;
  height: number;
  pieces: Piece[];
  /** Cells nothing can pass through. */
  obstacles?: Cell[];
  arrows?: ArrowTile[];
}
