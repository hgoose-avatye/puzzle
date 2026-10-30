import { describe, expect, it } from 'vitest';
import { hasSavedProgress, progressAfterClear } from './progress';

const LAST = 180;

describe('saved progress: the furthest level reached', () => {
  it('clearing the level at the frontier moves the save on', () => {
    expect(progressAfterClear(7, 7, LAST)).toBe(8);
  });

  it('replaying earlier levels ("from the start") never pulls the save back', () => {
    expect(progressAfterClear(7, 1, LAST)).toBe(7);
    expect(progressAfterClear(7, 6, LAST)).toBe(7);
  });

  it('a replay that overtakes the save moves it on', () => {
    expect(progressAfterClear(3, 5, LAST)).toBe(6);
  });

  it('clearing the last level starts the journey over, as before', () => {
    expect(progressAfterClear(LAST, LAST, LAST)).toBe(1);
  });

  it('a save beyond level 1 counts as progress to continue', () => {
    expect(hasSavedProgress(1)).toBe(false);
    expect(hasSavedProgress(2)).toBe(true);
  });
});
