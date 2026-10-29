/**
 * Picks, for every level, the generator seed whose simulated difficulty best fits a smooth curve:
 * npx tsx scripts/pick-seeds.ts [lastLevel=180] [candidates=10] [runs=150]
 *
 * Score = fail rate (%) of the 'average' simulated player with the level's own hearts, so lost hearts and bombs that
 * go off both count. Within a chapter, ordinary levels follow a straight line fitted through all their candidates (the
 * natural trend of the curve parameters, minus the noise); tough levels aim PEAK points above that line and the
 * finale FINALE points above, so they really stand out from their neighbours. Intro and rest levels keep the first
 * seed that works. Writes src/curve/seeds.json; then run scripts/build-levels.ts. Rerun both whenever the generator
 * or the curve changes.
 */
import { writeFileSync } from 'node:fs';
import { createRng } from '../src/core/rng';
import { CHAPTER_LENGTH, generateLevelFor, levelSpec } from '../src/curve/curve';
import { PROFILES, simulate } from '../src/sim/player';

const last = Number(process.argv[2] ?? 180);
const candidates = Number(process.argv[3] ?? 10);
const runs = Number(process.argv[4] ?? 150);
const average = PROFILES.find((p) => p.name === 'average')!;
/** how far above the ordinary trend tough and finale levels aim, in fail-rate points */
const PEAK = 15;
const FINALE = 22;

type Cand = { seed: number; score: number };
const pool = new Map<number, Cand[]>();
for (let n = 1; n <= last; n++) {
  const list: Cand[] = [];
  for (let seed = 1; seed <= candidates; seed++) {
    const r = generateLevelFor(n, seed);
    if (!r) continue;
    list.push({ seed, score: simulate(r.level, average, createRng(n * 31 + seed), runs, r.spec.hearts).failRate * 100 });
  }
  pool.set(n, list);
  if (n % 10 === 0) process.stderr.write(`level ${n}\n`);
}

const seeds: Record<number, number> = {};
const chapters = Math.ceil(last / CHAPTER_LENGTH);
for (let c = 0; c < chapters; c++) {
  const levels = Array.from({ length: CHAPTER_LENGTH }, (_, i) => c * CHAPTER_LENGTH + i + 1).filter((n) => n <= last);
  // least-squares line through every ordinary candidate: score ~ a + b * position
  const pts: Array<[number, number]> = [];
  for (const n of levels) if (levelSpec(n).role === 'ordinary') for (const k of pool.get(n)!) pts.push([n, k.score]);
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const b = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / (pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0) || 1);
  const trend = (n: number): number => my + b * (n - mx);
  for (const n of levels) {
    const list = pool.get(n)!;
    if (!list.length) continue;
    const role = levelSpec(n).role;
    if (role === 'intro' || role === 'rest') { seeds[n] = list[0].seed; continue; }
    const target = Math.min(80, trend(n) + (role === 'ordinary' ? 0 : role === 'finale' ? FINALE : PEAK));
    seeds[n] = list.reduce((best, k) => (Math.abs(k.score - target) < Math.abs(best.score - target) ? k : best)).seed;
  }
}
writeFileSync('src/curve/seeds.json', JSON.stringify(seeds) + '\n');
writeFileSync('docs/sim/seed-pool.json', JSON.stringify(Object.fromEntries(pool)));
process.stderr.write(`wrote src/curve/seeds.json (${Object.keys(seeds).length} levels)\n`);
