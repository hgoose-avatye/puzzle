import type { Direction, Level } from '../src/core/types';

/**
 * Hand-made scene for eyeballing every body type: ids pick the species (see speciesFor).
 * 1 chick (blocks the caterpillar), 2 fox (right), 8 fox (up), 3 caterpillar (L-turn), 4 dog (L-turn),
 * 5 bunny (up, 3 cells).
 */
export function demoLevel(): Level {
  return {
    width: 8,
    height: 10,
    pieces: [
      { id: 1, cells: [{ x: 3, y: 3 }], dir: 'up' },
      { id: 2, cells: [{ x: 2, y: 1 }, { x: 1, y: 1 }] },
      { id: 8, cells: [{ x: 4, y: 5 }, { x: 4, y: 6 }] },
      { id: 3, cells: [{ x: 1, y: 5 }, { x: 1, y: 6 }, { x: 1, y: 7 }] },
      { id: 4, cells: [{ x: 5, y: 9 }, { x: 4, y: 9 }, { x: 3, y: 9 }] },
      { id: 5, cells: [{ x: 7, y: 6 }, { x: 7, y: 7 }, { x: 7, y: 8 }] },
    ],
    arrows: [{ x: 1, y: 3, dir: 'right' }, { x: 6, y: 9, dir: 'up' }],
  };
}

const V = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } } as const;

/** One animal heading `from`, bent onto `to` by an arrow tile two cells ahead. Species follows from id and `len`. */
export function turnLevel(from: Direction, to: Direction, len: number, id: number): Level {
  const v = V[from];
  const head = { x: 4, y: 4 };
  const cells = Array.from({ length: len }, (_, k) => ({ x: head.x - v.x * k, y: head.y - v.y * k }));
  return {
    width: 9,
    height: 9,
    pieces: [{ id, cells }],
    arrows: [{ x: head.x + v.x * 2, y: head.y + v.y * 2, dir: to }],
  };
}

export const SHEET_SPECIES = ['penguin', 'chick', 'parrot', 'cow', 'pig', 'fox', 'tiger', 'husky', 'snake', 'caterpillar', 'dachshund', 'crocodile'];
const HEADINGS: Direction[] = ['up', 'down', 'left', 'right'];

/** One row per species, one column per heading (up, down, left, right). Pieces are `len` cells long. */
export function sheetLevel(names: string[], len = 1, headings: Direction[] = HEADINGS): { level: Level; species: Map<number, string> } {
  const species = new Map<number, string>();
  const pieces: Level['pieces'] = [];
  const pitch = len + 1;
  names.forEach((name, row) => {
    headings.forEach((dir, col) => {
      const id = 100 + row * 10 + col;
      species.set(id, name);
      const bx = col * pitch;
      const by = row * pitch;
      const cells = Array.from({ length: len }, (_, k) => {
        if (dir === 'up') return { x: bx, y: by + k };
        if (dir === 'down') return { x: bx, y: by + len - 1 - k };
        if (dir === 'left') return { x: bx + k, y: by };
        return { x: bx + len - 1 - k, y: by };
      });
      pieces.push(len === 1 ? { id, cells, dir } : { id, cells });
    });
  });
  return { level: { width: headings.length * pitch, height: names.length * pitch, pieces }, species };
}

/**
 * Crossing paths on one 9x9 board, for checking simultaneous runs: 1 (3 cells) runs right along row 4; 2 drops down column 5,
 * waits just above row 4 while 1 passes and then goes on by itself; 4 queues behind 2; 3 climbs through (7,4) after
 * 1 has passed (no wait).
 */
export function crossLevel(): Level {
  return {
    width: 9,
    height: 9,
    pieces: [
      { id: 1, cells: [{ x: 2, y: 4 }, { x: 1, y: 4 }, { x: 0, y: 4 }] },
      { id: 2, cells: [{ x: 5, y: 1 }], dir: 'down' },
      { id: 3, cells: [{ x: 7, y: 5 }], dir: 'up' },
      { id: 4, cells: [{ x: 5, y: 0 }], dir: 'down' },
    ],
  };
}

/**
 * crossLevel with a bomb on 2 (fuse 2), for checking bombs by hand: tap 1 and the bar warns at 1; then tapping 2 saves
 * it even while it waits behind 1, and tapping 3 first sets it off.
 */
export function bombLevel(): Level {
  const level = crossLevel();
  return { ...level, pieces: level.pieces.map((p) => (p.id === 2 ? { ...p, fuse: 2 } : p)) };
}
