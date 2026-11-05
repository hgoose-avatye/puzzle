import { blockersOf, traceExit } from '../core/rules';
import type { Level } from '../core/types';
import { CHAPTER_LENGTH, levelSpec, type Role } from './curve';

/**
 * Seed selection policy for scripts/pick-seeds.ts (2.5D level redesign, 2026-11-03). Every candidate seed of a level is
 * scored by the simulated average player's fail rate (%); this file decides which score each level aims at and which
 * candidate wins. Pure functions so the policy is unit-tested without running the simulator.
 */

/** Ordinary levels rise in one line across the whole game, from the first ordinary level to the last. */
export const LINE_START = 15;
export const LINE_END = 37.5;
/** Tough levels aim this far above the line at their place; finales this far above their chapter's last ordinary level. */
export const PEAK = 15;
export const FINALE = 22;
/** A finale must also beat the hardest tough level picked in its chapter by this much. */
export const FINALE_OVER_TOUGH = 5;
/** No level aims above this fail rate. */
export const CAP = 80;
/** Candidates this close to the aim count as on target; among them the preferences decide (see choose). */
export const TOLERANCE = 5;
export const DEFAULT_CANDIDATES = 10;
/**
 * Tough and finale levels draw more candidates, scored with more simulated runs: the finale guard compares picks a few
 * points apart, and with ten candidates at 150 runs some chapters had no finale above their tough levels (2026-11-03:
 * 150 runs vary by 6.8 points between repeats, 400 runs by 4.0).
 */
export const PEAK_CANDIDATES = 20;
export const PEAK_RUNS = 400;

/**
 * Seeds set by hand, which scripts/pick-seeds.ts keeps instead of its own pick (ordinary and tough levels only). The pick
 * script scores each one like a candidate and warns when it is off target. 2026-11-03: in the picked levels an animal
 * standing on the camera-side cell hid the level's arrow tiles at the start; these seeds are on target with every arrow
 * in sight. 2026-11-05: levels 8 and 12 follow the hand-made lessons (src/curve/handLevels.json) with few 3-cell
 * animals (seeds from a wider search, arrows checked in sight on the 2.5D board; level 12 was seed 11 before).
 */
export const SEED_OVERRIDES: Readonly<Record<number, { seed: number; reason: string }>> = {
  8: { seed: 21, reason: 'L7 onboarding: fewer 3-cell animals, arrows in sight' },
  12: { seed: 297, reason: 'L7 onboarding: fewer 3-cell animals, arrows in sight' },
  66: { seed: 3, reason: 'arrow tile hidden at start' },
  133: { seed: 2, reason: 'arrow tiles hidden at start' },
};

const roleOf = (n: number): Role => levelSpec(n).role;
const chapterOf = (n: number): number => Math.floor((n - 1) / CHAPTER_LENGTH) + 1;

/** Level numbers of all ordinary levels up to `last`, in order. */
export function ordinaryLevels(last: number): number[] {
  return Array.from({ length: last }, (_, i) => i + 1).filter((n) => roleOf(n) === 'ordinary');
}

/**
 * The target line at level `n`. An ordinary level sits at its own place in the line; any other level sits halfway
 * between the ordinary levels around it, so the line never jumps back at a chapter boundary.
 */
export function lineAt(n: number, ordinary: readonly number[]): number {
  const steps = Math.max(1, ordinary.length - 1);
  const before = ordinary.filter((o) => o < n).length;
  const place = ordinary.includes(n) ? before : before - 0.5;
  const clamped = Math.min(steps, Math.max(0, place));
  return LINE_START + ((LINE_END - LINE_START) * clamped) / steps;
}

export const toughTarget = (n: number, ordinary: readonly number[]): number => Math.min(CAP, lineAt(n, ordinary) + PEAK);

/** The finale's own aim before the tough-level guard: its chapter's last ordinary level + FINALE. */
export function finaleBase(n: number, ordinary: readonly number[]): number {
  const chapter = chapterOf(n);
  const last = ordinary.filter((o) => chapterOf(o) === chapter && o < n).pop();
  return (last === undefined ? lineAt(n, ordinary) : lineAt(last, ordinary)) + FINALE;
}

export interface FinaleAim {
  /** the score the finale is picked against (never above CAP) */
  target: number;
  /** the score it should reach: max(base, hardest tough + FINALE_OVER_TOUGH) */
  wanted: number;
  /** `wanted` is above CAP, so the guard cannot be met within the cap */
  capExceeded: boolean;
}

export function finaleAim(n: number, ordinary: readonly number[], toughScores: readonly number[]): FinaleAim {
  const guard = toughScores.length ? Math.max(...toughScores) + FINALE_OVER_TOUGH : -Infinity;
  const wanted = Math.max(finaleBase(n, ordinary), guard);
  return { target: Math.min(CAP, wanted), wanted, capExceeded: wanted > CAP };
}

const isPeak = (n: number): boolean => roleOf(n) === 'tough' || roleOf(n) === 'finale';

/** How many candidate seeds a level draws. */
export const candidatesFor = (n: number, base = DEFAULT_CANDIDATES): number => (isPeak(n) ? Math.max(base, PEAK_CANDIDATES) : base);

