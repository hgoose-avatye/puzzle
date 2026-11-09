// node experiments/2-5d-crocodile/tools/chick-two-compare.mjs  (from the repo root), then python3 tools/chick_diff.py
// 1-cell chick: every frame (1/30 s apart) of each chick scene in both renderers (legacy / shared sprites), board area
// only, at 390x844 and 360x640, saved for the pixel diff. 2-cell test animal: stills in both renderers and real-speed
// frames of the shared renderer. Writes out-render2/ only.
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const ROOT = 'experiments/2-5d-crocodile';
const OUT = `${ROOT}/out-render2`;
const DT = 1 / 60;
mkdirSync(`${OUT}/frames`, { recursive: true });
const server = await createServer({ configFile: `${ROOT}/vite.config.ts`, server: { port: 5414, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];

async function open(scene, render, w, h, dpr) {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true });
  p.on('pageerror', (e) => errs.push(`${scene}/${render}: ${e}`));
  await p.goto(`http://localhost:5414/?scene=${scene}${render === 'legacy' ? '&render=legacy' : ''}`, { waitUntil: 'networkidle0' });
  await p.waitForFunction('window.__exp && window.__exp.ready');
  await p.evaluate(() => { window.__exp.pause(true); window.__exp.advance(1 / 60); });
  return p;
}
const info = (p) => p.evaluate(() => window.__exp.info());
const advance = (p, n) => p.evaluate((dt, k) => window.__exp.advance(dt, k), DT, n);

const chick = [];
for (const [w, h] of [[390, 844], [360, 640]]) {
  for (const scene of ['chick-down', 'chick-up', 'chick-left', 'chick-right', 'chick-turns']) {
    const pages = { legacy: await open(scene, 'legacy', w, h, 1), sprites: await open(scene, 'sprites', w, h, 1) };
    const dirs = {};
    for (const r of Object.keys(pages)) {
      dirs[r] = `${OUT}/frames/chick/${w}x${h}/${scene}/${r}`;
      rmSync(dirs[r], { recursive: true, force: true });
      mkdirSync(dirs[r], { recursive: true });
    }
    for (const p of Object.values(pages)) await p.evaluate(() => window.__exp.tap(1));
    const clip = { x: 0, y: 70, width: w, height: h - 260 }; // the board, without HUD and panel
    let f = 0;
    for (; f < 200; f++) {
      for (const [r, p] of Object.entries(pages)) await p.screenshot({ path: `${dirs[r]}/${String(f).padStart(4, '0')}.png`, clip });
      if ((await info(pages.sprites)).views[0].gone) break;
      for (const p of Object.values(pages)) await advance(p, 2);
    }
    const s = await info(pages.sprites);
    chick.push({ size: `${w}x${h}`, scene, frames: f + 1, result: s.msg, missing: await pages.sprites.evaluate(() => window.__exp.missingPictures()) });
    for (const p of Object.values(pages)) await p.close();
  }
}

const two = [];
for (const [w, h] of [[390, 844], [360, 640]]) {
  for (const scene of ['two-straight', 'two-turn']) {
    for (const render of ['legacy', 'sprites']) {
      const p = await open(scene, render, w, h, 2);
      await p.screenshot({ path: `${OUT}/${w}x${h}-${scene}-idle-${render}.png` });
      await p.evaluate(() => window.__exp.tap(1));
      // turn scene: the first frame where head and tail face different ways; straight: a short way in
      let n = 0;
      if (scene === 'two-turn') while (n++ < 400) { const b = (await info(p)).views[0].blocks; if (b[0].deg !== b[1].deg) break; await advance(p, 1); }
      else await advance(p, 10);
      await p.screenshot({ path: `${OUT}/${w}x${h}-${scene}-moving-${render}.png` });
      if (render === 'sprites') {
        let k = 0;
        while (!(await info(p)).views[0].gone && k++ < 300) await advance(p, 2);
        const s = await info(p);
        two.push({ size: `${w}x${h}`, scene, result: s.msg, missing: await p.evaluate(() => window.__exp.missingPictures()) });
      }
      await p.close();
    }
  }
}
for (const scene of ['two-straight', 'two-turn']) {
  const dir = `${OUT}/frames/${scene}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const p = await open(scene, 'sprites', 390, 844, 1);
  let n = 0;
  const grab = async () => { await p.screenshot({ path: `${dir}/${String(n++).padStart(4, '0')}.png` }); await advance(p, 2); };
  for (let i = 0; i < 6; i++) await grab();
  await p.evaluate(() => window.__exp.tap(1));
  while (!(await info(p)).views[0].gone && n < 300) await grab();
  for (let i = 0; i < 6; i++) await grab();
  await p.close();
}
console.log('CHICK', JSON.stringify(chick));
console.log('TWO', JSON.stringify(two));
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
await server.close();
