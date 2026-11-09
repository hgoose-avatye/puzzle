// node experiments/2-5d-game/overlap-ab.mjs — crocodile joints in the real game: tuck 0.10 (A) / 0 (B) / 0.05 (C), scale 1.2,
// same levels and frames: idle, and 3 / 6 / 9 frames (paused game clock is not available, so taps happen on a fixed schedule).
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
const OUT = 'experiments/2-5d-game/out-overlap';
const server = await createServer({ configFile: 'experiments/2-5d-game/vite.config.ts', server: { port: 5425, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
for (const lv of [30, 90]) for (const tuck of ['0.1', '0', '0.05']) {
  const p = await browser.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.evaluateOnNewDocument(() => localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic','arrow','obstacle','crate','long','hearts','key','sleep','bomb'])));
  await p.goto(`http://localhost:5425/?level=${lv}&render=25d&tuck=${tuck}`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  await p.evaluate(() => { window.__runSpeed = 1.5; }); // slow runs so the same moments are caught in every setting
  await p.screenshot({ path: `${OUT}/L${lv}-t${tuck}-idle.png` });
  // send out animals in the game's own order until a crocodile runs, then grab it mid-run
  const crocs = await p.evaluate(() => [...window.__game.views().keys()].filter((id, i) => window.__cards.built[i].species === 'crocodile'));
  for (let k = 0; k < 40; k++) {
    const free = await p.evaluate(() => window.__game.free());
    const c = free.find((id) => crocs.includes(id));
    if (c !== undefined) { await p.evaluate((i) => window.__game.tap(i), c); break; }
    if (!free.length) break;
    await p.evaluate((i) => window.__game.tap(i), free[0]); await sleep(150);
  }
  for (const t of [400, 800, 1200]) { await sleep(400); await p.screenshot({ path: `${OUT}/L${lv}-t${tuck}-run${t}.png` }); }
  await p.close();
}
console.log('page errors:', errs.length ? errs : 'none');
await browser.close(); await server.close();
