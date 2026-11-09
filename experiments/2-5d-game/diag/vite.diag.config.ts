import { defineConfig, type Plugin } from 'vite';

/**
 * DIAGNOSIS ONLY: the real game (game/ unchanged) with game/animals.ts's `./cards` pointed at diag/cardModes.ts, which
 * draws the 2.5D cards with the current renderer (?cardmode=A, spriteCards.ts) or one of the compared placements (B, C).
 * Used by diag/measure.mjs on port 5431.
 */
const here = new URL('.', import.meta.url).pathname;
const game = new URL('../../../game/', import.meta.url).pathname;

const swapBlocks: Plugin = {
  name: 'two-five-d-diag-cards',
  enforce: 'pre',
  async resolveId(source, importer) {
    if (source === './cards' && importer?.endsWith('/game/animals.ts')) return `${here}cardModes.ts`;
    return null;
  },
};

export default defineConfig({ root: game, publicDir: `${game}public`, plugins: [swapBlocks], server: { port: 5431, strictPort: true } });
