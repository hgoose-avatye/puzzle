// node experiments/2-5d-game/shots.mjs  (from the repo root)
// The real game through the 2.5D entry (vite.config.ts): the same levels with ?render=3d (original look) and with
// sprite cards, at 390x844 and 360x640; which species the game chose and how each was drawn; a level cleared with
// real touch taps (window.__game.screenOf), frames for GIFs; frame time in both modes. Writes experiments/2-5d-game/out/.
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const ROOT = 'experiments/2-5d-game';
const OUT = process.env.SHOTS_OUT ?? `${ROOT}/out`;
mkdirSync(`${OUT}/frames`, { recursive: true });
const server = await createServer({ configFile: `${ROOT}/vite.config.ts`, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];

async function open(level, render, w, h, dpr = 2) {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errs.push(`L${level}/${render}: ${e}`));
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic', 'arrow', 'obstacle', 'crate', 'long', 'hearts', 'key', 'sleep', 'bomb'])); } catch { /* ignore */ } });
  await p.goto(`http://localhost:5420/?level=${level}${render === '3d' ? '&render=3d' : ''}`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  return p;
}

const LEVELS = [1, 3, 30, 90, 170];
const species = [];
for (const [w, h] of [[390, 844], [360, 640]]) {
  for (const level of LEVELS) {
    for (const render of ['3d', 'cards']) {
      const p = await open(level, render, w, h);
      await p.screenshot({ path: `${OUT}/${w}x${h}-L${level}-${render}.png` });
      if (w === 390) species.push({ level, render, built: await p.evaluate(() => window.__cards.built) });
      await p.close();
    }
  }
}

// frame time: 3 s of requestAnimationFrame, both modes, level 90
const perf = {};
for (const render of ['3d', 'cards', '3d', 'cards']) {
  const p = await open(90, render, 390, 844, 3);
  await sleep(2000);
  perf[render + (perf[render] ? '-2' : '')] = await p.evaluate(() => new Promise((res) => { const t = []; let last = performance.now(); const tick = (n) => { t.push(n - last); last = n; if (t.length < 180) requestAnimationFrame(tick); else res({ meanMs: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(1), worstMs: +Math.max(...t).toFixed(1) }); }; requestAnimationFrame(tick); }));
  await p.close();
}

// play a level by touch: tap each free animal at its screen point, at real speed, until cleared
const play = [];
for (const level of [3, 30]) {
  const dir = `${OUT}/frames/L${level}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const p = await open(level, 'cards', 390, 844, 1);
  let n = 0, taps = 0;
  const grab = async () => { await p.screenshot({ path: `${dir}/${String(n++).padStart(4, '0')}.png` }); await sleep(33); };
  for (let i = 0; i < 6; i++) await grab();
  for (let k = 0; k < 80; k++) {
    const st = await p.evaluate(() => window.__game.state());
    if (!st || st.cleared) break;
    const id = await p.evaluate(() => window.__game.free()[0]);
    if (id === undefined) { await grab(); continue; }
    const pt = await p.evaluate((i) => window.__game.screenOf(i), id);
    if (pt) { await p.touchscreen.tap(pt.x, pt.y); taps++; }
    for (let i = 0; i < 4; i++) await grab();
  }
  for (let i = 0; i < 40 && n < 600; i++) await grab();
  const st = await p.evaluate(() => window.__game.state());
  play.push({ level, taps, cleared: st?.cleared, blocked: st?.blocked, cards: await p.evaluate(() => window.__cards.stats()), frames: n });
  await p.close();
}

console.log('SPECIES', JSON.stringify(species));
console.log('PERF', JSON.stringify(perf));
console.log('PLAY', JSON.stringify(play));
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
await server.close();
