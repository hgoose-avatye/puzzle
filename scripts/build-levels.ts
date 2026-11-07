/**
 * Bakes the 180 levels the game plays into src/curve/levels.json, so the game never runs the generator on a phone
 * (the biggest levels take seconds to generate). Hand-designed levels (src/curve/handLevels.json, the first-play
 * lessons) take the place of the generated ones with the same number. Run after scripts/pick-seeds.ts:
 * npx tsx scripts/build-levels.ts [lastLevel=180]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Level } from '../src/core/types';
import { generateGameLevel } from '../src/curve/curve';
import handLevels from '../src/curve/handLevels.json';
import pickedSeeds from '../src/curve/seeds.json';

/**
 * Boards the pick script already made (docs/sim/picked-levels.json): used for a level whose seed there is the picked
 * one, so the bake takes seconds, not the knot search again. A level missing there, or picked with another seed since,
 * is generated here.
 */
const PICKED_PATH = 'docs/sim/picked-levels.json';
const PICKED: Record<string, { seed: number; level: Level; hearts?: number }> = existsSync(PICKED_PATH) ? JSON.parse(readFileSync(PICKED_PATH, 'utf8')) : {};
const SEEDS: Record<string, number> = pickedSeeds;
const prebuilt = (n: number): { level: Level; hearts?: number } | null => {
  const p = PICKED[n];
  return p && p.seed === SEEDS[n] ? { level: p.level, ...(p.hearts !== undefined ? { hearts: p.hearts } : {}) } : null;
};

const HAND: Record<string, { level: Level; hearts?: number }> = handLevels as unknown as Record<string, { level: Level; hearts?: number }>;

/**
 * Count bombs only on 2-3 cell animals (2026-11-05): the dynamite sits on the body block, which a one-cell animal does
 * not have. A one-cell bomb is dropped, not moved to another animal; the other bombs keep their fuses.
 */
const withoutOneCellBombs = (built: { level: Level; hearts?: number }): { level: Level; hearts?: number } => ({
  ...built,
  level: { ...built.level, pieces: built.level.pieces.map((p) => {
    if (p.fuse === undefined || p.cells.length > 1) return p;
    const { fuse: _dropped, ...rest } = p;
    return rest;
  }) },
});
const last = Number(process.argv[2] ?? 180);
const out: Record<number, unknown> = {};
for (let n = 1; n <= last; n++) {
  const built = HAND[n] ?? prebuilt(n) ?? generateGameLevel(n);
  if (!built) throw new Error(`level ${n} could not be generated`);
  out[n] = withoutOneCellBombs(built);
}
writeFileSync('src/curve/levels.json', JSON.stringify(out) + '\n');
process.stderr.write(`wrote src/curve/levels.json (${last} levels, ${Object.keys(HAND).filter((n) => +n <= last).length} by hand)\n`);
