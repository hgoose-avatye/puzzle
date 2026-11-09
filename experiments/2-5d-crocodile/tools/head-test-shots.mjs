// node experiments/2-5d-crocodile/tools/head-test-shots.mjs  (from the repo root, after head_check.py check)
// The unchanged prototype with the drawn head (vite.head-test.config.ts): stills of the head facing each way on the
// board, the 90° turn key frames, and GIF frames of the turn and the stairs at 8 headings. Output: out-head/ (or HEAD_TEST_OUT).
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const ROOT = 'experiments/2-5d-crocodile';
const OUT = process.env.HEAD_TEST_OUT ?? `${ROOT}/out-head`;
const DT = 1 / 60;
mkdirSync(OUT, { recursive: true });

const server = await createServer({ configFile: `${ROOT}/vite.head-test.config.ts`, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(scene, w = 390, h = 844, dpr = 2) {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true });
  await p.goto(`http://localhost:5412/?scene=${scene}`, { waitUntil: 'networkidle0' });
  await p.waitForFunction('window.__exp && window.__exp.ready');
  await p.evaluate(() => { window.__exp.pause(true); window.__exp.set({ dirs: 8, blend: false }); window.__exp.advance(1 / 60); });
  return p;
}
const info = (p) => p.evaluate(() => window.__exp.info());
const advance = (p, n) => p.evaluate((dt, k) => window.__exp.advance(dt, k), DT, n);
const head = async (p) => (await info(p)).views.find((v) => v.id === 1).blocks[0];
const until = async (p, pred, max = 600) => { for (let i = 0; i < max; i++) { if (await pred(await info(p))) return true; await advance(p, 1); } return false; };

// key frames of the 90° turn, at both phone sizes
for (const [w, h] of [[390, 844], [360, 640]]) {
  const p = await open('turn', w, h);
  await p.screenshot({ path: `${OUT}/${w}x${h}-head-idle-right.png` });
  await p.evaluate(() => window.__exp.tap(1));
  await until(p, (q) => { const b = q.views[0].blocks; return Math.abs(b[0].deg) === 180 && b[1].deg !== 90 && Math.abs(b[1].deg) !== 180; });
  await p.screenshot({ path: `${OUT}/${w}x${h}-head-turned-body-turning.png` });
  await p.close();
}

// GIF frames: the turn and the stairs (8 headings, real speed, a frame every 1/30 s)
for (const scene of ['turn', 'stairs']) {
  const dir = `${OUT}/frames/${scene}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const p = await open(scene, 390, 844, 1);
  let n = 0;
  const grab = async () => { await p.screenshot({ path: `${dir}/${String(n++).padStart(4, '0')}.png` }); await advance(p, 2); };
  for (let i = 0; i < 8; i++) await grab();
  await p.evaluate(() => window.__exp.tap(1));
  while (!(await info(p)).views[0].gone && n < 300) await grab();
  await p.close();
}
console.log('head test shots in', OUT);
await browser.close();
await server.close();
