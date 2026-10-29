/**
 * Bakes the 180 levels the game plays into src/curve/levels.json, so the game never runs the generator on a phone
 * (the biggest levels take seconds to generate). Run after scripts/pick-seeds.ts:
 * npx tsx scripts/build-levels.ts [lastLevel=180]
 */
import { writeFileSync } from 'node:fs';
import { generateGameLevel } from '../src/curve/curve';

const last = Number(process.argv[2] ?? 180);
const out: Record<number, unknown> = {};
for (let n = 1; n <= last; n++) {
  const built = generateGameLevel(n);
  if (!built) throw new Error(`level ${n} could not be generated`);
  out[n] = built;
}
writeFileSync('src/curve/levels.json', JSON.stringify(out) + '\n');
process.stderr.write(`wrote src/curve/levels.json (${last} levels)\n`);
