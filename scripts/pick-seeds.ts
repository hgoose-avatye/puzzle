/**
 * Picks, for every level, the generator seed whose simulated difficulty best fits the target curve:
 * npx tsx scripts/pick-seeds.ts [lastLevel=180] [candidates=10] [runs=150]
 *
 * Score = fail rate (%) of the 'average' simulated player with the level's own hearts, so lost hearts and bombs that
 * go off both count. The policy lives in src/curve/seedSelect.ts: ordinary levels follow one rising line across the
 * whole game, tough levels aim PEAK above it, and each finale aims FINALE above its chapter's last ordinary level and
 * at least FINALE_OVER_TOUGH above the hardest tough level picked in its chapter (a floor: chooseFinale). Among
 * candidates within TOLERANCE of the aim, preferences decide in order: locks and sleepers that matter, more blocking,
 * fewer touching badges. Intro and rest levels keep the first seed that works. Tough and finale levels draw
 * PEAK_CANDIDATES candidates scored with PEAK_RUNS runs.
 *
 * Writes src/curve/seeds.json, docs/sim/seed-pool.json (every candidate's score, blocking, mechanics that matter and
 * touching badges) and docs/sim/seed-selection.json (aims, picks, preference changes, finale issues and levels without
 * a candidate). Then run
 * scripts/build-levels.ts. Rerun both whenever the generator or the curve changes.
 */
import { writeFileSync } from 'node:fs';
import { createRng } from '../src/core/rng';
import { CHAPTER_LENGTH, generateLevelFor, levelSpec } from '../src/curve/curve';
import { PROFILES, simulate } from '../src/sim/player';
import {
  badgePairs, CAP, candidatesFor, choose, chooseFinale, FINALE_OVER_TOUGH, finaleAim, lineAt, meaningfulShare, ordinaryLevels, runsFor, toughTarget,
  type Candidate, type Choice, type FinaleIssue,
} from '../src/curve/seedSelect';

const last = Number(process.argv[2] ?? 180);
const baseCandidates = Number(process.argv[3] ?? 10);
const runs = Number(process.argv[4] ?? 150);
const average = PROFILES.find((p) => p.name === 'average')!;

const pool = new Map<number, Candidate[]>();
for (let n = 1; n <= last; n++) {
  const list: Candidate[] = [];
  for (let seed = 1; seed <= candidatesFor(n, baseCandidates); seed++) {
    const r = generateLevelFor(n, seed);
    if (!r) continue;
    const score = simulate(r.level, average, createRng(n * 31 + seed), runsFor(n, runs), r.spec.hearts).failRate * 100;
    list.push({ seed, score, pairs: badgePairs(r.level), blockers: r.metrics.avgBlockers, meaningful: meaningfulShare(r.level) });
  }
  pool.set(n, list);
  if (n % 10 === 0) process.stderr.write(`level ${n}\n`);
}

interface Picked {
  n: number;
  role: string;
  target: number | null;
  seed: number;
  score: number;
  pairs: number;
  onTarget?: number;
  /** the preferences moved the pick: what difficulty alone would have picked */
  preference?: { nearestScore: number; nearestMeaningful: number; nearestBlockers: number; nearestPairs: number };
  finale?: { wanted: number; guard: number | null; hardestTough: number | null; issues: FinaleIssue[] };
}

const ordinary = ordinaryLevels(last);
const seeds: Record<number, number> = {};
const picks: Picked[] = [];
const missing: number[] = [];
const chapters = Math.ceil(last / CHAPTER_LENGTH);
for (let c = 0; c < chapters; c++) {
  const levels = Array.from({ length: CHAPTER_LENGTH }, (_, i) => c * CHAPTER_LENGTH + i + 1).filter((n) => n <= last);
  const toughScores: number[] = [];
  // every other level before the finale: the finale's guard depends on the tough levels actually picked
  const order = [...levels.filter((n) => levelSpec(n).role !== 'finale'), ...levels.filter((n) => levelSpec(n).role === 'finale')];
  for (const n of order) {
    const list = pool.get(n)!;
    const role = levelSpec(n).role;
    if (!list.length) { missing.push(n); continue; }
    if (role === 'intro' || role === 'rest') {
      seeds[n] = list[0].seed;
      picks.push({ n, role, target: null, seed: list[0].seed, score: list[0].score, pairs: list[0].pairs });
      continue;
    }
    const aim = role === 'finale' ? finaleAim(n, ordinary, toughScores) : null;
    const target = aim ? aim.target : role === 'tough' ? toughTarget(n, ordinary) : Math.min(CAP, lineAt(n, ordinary));
    const finale = aim ? chooseFinale(list, aim, toughScores) : null;
    const choice: Choice = finale ?? choose(list, target);
    seeds[n] = choice.pick.seed;
    const entry: Picked = { n, role, target, seed: choice.pick.seed, score: choice.pick.score, pairs: choice.pick.pairs, onTarget: choice.onTarget };
    if (choice.preferenceApplied) {
      const { score, meaningful, blockers, pairs } = choice.nearest;
      entry.preference = { nearestScore: score, nearestMeaningful: meaningful, nearestBlockers: blockers, nearestPairs: pairs };
    }
    if (role === 'tough') toughScores.push(choice.pick.score);
    if (aim && finale) {
      const hardestTough = toughScores.length ? Math.max(...toughScores) : null;
      entry.finale = { wanted: aim.wanted, guard: hardestTough === null ? null : hardestTough + FINALE_OVER_TOUGH, hardestTough, issues: finale.issues };
    }
    picks.push(entry);
  }
}

const finaleProblems = picks.filter((p) => p.finale?.issues.length);
writeFileSync('src/curve/seeds.json', JSON.stringify(seeds) + '\n');
writeFileSync('docs/sim/seed-pool.json', JSON.stringify(Object.fromEntries(pool)));
writeFileSync('docs/sim/seed-selection.json', JSON.stringify({ runs, baseCandidates, picks: picks.sort((a, b) => a.n - b.n), missing, finaleProblems: finaleProblems.map((p) => p.n) }, null, 1) + '\n');
process.stderr.write(`wrote src/curve/seeds.json (${Object.keys(seeds).length} levels), docs/sim/seed-selection.json\n`);
if (missing.length) process.stderr.write(`WARNING: no candidate met the curve for levels ${missing.join(', ')}\n`);
for (const p of finaleProblems) {
  const f = p.finale!;
  process.stderr.write(`WARNING: finale ${p.n} scored ${p.score.toFixed(1)}: ${f.issues.join(', ')} (wanted ${f.wanted.toFixed(1)}, hardest tough ${f.hardestTough?.toFixed(1)})\n`);
}
