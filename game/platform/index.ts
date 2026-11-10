import { ITEMS_KEY, WALLET_KEY } from './local';
import { createTossPlatform } from './toss';
import type { Platform, SaveState } from './types';
import { createWebPlatform } from './web';

/**
 * The platform this build runs on (사천팝 src/main.ts): `vite build --mode toss` (npm run build:toss) is Apps in Toss,
 * everything else (dev:game, build:game, tests) the web preview. The mode is a build constant, so the web bundle
 * drops the Toss code and needs no SDK.
 */
export const platform: Platform = import.meta.env.MODE === 'toss' ? createTossPlatform() : createWebPlatform();

/**
 * Saved progress (사천팝 SaveState): this game keeps it in its animal-rescue-* localStorage keys — hearts, the gift box,
 * the level reached, lessons seen, settings. The wallet keys are not in it (the server wallet holds those); nor is the
 * dev play log.
 */
const PREFIX = 'animal-rescue-';
const SKIP = new Set([WALLET_KEY, ITEMS_KEY, 'animal-rescue-playlog']);
export function snapshotState(): SaveState {
  const keys: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && !SKIP.has(k)) keys[k] = localStorage.getItem(k) ?? '';
    }
  } catch { /* no storage */ }
  return { keys, level: Math.max(1, Number(keys['animal-rescue-progress']) || 1) };
}
function applyState(s: SaveState): void {
  try {
    for (const [k, v] of Object.entries(s.keys)) if (k.startsWith(PREFIX) && !SKIP.has(k) && typeof v === 'string') localStorage.setItem(k, v);
  } catch { /* no storage */ }
}

if (import.meta.env.MODE === 'toss') {
  // the Apps in Toss bridge (IAP product list) on window, as 사천팝 src/toss-entry.js
  try { (window as any).AppsInToss = await import('@apps-in-toss/web-framework'); } catch (e) { console.warn('[AppsInToss] bridge unavailable', e); }
  // before the game reads its saved keys: start the SDK and take the server's state when it is newer
  await platform.init();
  const s = await platform.loadState();
  if (s) applyState(s);
  const save = (urgent: boolean) => platform.saveState(snapshotState(), urgent);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(true); });
  window.addEventListener('pagehide', () => save(true));
  platform.wallet.onChange(() => save(false));
  window.setInterval(() => save(false), 10_000);
}

/**
 * Server wallet start items (사천팝 ensureStartGrant): 힌트·되돌리기 3 each, idempotency id start:v1:animalrescue,
 * asked on every boot (the server answers DUPLICATE after the first). The local wallet starts with 3 already.
 */
if (import.meta.env.MODE === 'toss' && platform.wallet.server) {
  const tryGrant = async (): Promise<void> => {
    if (platform.wallet.get('powerup_hint') === null) { window.setTimeout(tryGrant, 2000); return; }
    const id = 'start:v1:animalrescue';
    const [a, b] = await Promise.all([
      platform.wallet.apply({ id, currency: 'powerup_hint', amount: 3, reason: 'play', ref: 'start' }),
      platform.wallet.apply({ id, currency: 'powerup_undo', amount: 3, reason: 'play', ref: 'start' }),
    ]);
    if (a !== 'ok' || b !== 'ok') window.setTimeout(tryGrant, 5000);
  };
  void tryGrant();
}

// the SDK screens (missions, ranking, attendance) in the game's cream popup look — Toss only, the web build has no SDK
if (import.meta.env.MODE === 'toss') {
  await import('../sdk-skin.css');
  (await import('../sdk-skin')).installSdkSkin();
}
