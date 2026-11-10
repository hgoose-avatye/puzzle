import type { ApplyResult, Currency, Wallet, WalletOp } from './types';

/** localStorage behind try/catch (private mode, blocked storage). */
export const store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch { return fallback; }
  },
  set(key: string, value: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};

/** The local wallet's keys: the same ones the web build has always used (game/economy.ts before the platform layer). */
export const WALLET_KEY = 'animal-rescue-wallet';
export const ITEMS_KEY = 'animal-rescue-items';
/** 3 of each item to start (사천팝 START: 힌트·섞기 3). Coins start at 0. */
const START_ITEMS = { hint: 3, undo: 3 };
const ITEM: Partial<Record<Currency, 'hint' | 'undo'>> = { powerup_hint: 'hint', powerup_undo: 'undo' };

/**
 * The local wallet (사천팝 LocalWallet) — web preview and Toss before the server wallet (serverReady:false).
 * One id+currency is applied once (the server's idempotency key). Coins stay in {coin, seen} and the items in
 * {hint, undo}, as before, so a saved web game keeps its balance. apply() settles synchronously (the promise is
 * already decided when it returns), so callers may read get() right after.
 */
export class LocalWallet implements Wallet {
  private subs: Array<() => void> = [];

  get(c: Currency): number {
    const item = ITEM[c];
    if (item) return { ...START_ITEMS, ...store.get<Partial<typeof START_ITEMS>>(ITEMS_KEY, {}) }[item] ?? 0;
    return store.get<{ coin: number }>(WALLET_KEY, { coin: 0 }).coin ?? 0;
  }
  onChange(cb: () => void): void { this.subs.push(cb); }
  apply(op: WalletOp): Promise<ApplyResult> {
    const w = store.get<{ coin: number; seen: string[] }>(WALLET_KEY, { coin: 0, seen: [] });
    w.seen ??= [];
    const idem = op.currency === 'coin' ? op.id : `${op.id}:${op.currency}`;
    if (w.seen.includes(idem)) return Promise.resolve('ok');
    const next = this.get(op.currency) + op.amount;
    if (next < 0) return Promise.resolve('insufficient');
    const item = ITEM[op.currency];
    if (item) store.set(ITEMS_KEY, { ...START_ITEMS, ...store.get<Partial<typeof START_ITEMS>>(ITEMS_KEY, {}), [item]: next });
    else w.coin = next;
    w.seen.push(idem);
    if (w.seen.length > 300) w.seen.splice(0, w.seen.length - 300);
    store.set(WALLET_KEY, w);
    this.subs.forEach((f) => f());
    return Promise.resolve('ok');
  }
}
