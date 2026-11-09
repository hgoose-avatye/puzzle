// node experiments/2-5d-crocodile/tools/shots.mjs  (from the repo root)
// Starts this experiment's own Vite server (port 5411), drives every scene on a frame-exact paused clock in headless
// Chrome, prints PASS / FAIL per check, and saves screenshots plus GIF frame folders under experiments/2-5d-crocodile/out/.
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const ROOT = 'experiments/2-5d-crocodile';
const OUT = process.env.SHOTS_OUT ?? `${ROOT}/out`;
const DT = 1 / 60;
// CHECKS=0 skips the checks and screenshots; GIFS=a,b only captures those GIFs (default: all, CHECKS and GIFS both on)
const CHECKS = process.env.CHECKS !== '0';
const GIFS = process.env.GIFS ? process.env.GIFS.split(',') : null;
mkdirSync(`${OUT}/frames`, { recursive: true });

const server = await createServer({ configFile: `${ROOT}/vite.config.ts`, server: { port: 5411, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ` — ${info}` : ''}`); };

async function open(w, h, dpr, scene) {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true });
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(String(e)));
  await p.goto(`http://localhost:5411/?scene=${scene}`, { waitUntil: 'networkidle0' });
  await p.waitForFunction('window.__exp && window.__exp.ready');
  await p.evaluate(() => window.__exp.pause(true));
  await p.evaluate(() => window.__exp.advance(1 / 60));
  return p;
}
const info = (p) => p.evaluate(() => window.__exp.info());
const tap = (p, id) => p.evaluate((i) => window.__exp.tap(i), id);
const advance = (p, n) => p.evaluate((dt, k) => window.__exp.advance(dt, k), DT, n);
/** Step until `pred(info)` holds (checked every frame), at most `max` frames; returns the info or null. */
async function until(p, pred, max = 600) {
  for (let i = 0; i < max; i++) {
    const s = await info(p);
    if (pred(s)) return s;
    await advance(p, 1);
  }
  return null;
}
const croc = (s) => s.views.find((v) => v.id === 1);
const degDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });

/** Run a scene until the crocodile is gone; returns the crocodile's block log (every frame). */
async function runOut(p) {
  const log = [];
  for (let i = 0; i < 900; i++) {
    const s = await info(p);
    const c = croc(s);
    if (c.gone) return { log, s };
    log.push(c.blocks);
    await advance(p, 1);
  }
  return { log, s: await info(p) };
}

