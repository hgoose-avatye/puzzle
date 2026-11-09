// node experiments/2-5d-game/art-shots.mjs  (from the repo root)
// Art review stills: the real game camera on ?demo=sheet (one species per row, heading down / up / right = 0° / 180° /
// 90°), once with the current pictures and once with ?art=candidate. SHOTS='name:len:sp1,sp2;…', DIRS='down,up,right',
// PORT (default 5420, when another dev server holds it). Writes OUT/<name>-{before,after}.png.
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const ROOT = 'experiments/2-5d-game';
const OUT = process.env.OUT ?? `${ROOT}/out-art`;
const SHOTS = (process.env.SHOTS ?? 'two:2:husky,cow,pig,fox,tiger;three:3:snake,caterpillar,dachshund,crocodile')
  .split(';').map((s) => { const [name, len, species] = s.split(':'); return { name, len: Number(len), species }; });
const DIRS = process.env.DIRS ?? 'down,up,right';
const PORT = Number(process.env.PORT ?? 5420);
mkdirSync(OUT, { recursive: true });
const server = await createServer({ configFile: `${ROOT}/vite.config.ts`, server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
for (const { name, len, species } of SHOTS) {
  for (const [tag, extra] of [['before', ''], ['after', '&art=candidate']]) {
    const p = await browser.newPage();
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    p.on('pageerror', (e) => errs.push(`${name}/${tag}: ${e}`));
    await p.goto(`http://localhost:${PORT}/?demo=sheet&species=${species}&len=${len}&dirs=${DIRS}${extra}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1500));
    await p.screenshot({ path: `${OUT}/${name}-${tag}.png` });
    await p.close();
  }
}
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
await server.close();
