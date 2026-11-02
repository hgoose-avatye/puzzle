// node experiments/2-5d-game/diag/turn3.mjs — DIAGNOSIS ONLY: 3-cell animals through a bend, per joining-offset scale.
// The game's own ?demo=turn scene (9x9, one animal, an arrow tile that turns it) with ?id choosing the species
// (speciesFor: long pool snake, caterpillar, dachshund, crocodile = id 4, 5, 6, 7). Card mode C, offsets scaled by
// ?offsetscale (1 = manifest, 0.5, 0). The run is frozen and the head stepped from its start through the turn with a
// fixed crop: down then right (0° -> 90°) and up then left (180° -> 270°). Writes out-diag-turn3/<sp>-<turn>-s<scale>-NN.png.
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const OUT = 'experiments/2-5d-game/out-diag-turn3';
mkdirSync(OUT, { recursive: true });
const SPECIES = { snake: 4, caterpillar: 5, dachshund: 6, crocodile: 7 };
const TURNS = [['down', 'right'], ['up', 'left']];
const SCALES = (process.env.SCALES ?? '1,0.5,0').split(',');
const STEPS = 34;
const server = await createServer({ configFile: 'experiments/2-5d-game/diag/vite.diag.config.ts', logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 180000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
page.on('pageerror', (e) => errs.push(String(e)));
await page.evaluateOnNewDocument(() => localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic','arrow','obstacle','crate','long','hearts','key','sleep','bomb'])));
for (const [sp, id] of Object.entries(SPECIES)) {
  for (const [from, to] of TURNS) {
    let crop = null;
    for (const scale of SCALES) {
      await page.goto(`http://localhost:5431/?demo=turn&from=${from}&to=${to}&len=3&id=${id}&cardmode=C&offsetscale=${scale}`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => window.__game && window.__diagCamera, { timeout: 20000 });
      await sleep(1000);
      const start = await page.evaluate((id) => window.__game.views().get(id).headStart, id);
      const species = await page.evaluate(() => window.__cards.built[0]?.species);
      if (species !== sp) errs.push(`${sp}: scene built ${species}`);
      if (!crop) {
        // the turn tile is two cells ahead of the head: centre the crop between the start and the turn
        const pt = await page.evaluate((id) => window.__game.screenOf(id), id);
        crop = { x: Math.max(0, Math.min(390 - 260, (pt?.x ?? 195) - 130)), y: Math.max(0, Math.min(844 - 260, (pt?.y ?? 420) - 150)), width: 260, height: 260 };
      }
      await page.evaluate((id) => { window.__game.tap(id); window.__runSpeed = 0; }, id);
      await sleep(250);
      for (let k = 0; k < STEPS; k++) {
        const s = start + k * 0.12;
        await page.evaluate((id, s) => { window.__game.traffic.get(id).s = s; window.__game.views().get(id).setRun(s, false); }, id, s);
        await sleep(160);
        await page.screenshot({ path: `${OUT}/${sp}-${from}-${to}-s${scale}-${String(k).padStart(2, '0')}.png`, clip: crop });
      }
    }
    console.log(sp, from, to, 'done');
  }
}
console.log('page errors:', errs.length ? errs : 'none');
await browser.close(); await server.close();
