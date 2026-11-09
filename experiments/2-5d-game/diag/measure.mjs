// node experiments/2-5d-game/diag/measure.mjs — DIAGNOSIS ONLY. Real game camera and board (?demo=sheet: one species
// per row, rows top / middle / bottom of the board, columns heading up / down / left / right), drawn with card mode
// A (current), B or C (diag/cardModes.ts). For every card it records, from the real camera: the projected outline of the
// picture's opaque pixels, its lowest opaque row (feet), the plate-top floor point, the projected cell width, the
// block's track angle and the picture drawn. It also saves the frame with and without the cards, so diag/analyse.py can
// find which card pixels are really visible (buried feet, cover by other things). Writes out-diag/<scene>-<mode>.*
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.env.OUT ?? 'experiments/2-5d-game/out-diag';
// ROWS=1: one row per species (nothing behind an animal, for heights); default 3 rows (top / middle / bottom of the board)
const ROWS = Number(process.env.ROWS ?? 3);
// EXTRA='&offsetscale=0.5': more query parameters for every scene (diag/cardModes.ts switches)
const EXTRA = process.env.EXTRA ?? '';
mkdirSync(OUT, { recursive: true });
const [VW, VH] = (process.env.VIEW ?? '390x844').split('x').map(Number);
const MODES = (process.env.MODES ?? 'A,B,C').split(',');
const SCENES = [
  ['chick', 1], ['penguin', 1], ['parrot', 1], ['husky', 2], ['tiger', 2], ['crocodile', 3], ['dachshund', 3], ['snake', 3],
].filter(([sp]) => !process.env.SPECIES || process.env.SPECIES.split(',').includes(sp));
const server = await createServer({ configFile: 'experiments/2-5d-game/diag/vite.diag.config.ts', logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 180000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const page = await browser.newPage();
await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 2, isMobile: true });
page.on('pageerror', (e) => errs.push(String(e)));
await page.evaluateOnNewDocument(() => localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic','arrow','obstacle','crate','long','hearts','key','sleep','bomb'])));

const measure = () => page.evaluate(async () => {
  const THREE = { Vector3: window.__game.scene().position.constructor };
  const camera = window.__diagCamera;
  const canvas = document.querySelector('canvas');
  const rect = canvas.getBoundingClientRect();
  const toScreen = (p) => { const q = p.clone().project(camera); return [rect.left + ((q.x + 1) / 2) * rect.width, rect.top + ((1 - q.y) / 2) * rect.height]; };
  const boxes = new Map();
  const alphaBox = (img) => {
    if (boxes.has(img.src)) return boxes.get(img.src);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let x0 = img.width, x1 = -1, y0 = img.height, y1 = -1;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (d[(y * img.width + x) * 4 + 3] > 127) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    // the feet: middle of the lowest opaque row
    let fx0 = img.width, fx1 = -1;
    for (let x = 0; x < img.width; x++) if (d[(y1 * img.width + x) * 4 + 3] > 127) { fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); }
    const b = { w: img.width, h: img.height, x0, x1, y0, y1, fx: (fx0 + fx1) / 2 };
    boxes.set(img.src, b);
    return b;
  };
  const out = [];
  const views = window.__game.views();
  for (const [id, view] of views) {
    view.group.traverse((o) => {
      if (!o.isMesh || !o.userData.spriteCard || !o.visible) return;
      const img = o.material.map?.image;
      if (!img?.width) return;
      const b = alphaBox(img);
      o.updateWorldMatrix(true, false);
      // plane geometry is 1x1 centred: pixel (px, py) -> local (px / w - 0.5, 0.5 - py / h)
      const at = (px, py) => new THREE.Vector3(px / b.w - 0.5, 0.5 - py / b.h, 0).applyMatrix4(o.matrixWorld);
      const corners = [at(b.x0, b.y0), at(b.x1 + 1, b.y0), at(b.x0, b.y1 + 1), at(b.x1 + 1, b.y1 + 1)].map(toScreen);
      const feet = toScreen(at(b.fx, b.y1 + 1));
      const root = o.parent.parent;
      const r = root.getWorldPosition(new THREE.Vector3());
      const floor0 = toScreen(r.clone().setY(0)), floorTop = toScreen(r.clone().setY(0.1));
      const plateFront = toScreen(r.clone().setY(0.1).add(new THREE.Vector3(Math.sin(root.rotation.y) * 0, 0, 0.51)));
      const cellL = toScreen(r.clone().setY(0.1).add(new THREE.Vector3(-0.5, 0, 0))), cellR = toScreen(r.clone().setY(0.1).add(new THREE.Vector3(0.5, 0, 0)));
      const camDist = r.distanceTo(camera.getWorldPosition(new THREE.Vector3()));
      const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
      out.push({ id, ...o.userData.diag, block: [r.x, r.z], camDist, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], feet, floor0, floorTop, plateFront, cellPx: cellR[0] - cellL[0], cardDepth: o.getWorldPosition(new THREE.Vector3()).clone().project(camera).z });
    });
  }
  return out;
});

const setCards = (on) => page.evaluate((on) => window.__game.scene().traverse((o) => { if (o.isMesh && o.userData.spriteCard) o.material.visible = on; }), on);
for (const [sp, len] of SCENES) {
  for (const mode of MODES) {
    const name = `${sp}-${mode}`;
    try {
      await page.goto(`http://localhost:5431/?demo=sheet&species=${Array(ROWS).fill(sp).join(',')}&len=${len}&cardmode=${mode}${EXTRA}`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForFunction(() => window.__game && window.__diagCamera, { timeout: 20000 });
      await sleep(1500);
      const cards = await measure();
      await page.screenshot({ path: `${OUT}/${name}-on.png` });
      await setCards(false); await sleep(250);
      await page.screenshot({ path: `${OUT}/${name}-off.png` });
      await setCards(true);
      writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ species: sp, len, mode, view: [VW, VH], cards }, null, 1));
      console.log(name, cards.length, 'cards');
    } catch (e) { errs.push(`${name}: ${e.message}`); }
  }
}
// crowded mixed board (adjacent animals, one in front of another), current renderer and the two alternatives
for (const mode of MODES) {
  await page.goto(`http://localhost:5431/?demo=dirs&cardmode=${mode}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__diagCamera, { timeout: 20000 }).catch(() => {});
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/dirs-${mode}-on.png` });
  writeFileSync(`${OUT}/dirs-${mode}.cards.json`, JSON.stringify(await measure(), null, 1));
}
console.log('page errors:', errs.length ? errs : 'none');
await browser.close(); await server.close();
