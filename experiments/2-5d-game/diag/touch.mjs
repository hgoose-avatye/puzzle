// node experiments/2-5d-game/diag/touch.mjs — DIAGNOSIS ONLY: does a tap select the animal the player sees there?
// For a grid of screen points over the board (real game camera, diag/vite.diag.config.ts) it compares
//   pick     the animal the game's own rule selects (main.ts animalAt: first drawn hit on the views' tapTargets, else
//            the closest animal within 0.75 cell of the floor point)
//   visible  the animal actually drawn there (first hit along the ray that is an opaque card texel or a plate/badge;
//            the floor or an obstacle first means none)
//   floor    the animal whose occupied cell is under the floor point
// in card modes A and C, each with and without the alpha-aware hit test (?alphahit=1). Then it taps (real touch events)
// on some points where pick and visible differ and reads which animal started to run. Writes out-diag/touch.json.
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const OUT = 'experiments/2-5d-game/out-diag';
const [VW, VH] = (process.env.VIEW ?? '390x844').split('x').map(Number);
const SCENES = (process.env.SCENES ?? 'demo=dirs,level=20,level=60,level=120').split(',');
const VARIANTS = [['A', 0], ['A', 1], ['C', 0], ['C', 1]];
const server = await createServer({ configFile: 'experiments/2-5d-game/diag/vite.diag.config.ts', logLevel: 'error' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 180000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const page = await browser.newPage();
await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => errs.push(String(e)));
await page.evaluateOnNewDocument(() => localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic','arrow','obstacle','crate','long','hearts','key','sleep','bomb'])));
const open = async (scene, mode, alpha) => {
  await page.goto(`http://localhost:5431/?${scene}&cardmode=${mode}&alphahit=${alpha}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__diagCamera && window.__diagThree, { timeout: 20000 });
  await sleep(1300);
};

const sample = (step) => page.evaluate((step) => {
  const THREE = window.__diagThree, camera = window.__diagCamera, scene = window.__game.scene();
  const rect = document.querySelector('canvas').getBoundingClientRect();
  const views = window.__game.views();
  const owner = new Map();
  for (const [id, v] of views) if (v.group.visible) for (const t of v.tapTargets()) owner.set(t, id);
  const drawn = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const ownerOf = (o) => { for (; o; o = o.parent) if (owner.has(o)) return owner.get(o); return null; };
  const anyView = views.values().next().value;
  const W = anyView.level.width, H = anyView.level.height;
  const cellOwner = new Map();
  for (const [id, v] of views) if (v.group.visible) for (const c of v.piece.cells) cellOwner.set(`${c.x},${c.y}`, id);
  const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0; return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
  const polyDist = (cells, x, y) => cells.length === 1 ? Math.hypot(x - cells[0].x, y - cells[0].y) : Math.min(...cells.slice(1).map((c, i) => segDist(x, y, cells[i].x, cells[i].y, c.x, c.y)));
  const ray = new THREE.Raycaster(); ray.camera = camera;
  const isCard = (o) => o.userData?.spriteCard;
  const opaque = (h) => { const img = h.object.material?.map?.image; return !isCard(h.object) || !img?.width || !h.uv || window.__diagAlpha(img, h.uv.x, h.uv.y) > 127; };
  const shown = (o) => drawn(o) && o.material?.visible !== false && o.material?.colorWrite !== false;
  const res = { animalPts: 0, ok: 0, other: 0, none: 0, otherViaClear: 0, floorPts: 0, phantom: 0, phantomViaClear: 0, visibleNotFloorOwner: 0, examples: [], good: [] };
  for (let y = rect.top + 2; y < rect.bottom; y += step) for (let x = rect.left + 2; x < rect.right; x += step) {
    ray.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -(((y - rect.top) / rect.height) * 2 - 1)), camera);
    const fp = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1), fp)) continue;
    const gx = fp.x + (W - 1) / 2, gy = fp.z + (H - 1) / 2;
    if (gx < -0.5 || gy < -0.5 || gx > W - 0.5 || gy > H - 0.5) continue;
    // the game's rule
    const tapHit = ray.intersectObjects([...owner.keys()], true).find((h) => drawn(h.object));
    let pick = tapHit ? ownerOf(tapHit.object) : null;
    const viaClear = !!tapHit && isCard(tapHit.object) && !opaque(tapHit);
    if (pick === null) {
      const g0 = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), g0);
      const fx = g0.x + (W - 1) / 2, fy = g0.z + (H - 1) / 2;
      let best = null;
      for (const [id, v] of views) { if (!v.group.visible) continue; const d = polyDist(v.piece.cells, fx, fy); if (d <= 0.75 && (!best || d < best.d)) best = { id, d }; }
      pick = best?.id ?? null;
    }
    // what is drawn there
    let visible = null;
    for (const h of ray.intersectObjects(scene.children, true)) {
      if (!shown(h.object) || h.object.isSprite && !ownerOf(h.object)) continue;
      const id = ownerOf(h.object);
      if (id !== null) { if (!opaque(h)) continue; visible = id; break; }
      if (h.object.isSprite) continue;
      break; // floor, plaza, obstacle, fence: nothing of an animal shows here
    }
    const floorOwner = cellOwner.get(`${Math.round(gx)},${Math.round(gy)}`) ?? null;
    if (visible !== null) {
      res.animalPts++;
      if (visible !== floorOwner) res.visibleNotFloorOwner++;
      if (pick === visible) { res.ok++; if (res.good.length < 400) res.good.push({ x, y, pick, visible }); }
      else {
        if (pick === null) res.none++; else { res.other++; if (viaClear) res.otherViaClear++; }
        if (res.examples.length < 400) res.examples.push({ x, y, pick, visible, floorOwner, viaClear });
      }
    } else {
      res.floorPts++;
      if (pick !== null && pick !== floorOwner) { res.phantom++; if (viaClear) res.phantomViaClear++; }
    }
  }
  return res;
}, step);

const report = {};
for (const scene of SCENES) {
  for (const [mode, alpha] of VARIANTS) {
    const key = `${scene} ${mode}${alpha ? '+alphahit' : ''}`;
    try {
      await open(scene, mode, alpha);
      const r = await sample(4);
      // real taps on points where pick and visible differ and the visible animal can leave: who runs?
      const taps = [];
      const free = await page.evaluate(() => window.__game.free());
      const cands = r.examples.filter((e) => free.includes(e.visible)).filter((_, i) => i % 7 === 0).slice(0, 4);
      for (const e of cands) {
        await open(scene, mode, alpha);
        await page.touchscreen.tap(e.x, e.y);
        await sleep(450);
        const running = await page.evaluate(() => [...window.__game.views().keys()].filter((id) => window.__game.traffic?.get(id)));
        taps.push({ at: [Math.round(e.x), Math.round(e.y)], expected: e.visible, rulePick: e.pick, ran: running, viaClear: e.viaClear });
      }
      // control: real taps where rule and drawing agree on a free animal; it must run
      const controls = r.good.filter((e) => free.includes(e.visible)).filter((_, i) => i % 37 === 0).slice(0, 2);
      for (const e of controls) {
        await open(scene, mode, alpha);
        await page.touchscreen.tap(e.x, e.y);
        await sleep(450);
        const running = await page.evaluate(() => [...window.__game.views().keys()].filter((id) => window.__game.traffic?.get(id)));
        taps.push({ control: true, at: [Math.round(e.x), Math.round(e.y)], expected: e.visible, rulePick: e.pick, ran: running });
      }
      delete r.examples; delete r.good;
      report[key] = { ...r, taps };
      console.log(key, JSON.stringify({ ...r, taps: taps.map((t) => `${t.control ? 'control ' : ''}${t.expected}->${t.ran.join('/') || 'none'}`) }));
    } catch (e) { errs.push(`${key}: ${e.message}`); }
  }
}
writeFileSync(`${OUT}/touch.json`, JSON.stringify(report, null, 1));
console.log('page errors:', errs.length ? errs : 'none');
await browser.close(); await server.close();
