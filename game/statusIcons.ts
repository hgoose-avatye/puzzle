import * as THREE from 'three';

/**
 * 2.5D status icons over an animal (status UI decided 2026-11-05, plan B): the clay icon itself, no bubble, medal or
 * pointer. A count bomb shows its remaining count on its own ball. Drawn on a canvas at a fixed size on the screen
 * (css px), so the count stays 12px tall on every board; the sprite size comes from statusPixelScale().
 * Icons: game/public/assets/status (cut from the delivered pictures, fully opaque, cream outline).
 */

/** The badge tokens main.ts passes (shared with Classic 3D) and the icon each one shows. */
const ICON_OF: Record<string, 'bomb' | 'key' | 'lock' | 'sleep'> = { '💣': 'bomb', '🔑': 'key', '🔒': 'lock', '💤': 'sleep' };
/** Height on the screen in css px. The bomb is taller so that its ball (0.5781 of its height) holds "18" at 17px. */
const ICON_H = { key: 24, lock: 24, sleep: 24, bomb: 28 / 0.5781 };
/** Width / height of each picture (fixed, so the layout does not depend on the image having loaded). */
const ASPECT = { key: 118 / 192, lock: 170 / 192, sleep: 224 / 192, bomb: 154 / 192 };
/** Where the ball is in bomb.png, as fractions of the picture (measured when the icon was cut). */
const BOMB = { cx: 0.4448, cy: 0.651 };
/** Count digits: Pretendard Bold 17px = 12.35px tall digits, cream white on the dark ball. */
const COUNT_FONT_PX = 17;
const COUNT_COLOR = '#fff8e8';
const GAP = 2;
/** Canvas pixels per css px (sharp up to a 3x screen). */
const RES = 3;

const images = new Map<string, HTMLImageElement>();
function image(name: string): HTMLImageElement {
  let img = images.get(name);
  if (!img) {
    img = new Image();
    img.src = `/assets/status/${name}.png`;
    images.set(name, img);
  }
  return img;
}
for (const name of new Set(Object.values(ICON_OF))) image(name);

/**
 * Key only (2026-11-05): a dark brown line on the inside edge of the orange body, just within the cream outline, so the
 * key holds its shape on yellow and orange animals. Orange is an opaque pixel whose blue is under creamBlue; the line
 * follows only the cream that reaches the clear pixels, so a light spot inside the body gets none. px is in key.png
 * pixels: 192 tall drawn 72 canvas px tall, so 5 is about 2 canvas px (0.67 css px).
 */
const KEY_LINE = { r: 0x75, g: 0x45, b: 0x2f, px: 5, creamBlue: 140 };
let lineKey: HTMLCanvasElement | null = null;
function keyWithLine(img: HTMLImageElement): HTMLCanvasElement {
  if (lineKey) return lineKey;
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  const opaque = (i: number): boolean => d[i * 4 + 3] >= 128;
  const orange = (i: number): boolean => opaque(i) && d[i * 4 + 2] < KEY_LINE.creamBlue;
  // the clear pixels and the cream joined to them
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) if (!opaque(i)) { outside[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i - x) / w;
    const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of next) if (j >= 0 && !outside[j] && !orange(j)) { outside[j] = 1; stack.push(j); }
  }
  const R = KEY_LINE.px;
  const nearOutside = (x: number, y: number): boolean => {
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const nx = x + dx, ny = y + dy;
      if (dx * dx + dy * dy <= R * R && nx >= 0 && nx < w && ny >= 0 && ny < h && outside[ny * w + nx]) return true;
    }
    return false;
  };
  const line: number[] = [];
  for (let i = 0; i < w * h; i++) if (orange(i) && nearOutside(i % w, Math.floor(i / w))) line.push(i);
  for (const i of line) {
    d[i * 4] = KEY_LINE.r;
    d[i * 4 + 1] = KEY_LINE.g;
    d[i * 4 + 2] = KEY_LINE.b;
  }
  ctx.putImageData(data, 0, 0);
  lineKey = c;
  return c;
}

const fontOf = (px: number): string => `700 ${px}px Pretendard, system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif`;

let pixelScale = 0;
/** Sprite scale per css px for a sprite with sizeAttenuation off: 2 / (projection[1][1] x canvas height in css px). */
export function setStatusPixelScale(v: number): void {
  pixelScale = v;
}
export const statusPixelScale = (): number => pixelScale;

