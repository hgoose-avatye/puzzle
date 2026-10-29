import { canExit } from '../core/rules';
import type { Level } from '../core/types';
import { nextTapToward } from '../solver/plan';

/**
 * Which animal to point at when the player asks for a hint. A bomb still on the board comes first: the tap that gets
 * the bomb closest to going off out of the way. Otherwise the free animal whose leaving frees the most others (the
 * most helpful move), lowest id on ties so the answer is stable. Null when nothing can move.
 */
export function pickHint(level: Level, alive: ReadonlySet<number>, fuses: Readonly<Record<number, number>> = {}): number | null {
  const bombs = [...alive].filter((id) => fuses[id] !== undefined).sort((a, b) => fuses[a] - fuses[b] || a - b);
  for (const b of bombs) {
    const t = nextTapToward(level, alive, b);
    if (t !== null) return t;
  }
  const free = [...alive].filter((id) => canExit(level, id, alive)).sort((a, b) => a - b);
  let best: number | null = null;
  let bestGain = -1;
  for (const id of free) {
    const rest = new Set(alive);
    rest.delete(id);
    const gain = [...rest].filter((o) => !free.includes(o) && canExit(level, o, rest)).length;
    if (gain > bestGain) { best = id; bestGain = gain; }
  }
  return best;
}
