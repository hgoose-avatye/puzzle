import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { buildDefine } from '../../tools/build-info';
import { SDK, SDK_SHA } from '../../tools/gf-sdk';
import type { SpeciesSprites } from '../2-5d-crocodile/src/sprites';
import { SPECIES } from '../../game/species';
import { spriteProblems } from './spriteCheck';

/**
 * The game entry: `npm run dev:game` / `build:game` / `test:e2e` use it. game/animals.ts imports `./cards` for
 * buildAnimal (typed by game/cards.d.ts); this entry resolves it to spriteCards.ts, which draws every animal as 2.5D
 * image cards in the game's Three.js scene. There is no other renderer.
 */
const here = new URL('.', import.meta.url).pathname;
const game = new URL('../../game/', import.meta.url).pathname;

const swapCards: Plugin = {
  name: 'two-five-d-animals',
  enforce: 'pre',
  async resolveId(source, importer) {
    if (source === './cards' && importer?.endsWith('/game/animals.ts')) return `${here}spriteCards.ts`;
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

/**
 * Every species the game draws (game/species.ts, at its size class; the levels, the title and the dirs / quiz / sheet
 * demos only use these) must have a manifest whose parts have a picture on disk for all four board headings. Checked
 * when the dev server or a build starts: a missing picture fails here, never as a blank or stand-in animal in the game.
 */
const checkSprites: Plugin = {
  name: 'two-five-d-sprite-check',
  buildStart() {
    const found = new Map<string, { sprites: SpeciesSprites; dir: string }>();
    for (const root of ['assets', 'public']) {
      for (const rel of readdirSync(`${sprites}${root}`, { recursive: true }) as string[]) {
        if (!rel.endsWith('.sprites.json') || rel.split('/').includes('candidate')) continue;
        const file = `${sprites}${root}/${rel}`;
        const manifest = JSON.parse(readFileSync(file, 'utf8')) as SpeciesSprites;
        found.set(manifest.species, { sprites: manifest, dir: dirname(file) });
      }
    }
    const pools: Array<[string[], number]> = [[SPECIES.one, 1], [SPECIES.two, 2], [SPECIES.long, 3]];
    const problems = pools.flatMap(([names, cells]) => names.flatMap((species) => {
      const entry = found.get(species);
      return spriteProblems(entry?.sprites, species, cells, (pic) => existsSync(resolve(entry!.dir, pic)));
    }));
    if (problems.length) this.error(`2.5D sprites incomplete:\n  ${problems.join('\n  ')}`);
  },
};

const repo = new URL('../../', import.meta.url).pathname;

/**
 * `vite build --mode toss` (npm run build:toss): the Apps in Toss web bundle in dist/toss/web (apps-in-toss.config.ts
 * webBundleDir), as 사천팝 scripts/build.mjs toss. The page loads the hash-locked GFactory SDK (vendor/, tools/gf-sdk.ts)
 * as a classic script before the game; game/platform picks the Toss platform from the mode. Other modes have no SDK.
 */
const tossBundle: Plugin = {
  name: 'apps-in-toss-bundle',
  apply: (_config, env) => env.mode === 'toss',
  buildStart() {
    const sdk = readFileSync(`${repo}vendor/${SDK}`);
    if (createHash('sha256').update(sdk).digest('hex') !== SDK_SHA) this.error(`SDK hash mismatch — vendor/${SDK}`);
    this.emitFile({ type: 'asset', fileName: SDK, source: sdk });
  },
  transformIndexHtml: (html) => html.replace('<script type="module"', `<script src="./${SDK}"></script>\n    <script type="module"`),
};

export default defineConfig(({ mode }) => ({
  root: game, publicDir: `${game}public`, plugins: [swapCards, spritePictures, checkSprites, tossBundle], server: { port: 5420, strictPort: true }, define: buildDefine(repo),
  ...(mode === 'toss' ? { base: './', build: { outDir: `${repo}dist/toss/web`, emptyOutDir: true } } : {}),
}));
