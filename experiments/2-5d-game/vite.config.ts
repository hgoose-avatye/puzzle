import { defineConfig, type Plugin } from 'vite';
import { buildDefine } from '../../tools/build-info';

/**
 * The real game (game/ unchanged) with 2.5D animals: game/animals.ts imports `./blocks` for buildAnimal; this entry
 * points that one import at spriteCards.ts, which draws species that have a sprite manifest as 2D image cards in the
 * same Three.js scene and hands every other species to the original 3D buildAnimal. `?render=3d` turns the cards off.
 * The original game still runs as before with `npm run dev:game` (vite.game.config.ts).
 */
const here = new URL('.', import.meta.url).pathname;
const game = new URL('../../game/', import.meta.url).pathname;

const swapBlocks: Plugin = {
  name: 'two-five-d-animals',
  enforce: 'pre',
  async resolveId(source, importer) {
    if (source === './blocks' && importer?.endsWith('/game/animals.ts')) return `${here}spriteCards.ts`;
    return null;
  },
};

const repo = new URL('../../', import.meta.url).pathname;

export default defineConfig({ root: game, publicDir: `${game}public`, plugins: [swapBlocks], server: { port: 5420, strictPort: true }, define: buildDefine(repo) });
