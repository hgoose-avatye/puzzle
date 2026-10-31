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
