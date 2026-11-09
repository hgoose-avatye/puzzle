import { CHAPTER_LENGTH, STAGE_LENGTH, stageFor, type StageInfo } from '../curve/curve';

/** Screens shown between levels: after the last level of a stage, of a chapter, and of the whole journey. */
export type Interlude =
  | { kind: 'stage-done'; done: StageInfo; next: StageInfo }
  | { kind: 'chapter-done'; done: StageInfo }
  | { kind: 'chapter-intro'; next: StageInfo }
  | { kind: 'journey-done' };

export const LAST_LEVEL = 6 * CHAPTER_LENGTH;

/** What to show, in order, between clearing level `n` and playing `n + 1`. Nothing for an ordinary level. */
export function interludesAfter(n: number): Interlude[] {
  if (n >= LAST_LEVEL) return [{ kind: 'chapter-done', done: stageFor(n) }, { kind: 'journey-done' }];
  if (n % CHAPTER_LENGTH === 0) return [{ kind: 'chapter-done', done: stageFor(n) }, { kind: 'chapter-intro', next: stageFor(n + 1) }];
  if (n % STAGE_LENGTH === 0) return [{ kind: 'stage-done', done: stageFor(n), next: stageFor(n + 1) }];
  return [];
}

/** Position of level `n` inside its stage, 1-based. */
export function stageStep(n: number): { step: number; of: number } {
  return { step: ((n - 1) % STAGE_LENGTH) + 1, of: STAGE_LENGTH };
}

/** A new stage starts here (its name card is shown). */
export const startsStage = (n: number): boolean => (n - 1) % STAGE_LENGTH === 0;

/** A picture word for each stage, for the name cards and interlude screens. */
const STAGE_ICONS: Record<string, string> = {
  '동물 마을 · 꽃밭': '🌼', '동물 마을 · 농장': '🐄', '동물 마을 · 마을 광장': '⛲',
  '숲속 · 캠핑장': '⛺', '숲속 · 강가': '🌊', '숲속 · 깊은 숲': '🌲',
  '해적섬 · 해변': '🏖️', '해적섬 · 항구': '⚓', '해적섬 · 보물 동굴': '💎',
  '정글 · 밀림 입구': '🌿', '정글 · 폭포': '💧', '정글 · 고대 유적': '🗿',
  '유령 성 · 호박밭': '🎃', '유령 성 · 묘지': '👻', '유령 성 · 성 마당': '🏰',
  '겨울 마을 · 눈 마을': '🏡', '겨울 마을 · 얼음 호수': '⛸️', '겨울 마을 · 크리스마스 광장': '🎄',
};
export const stageIcon = (s: StageInfo): string => STAGE_ICONS[s.name] ?? '🐾';
/** "숲속 · 캠핑장" -> region "숲속", place "캠핑장" */
export const splitName = (s: StageInfo): { region: string; place: string } => {
  const [region, place] = s.name.split(' · ');
  return { region, place: place ?? region };
};
