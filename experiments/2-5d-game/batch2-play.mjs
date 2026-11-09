// node experiments/2-5d-game/batch2-play.mjs — batch 2 (cow, pig, fox, tiger, husky) in the real game.
// Other batches: SPECIES=snake,caterpillar,dachshund OUT=experiments/2-5d-game/out-batch3 VIEW=360x640 (defaults: batch 2, 390x844).
// One pass over the levels finds, per species, a free piece whose way out has both blocks facing 0 / 90 / 180 / 270
// (still shots, 2.5D and 3D) and bends between 0 and 90 / 90 and 180 (turn strips, plus a frame pair either side of
// the moment each block's picture switches). The run is frozen and the head set to exact arc lengths. Writes out-batch2/.
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const OUT = process.env.OUT ?? 'experiments/2-5d-game/out-batch2';
const [VW, VH] = (process.env.VIEW ?? '390x844').split('x').map(Number);
mkdirSync(OUT, { recursive: true });
const SPECIES = process.env.SPECIES ? process.env.SPECIES.split(',') : ['cow', 'pig', 'fox', 'tiger', 'husky'];
const server = await createServer({ configFile: 'experiments/2-5d-game/vite.config.ts', server: { port: 5427, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 180000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const page = await browser.newPage();
await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 2, isMobile: true });
page.on('pageerror', (e) => errs.push(String(e)));
await page.evaluateOnNewDocument(() => localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic','arrow','obstacle','crate','long','hearts','key','sleep','bomb'])));
async function open(lv, render) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(`http://localhost:5427/?level=${lv}&render=${render}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForFunction(() => window.__game && window.__cards, { timeout: 10000 });
      await sleep(500);
      return true;
    } catch (e) { errs.push(`level ${lv} ${render}: ${e.message}`); }
  }
  return false;
}
// per free piece of the batch: arc lengths where head and tail both face a heading, and bends with their headings
const scan = () => page.evaluate((species) => {
  const ids = [...window.__game.views().keys()], free = window.__game.free();
  const angleAt = (pts, cum, s) => {
    let k = 1; while (k < cum.length - 1 && cum[k] < s) k++;
    return ((Math.atan2(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y) * 180) / Math.PI + 360) % 360;
  };
  const near = (a, h) => Math.abs(((a - h + 540) % 360) - 180);
  const card = (a) => (Math.round(a / 90) % 4) * 90;
  return ids.map((id, i) => ({ id, sp: window.__cards.built[i]?.species, cells: window.__cards.built[i]?.cells })).filter(({ id, sp }) => species.includes(sp) && free.includes(id)).map(({ id, sp, cells }) => {
    const v = window.__game.views().get(id), { pts, cum } = v.track, end = cum[cum.length - 1];
    const still = {}, bends = [];
    let prev = null;
    for (let s = v.headStart + 0.2; s < end - 0.5; s += 0.05) {
      const a = angleAt(pts, cum, s), b = angleAt(pts, cum, s - 1);
      for (const h of [0, 90, 180, 270]) if (!(h in still) && near(a, h) < 3 && near(b, h) < 3) still[h] = s;
      if (prev !== null && card(a) !== card(prev)) {
        const pair = [card(prev), card(a)].sort((x, y) => x - y).join('-');
        const kind = pair === '0-90' || pair === '0-270' ? '0-90' : pair === '90-180' || pair === '180-270' ? '90-180' : null;
        if (kind && s - 0.6 > v.headStart) bends.push({ kind, s, from: card(prev), to: card(a) });
      }
      prev = a;
    }
    return { id, sp, cells, still, bends };
  });
}, SPECIES);
// pick, per species: one source for each still heading and for each bend kind
// a previous run's picks are reused (the scan takes most of the time); delete picks.json to scan again
const PICKS = `${OUT}/picks.json`;
const want = existsSync(PICKS) ? JSON.parse(readFileSync(PICKS, 'utf8')) : Object.fromEntries(SPECIES.map((sp) => [sp, { still: {}, bends: {} }]));
const done = () => existsSync(PICKS) || SPECIES.every((sp) => Object.keys(want[sp].still).length === 4 && Object.keys(want[sp].bends).length === 2);
for (let lv = 1; lv <= 200 && !done(); lv++) {
  if (!(await open(lv, '25d'))) continue;
  for (const c of await scan()) {
    const w = want[c.sp];
    for (const [h, s] of Object.entries(c.still)) w.still[h] ??= { lv, id: c.id, s };
    for (const b of c.bends) w.bends[b.kind] ??= { lv, id: c.id, cells: c.cells, ...b };
  }
}
if (!existsSync(PICKS)) writeFileSync(PICKS, JSON.stringify(want, null, 1));
// frames already on disk are kept, so a run that stopped resumes where it was
const shot = async (id, s, name) => {
  if (existsSync(`${OUT}/${name}.png`)) return;
  await page.evaluate((id, s) => { window.__game.traffic.get(id).s = s; window.__game.views().get(id).setRun(s, false); }, id, s);
  await sleep(200);
  const pt = await page.evaluate((id) => window.__game.screenOf(id), id);
  const x = Math.max(0, Math.min(VW - 200, (pt?.x ?? VW / 2) - 100)), y = Math.max(0, Math.min(VH - 200, (pt?.y ?? VH / 2) - 100));
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x, y, width: 200, height: 200 } }); return; }
    catch (e) { errs.push(`${name}: ${e.message}`); }
  }
};
const start = async (lv, id, render) => {
  if (!(await open(lv, render))) return false;
  await page.evaluate((id) => { window.__game.tap(id); window.__runSpeed = 0; }, id);
  await sleep(250);
  return true;
};
const missing = [];
for (const sp of SPECIES) {
  for (const h of [0, 90, 180, 270]) {
    const p = want[sp].still[h];
    if (!p) { missing.push(`${sp} still ${h}`); continue; }
    for (const render of ['25d', '3d']) if (await start(p.lv, p.id, render)) await shot(p.id, p.s, `${sp}-still-${String(h).padStart(3, '0')}-${render}`);
  }
  for (const kind of ['0-90', '90-180']) {
    const b = want[sp].bends[kind];
    if (!b) { missing.push(`${sp} bend ${kind}`); continue; }
    if (!(await start(b.lv, b.id, '25d'))) continue;
    // head switches at b.s, each next block one cell later: frames through all of them, then a tight pair either side of each switch
    const cells = b.cells ?? 2, parts = cells >= 3 ? ['head', 'body', 'tail'] : ['head', 'tail'];
    for (let k = 0; k < 6 * cells; k++) await shot(b.id, b.s - 0.4 + k * 0.15, `${sp}-turn-${kind}-${String(k).padStart(2, '0')}`);
    for (const [i, part] of parts.entries()) {
      const at = b.s + i;
      await shot(b.id, at - 0.06, `${sp}-switch-${kind}-${part}-a`);
      await shot(b.id, at + 0.06, `${sp}-switch-${kind}-${part}-b`);
    }
  }
}
console.log('missing:', missing.length ? missing : 'none');
console.log('page errors:', errs.length ? errs : 'none');
await browser.close(); await server.close();
