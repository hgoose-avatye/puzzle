/**
 * Picks, for every level, the generator seed whose board comes nearest the knot shape the curve asks for (curve.ts
 * shapeAt, searched by generator/knotSearch.ts): forced pushes, few winning lines, a knot of some size.
 *
 *   npx tsx scripts/pick-seeds-curve.ts [first=1] [last=180] [candidates=6] [out]
 *   npx tsx scripts/pick-seeds-curve.ts merge part1.json part2.json ...
 *
 * A knot level tries seeds in order and stops at the first that meets its shape (score 0), keeping the best seen among
 * `candidates` otherwise; levels without a knot keep the first seed that makes a level; hand-made levels
 * (handLevels.json) are skipped, build-levels.ts ships them as written. With `out` the picks go to that file (one
 * part of a parallel run, see scripts/pick-all.sh); without it, and on `merge`, the script writes src/curve/seeds.json
 * and docs/sim/curve-selection.json (every level's shape, pick and grade). Then run scripts/build-levels.ts. Rerun
 * whenever the generator or the curve changes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { generateLevelFor, HAND_LEVELS, knotLevel, levelSpec, shapeAt } from '../src/curve/curve';

interface Row {
  n: number; role: string; knot: boolean; shape: { keyMoves: number; answersMax: number; knotMin: number } | null; seed: number; score: number;
  guessWin: number; knotSize: number; answers: number; keyMoves: number; pushes: number; seedsTried: number;
}
interface Part { seeds: Record<number, number>; report: Row[]; levels: Record<number, unknown> }

function write(parts: Part[]): void {
  const seeds: Record<number, number> = {};
  const report: Row[] = [];
  const levels: Record<number, unknown> = {};
  // a level picked again in a later part replaces its earlier row (seeds and boards: last part wins the same way)
  const rows = new Map<number, Row>();
  for (const p of parts) { Object.assign(seeds, p.seeds); for (const r of p.report) rows.set(r.n, r); Object.assign(levels, p.levels); }
  report.push(...rows.values());
  report.sort((a, b) => a.n - b.n);
  const ordered: Record<number, number> = {};
  for (const n of Object.keys(seeds).map(Number).sort((a, b) => a - b)) ordered[n] = seeds[n];
  writeFileSync('src/curve/seeds.json', JSON.stringify(ordered) + '\n');
  writeFileSync('docs/sim/curve-selection.json', JSON.stringify(report, null, 1) + '\n');
  // the boards the picks made, so build-levels.ts need not search again (a knot search takes up to a minute a level)
  writeFileSync('docs/sim/picked-levels.json', JSON.stringify(levels) + '\n');
  process.stderr.write(`wrote src/curve/seeds.json, docs/sim/curve-selection.json and docs/sim/picked-levels.json (${Object.keys(ordered).length} levels)\n`);
}

if (process.argv[2] === 'merge') {
  write(process.argv.slice(3).map((f) => JSON.parse(readFileSync(f, 'utf8')) as Part));
  process.exit(0);
}

const first = Number(process.argv[2] ?? 1);
const last = Number(process.argv[3] ?? 180);
const candidates = Number(process.argv[4] ?? 6);
const out = process.argv[5];

const part: Part = { seeds: {}, report: [], levels: {} };
for (let n = first; n <= last; n++) {
  if (HAND_LEVELS.has(n)) { part.seeds[n] = 1; continue; }
  const role = levelSpec(n).role;
  const knot = knotLevel(n);
  const shape = shapeAt(n);
  let best: { seed: number; r: NonNullable<ReturnType<typeof generateLevelFor>> } | null = null;
  let tried = 0;
  const started = Date.now();
  for (let seed = 1; seed <= candidates * 3 && (seed <= candidates || !best); seed++) {
    tried++;
    const r = generateLevelFor(n, seed);
    if (!r) continue;
    if (!best || r.score < best.r.score) best = { seed, r };
    if (!knot || r.score === 0) break;
  }
  if (!best) throw new Error(`level ${n}: no seed makes a level`);
  const g = best.r.grade;
  part.seeds[n] = best.seed;
  part.levels[n] = { seed: best.seed, level: best.r.level, hearts: best.r.spec.hearts };
  part.report.push({
    n, role, knot, shape: shape && { keyMoves: shape.keyMoves, answersMax: shape.answersMax, knotMin: shape.knotMin }, seed: best.seed, score: best.r.score,
    guessWin: g.guessWin, knotSize: g.knot, answers: g.answers, keyMoves: g.keyMoves, pushes: g.pushes?.length ?? 0, seedsTried: tried,
  });
  process.stderr.write(`level ${n}: seed ${best.seed} score ${best.r.score} km ${g.keyMoves}/${shape?.keyMoves ?? '-'} ans ${g.answers} knot ${g.knot} (${tried} seeds, ${Math.round((Date.now() - started) / 1000)}s)\n`);
}
if (out) writeFileSync(out, JSON.stringify(part) + '\n');
else write([part]);
