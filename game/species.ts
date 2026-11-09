/** Species per size class, following docs/art-reference/09-size-classes-1-2-3cell.png. */
export const SPECIES: Record<'one' | 'two' | 'long', string[]> = {
  one: ['penguin', 'chick', 'parrot'],
  two: ['cow', 'pig', 'fox', 'tiger', 'husky'],
  long: ['snake', 'caterpillar', 'dachshund', 'crocodile'],
};

/** The cells a species is drawn with (its size class), undefined for a name outside the pools. */
export function cellsOf(species: string): 1 | 2 | 3 | undefined {
  if (SPECIES.one.includes(species)) return 1;
  if (SPECIES.two.includes(species)) return 2;
  if (SPECIES.long.includes(species)) return 3;
  return undefined;
}
