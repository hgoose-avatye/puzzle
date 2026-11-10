/**
 * When a blocked tap says why (2026-11-10). A rule's words are for the player who has not learnt it yet; after that they
 * would repeat on every tap, so they come back only while the player keeps tapping the same stuck animal.
 *
 * - Locked / asleep / crate: before its tutorial is learnt, every tap says it. After, the first HINT_LIMIT times
 *   (counted only when the words were shown), then only on the second tap in a row on the same animal.
 * - Plain "blocked": only on the second tap in a row on the same animal.
 * - One line per streak: the same animal on the same board says it once. Any tap on another animal, an exit, a push,
 *   an undo or a new level ends the streak.
 */
export type BlockCause = 'plain' | 'key' | 'sleep' | 'crate';
export const HINT_LIMIT = 3;

/** Taps in a row on one animal that moved nothing, and whether its line was already shown. */
export interface Streak { id: number; n: number; said: boolean }

/** The streak after a tap on `id` that moved nothing; a different animal starts a new one. */
export const extendStreak = (prev: Streak | null, id: number): Streak =>
  prev && prev.id === id ? { ...prev, n: prev.n + 1 } : { id, n: 1, said: false };

export function decideHint(cause: BlockCause, streak: Streak, learnt: boolean, used: number): { say: boolean; count: boolean } {
  const repeat = streak.n >= 2 && !streak.said;
  if (cause === 'plain') return { say: repeat, count: false };
  if (!learnt) return { say: true, count: false };
  if (used < HINT_LIMIT && !streak.said) return { say: true, count: true };
  return { say: repeat, count: false };
}
