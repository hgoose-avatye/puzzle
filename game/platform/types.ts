/**
 * The platform layer (사천팝 ~/sachunpop src/platform/types.ts, trimmed to this game): which channel the build is,
 * the coin/item wallet, rewarded ads, the IAP shop, round start/end, logging and the saved state. The web build
 * (npm run dev:game / build:game) is the local wallet and a mock ad; the Toss build (npm run build:toss) is GfSDK.
 */
export type Channel = 'web' | 'toss';
/** Server wallet currencies: coins and the two items (힌트 · 되돌리기). */
export type Currency = 'coin' | 'powerup_hint' | 'powerup_undo';
export type Reason = 'ad' | 'mission' | 'play' | 'shop' | 'use';
/** Rewarded ad slots (game.config.json ads.rv): the hearts popup and the gift box. */
export type RvSlot = 'heart' | 'chest';

export interface WalletOp {
  id: string;
  currency: Currency;
  amount: number;
  reason: Reason;
  ref?: string;
}
export type ApplyResult = 'ok' | 'insufficient' | 'error';

export interface Wallet {
  /** Balance on screen. null = not known yet (server connecting / failed) — never treat it as 0. */
  get(c: Currency): number | null;
  /** strict=true: an uncertain failure is 'error' (the coin leg of a purchase). By default an uncertain spend is 'ok'. */
  apply(op: WalletOp, strict?: boolean): Promise<ApplyResult>;
  /** true for the server wallet (the start items are granted by the server). */
  readonly server?: boolean;
  onChange(cb: () => void): void;
}

export interface AdResult { rewarded: boolean; noFill?: boolean }

/**
 * Saved progress apart from the wallet: this game keeps it in its own localStorage keys (animal-rescue-*), so the
 * state is a copy of those keys. With the server wallet it goes to gf_player_state.state (as 사천팝 SaveState).
 */
export interface SaveState {
  keys: Record<string, string>;
  /** the highest level reached (the server's level column) */
  level: number;
  savedAt?: number;
}

export interface ShopProduct {
  sku: string;
  title: string;
  coins: number;
  adFreeDays: number;
  price: string;
  once?: boolean;
}

export interface Platform {
  channel: Channel;
  /** room above the game kept for the Apps in Toss bar (px). The CSS keeps it with --toss-top. */
  navInset: number;
  wallet: Wallet;
  init(): Promise<void>;
  loadState(): Promise<SaveState | null>;
  /** urgent=true: send now (keepalive), e.g. the page going to the background */
  saveState(s: SaveState, urgent?: boolean): void;
  showRewarded(slot: RvSlot): Promise<AdResult>;
  roundStart(level: number): void;
  roundEnd(level: number, durationMs: number): void;
  /** true on the title with no popup: the SDK may show its own screens then */
  setIdle(idle: boolean): void;
  shop: {
    products(): Promise<ShopProduct[]>;
    /** false: the buy buttons say notReadyReason() instead of paying */
    ready(): boolean;
    notReadyReason(): string;
    buy(sku: string): Promise<boolean>;
    /** re-deliver a purchase that was paid but not granted; absent = no button */
    restore?(): Promise<boolean>;
  };
  log(event: string, data?: Record<string, unknown>): void;
}

export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
