import { describe, expect, it } from 'vitest';
import { hasSavedProgress, parseProgress, parseSeen, progressAfterClear } from './progress';

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

describe('saved values read back from storage', () => {
  it('a whole level number from 1 to the last level is kept', () => {
    expect(parseProgress('1', LAST)).toBe(1);
    expect(parseProgress('44', LAST)).toBe(44);
    expect(parseProgress('180', LAST)).toBe(180);
  });

  it('no save, or a damaged one, starts at level 1', () => {
    for (const raw of [null, '', 'abc', 'NaN', '2.5', '0', '-3', '181', '999', 'Infinity', '{}']) expect(parseProgress(raw, LAST)).toBe(1);
  });

  it('the learnt tutorials keep only names from a JSON list', () => {
    expect(parseSeen('["basic","blocked"]')).toEqual(['basic', 'blocked']);
    expect(parseSeen('["basic",5,null]')).toEqual(['basic']);
    for (const raw of [null, 'null', '5', '{}', '"basic"', 'not json']) expect(parseSeen(raw)).toEqual([]);
  });
});
