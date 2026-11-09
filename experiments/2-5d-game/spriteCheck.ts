import { type Heading, partsFor, type SpeciesSprites, spriteFor } from '../2-5d-crocodile/src/sprites';

/** the four ways an animal heads on the board; turns in between pick the nearest of these (or a drawn diagonal) */
const BOARD_HEADINGS: Heading[] = [0, 90, 180, 270];

/**
 * What keeps `species` at `cells` cells from being drawn as cards: no manifest, a part without a picture for one of
 * the four board headings (drawn, mirrored or turned round), or, with `exists`, a named picture missing on disk.
 * Empty when the animal is complete. Used by the build check (vite.config.ts) and by buildAnimal (spriteCards.ts).
 */
export function spriteProblems(sprites: SpeciesSprites | undefined, species: string, cells: number, exists?: (file: string) => boolean): string[] {
  if (!sprites) return [`${species}: no *.sprites.json manifest`];
  const out: string[] = [];
  for (const part of partsFor(cells)) {
    for (const heading of BOARD_HEADINGS) {
      const pic = spriteFor(sprites, part, heading);
      if (!pic) out.push(`${species} ${cells}-cell ${part}: no picture for ${heading}°`);
      else if (exists && !exists(pic.file)) out.push(`${species} ${cells}-cell ${part} ${heading}°: ${pic.file} not on disk`);
    }
  }
  if (exists && cells > 1 && sprites.joints) {
    for (const file of Object.values(sprites.joints)) if (!exists(file)) out.push(`${species} joint: ${file} not on disk`);
  }
  return out;
}
