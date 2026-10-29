import { describe, expect, it } from 'vitest';
import { interludesAfter, splitName, stageIcon, stageStep, startsStage } from './journey';
import { stageFor } from '../curve/curve';

describe('journey between levels', () => {
  it('ordinary levels go straight on', () => {
    for (const n of [1, 5, 9, 11, 29, 31, 179]) expect(interludesAfter(n), `level ${n}`).toEqual([]);
  });
  it('the last level of a stage shows the stage done, with the next stage', () => {
    const [s] = interludesAfter(10);
    expect(s).toMatchObject({ kind: 'stage-done', done: { stage: 1, chapter: 1 }, next: { stage: 2, chapter: 1 } });
    expect(interludesAfter(20)[0]).toMatchObject({ kind: 'stage-done', next: { stage: 3 } });
  });
  it('the last level of a chapter shows the chapter done, then the next region', () => {
    expect(interludesAfter(30).map((i) => i.kind)).toEqual(['chapter-done', 'chapter-intro']);
    expect(interludesAfter(30)[1]).toMatchObject({ next: { chapter: 2, stage: 1, theme: 'forest' } });
    expect(interludesAfter(150)[1]).toMatchObject({ next: { theme: 'winter' } });
  });
  it('the very last level ends the journey', () => {
    expect(interludesAfter(180).map((i) => i.kind)).toEqual(['chapter-done', 'journey-done']);
  });
  it('knows where a level sits in its stage and where stages start', () => {
    expect(stageStep(1)).toEqual({ step: 1, of: 10 });
    expect(stageStep(10)).toEqual({ step: 10, of: 10 });
    expect(stageStep(57)).toEqual({ step: 7, of: 10 });
    expect([1, 11, 21, 31, 171].every(startsStage)).toBe(true);
    expect([2, 10, 30].some(startsStage)).toBe(false);
  });
  it('every stage has its own icon and splits into region and place', () => {
    const icons = new Set(Array.from({ length: 18 }, (_, i) => stageIcon(stageFor(i * 10 + 1))));
    expect(icons.size).toBe(18);
    expect(splitName(stageFor(36))).toEqual({ region: '숲속', place: '캠핑장' });
  });
});
