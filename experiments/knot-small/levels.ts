/**
 * Small whole-knot experiment (2026-11-07, approved): 6 x 8 boards of six to nine animals where the whole board is the
 * knot. Three are designed by hand from a dependency chain written first (see the comment on each), two come from the
 * generator (make.ts). check.ts verifies every one; the game opens them with ?exp=<name> (dev only).
 */
import type { Level } from '../../src/core/types';

const one = (id: number, x: number, y: number, dir: 'up' | 'down' | 'left' | 'right') => ({ id, cells: [{ x, y }], dir });
const two = (id: number, hx: number, hy: number, tx: number, ty: number) => ({ id, cells: [{ x: hx, y: hy }, { x: tx, y: ty }] });

/**
 * EASY (one forced push). Ring: 1 is stopped by 2's tail; 3 is held by 1; 4 by 3; 5 by 4's tail; 8 by 5; 7 by 8;
 * 6 by 7; 2 by 6. Push 1 (it runs right to 2) and 3 is free: 3, 4, 5, 8, 7, 6, 2, 1 leave in that order.
 * Push 6 instead and it runs into the square 5-7-8 and closes it for good.
 */
const easy: Level = {
  width: 6, height: 8,
  pieces: [one(1, 0, 4, 'right'), two(2, 4, 5, 4, 4), one(3, 0, 5, 'up'), two(4, 1, 5, 2, 5), one(5, 2, 7, 'up'), one(6, 4, 6, 'left'), one(7, 1, 6, 'down'), one(8, 1, 7, 'right')],
};

/**
 * Hand attempts at a medium and a hard level failed on this board (2026-11-07): every coupling added to the ring
 * either made two animals face each other on one line (never solvable) or left the new animal free (filler). See
 * the report. The four levels below come from make.ts (the game's generator plus knotSearch with fairTraps), picked by
 * hand from the search sweep and verified by check.ts.
 */
const gen1: Level = {"width": 6, "height": 8, "pieces": [{"id": 3, "cells": [{"x": 2, "y": 3}, {"x": 1, "y": 3}]}, {"id": 6, "cells": [{"x": 3, "y": 3}], "dir": "down"}, {"id": 1, "cells": [{"x": 4, "y": 5}], "dir": "left"}, {"id": 7, "cells": [{"x": 4, "y": 4}], "dir": "left"}, {"id": 5, "cells": [{"x": 3, "y": 5}], "dir": "left"}, {"id": 8, "cells": [{"x": 4, "y": 2}, {"x": 4, "y": 1}]}, {"id": 2, "cells": [{"x": 0, "y": 2}], "dir": "right"}, {"id": 4, "cells": [{"x": 2, "y": 4}, {"x": 2, "y": 5}]}]};
const gen2: Level = {"width": 6, "height": 8, "pieces": [{"id": 2, "cells": [{"x": 2, "y": 4}, {"x": 2, "y": 3}, {"x": 2, "y": 2}]}, {"id": 6, "cells": [{"x": 3, "y": 7}, {"x": 2, "y": 7}, {"x": 1, "y": 7}]}, {"id": 8, "cells": [{"x": 1, "y": 6}], "dir": "down"}, {"id": 5, "cells": [{"x": 4, "y": 7}], "dir": "up"}, {"id": 7, "cells": [{"x": 5, "y": 1}], "dir": "left"}, {"id": 3, "cells": [{"x": 1, "y": 3}, {"x": 1, "y": 2}, {"x": 1, "y": 1}]}, {"id": 1, "cells": [{"x": 3, "y": 3}], "dir": "down"}, {"id": 4, "cells": [{"x": 4, "y": 6}, {"x": 5, "y": 6}]}]};
const gen3: Level = {"width": 6, "height": 8, "pieces": [{"id": 5, "cells": [{"x": 2, "y": 5}, {"x": 2, "y": 6}, {"x": 2, "y": 7}]}, {"id": 3, "cells": [{"x": 2, "y": 2}, {"x": 3, "y": 2}, {"x": 4, "y": 2}]}, {"id": 2, "cells": [{"x": 1, "y": 2}, {"x": 1, "y": 1}]}, {"id": 7, "cells": [{"x": 1, "y": 4}, {"x": 0, "y": 4}]}, {"id": 8, "cells": [{"x": 0, "y": 2}], "dir": "down"}, {"id": 6, "cells": [{"x": 3, "y": 6}, {"x": 3, "y": 7}]}, {"id": 4, "cells": [{"x": 4, "y": 1}], "dir": "right"}, {"id": 1, "cells": [{"x": 4, "y": 3}, {"x": 4, "y": 4}, {"x": 4, "y": 5}]}]};
const gen4: Level = {"width": 6, "height": 8, "pieces": [{"id": 9, "cells": [{"x": 1, "y": 4}, {"x": 1, "y": 3}]}, {"id": 2, "cells": [{"x": 0, "y": 6}], "dir": "right"}, {"id": 3, "cells": [{"x": 2, "y": 6}, {"x": 2, "y": 7}]}, {"id": 5, "cells": [{"x": 1, "y": 5}], "dir": "right"}, {"id": 8, "cells": [{"x": 4, "y": 5}, {"x": 4, "y": 6}]}, {"id": 1, "cells": [{"x": 3, "y": 2}], "dir": "down"}, {"id": 7, "cells": [{"x": 3, "y": 1}], "dir": "down"}, {"id": 4, "cells": [{"x": 2, "y": 4}, {"x": 3, "y": 4}, {"x": 4, "y": 4}]}, {"id": 6, "cells": [{"x": 3, "y": 0}, {"x": 4, "y": 0}, {"x": 5, "y": 0}]}]};

export const LEVELS: Record<string, Level> = { easy, gen1, gen2, gen3, gen4 };
