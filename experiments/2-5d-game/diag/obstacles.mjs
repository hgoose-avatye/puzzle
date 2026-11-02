// node experiments/2-5d-game/diag/obstacles.mjs — DIAGNOSIS ONLY: cards against the 3D scene in card modes A and C.
// 1. Finds the levels with the most obstacles + crates next to animals.
// 2. On each, along a grid of screen rays, compares the first opaque card texel with the first obstacle surface (not
//    the floor or a plate): a card nearer than an obstacle standing in the row in front of the card's block is drawn
//    over it wrongly; an obstacle nearer than the card while standing in the row behind hides the card wrongly.
// 3. Saves the board (A, C) and an exit run: a free animal is tapped, the run frozen and the head stepped up to and
//    through its gate (the shrink), with a fixed crop. Writes out-diag/obstacles.json and out-diag/obst-*.png.
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const OUT = 'experiments/2-5d-game/out-diag';
const server = await createServer({ configFile: 'experiments/2-5d-game/diag/vite.diag.config.ts', logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 180000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
page.on('pageerror', (e) => errs.push(String(e)));
await page.evaluateOnNewDocument(() => localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic','arrow','obstacle','crate','long','hearts','key','sleep','bomb'])));
const open = async (lv, mode) => {
  await page.goto(`http://localhost:5431/?level=${lv}&cardmode=${mode}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__diagCamera && window.__diagThree, { timeout: 20000 });
  await sleep(1200);
};

// 1. levels with obstacles or crates
const found = [];
for (let lv = 1; lv <= 180; lv += 2) {
  try {
    await open(lv, 'A');
    const n = await page.evaluate(() => { const l = window.__game.views().values().next().value.level; return (l.obstacles?.length ?? 0) + (l.crates?.length ?? 0); });
    if (n) found.push({ lv, n });
  } catch (e) { errs.push(`scan ${lv}: ${e.message}`); }
}
const levels = found.sort((a, b) => b.n - a.n).slice(0, 3).map((f) => f.lv);
console.log('levels with obstacles:', found.length, 'chosen', levels);

const sample = () => page.evaluate(() => {
  const THREE = window.__diagThree, camera = window.__diagCamera, scene = window.__game.scene();
  const rect = document.querySelector('canvas').getBoundingClientRect();
  const views = window.__game.views();
  const owner = new Map();
  for (const [id, v] of views) if (v.group.visible) v.group.traverse((o) => owner.set(o, id));
  const drawn = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const shown = (o) => drawn(o) && o.material?.visible !== false && o.material?.colorWrite !== false && !o.isSprite;
  const ray = new THREE.Raycaster(); ray.camera = camera;
  const res = { rays: 0, cardOverObstacleInFront: 0, obstacleBehindOverCard: 0, cardVsObstacle: 0 };
  for (let y = rect.top + 2; y < rect.bottom; y += 4) for (let x = rect.left + 2; x < rect.right; x += 4) {
    ray.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -(((y - rect.top) / rect.height) * 2 - 1)), camera);
    let card = null, obst = null;
    for (const h of ray.intersectObjects(scene.children, true)) {
      if (!shown(h.object)) continue;
      if (h.object.userData?.spriteCard) {
        const img = h.object.material?.map?.image;
        if (!card && img?.width && h.uv && window.__diagAlpha(img, h.uv.x, h.uv.y) > 127) card = h;
      } else if (!owner.has(h.object) && h.point.y > 0.15 && !obst) obst = h;
      if (card && obst) break;
    }
    res.rays++;
    if (!card || !obst) continue;
    res.cardVsObstacle++;
    const block = card.object.parent.parent.getWorldPosition(new THREE.Vector3());
    // obstacle surface clearly in the row in front of the card's block (toward the camera, +z) or behind it
    if (card.distance < obst.distance && obst.point.z > block.z + 0.55) res.cardOverObstacleInFront++;
    if (obst.distance < card.distance && obst.point.z < block.z - 0.55) res.obstacleBehindOverCard++;
  }
  return res;
});

const report = { levels: found, depth: {} };
for (const lv of levels) {
  for (const mode of ['A', 'C']) {
    await open(lv, mode);
    report.depth[`${lv} ${mode}`] = await sample();
    await page.screenshot({ path: `${OUT}/obst-${lv}-${mode}.png` });
    console.log(lv, mode, JSON.stringify(report.depth[`${lv} ${mode}`]));
  }
}

// 3. exit run with the shrink at the gate, same animal and crop in A and C
for (const lv of levels.slice(0, 1)) {
  await open(lv, 'A');
  const id = await page.evaluate(() => window.__game.free()[0]);
  let crop = null;
  for (const mode of ['A', 'C']) {
    await open(lv, mode);
    await page.evaluate((id) => { window.__game.tap(id); window.__runSpeed = 0; }, id);
    await sleep(250);
    const end = await page.evaluate((id) => { const v = window.__game.views().get(id); return v.track.cum[v.track.cum.length - 1]; }, id);
    for (let k = 0; k < 14; k++) {
      const s = end - 2.6 + k * 0.2;
      await page.evaluate((id, s) => { window.__game.traffic.get(id).s = s; window.__game.views().get(id).setRun(s, false); }, id, s);
      await sleep(200);
      if (!crop) {
        const g = await page.evaluate((id) => { const v = window.__game.views().get(id).gateWorld(); return v ? { x: v.x, z: v.z } : null; }, id);
        const pt = await page.evaluate((id) => window.__game.screenOf(id), id);
        crop = { x: Math.max(0, Math.min(390 - 180, (pt?.x ?? 195) - 90)), y: Math.max(0, Math.min(844 - 180, (pt?.y ?? 420) - 90)), width: 180, height: 180 };
      }
      await page.screenshot({ path: `${OUT}/obst-exit-${mode}-${String(k).padStart(2, '0')}.png`, clip: crop });
    }
  }
}
writeFileSync(`${OUT}/obstacles.json`, JSON.stringify(report, null, 1));
console.log('page errors:', errs.length ? errs : 'none');
await browser.close(); await server.close();
