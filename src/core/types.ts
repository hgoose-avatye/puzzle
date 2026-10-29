export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Cell {
  x: number;
  y: number;
}

/** cells[0] is the head; the exit direction is cells[1] -> cells[0]. */
export interface Piece {
  id: number;
  cells: Cell[];
}

export interface Level {
  width: number;
  height: number;
  pieces: Piece[];
}
