import type { Level } from '../src/core/types';

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
