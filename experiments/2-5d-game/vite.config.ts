import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { buildDefine } from '../../tools/build-info';
import type { SpeciesSprites } from '../2-5d-crocodile/src/sprites';

/**
 * The real game (game/ unchanged) with 2.5D animals: game/animals.ts imports `./blocks` for buildAnimal; this entry
 * points that one import at spriteCards.ts, which draws species that have a sprite manifest as 2D image cards in the
 * same Three.js scene and hands every other species to the original 3D buildAnimal. `?render=3d` turns the cards off.
 * This is the game: `npm run dev:game` / `build:game` / `test:e2e` use it. Classic 3D (vite.game.config.ts) only runs with `npm run dev:game3d`.
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

/**
 * `virtual:sprite-pictures`: the picture URLs spriteCards.ts looks up (key: manifest folder + picture path, relative to
 * this folder). Only pictures a manifest names (drawn parts, joint corners) and candidate/ cut-outs (?art=candidate)
 * are bundled; the received, delivered and reference art beside them stays in the repo but out of the build. A picture
 * a manifest names that is not on disk is left out, so the card counts it missing as before.
 */
const sprites = `${here}../2-5d-crocodile/`;
const PICTURES_ID = 'virtual:sprite-pictures';
const spritePictures: Plugin = {
  name: 'two-five-d-sprite-pictures',
  resolveId: (source) => (source === PICTURES_ID ? `\0${PICTURES_ID}` : null),
  load(id) {
    if (id !== `\0${PICTURES_ID}`) return null;
    const files = new Map<string, string>();
    const add = (key: string, file: string) => { if (existsSync(file)) files.set(key, file); };
    for (const root of ['assets', 'public']) {
      for (const rel of readdirSync(`${sprites}${root}`, { recursive: true }) as string[]) {
        const file = `${sprites}${root}/${rel}`;
        if (rel.endsWith('.png') && rel.split('/').includes('candidate')) add(relative(here, file), file);
        if (!rel.endsWith('.sprites.json')) continue;
        this.addWatchFile(file);
        const manifest = JSON.parse(readFileSync(file, 'utf8')) as SpeciesSprites;
        const dir = dirname(file);
        const named = [
          ...Object.values(manifest.parts).flatMap((part) => Object.values(part?.drawn ?? {}).map((pic) => (typeof pic === 'string' ? pic : pic.file))),
          ...Object.values(manifest.joints ?? {}),
        ];
        for (const pic of named) add(`${relative(here, dir)}/${pic}`, resolve(dir, pic));
      }
    }
    const keys = [...files.keys()].sort();
    return `${keys.map((key, i) => `import p${i} from ${JSON.stringify(`${files.get(key)}?url`)};`).join('\n')}
export default { ${keys.map((key, i) => `${JSON.stringify(key)}: p${i}`).join(', ')} };`;
  },
};

const repo = new URL('../../', import.meta.url).pathname;

export default defineConfig({ root: game, publicDir: `${game}public`, plugins: [swapBlocks, spritePictures], server: { port: 5420, strictPort: true }, define: buildDefine(repo) });
