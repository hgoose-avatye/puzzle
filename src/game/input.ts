/** How long a blocked animal shakes (PieceView.bump). Another tap on it in that time is the same tap (docs/rules.md R1). */
export const BLOCKED_REPEAT_MS = 400;

/**
 * Touch input rules that do not need the screen: each finger keeps its own press (rules R5), a press becomes at most
 * one tap, and a blocked animal ignores repeat taps while it shakes (rules R1).
 */
export class TapInput {
  /** pointer id -> animal it went down on */
  private readonly presses = new Map<number, number>();
  /** animal id -> time of its last counted blocked tap */
  private readonly blockedAt = new Map<number, number>();

  /** A finger went down on `animal` (null: on nothing). True when it pressed an animal. */
  down(pointer: number, animal: number | null): boolean {
    if (animal === null) return false;
    this.presses.set(pointer, animal);
    return true;
  }

  /**
   * A finger lifted over `animal`. `released` is the animal it went down on (its path may hide now); `tap` is that
   * animal again if the finger is still over it, else null.
   */
  up(pointer: number, animal: number | null): { released: number | null; tap: number | null } {
    const released = this.cancel(pointer);
    return { released, tap: released !== null && released === animal ? released : null };
  }

  /** The finger's press is dropped without a tap. Returns the animal it was on, if any. */
  cancel(pointer: number): number | null {
    const pressed = this.presses.get(pointer);
    this.presses.delete(pointer);
    return pressed ?? null;
  }

  /** Is any finger still down on this animal? */
  isPressed(animal: number): boolean {
    for (const a of this.presses.values()) if (a === animal) return true;
    return false;
  }

  noteBlocked(animal: number, now: number): void {
    this.blockedAt.set(animal, now);
  }

  isBlockedRepeat(animal: number, now: number): boolean {
    const at = this.blockedAt.get(animal);
    return at !== undefined && now - at < BLOCKED_REPEAT_MS;
  }

  clear(): void {
    this.presses.clear();
    this.blockedAt.clear();
  }
}
