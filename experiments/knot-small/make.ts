/**
 * Generator levels for the small whole-knot experiment: 6 x 8 boards of `animals` animals, the base board from the
 * game's generator (reverse placement), knotted by knotSearch towards "every animal in the knot, `keyMoves` forced
 * pushes, two answers at most, hidden traps earn nothing". Prints each candidate's report and the time it took.
 *   npx tsx experiments/knot-small/make.ts <keyMoves> <animals> <seeds> [evals=300] [maxLength=2] [knotMin=animals]
 */
import { createRng } from '../../src/core/rng';
import { generateLevel } from '../../src/generator/generate';
import { searchKnot } from '../../src/generator/knotSearch';
import { report } from './check';

const keyMoves = Number(process.argv[2] ?? 1);
const animals = Number(process.argv[3] ?? 8);
const seeds = Number(process.argv[4] ?? 4);
const evals = Number(process.argv[5] ?? 300);
const maxLength = Number(process.argv[6] ?? 2);
const knotMin = Number(process.argv[7] ?? animals);   // animals that must be in the knot (all by default)

for (let s = 1; s <= seeds; s++) {
  const rng = createRng(6080 + s);
  const t0 = performance.now();
  const base = generateLevel({ width: 6, height: 8, pieceCount: animals, minLength: 1, maxLength }, rng);
  if (!base) { console.log(`seed ${s}: no base board`); continue; }
  const r = searchKnot(base, rng, { keyMoves, answersMax: 2, knotMin, fairTraps: true }, { evals, minLength: 1, maxLength });
  const ms = Math.round(performance.now() - t0);
  if (!r) { console.log(`seed ${s}: no knot (${ms}ms)`); continue; }
  console.log(report(`gen k${keyMoves} a${animals} s${s} score=${r.score} (${ms}ms, ${evals} evals)`, r.level));
  console.log('json:', JSON.stringify(r.level));
  console.log();
}
