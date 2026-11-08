/**
 * The saved level is the furthest level reached (the next one to play there). "Continue" goes back to it; "from the
 * start" only plays level 1 and keeps the save, which moves only when a cleared level is beyond it.
 */
export function progressAfterClear(saved: number, cleared: number, last: number): number {
  // the whole journey is done: start over, as the game always did
  if (cleared >= last) return 1;
  return Math.max(saved, cleared + 1);
}

/** Level 1 is where everyone starts, so only a save past it is something to continue. */
export const hasSavedProgress = (saved: number): boolean => saved > 1;

/**
 * The saved level as read back from storage: a whole level number from 1 to the last level. Anything else (no save, a
 * damaged value such as "abc" or "2.5", a level that does not exist) starts at level 1 instead of breaking the game.
 */
export function parseProgress(raw: string | null, last: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= last ? n : 1;
}

/** The learnt tutorials as read back from storage: the names in a JSON list; anything else is an empty list. */
export function parseSeen(raw: string | null): string[] {
  try {
    const list: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