for (const [w, h, dpr] of CHECKS ? [[390, 844, 2], [360, 640, 2]] : []) {
  const tag = `${w}x${h}`;

  // 1. straight
  let p = await open(w, h, dpr, 'straight');
  await shot(p, `${tag}-straight-idle`);
  check(`${tag} straight: tap -> out`, (await tap(p, 1)) === 'exited');
  await advance(p, 8);
  await shot(p, `${tag}-straight-running`);
  let r = await runOut(p);
  check(`${tag} straight: every block keeps heading right (90°) until gone`, r.log.every((bs) => bs.every((b) => b.deg === 90)));
  check(`${tag} straight: gone and level cleared`, croc(r.s).gone && r.s.msg === '탈출 성공!', r.s.msg);
  await p.close();

  // 2. one 90° turn, three key frames
  p = await open(w, h, dpr, 'turn');
  await shot(p, `${tag}-turn-idle`);
  await tap(p, 1);
  let s = await until(p, (q) => { const b = croc(q).blocks; return b[0].deg !== 90 && b[0].deg !== 180 && b[0].deg !== -180; });
  await shot(p, `${tag}-turn-a-head-turning`);
  s = await until(p, (q) => { const b = croc(q).blocks; return Math.abs(b[0].deg) === 180 && b[1].deg !== 90 && Math.abs(b[1].deg) !== 180; });
  check(`${tag} turn: a frame where the head has turned up and the middle is still turning`, !!s, s ? JSON.stringify(croc(s).blocks.map((b) => b.deg)) : 'never');
  await shot(p, `${tag}-turn-b-head-done-body-turning`);
  s = await until(p, (q) => { const b = croc(q).blocks; return Math.abs(b[1].deg) === 180 && b[2].deg !== 90 && Math.abs(b[2].deg) !== 180; });
  await shot(p, `${tag}-turn-c-tail-turning`);
  r = await runOut(p);
  check(`${tag} turn: leaves through the top and clears`, r.s.msg === '탈출 성공!');
  await p.close();

  // 3. zigzag (bends two cells apart): the widest spread of headings along the body, and a mid-zigzag frame
  p = await open(w, h, dpr, 'zigzag');
  await shot(p, `${tag}-zigzag-idle`);
  await tap(p, 1);
  r = await runOut(p);
  const spread = Math.max(...r.log.map((bs) => degDiff(bs[0].deg, bs[2].deg)));
  check(`${tag} zigzag: clears; head and tail headings differ by up to ${spread}° on the way`, r.s.msg === '탈출 성공!' && spread >= 110);
  await p.evaluate(() => window.__exp.load('zigzag'));
  await tap(p, 1);
  await until(p, (q) => { const d = croc(q).blocks.map((b) => b.deg); return degDiff(d[0], d[2]) >= 110; });
  await shot(p, `${tag}-zigzag-mid`);
  await p.close();

  // 3b. stairs (bends one cell apart): head, middle and tail facing three different ways at once
  p = await open(w, h, dpr, 'stairs');
  await shot(p, `${tag}-stairs-idle`);
  await tap(p, 1);
  s = await until(p, (q) => { const d = croc(q).blocks.map((b) => b.deg); return degDiff(d[0], d[1]) >= 60 && degDiff(d[1], d[2]) >= 60 && degDiff(d[0], d[2]) >= 60; });
  check(`${tag} stairs: head, middle and tail all facing different ways`, !!s, s ? JSON.stringify(croc(s).blocks.map((b) => b.deg)) : 'never');
  await shot(p, `${tag}-stairs-three-ways`);
  r = await runOut(p);
  check(`${tag} stairs: clears`, r.s.msg === '탈출 성공!');
  await p.close();

  // 4. blocked by a rock, a facing arrow, an arrow loop: no movement, a heart less
  for (const scene of ['rock', 'facing', 'loop']) {
    p = await open(w, h, dpr, scene);
    const before = croc(await info(p)).blocks;
    check(`${tag} ${scene}: tap -> blocked`, (await tap(p, 1)) === 'blocked');
    await advance(p, 6);
    await shot(p, `${tag}-${scene}-blocked-shake`);
    await advance(p, 40);
    s = await info(p);
    check(`${tag} ${scene}: stays in place, 2 hearts`, JSON.stringify(croc(s).blocks) === JSON.stringify(before) && s.hearts === 2, `hearts ${s.hearts}`);
    await p.close();
  }

  // 5. another animal in the way: blocked, send the chick, then the crocodile gets out
  p = await open(w, h, dpr, 'friend');
  await shot(p, `${tag}-friend-idle`);
  check(`${tag} friend: crocodile blocked by the chick`, (await tap(p, 1)) === 'blocked');
  check(`${tag} friend: chick goes`, (await tap(p, 2)) === 'exited');
  await advance(p, 5);
  await shot(p, `${tag}-friend-chick-running`);
  await until(p, (q) => q.views.find((v) => v.id === 2).gone);
  check(`${tag} friend: now the crocodile gets out`, (await tap(p, 1)) === 'exited');
  await advance(p, 10);
  await shot(p, `${tag}-friend-croc-running`);
  r = await runOut(p);
  check(`${tag} friend: cleared with 2 hearts`, r.s.msg === '탈출 성공!' && r.s.hearts === 2, `${r.s.msg} ${r.s.hearts}`);
  // real touch: tap the screen on the crocodile body
  await p.evaluate(() => window.__exp.load('straight'));
  const pt = await p.evaluate(() => window.__exp.screenOf(2, 4));
  await p.touchscreen?.tap?.(pt.x, pt.y).catch(() => {});
  await p.mouse.click(pt.x, pt.y);
  check(`${tag} touch on the middle block starts the run`, croc(await info(p)).running === true);
  check(`${tag} no page errors`, p.errs.length === 0, p.errs.join(' | '));
  await p.close();
}

// GIF frames (390 wide): the zigzag at 8 directions, 8 + blend and 32 directions; the friend scene at 8 directions
for (const [name, scene, opts, taps] of [
  ['zigzag-8', 'zigzag', { dirs: 8, blend: false }, [1]],
  ['zigzag-8blend', 'zigzag', { dirs: 8, blend: true }, [1]],
  ['zigzag-32', 'zigzag', { dirs: 32, blend: false }, [1]],
  ['stairs-8', 'stairs', { dirs: 8, blend: false }, [1]],
  ['stairs-32', 'stairs', { dirs: 32, blend: false }, [1]],
  ['friend-8', 'friend', { dirs: 8, blend: false }, [1, 2, 'wait2', 1]],
].filter(([name]) => !GIFS || GIFS.includes(name))) {
  rmSync(`${OUT}/frames/${name}`, { recursive: true, force: true });
  const p = await open(390, 844, 1, scene);
  await p.evaluate((o) => window.__exp.set(o), opts);
  mkdirSync(`${OUT}/frames/${name}`, { recursive: true });
  let n = 0;
  const grab = async (k) => { for (let i = 0; i < k; i++) { await p.screenshot({ path: `${OUT}/frames/${name}/${String(n++).padStart(4, '0')}.png` }); await advance(p, 2); } };
  await grab(10);
  for (const t of taps) {
    if (t === 'wait2') { while (!(await info(p)).views.find((v) => v.id === 2).gone && n < 400) await grab(1); continue; }
    await tap(p, t);
    await grab(t === 1 && scene === 'friend' && n < 20 ? 18 : 0);
  }
  while (!croc(await info(p)).gone && n < 500) await grab(1);
  await grab(10);
  await p.close();
}

await browser.close();
await server.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
