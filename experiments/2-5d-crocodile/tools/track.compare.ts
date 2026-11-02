/**
 * The 2D compositor's block placement (tools/overlap_compare.py smooth/at, dumped by croc_full_check scenes with game
 * spacing, no tuck) against the game's own track code: every block at the same place and heading, so head, body and
 * tail turn in the same order and at the same moment as in the game.
 * Run: npx vitest run --config experiments/2-5d-crocodile/vitest.config.ts (needs out-full/track-dump.json)
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { smoothPath, trackAt } from '../../../src/game/smooth';

const CORNER_RADIUS = 0.3; // src/game/flow.ts
interface Sample { scene: string; path: Array<[number, number]>; s: number; blocks: Array<[number, number, number]> }
const dump = JSON.parse(readFileSync(new URL('../out-full/track-dump.json', import.meta.url), 'utf8')) as Sample[];

describe('compositor track = game track', () => {
  it(`every block at the game's position and heading (${dump.length} samples, 9 scenes)`, () => {
    let worstPos = 0;
    let worstDeg = 0;
    for (const d of dump) {
      const track = smoothPath(d.path.map(([x, y]) => ({ x, y })), CORNER_RADIUS);
      d.blocks.forEach(([x, y, deg], i) => {
        const q = trackAt(track, d.s - i);
        worstPos = Math.max(worstPos, Math.hypot(q.x - x, q.y - y));
        const gameDeg = (((q.angle * 180) / Math.PI) % 360 + 360) % 360;
        worstDeg = Math.max(worstDeg, Math.abs(((gameDeg - deg + 540) % 360) - 180));
      });
    }
    expect(worstPos).toBeLessThan(1e-9);
    expect(worstDeg).toBeLessThan(1e-6);
  });
});