/** How many simulated runs score each candidate of a level. */
export const runsFor = (n: number, base: number): number => (isPeak(n) ? Math.max(base, PEAK_RUNS) : base);

/** Pairs of animals carrying a badge (lock, key, bomb) or sleeping whose heads touch, diagonals included. */
export function badgePairs(level: Level): number {
  const heads = level.pieces
    .filter((p) => p.lock !== undefined || p.key !== undefined || p.fuse !== undefined || p.sleeping)
    .map((p) => p.cells[0]);
  let pairs = 0;
  for (let i = 0; i < heads.length; i++) {
    for (let j = i + 1; j < heads.length; j++) {
      if (Math.max(Math.abs(heads[i].x - heads[j].x), Math.abs(heads[i].y - heads[j].y)) <= 1) pairs++;
    }
  }
  return pairs;
}

/**
 * Share of a level's locked and sleeping animals that the mechanic alone holds: the way out reaches the edge and no
 * other animal stands on it (the definition in levels.test.ts). A level without locks or sleepers counts as 1, so it is
 * never ranked below a level that has them.
 */
export function meaningfulShare(level: Level): number {
  const alive = new Set(level.pieces.map((p) => p.id));
  const held = level.pieces.filter((p) => p.lock !== undefined || p.sleeping);
  if (!held.length) return 1;
  const alone = held.filter((p) => traceExit(level, p).reachesEdge && blockersOf(level, p, alive).length === 0);
  return alone.length / held.length;
}

export interface Candidate {
  seed: number;
  /** simulated fail rate, % */
  score: number;
  /** badgePairs of the generated level */
  pairs: number;
  /** the level's average blockers per animal (Metrics.avgBlockers) */
  blockers: number;
  /** meaningfulShare of the generated level */
  meaningful: number;
}

export interface Choice {
  pick: Candidate;
  /** what difficulty alone would have picked */
  nearest: Candidate;
  /** candidates within TOLERANCE of the target */
  onTarget: number;
  /** the preferences changed the pick */
  preferenceApplied: boolean;
}

/**
 * Preferences among candidates that are on target, in order: more of the locks and sleepers matter, more blocking
 * between animals, fewer touching badges, then the nearer score. Plain comparisons, so a candidate is never rejected.
 */
function preferred(a: Candidate, b: Candidate, distance: (c: Candidate) => number): Candidate {
  if (a.meaningful !== b.meaningful) return a.meaningful > b.meaningful ? a : b;
  if (a.blockers !== b.blockers) return a.blockers > b.blockers ? a : b;
  if (a.pairs !== b.pairs) return a.pairs < b.pairs ? a : b;
  return distance(b) < distance(a) ? b : a;
}

/**
 * Difficulty first: the candidate nearest the target, unless other candidates are also within TOLERANCE of it, in
 * which case the preferences decide among those. Never picks off target for structure or looks alone.
 */
export function choose(candidates: readonly Candidate[], target: number): Choice {
  if (!candidates.length) throw new Error('no candidates to choose from');
  const distance = (c: Candidate): number => Math.abs(c.score - target);
  const nearest = candidates.reduce((best, c) => (distance(c) < distance(best) ? c : best));
  const near = candidates.filter((c) => distance(c) <= TOLERANCE);
  const pick = near.length ? near.reduce((best, c) => preferred(best, c, distance)) : nearest;
  return { pick, nearest, onTarget: near.length, preferenceApplied: pick !== nearest };
}

/** below-guard: under the hardest tough + FINALE_OVER_TOUGH; not-above-tough: not even above it; cap-exceeded: over CAP. */
export type FinaleIssue = 'below-guard' | 'not-above-tough' | 'cap-exceeded';

export interface FinaleChoice extends Choice {
  issues: FinaleIssue[];
}

/**
 * The finale guard is a floor, not an aim. Candidates at or above it and at most CAP are chosen from as usual (nearest
 * the aim, preferences within TOLERANCE). With none at or above it, the candidate nearest the aim; with some above it
 * but all over CAP, the lowest of those. Whatever the pick breaks is reported, never shown as met.
 */
export function chooseFinale(candidates: readonly Candidate[], aim: FinaleAim, toughScores: readonly number[]): FinaleChoice {
  const hardest = toughScores.length ? Math.max(...toughScores) : -Infinity;
  const guard = hardest + FINALE_OVER_TOUGH;
  const passing = candidates.filter((c) => c.score >= guard);
  const allowed = passing.filter((c) => c.score <= CAP);
  let choice: Choice;
  if (allowed.length) choice = choose(allowed, aim.target);
  else if (passing.length) {
    const lowest = passing.reduce((best, c) => (c.score < best.score ? c : best));
    choice = { pick: lowest, nearest: lowest, onTarget: 0, preferenceApplied: false };
  } else choice = choose(candidates, aim.target);
  const score = choice.pick.score;
  const issues: FinaleIssue[] = [];
  if (score < guard) issues.push('below-guard');
  if (score <= hardest) issues.push('not-above-tough');
  if (score > CAP) issues.push('cap-exceeded');
  return { ...choice, issues };
}
