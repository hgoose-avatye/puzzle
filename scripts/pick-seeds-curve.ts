/**
 * Picks, for every level, the generator seed whose board comes closest to the difficulty curve's aim (curve.ts aimAt,
 * the guessWin of core/bump.ts under the bump rule):
 * npx tsx scripts/pick-seeds-curve.ts [lastLevel=180] [candidates=40]
 *
 * Levels without a knot (intro, rest) keep the first seed that makes a level. A knot level whose first `candidates`
 * seeds take no knot draws three times as many before the script gives up. (The hand-set seeds of
 * seedSelect.ts SEED_OVERRIDES belong to the old picks and are not used.) Writes src/curve/seeds.json and
 * docs/sim/curve-selection.json (every level's aim, pick and grade); then run scripts/build-levels.ts. Rerun both
 * whenever the generator or the curve changes.
 */
import { writeFileSync } from 'node:fs';
import { aimAt, generateLevelFor, knotLevel, levelSpec } from '../src/curve/curve';

const last = Number(process.argv[2] ?? 180);
const candidates = Number(process.argv[3] ?? 40);

interface Row { n: number; role: string; knot: boolean; aim: number; seed: number; guessWin: number; knotSize: number; answers: number; keyMoves: number; seedsTried: number; seedsOk: number }

const seeds: Record<number, number> = {};
const report: Row[] = [];
for (let n = 1; n <= last; n++) {
  const aim = aimAt(n);
  const role = levelSpec(n).role;
  const knot = knotLevel(n);
  let best: { seed: number; g: NonNullable<ReturnType<typeof generateLevelFor>>['grade'] } | null = null;
  let tried = 0;
  let ok = 0;
  const limit = knot ? candidates : 10;
  for (let seed = 1; seed <= limit * 3 && (seed <= limit || !best); seed++) {
    tried++;
    const r = generateLevelFor(n, seed);
    if (!r) continue;
    ok++;
    if (!best || Math.abs(r.grade.guessWin - aim) < Math.abs(best.g.guessWin - aim)) best = { seed, g: r.grade };
    if (!knot) break;
  }
  if (!best) throw new Error(`level ${n}: no seed makes a level`);
  seeds[n] = best.seed;
  report.push({ n, role, knot, aim, seed: best.seed, guessWin: best.g.guessWin, knotSize: best.g.knot, answers: best.g.answers, keyMoves: best.g.keyMoves, seedsTried: tried, seedsOk: ok });
  if (n % 10 === 0) process.stderr.write(`level ${n}\n`);
}
writeFileSync('src/curve/seeds.json', JSON.stringify(seeds) + '\n');
writeFileSync('docs/sim/curve-selection.json', JSON.stringify(report, null, 1) + '\n');
process.stderr.write(`wrote src/curve/seeds.json and docs/sim/curve-selection.json (${last} levels)\n`);
