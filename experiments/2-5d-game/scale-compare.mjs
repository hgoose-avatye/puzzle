// node experiments/2-5d-game/scale-compare.mjs  (from the repo root)
// Card size candidates in the real game: levels 3 / 30 / 90 in 2.5D at each ?cardScale,
// 390x844 and 360x640; touch check per scale (every free sprite animal tapped at its screen point must leave);
// species still missing 2.5D art. Writes experiments/2-5d-game/out-scale/ only.
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const ROOT = 'experiments/2-5d-game';
const OUT = `${ROOT}/out-scale`;
const SCALES = [1.0, 1.2, 1.4];
mkdirSync(OUT, { recursive: true });
const server = await createServer({ configFile: `${ROOT}/vite.config.ts`, server: { port: 5421, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];

async function open(level, mode, w, h) {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errs.push(`L${level}/${mode}: ${e}`));
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic', 'arrow', 'obstacle', 'crate', 'long', 'hearts', 'key', 'sleep', 'bomb'])); } catch { /* ignore */ } });
  const q = `cardScale=${mode}`;
  await p.goto(`http://localhost:5421/?level=${level}&${q}`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  return p;
}

for (const [w, h] of [[390, 844], [360, 640]]) {
  for (const level of [3, 30, 90]) {
    for (const mode of SCALES) {
      const p = await open(level, mode, w, h);
      await p.screenshot({ path: `${OUT}/${w}x${h}-L${level}-x${mode.toFixed(1)}.png` });
      await p.close();
    }
  }
}

// touch: at each scale, keep tapping free animals at their screen point; record what happened to the sprite ones
const touch = [];
let missing = [];
for (const scale of SCALES) {
  for (const level of [3, 30]) {
    const p = await open(level, scale, 390, 844);
    // pieces are built in level order, so __cards.built[i] is the i-th view
    const kinds = await p.evaluate(() => { const ids = [...window.__game.views().keys()]; return ids.map((id, i) => ({ id, as: window.__cards.built[i]?.as })); });
    missing = await p.evaluate(() => window.__cards.missingSpecies());
    let spriteTaps = 0, spriteOut = 0, misses = 0;
    for (let k = 0; k < 60; k++) {
      const st = await p.evaluate(() => window.__game.state());
      if (!st || st.cleared) break;
      const id = await p.evaluate(() => window.__game.free()[0]);
      if (id === undefined) { await sleep(150); continue; }
      const pt = await p.evaluate((i) => window.__game.screenOf(i), id);
      if (!pt) { misses++; break; }
      await p.touchscreen.tap(pt.x, pt.y);
      await sleep(120);
      const after = await p.evaluate(() => window.__game.state());
      if (kinds.find((x) => x.id === id)?.as === 'cards') { spriteTaps++; if (!after.alive.includes(id)) spriteOut++; }
    }
    const st = await p.evaluate(() => window.__game.state());
    touch.push({ scale, level, cleared: st.cleared, blocked: st.blocked, spriteTaps, spriteOut, unreachable: misses });
    await p.close();
  }
}
console.log('TOUCH', JSON.stringify(touch));
console.log('MISSING 2.5D', JSON.stringify(missing));
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
await server.close();
