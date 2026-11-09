/**
 * Lives (하트) and coins, the same rules as 사천팝 (~/sachunpop src/game/rules.ts, src/platform/local.ts, catalog.ts):
 * at most 5 hearts, one comes back every 20 minutes; giving up a level (a lost level, or leaving one already started)
 * takes one; with none left a level does not start and the hearts popup opens (watch an ad for 1, or 1 coin for a full
 * refill). Coins come only from the shop. Coins, items, ads and the shop go through game/platform: the web build is a
 * local wallet in localStorage, a mock ad and products that cannot be bought; the Toss build (npm run build:toss) is
 * GfSDK (server wallet when serverReady, SDK ads, Apps in Toss IAP).
 */

import { platform } from './platform';
import { uuid as platformUuid, type ApplyResult, type Currency, type Reason, type RvSlot } from './platform/types';

export const HEART_MAX = 5;
export const HEART_REGEN_MS = 20 * 60_000;

export interface Hearts { hearts: number; heartAt: number }

/** Count the time passed. A clock that went backwards (heartAt > now) starts again from now. */
export function settleHearts(h: Hearts, now: number): Hearts {
  const hearts = Math.max(0, Math.min(HEART_MAX, Math.floor(Number(h.hearts) || 0)));
  if (hearts >= HEART_MAX) return { hearts: HEART_MAX, heartAt: 0 };
  const at = h.heartAt > 0 && h.heartAt <= now ? h.heartAt : now;
  const gained = Math.floor((now - at) / HEART_REGEN_MS);
  if (hearts + gained >= HEART_MAX) return { hearts: HEART_MAX, heartAt: 0 };
  return { hearts: hearts + gained, heartAt: at + gained * HEART_REGEN_MS };
}

/** Use one. Spent from full, the refill timer starts now. */
export function spendHeart(h: Hearts, now: number): Hearts {
  const s = settleHearts(h, now);
  if (s.hearts <= 0) return s;
  return { hearts: s.hearts - 1, heartAt: s.hearts >= HEART_MAX ? now : s.heartAt };
}

export function addHearts(h: Hearts, n: number, now: number): Hearts {
  const s = settleHearts(h, now);
  const hearts = Math.min(HEART_MAX, s.hearts + n);
  return { hearts, heartAt: hearts >= HEART_MAX ? 0 : s.heartAt };
}

/** ms until the next heart, null when full. */
export function msUntilNextHeart(h: Hearts, now: number): number | null {
  const s = settleHearts(h, now);
  return s.hearts >= HEART_MAX ? null : Math.max(0, s.heartAt + HEART_REGEN_MS - now);
}

export const mmss = (ms: number): string => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const HEARTS_KEY = 'animal-rescue-lives';

const read = <T>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown): void => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } };

/** The saved hearts, settled to now. */
export const lives = {
  get(): Hearts {
    const saved = read<Hearts>(HEARTS_KEY, { hearts: HEART_MAX, heartAt: 0 });
    return settleHearts(saved, Date.now());
  },
  set(h: Hearts): void { write(HEARTS_KEY, h); subs.forEach((f) => f()); },
  spend(): Hearts { const h = spendHeart(lives.get(), Date.now()); lives.set(h); return h; },
  add(n: number): Hearts { const h = addHearts(lives.get(), n, Date.now()); lives.set(h); return h; },
};

const subs: Array<() => void> = [];
export const onEconomyChange = (cb: () => void): void => { subs.push(cb); };

export type { ApplyResult } from './platform/types';
export { CATALOG } from './platform/catalog';
export type { ShopProduct } from './platform/types';

/**
 * The coin wallet goes through the platform (game/platform): the web build keeps the local wallet (사천팝 LocalWallet,
 * the same localStorage keys as before: one operation id is applied once); the Toss build uses the server wallet
 * when game.config.json serverReady is on.
 */
platform.wallet.onChange(() => subs.forEach((f) => f()));
export const wallet = {
  /** The balance; null while the server wallet is not known yet (connecting). */
  balance(): number | null { return platform.wallet.get('coin'); },
  coins(): number { return platform.wallet.get('coin') ?? 0; },
  /** strict (default): an uncertain spend is an error, as 사천팝 does for coin purchases. */
  apply(id: string, amount: number, ref?: string): Promise<ApplyResult> {
    return platform.wallet.apply({ id, currency: 'coin', amount, reason: amount < 0 ? 'shop' : 'ad', ...(ref ? { ref } : {}) }, true);
  },
};

export const uuid = (): string => platformUuid();

/** Rewarded ad through the platform (web: the mock ad, ?nofill=1 fails to fill; Toss: the SDK ad of the slot). */
export async function showRewarded(slot: RvSlot = 'heart'): Promise<boolean> {
  const r = await platform.showRewarded(slot);
  platform.log('rv-result', { slot, rewarded: r.rewarded, noFill: !!r.noFill });
  return r.rewarded;
}

/**
 * Items (사천팝's 힌트·섞기 become 힌트·되돌리기 here): counts kept across levels, 3 of each to start. A hint shown uses
 * one; 되돌리기 uses the level's own 3 first and then one from here. They live in the platform wallet (as 사천팝:
 * powerup_hint / powerup_undo on the server wallet).
 */
export type Item = 'hint' | 'undo';
const CUR: Record<Item, Currency> = { hint: 'powerup_hint', undo: 'powerup_undo' };
export const items = {
  get(k: Item): number { return platform.wallet.get(CUR[k]) ?? 0; },
  /** null while the server wallet is connecting. */
  known(k: Item): number | null { return platform.wallet.get(CUR[k]); },
  /** Use or add at once (the count changes now; the server call goes on behind). false when there are not enough. */
  add(k: Item, n: number, reason: Reason = n < 0 ? 'use' : 'shop', id: string = uuid()): boolean {
    const cur = platform.wallet.get(CUR[k]);
    if (cur === null || cur + n < 0) return false;
    void platform.wallet.apply({ id, currency: CUR[k], amount: n, reason, ref: (n < 0 ? 'powerup:' : `${reason}:`) + k });
    return true;
  },
  /** A grant whose result matters (the gift box keeps its reward when it fails). */
  grant(k: Item, n: number, reason: Reason, id: string, ref?: string): Promise<ApplyResult> {
    return platform.wallet.apply({ id, currency: CUR[k], amount: n, reason, ...(ref ? { ref } : {}) });
  },
};

/**
 * 선물 상자 (사천팝 보물상자): it fills over 10 minutes of real play (a level on screen, the page visible, no popup,
 * a touch within the last minute), then opens with a rewarded ad for 힌트 +1 and 되돌리기 +2.
 */
export const CHEST_SECONDS = 600;
export const IDLE_CUTOFF_MS = 60_000;
const CHEST_KEY = 'animal-rescue-chest';
export const chest = {
  sec(): number { return Math.max(0, Math.min(CHEST_SECONDS, Number(read<number>(CHEST_KEY, 0)) || 0)); },
  ready(): boolean { return chest.sec() >= CHEST_SECONDS; },
  /** One second of play, when it counts. */
  tick(counts: boolean): void { if (counts && !chest.ready()) { write(CHEST_KEY, chest.sec() + 1); subs.forEach((f) => f()); } },
  reset(): void { write(CHEST_KEY, 0); subs.forEach((f) => f()); },
};
