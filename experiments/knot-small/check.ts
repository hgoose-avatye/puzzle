/**
 * Reads the small whole-knot experiment levels (levels.ts) and prints, for each: the board as text, the grade
 * (solvable, forced pushes, answers, winning line) and what every possible first push leads to. Run:
 *   npx tsx experiments/knot-small/check.ts [name]
 */
import { bumpResult, gradeKnot, peel, type KnotGrade } from '../../src/core/bump';
import { canExit, headDirection, validateLevel } from '../../src/core/rules';
import type { Level } from '../../src/core/types';
import { stuckAtOnce } from '../../src/generator/knotSearch';
import { LEVELS } from './levels';

const ARROW = { up: '^', down: 'v', left: '<', right: '>' } as const;

export function render(level: Level): string {
  const rows: string[][] = Array.from({ length: level.height }, () => Array.from({ length: level.width }, () => ' .'));
  for (const c of level.obstacles ?? []) rows[c.y][c.x] = ' #';
  for (const p of level.pieces) {
    const d = ARROW[headDirection(p)];
    p.cells.forEach((c, i) => { rows[c.y][c.x] = (i === 0 ? d : '·') + String(p.id); });
  }
  return rows.map((r) => r.join('')).join('\n');
}

/** The line as "exit 3, push 5, exit 1 ..." */
const lineText = (g: KnotGrade): string => (g.line ?? []).map((m) => `${m.kind === 'push' ? 'push' : 'out'} ${m.id}`).join(', ');

export function report(name: string, level: Level): string {
  const errors = validateLevel(level);
  const out: string[] = [`== ${name} (${level.width}x${level.height}, ${level.pieces.length} animals)`, render(level)];
  if (errors.length) { out.push('INVALID: ' + errors.join('; ')); return out.join('\n'); }
  const all = new Set(level.pieces.map((p) => p.id));
  const free = level.pieces.filter((p) => canExit(level, p.id, all)).map((p) => p.id);
  const knot = peel(level, all);
  const t = performance.now();
  const g = gradeKnot(level);
  const ms = Math.round(performance.now() - t);
  out.push(`free at start: [${free.join(',')}]  knot: [${[...knot].join(',')}] (${knot.size}/${level.pieces.length})`);
  out.push(`solvable: ${g.solvable}  forced pushes: ${g.keyMoves}  answers: ${g.answers}  pushes on line: ${g.pushes?.length ?? '-'}  (graded in ${ms}ms, ${g.nodes} nodes)`);
  out.push(`line: ${lineText(g)}`);
  // every first push once the free animals are out
  for (const p of level.pieces) {
    if (!knot.has(p.id)) continue;
    const b = bumpResult(level, p, knot);
    if (!b) { out.push(`  push ${p.id}: cannot move`); continue; }
    const after = peel(b.level, knot);
    const gg = gradeKnot(b.level, knot);
    const state = after.size === 0 ? 'CLEARS' : stuckAtOnce(b.level, after) ? 'stuck at once' : gg.solvable ? 'still solvable' : 'dead (not visible yet)';
    out.push(`  push ${p.id}: moves ${b.moved}${b.stopper !== undefined ? ` to ${b.stopper}` : ''} -> frees [${[...knot].filter((id) => !after.has(id)).join(',')}] -> ${state}`);
  }
  return out.join('\n');
}

if (process.argv[1]?.endsWith('check.ts')) {
  const only = process.argv[2];
  for (const [name, level] of Object.entries(LEVELS)) if (!only || name === only) console.log(report(name, level) + '\n');
}
