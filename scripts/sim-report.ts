/**
 * Simulated-player report for the level curve: npx tsx scripts/sim-report.ts [lastLevel=180] [runs=200]
 * Writes docs/sim/sim-report.json. Levels are built exactly like the game builds them (game/main.ts buildLevel).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRng } from '../src/core/rng';
import { buildGameLevel, levelSpec } from '../src/curve/curve';
import { computeMetrics } from '../src/solver/metrics';
import { PROFILES, simulate } from '../src/sim/player';

const last = Number(process.argv[2] ?? 180);
const runs = Number(process.argv[3] ?? 200);

const rows = [];
for (let n = 1; n <= last; n++) {
  const spec = levelSpec(n);
  const built = buildGameLevel(n);
  if (!built) { rows.push({ n, chapter: spec.chapter, role: spec.role, missing: true }); continue; }
  const m = computeMetrics(built.level);
  const sims = Object.fromEntries(PROFILES.map((p) => [p.name, simulate(built.level, p, createRng(n * 7919 + p.name.length), runs, built.hearts)]));
  rows.push({
    n, chapter: spec.chapter, role: spec.role, hearts: built.hearts ?? null,
    pieces: m.pieceCount, rounds: m.rounds, initialFree: +m.initialFreeRatio.toFixed(2),
    arrows: built.level.arrows?.length ?? 0,
    sims,
  });
  if (n % 10 === 0) process.stderr.write(`level ${n}\n`);
}
mkdirSync('docs/sim', { recursive: true });
writeFileSync('docs/sim/sim-report.json', JSON.stringify({ runs, profiles: PROFILES, rows }, null, 1));
process.stderr.write(`wrote docs/sim/sim-report.json (${rows.length} levels, ${runs} runs each)\n`);
