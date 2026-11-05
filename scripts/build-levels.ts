/**
 * Bakes the 180 levels the game plays into src/curve/levels.json, so the game never runs the generator on a phone
 * (the biggest levels take seconds to generate). Hand-designed levels (src/curve/handLevels.json, the first-play
 * lessons) take the place of the generated ones with the same number. Run after scripts/pick-seeds.ts:
 * npx tsx scripts/build-levels.ts [lastLevel=180]
 */
import { writeFileSync } from 'node:fs';
import { generateGameLevel } from '../src/curve/curve';
import handLevels from '../src/curve/handLevels.json';

const HAND: Record<string, unknown> = handLevels;
const last = Number(process.argv[2] ?? 180);
const out: Record<number, unknown> = {};
for (let n = 1; n <= last; n++) {
  const built = HAND[n] ?? generateGameLevel(n);
  if (!built) throw new Error(`level ${n} could not be generated`);
  out[n] = built;
}
writeFileSync('src/curve/levels.json', JSON.stringify(out) + '\n');
process.stderr.write(`wrote src/curve/levels.json (${last} levels, ${Object.keys(HAND).filter((n) => +n <= last).length} by hand)\n`);
