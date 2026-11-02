// node experiments/2-5d-game/batch2-switch.mjs — after batch2-play.mjs: the moment a block's picture switches heading.
// Reuses out-batch2/picks.json (the bends found there), freezes the run and steps the head finely through the bend with
// a FIXED crop (the camera view does not follow the animal), so any jump of a card shows as a jump between frames.
// Writes out-batch2/fixed-<species>-<kind>-NN.png. Other batches: OUT=... VIEW=360x640 (3-cell bends get a longer run).
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const OUT = process.env.OUT ?? 'experiments/2-5d-game/out-batch2';
// CONFIG / PORT / EXTRA: run on another entry, e.g. the diagnosis one (diag/vite.diag.config.ts, 5431, '&cardmode=C')
const CONFIG = process.env.CONFIG ?? 'experiments/2-5d-game/vite.config.ts', PORT = Number(process.env.PORT ?? 5428), EXTRA = process.env.EXTRA ?? '';
const [VW, VH] = (process.env.VIEW ?? '390x844').split('x').map(Number);
const picks = JSON.parse(readFileSync(`${OUT}/picks.json`, 'utf8'));
const server = await createServer({ configFile: CONFIG, server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 180000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const page = await browser.newPage();
await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 2, isMobile: true });
page.on('pageerror', (e) => errs.push(String(e)));
await page.evaluateOnNewDocument(() => localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic','arrow','obstacle','crate','long','hearts','key','sleep','bomb'])));
const FROM = -0.3; // head arc length relative to the bend; the run covers every block's switch (one cell apart)
for (const [sp, w] of Object.entries(picks)) {
  for (const [kind, b] of Object.entries(w.bends)) {
    const TO = (b.cells ?? 2) - 0.5, STEPS = Math.round((TO - FROM) / 0.072) + 1;
    await page.goto(`http://localhost:${PORT}/?level=${b.lv}&render=25d${EXTRA}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__game && window.__cards, { timeout: 15000 });
    await sleep(600);
    await page.evaluate((id) => { window.__game.tap(id); window.__runSpeed = 0; }, b.id);
    await sleep(250);
    const set = async (s) => {
      await page.evaluate((id, s) => { window.__game.traffic.get(id).s = s; window.__game.views().get(id).setRun(s, false); }, b.id, s);
      await sleep(180);
    };
    // one crop for the whole sequence: centred where the animal is mid-bend
    await set(b.s + 0.5);
    const pt = await page.evaluate((id) => window.__game.screenOf(id), b.id);
    const x = Math.max(0, Math.min(VW - 160, (pt?.x ?? VW / 2) - 80)), y = Math.max(0, Math.min(VH - 160, (pt?.y ?? VH / 2) - 80));
    for (let k = 0; k < STEPS; k++) {
      await set(b.s + FROM + ((TO - FROM) * k) / (STEPS - 1));
      await page.screenshot({ path: `${OUT}/fixed-${sp}-${kind}-${String(k).padStart(2, '0')}.png`, clip: { x, y, width: 160, height: 160 } });
    }
  }
}
console.log('page errors:', errs.length ? errs : 'none');
await browser.close(); await server.close();
