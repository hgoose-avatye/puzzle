import { describe, expect, it } from 'vitest';
import { BLOCKED_REPEAT_MS, TapInput } from './input';

describe('TapInput: one press per finger (rules R5)', () => {
  it('a second finger does not cancel the first finger', () => {
    const input = new TapInput();
    input.down(1, 10);
    input.down(2, 20);
    expect(input.up(1, 10).tap).toBe(10);
    expect(input.up(2, 20).tap).toBe(20);
  });

  it('a press becomes at most one tap', () => {
    const input = new TapInput();
    input.down(1, 10);
    expect(input.up(1, 10)).toEqual({ released: 10, tap: 10 });
    expect(input.up(1, 10)).toEqual({ released: null, tap: null });
  });

  it('lifting over another animal, or off every animal, taps nothing', () => {
    const input = new TapInput();
    input.down(1, 10);
    expect(input.up(1, 20)).toEqual({ released: 10, tap: null });
    input.down(1, 10);
    expect(input.up(1, null)).toEqual({ released: 10, tap: null });
  });

  it('a press that started on empty ground taps nothing', () => {
    const input = new TapInput();
    expect(input.down(1, null)).toBe(false);
    expect(input.up(1, 10).tap).toBeNull();
  });

  it('cancel drops the press and reports the animal whose path should hide', () => {
    const input = new TapInput();
    input.down(1, 10);
    expect(input.cancel(1)).toBe(10);
    expect(input.up(1, 10).tap).toBeNull();
  });

  it('an animal stays pressed until its last finger lets go', () => {
    const input = new TapInput();
    input.down(1, 10);
    input.down(2, 10);
    input.cancel(1);
    expect(input.isPressed(10)).toBe(true);
    input.up(2, null);
    expect(input.isPressed(10)).toBe(false);
  });

  it('clear forgets every press', () => {
    const input = new TapInput();
    input.down(1, 10);
    input.clear();
    expect(input.up(1, 10).tap).toBeNull();
    expect(input.isPressed(10)).toBe(false);
  });
});

describe('TapInput: blocked repeat guard (rules R1)', () => {
  it('a repeat on the same blocked animal while it shakes is the same tap', () => {
    const input = new TapInput();
    input.noteBlocked(10, 1000);
    expect(input.isBlockedRepeat(10, 1000 + BLOCKED_REPEAT_MS - 1)).toBe(true);
    expect(input.isBlockedRepeat(10, 1000 + BLOCKED_REPEAT_MS)).toBe(false);
  });

  it('only the animal that was blocked is guarded', () => {
    const input = new TapInput();
    input.noteBlocked(10, 1000);
    expect(input.isBlockedRepeat(20, 1001)).toBe(false);
  });

  it('the guard matches the 0.4 s shake of a blocked animal', () => {
    expect(BLOCKED_REPEAT_MS).toBe(400);
  });

  it('clear drops the guard (retry starts fresh)', () => {
    const input = new TapInput();
    input.noteBlocked(10, 1000);
    input.clear();
    expect(input.isBlockedRepeat(10, 1001)).toBe(false);
  });
});
