// node experiments/2-5d-crocodile/tools/render-compare.mjs  (from the repo root)
// The prototype before (?render=legacy, temporary block strips) and after (shared sprites + manifests), same scenes and
// frames on a paused clock, at 390x844 and 360x640. Also real-speed frames of the new renderer for GIFs, with the
// renderer's own count of blocks it had no picture for. Writes out-render/ only.
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const ROOT = 'experiments/2-5d-crocodile';
const OUT = `${ROOT}/out-render`;
const DT = 1 / 60;
mkdirSync(`${OUT}/frames`, { recursive: true });
const server = await createServer({ configFile: `${ROOT}/vite.config.ts`, server: { port: 5413, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];

async function open(scene, render, w, h, dpr) {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true });
  p.on('pageerror', (e) => errs.push(`${scene}/${render}: ${e}`));
  await p.goto(`http://localhost:5413/?scene=${scene}${render === 'legacy' ? '&render=legacy' : ''}`, { waitUntil: 'networkidle0' });
  await p.waitForFunction('window.__exp && window.__exp.ready');
  await p.evaluate(() => { window.__exp.pause(true); window.__exp.advance(1 / 60); });
  return p;
}
const info = (p) => p.evaluate(() => window.__exp.info());
const advance = (p, n) => p.evaluate((dt, k) => window.__exp.advance(dt, k), DT, n);

// stills: idle, and for turning scenes the frame where head and tail face 60°+ apart (mid-bend)
const STILLS = ['straight', 'down', 'up', 'left', 'turn', 'stairs', 'friend'];
const midTurn = (q) => { const b = q.views[0].blocks; return b.length === 3 && Math.abs(((b[0].deg - b[2].deg) % 360 + 540) % 360 - 180) >= 60; };
for (const [w, h] of [[390, 844], [360, 640]]) {
  for (const scene of STILLS) {
    for (const render of ['legacy', 'sprites']) {
      const p = await open(scene, render, w, h, 2);
      await p.screenshot({ path: `${OUT}/${w}x${h}-${scene}-idle-${render}.png` });
      await p.evaluate(() => window.__exp.tap(1));
      let n = 0;
      if (scene === 'turn' || scene === 'stairs') while (!midTurn(await info(p)) && n++ < 400) await advance(p, 1);
      else await advance(p, 12);
      await p.screenshot({ path: `${OUT}/${w}x${h}-${scene}-moving-${render}.png` });
      await p.close();
    }
  }
}

// real speed, new renderer: a frame every 1/30 s, plus the renderer's count of blocks with no picture
const report = [];
for (const scene of ['straight', 'down', 'up', 'left', 'turn', 'zigzag', 'stairs', 'friend']) {
  const dir = `${OUT}/frames/${scene}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const p = await open(scene, 'sprites', 390, 844, 1);
  let n = 0;
  const grab = async () => { await p.screenshot({ path: `${dir}/${String(n++).padStart(4, '0')}.png` }); await advance(p, 2); };
  for (let i = 0; i < 6; i++) await grab();
  if (scene === 'friend') { await p.evaluate(() => window.__exp.tap(2)); while (!(await info(p)).views.find((v) => v.id === 2).gone && n < 200) await grab(); }
  await p.evaluate(() => window.__exp.tap(1));
  while (!(await info(p)).views.find((v) => v.id === 1).gone && n < 400) await grab();
  for (let i = 0; i < 6; i++) await grab();
  const s = await info(p);
  report.push({ scene, frames: n, missingPictures: await p.evaluate(() => window.__exp.missingPictures()), result: s.msg, hearts: s.hearts });
  await p.close();
}
console.log(JSON.stringify(report));
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
await server.close();