/** The icons for these badge tokens side by side on one bottom line, the count on the bomb's ball; size in css px. */
export function statusTexture(items: string[], count?: number): { tex: THREE.CanvasTexture; w: number; h: number } {
  const names = items.map((it) => ICON_OF[it]).filter((n) => n !== undefined);
  const imgs = names.map(image);
  const widthOf = (i: number): number => ICON_H[names[i]] * ASPECT[names[i]];
  const h = Math.max(...names.map((n) => ICON_H[n]));
  const w = names.reduce((sum, _, i) => sum + widthOf(i), 0) + GAP * Math.max(0, names.length - 1);
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * RES);
  c.height = Math.ceil(h * RES);
  const ctx = c.getContext('2d')!;
  const paint = (): void => {
    ctx.clearRect(0, 0, c.width, c.height);
    let x = 0;
    names.forEach((name, i) => {
      const iw = widthOf(i), ih = ICON_H[name];
      const img = imgs[i];
      if (img.complete && img.naturalWidth) ctx.drawImage(name === 'key' ? keyWithLine(img) : img, x * RES, (h - ih) * RES, iw * RES, ih * RES);
      if (name === 'bomb' && count !== undefined) {
        ctx.font = fontOf(COUNT_FONT_PX * RES);
        ctx.fillStyle = COUNT_COLOR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(count), (x + iw * BOMB.cx) * RES, (h - ih + ih * BOMB.cy) * RES + RES);
      }
      x += iw + GAP;
    });
  };
  paint();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // pictures or the font still loading: draw again when they arrive
  const later: Promise<unknown>[] = imgs.filter((img) => !img.complete).map((img) => img.decode().catch(() => undefined));
  if (count !== undefined && !document.fonts.check(fontOf(COUNT_FONT_PX))) later.push(document.fonts.load(fontOf(COUNT_FONT_PX), '0123456789'));
  if (later.length) void Promise.all(later).then(() => { paint(); tex.needsUpdate = true; });
  return { tex, w, h };
}

/**
 * Count dynamite on 2-3 cell bodies (2.5D, 2026-11-05; one-cell animals carry no bombs): the bundle picture and, apart from it, the screen plate with the
 * count, so the plate can be drawn over everything while the bundle stays behind the blocks in front of it.
 * Sizes in css px; the count is the same 17px Pretendard Bold as the bomb icon.
 */
export const DYNAMITE = {
  w: 64 * (796 / 788), // whole picture; its opaque bundle is 64 css px wide
  aspect: 522 / 796,
  screen: { cx: 0.5558, cy: 0.5413, d: 373 / 796 },
};
export function dynamiteBundleTexture(): THREE.CanvasTexture {
  const w = DYNAMITE.w, h = w * DYNAMITE.aspect;
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * RES);
  c.height = Math.ceil(h * RES);
  const ctx = c.getContext('2d')!;
  const img = image('count_dynamite');
  const paint = (): void => {
    ctx.clearRect(0, 0, c.width, c.height);
    if (img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, c.width, c.height);
  };
  paint();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (!img.complete) void img.decode().catch(() => undefined).then(() => { paint(); tex.needsUpdate = true; });
  return tex;
}
export function dynamiteScreenTexture(count: number): { tex: THREE.CanvasTexture; size: number } {
  const size = DYNAMITE.w * DYNAMITE.screen.d;
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * RES);
  const ctx = c.getContext('2d')!;
  const img = image('count_dynamite_screen');
  const paint = (): void => {
    ctx.clearRect(0, 0, c.width, c.height);
    if (img.complete && img.naturalWidth) ctx.drawImage(img, 0, 0, c.width, c.height);
    ctx.font = fontOf(COUNT_FONT_PX * RES);
    ctx.fillStyle = COUNT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), c.width / 2, c.height / 2 + RES);
  };
  paint();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const later: Promise<unknown>[] = img.complete ? [] : [img.decode().catch(() => undefined)];
  if (!document.fonts.check(fontOf(COUNT_FONT_PX))) later.push(document.fonts.load(fontOf(COUNT_FONT_PX), '0123456789'));
  if (later.length) void Promise.all(later).then(() => { paint(); tex.needsUpdate = true; });
  return { tex, size };
}
