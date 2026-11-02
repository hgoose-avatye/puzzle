// node experiments/2-5d-game/batch1-play.mjs  (repo root) — batch 1 game check: find levels where penguin / parrot
// run with turns, clear them by real touch at real speed in 2.5D (390x844, 360x640), record frames and card sizes.
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
const OUT = 'experiments/2-5d-game/out-batch1/play';
const server = await createServer({ configFile: 'experiments/2-5d-game/vite.config.ts', server: { port: 5424, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
async function open(level, w, h, dpr = 1) {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errs.push(`L${level}: ${e}`));
  await p.evaluateOnNewDocument(() => localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic','arrow','obstacle','crate','long','hearts','key','sleep','bomb'])));
  await p.goto(`http://localhost:5424/?level=${level}&render=25d`, { waitUntil: 'networkidle0' });
  await sleep(1200);
  return p;
}
// headings each penguin / parrot passes on its way out (from the game's own track)
const scan = (p) => p.evaluate(() => {
  const ids = [...window.__game.views().keys()];
  return ids.map((id, i) => ({ id, sp: window.__cards.built[i].species, h: [...new Set(window.__game.views().get(id).track.pts.slice(1).map((q, k, a) => { const b = k ? a[k - 1] : window.__game.views().get(id).track.pts[0]; return (Math.round(Math.atan2(q.x - b.x, q.y - b.y) * 180 / Math.PI / 90) * 90 + 360) % 360; }))] }))
    .filter((v) => v.sp === 'penguin' || v.sp === 'parrot');
});
const picks = [];
const seen = new Set();
for (let lv = 1; lv <= 80 && picks.length < 4; lv++) {
  const p = await open(lv, 390, 844);
  for (const v of await scan(p)) {
    const key = `${v.sp}:${v.h.join(',')}`;
    if (v.h.length >= 2 && !seen.has(key)) { seen.add(key); picks.push({ lv, ...v }); }
  }
  await p.close();
}
const report = [];
for (const { lv } of [...new Map(picks.map((x) => [x.lv, x])).values()].slice(0, 3)) {
  for (const [w, h] of [[390, 844], [360, 640]]) {
    const p = await open(lv, w, h);
    const dir = `${OUT}/L${lv}-${w}`; mkdirSync(dir, { recursive: true });
    let n = 0, worstJump = 0, prev = null;
    const grab = async () => {
      if (w === 390) await p.screenshot({ path: `${dir}/${String(n).padStart(4, '0')}.png` });
      n++;
      const sizes = await p.evaluate(() => { const o = []; window.__game.scene().traverse((m) => { if (m.userData?.spriteCard && m.visible && m.parent.parent.scale.x > 0.999) { const s = new m.scale.constructor(); m.getWorldScale(s); o.push(Math.abs(s.y)); } }); return o; });
      if (prev && prev.length === sizes.length && sizes.length) for (let i = 0; i < sizes.length; i++) worstJump = Math.max(worstJump, Math.abs(sizes[i] - prev[i]) / prev[i]);
      prev = sizes;
      await sleep(33);
    };
    for (let k = 0; k < 120; k++) {
      const st = await p.evaluate(() => window.__game.state());
      if (!st || st.cleared) break;
      const id = await p.evaluate(() => window.__game.free()[0]);
      if (id !== undefined) { const pt = await p.evaluate((i) => window.__game.screenOf(i), id); if (pt) await p.touchscreen.tap(pt.x, pt.y); prev = null; }
      for (let i = 0; i < 3; i++) await grab();
    }
    for (let i = 0; i < 25; i++) await grab();
    const st = await p.evaluate(() => window.__game.state());
    report.push({ lv, size: `${w}x${h}`, cleared: st.cleared, blocked: st.blocked, cards: await p.evaluate(() => window.__cards.stats()), worstCardSizeJumpPct: +(worstJump * 100).toFixed(1) });
    await p.close();
  }
}
console.log('PICKS', JSON.stringify(picks));
console.log('PLAY', JSON.stringify(report));
console.log('page errors:', errs.length ? errs : 'none');
await browser.close(); await server.close();
