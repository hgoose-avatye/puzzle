// node experiments/2-5d-game/turn-shots.mjs  (from the repo root)
// A 3-cell animal through the game's ?demo=turn bends (down -> right, up -> left) with the run frozen and the head stepped
// along the track, as diag/turn3.mjs does, but on the normal game entry and with the art of your choice.
// ID (speciesFor id: 4 snake, 5 caterpillar, 6 dachshund, 7 crocodile; default 6), ART ('candidate' or ''), STEPS
// (comma list of 0.12-cell steps from the start; default '0,10,16,22,28,34'), OUT (default out-turn/). Writes
// OUT/<from>-<to>-NN.png, a 260x260 crop around the animal.
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const ROOT = 'experiments/2-5d-game';
const OUT = process.env.OUT ?? `${ROOT}/out-turn`;
const ID = Number(process.env.ID ?? 6);
const LEN = Number(process.env.LEN ?? 3);
const ART = process.env.ART ?? 'candidate';
const STEPS = (process.env.STEPS ?? '0,10,16,22,28,34').split(',').map(Number);
const PORT = Number(process.env.PORT ?? 5436);
mkdirSync(OUT, { recursive: true });
const server = await createServer({ configFile: `${ROOT}/vite.config.ts`, server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.evaluateOnNewDocument(() => localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic', 'arrow', 'obstacle', 'crate', 'long', 'hearts', 'key', 'sleep', 'bomb'])));
for (const [from, to] of [['down', 'right'], ['up', 'left']]) {
  await page.goto(`http://localhost:${PORT}/?demo=turn&from=${from}&to=${to}&len=${LEN}&id=${ID}${ART ? `&art=${ART}` : ''}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__cards, { timeout: 20000 });
  await sleep(1000);
  const start = await page.evaluate((id) => window.__game.views().get(id).headStart, ID);
  const pt = await page.evaluate((id) => window.__game.screenOf(id), ID);
  const crop = { x: Math.max(0, Math.min(390 - 260, (pt?.x ?? 195) - 130)), y: Math.max(0, Math.min(844 - 260, (pt?.y ?? 420) - 150)), width: 260, height: 260 };
  await page.evaluate((id) => { window.__game.tap(id); window.__runSpeed = 0; }, ID);
  await sleep(250);
  for (const k of STEPS) {
    const s = start + k * 0.12;
    await page.evaluate((id, s) => { window.__game.traffic.get(id).s = s; window.__game.views().get(id).setRun(s, false); }, ID, s);
    await sleep(160);
    await page.screenshot({ path: `${OUT}/${from}-${to}-${String(k).padStart(2, '0')}.png`, clip: crop });
  }
}
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
await server.close();
