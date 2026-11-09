import { describe, expect, it } from 'vitest';
import { lostHeartSlots } from './hearts';

describe('hearts that break on the HUD', () => {
  it('lists the slot of each heart just lost, two quick blocked taps included, and never goes below zero', () => {
    expect(lostHeartSlots(3, 2)).toEqual([2]);
    expect(lostHeartSlots(3, 1)).toEqual([1, 2]);
    expect(lostHeartSlots(1, -1)).toEqual([0]);
    expect(lostHeartSlots(2, 2)).toEqual([]);
    expect(lostHeartSlots(1, 3)).toEqual([]);
  });
});
