// node experiments/2-5d-game/turn-ab.mjs — crocodile bends in the real game at the SAME track progress for tuck 0.10 / 0 / 0.05:
// a free crocodile whose way out bends is sent off, the run is frozen (__runSpeed = 0) and its head is set to exact arc
// lengths around each bend (PieceView.setRun), then the board around it is captured. Writes out-overlap/turn-*.png.
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
const OUT = 'experiments/2-5d-game/out-overlap';
const server = await createServer({ configFile: 'experiments/2-5d-game/vite.config.ts', server: { port: 5426, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
async function open(lv, tuck) {
  const p = await browser.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.evaluateOnNewDocument(() => localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic','arrow','obstacle','crate','long','hearts','key','sleep','bomb'])));
  await p.goto(`http://localhost:5426/?level=${lv}&render=25d&tuck=${tuck}`, { waitUntil: 'networkidle0' });
  await sleep(1200);
  return p;
}
// free crocodiles and the arc lengths where their heading changes
const bends = (p) => p.evaluate(() => {
  const ids = [...window.__game.views().keys()], free = window.__game.free();
  return ids.map((id, i) => ({ id, i })).filter(({ id, i }) => window.__cards.built[i].species === 'crocodile' && free.includes(id)).map(({ id }) => {
    const v = window.__game.views().get(id), { pts, cum } = v.track; const out = []; let last = null;
    for (let k = 1; k < pts.length; k++) { const a = Math.round(Math.atan2(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y) * 180 / Math.PI); if (last !== null && Math.abs(a - last) > 30 && cum[k] > v.headStart) out.push(cum[k - 1]); if (last === null || Math.abs(a - last) > 30) last = a; }
    return { id, start: v.headStart, bends: out };
  }).filter((c) => c.bends.length);
});
let pick = null;
for (let lv = 1; lv <= 180 && !pick; lv++) {
  const p = await open(lv, '0.1');
  const c = (await bends(p)).sort((a, b) => b.bends.length - a.bends.length)[0];
  if (c && (c.bends.length >= 2 || !pick)) pick = { lv, ...c };
  await p.close();
  if (pick && pick.bends.length >= 2) break;
}
console.log('PICK', JSON.stringify(pick));
// before, start of, mid, end of the head's bend, and the body / tail going through it; same for the next bend
const ss = pick.bends.slice(0, 2).flatMap((b) => [b - 0.3, b + 0.05, b + 0.25, b + 0.6, b + 1.25, b + 2.2]);
for (const tuck of ['0.1', '0', '0.05']) {
  const p = await open(pick.lv, tuck);
  await p.evaluate((id) => { window.__game.tap(id); window.__runSpeed = 0; }, pick.id);
  await sleep(300);
  for (const [k, s] of ss.entries()) {
    await p.evaluate((id, s) => { window.__game.traffic.get(id).s = s; window.__game.views().get(id).setRun(s, false); }, pick.id, s);
    await sleep(250);
    const pt = await p.evaluate((id) => window.__game.screenOf(id), pick.id);
    const x = Math.max(0, Math.min(390 - 220, (pt?.x ?? 195) - 110)), y = Math.max(0, Math.min(844 - 220, (pt?.y ?? 400) - 110));
    await p.screenshot({ path: `${OUT}/turn-t${tuck}-${String(k).padStart(2, '0')}.png`, clip: { x, y, width: 220, height: 220 } });
  }
  await p.close();
}
console.log('frames per setting', ss.length, 'page errors:', errs.length ? errs : 'none');
await browser.close(); await server.close();
