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
  /** Locked until the piece whose `key` equals this value has left. */
  lock?: number;
  /** Carries the key with this id. */
  key?: number;
  /** Ignores taps until an adjacent piece has left. */
  sleeping?: boolean;
  /** Bomb: the level fails if this many counted taps pass while the piece is still on the board. */
  fuse?: number;
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
  /**
   * Cells of the width x height box that are not part of the board (its outline, see core/shapes.ts). Stepping onto
   * one counts as leaving the board. Absent means a plain rectangle.
   */
  voids?: Cell[];
  /** Cells nothing can pass through. */
  obstacles?: Cell[];
  arrows?: ArrowTile[];
  /** Breakable crates: block like an animal until `hits` of the animals next to them have left. */
  crates?: Crate[];
}

/** A crate on a cell; each animal next to it that leaves cracks it once, and after `hits` cracks it is gone. */
export interface Crate {
  x: number;
  y: number;
  hits: number;
}
