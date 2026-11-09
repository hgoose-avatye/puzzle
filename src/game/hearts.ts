/**
 * HUD slots (0 = leftmost) of the hearts lost when the count drops from `before` to `after`; each one plays the heart
 * break. Several at once when blocked taps come faster than the HUD redraws; none when the count stays or refills.
 */
export function lostHeartSlots(before: number, after: number): number[] {
  const slots: number[] = [];
  for (let i = Math.max(0, after); i < before; i++) slots.push(i);
  return slots;
}
