import cfg from '../../game.config.json';
import { createAitEconomy } from './economy-toss.mjs';
import { CATALOG } from './catalog';
import { LocalWallet, store } from './local';
import { type Econ, ServerWallet, makeDeliver, sleep } from './server-wallet';
import { gfLog, sdk } from './sdk';
import type { AdResult, Platform, RvSlot, SaveState, ShopProduct } from './types';

/**
 * Apps in Toss (사천팝 ~/sachunpop src/platform/toss.ts, the same rules):
 *  serverReady=false : GfSDK.init once (ads and logs) + the local wallet. No hub, IAP or leaderboard.
 *  serverReady=true  : createAitEconomy owns init, the wallet and IAP; the hub callbacks go in through an SDK Proxy.
 * Lives and the gift box stay local saved state; with the server they travel in the saved state (/state/save).
 */
const GAME_API = 'https://kzqkpbmdiyyvcsssktzc.supabase.co/functions/v1/game';
const SERVER = cfg.serverReady === true;
const LOCAL_STATE_AT = 'animal-rescue:toss:state-at';

/** The game's own popups (modal.ts card, the result card) or an SDK screen are up. */
let sdkPaused = false;
const popupOpen = (): boolean => sdkPaused
  || [document.getElementById('modal'), document.getElementById('popup')].some((e) => !!e && !e.hidden);
/** An SDK screen covers the game: the gift box stops counting (livesUi checks body.sdk-paused). */
const setSdkPause = (v: boolean): void => { sdkPaused = v; document.body.classList.toggle('sdk-paused', v); };

async function tossAd(kind: 'rv' | 'interstitial', placementId: string, initDone: Promise<unknown>): Promise<AdResult> {
  await Promise.race([initDone, sleep(5000)]);
  const g = sdk();
  if (!g?.ad) return { rewarded: false, noFill: true };
  try {
    await g.ad.preload({ kind, placementId });
    const r = kind === 'rv' ? await g.ad.showRewarded({ placementId }) : await g.ad.showInterstitial({ placementId });
    // grantBasis earned / unverified count as rewarded; no_fill grants nothing (Toss policy, as tilepop / 사천팝)
    return { rewarded: !!r?.rewarded && !r?.noFill, noFill: !!r?.noFill };
  } catch {
    return { rewarded: false, noFill: true };
  }
}

async function stateCall(path: string, body: unknown, keepalive = false): Promise<any> {
  const token = sdk()?.getToken?.();
  if (!token) throw new Error('no token');
  const res = await fetch(GAME_API + path, {
    method: 'POST', cache: 'no-store', keepalive,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('HTTP_' + res.status);
  return res.json();
}

export function createTossPlatform(): Platform {
  const env = cfg.env === 'live' ? 'live' : 'test';
  const tossOpts = { proxyBase: cfg.apiBase, env, adSubstitutions: cfg.ads.substitutions ?? {} };
  const w = window as any;
  w.__gfRoundActive = false;
  let idle = true;
  let initDone: Promise<unknown> = Promise.resolve(null);
  let econ: Econ | null = null;
  let serverWallet: ServerWallet | null = null;
  let resolveReady!: (v: unknown) => void;
  const econReady = new Promise((r) => { resolveReady = r; });
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let firstDirtyAt = 0;
  let lastKey = '';
  let serverLoaded = false;
  let lastLocal: SaveState | null = null;
  let productsLoaded = false;
  let deliver: (g: any) => Promise<boolean> = async () => false;

  if (SERVER) {
    // reward UX v2 (SDK 0.35+, GAME-INTEGRATION §8.9): the Toss login only from a player action (loginTiming "explicit")
    const options = () => ({
      gameId: cfg.gameId, platform: 'toss', apiBase: cfg.apiBase, toss: { ...tossOpts, loginTiming: 'explicit' }, debug: false,
      analytics: { enabled: true, deploymentId: `${cfg.appName}-${env}-2026-11` },
      ...(cfg.leaderboardEntryUrl ? { leaderboard: { entryUrl: cfg.leaderboardEntryUrl, scoreLabel: '레벨', badge: 'top-left', font: false } } : {}),
      ...(cfg.promotionCode ? { reward: { promotionCode: cfg.promotionCode } } : {}),
    });
    // the shared reward window (missions, 7-day attendance, alerts, grant toasts, the mission badge), made once;
    // its look is game/sdk-skin.css (.gf-rx-*), its icons window.__gfRewardIcons (game/sdk-skin.ts)
    const rewardView = () => w.__animalRescueRewardView ??= sdk()?.reward?.createView?.({
      gameId: cfg.gameId, gameName: cfg.title, platform: 'toss', badge: 'top-left',
      icons: () => w.__gfRewardIcons || {},
    });
    // economy.mjs JSON-copies options, losing functions (hub callbacks, the view) -> only init is intercepted to add them
    const hub = {
      // font: false = the SDK does not fetch Google Fonts; sdk-skin.css sets the game's Jua
      uxVersion: 2, econ: 4, autoOpen: false, badge: 'top-left', font: false,
      idle: () => idle && !popupOpen(),
      items: { deliver: (g: any) => deliver(g) },
    };
    const withReward = (opts: any) => {
      if (!opts.reward) return opts;
      const view = rewardView();
      return view ? { ...opts, reward: { ...opts.reward, hub, view, pause: (p: boolean) => setSdkPause(!!p) } } : opts;
    };
    const real = sdk();
    const proxied = real && new Proxy(real, {
      get(t, k) {
        if (k === 'init') return (opts: any) => t.init(withReward(opts));
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    econ = createAitEconomy({ sdk: proxied, options }) as Econ;
    serverWallet = new ServerWallet(econ);
    deliver = makeDeliver(econReady, econ, serverWallet, (idem) => { try { sdk()?.promoHub?.ackItem(idem); } catch { /* ignore */ } });
    window.addEventListener('pagehide', () => econ?.close());
    // attendance items are put in the wallet by the server (delivery "wallet_snapshot"): just read it again
    try { real?.on?.('attendance-granted', (e: any) => { if (e?.delivery === 'wallet_snapshot') serverWallet?.refresh(); }); } catch { /* old SDK */ }
  }

  const platform: Platform = {
    channel: 'toss',
    // sachunpop keeps 52px for the Toss bar; here the CSS does it: --toss-top = max(safe area, --gf-ait-top) + 56px
    navInset: 56,
    wallet: serverWallet ?? new LocalWallet(),
    async init() {
      if (!SERVER) {
        const g = sdk();
        if (g?.init) {
          initDone = Promise.resolve()
            .then(() => g.init({ gameId: cfg.gameId, platform: 'toss', apiBase: cfg.apiBase, toss: tossOpts, debug: false }))
            .catch((e: unknown) => { console.warn('[GfSDK] toss init failed — local mode', e); return null; });
        }
        return;
      }
      // boot fails -> retry with backoff (2s..60s). Until then the wallet is null (= connecting).
      const delays = [2000, 5000, 10000, 30000, 60000];
      let first: ((v: unknown) => void) | null = null;
      initDone = new Promise((r) => { first = r; });
      const attempt = async (n: number): Promise<void> => {
        try {
          await econ!.boot();
          serverWallet!.refresh();
          serverWallet!.resumePending();
          resolveReady(true);
          first?.(true); first = null;
          if (n > 0 && !serverLoaded) {
            stateCall('/state/load', {}).then((r) => {
              if (!r?.ok) return;
              const cur = lastLocal;
              if (!r.found || (cur?.savedAt ?? 0) >= (r.state?.savedAt ?? 0)) { serverLoaded = true; if (cur) platform.saveState(cur); }
              else gfLog('state-conflict-server-newer', { server: r.state?.savedAt, local: cur?.savedAt });
            }).catch(() => {});
          }
        } catch (e: unknown) {
          gfLog('economy-boot-failed', { code: (e as any)?.code, attempt: n });
          first?.(null); first = null; // the first failure still lets loadState go on (local)
          setTimeout(() => void attempt(n + 1), delays[Math.min(n, delays.length - 1)]);
        }
      };
      void attempt(0);
    },
    /** Server state when it is newer than this device's last save, else null (keep the local keys). */
    async loadState() {
      if (!SERVER) return null;
      const localAt = store.get<number>(LOCAL_STATE_AT, 0);
      try {
        await Promise.race([initDone, sleep(8000)]);
        const r = await stateCall('/state/load', {});
        if (r?.ok) serverLoaded = true;
        const s = r?.state;
        if (r?.ok && r.found && s && typeof s === 'object' && s.keys && typeof s.keys === 'object') {
          // the later save wins (a server save that landed late keeps this device's progress)
          if (localAt > (Number(s.savedAt) || 0)) return null;
          return s as SaveState;
        }
      } catch { /* no server -> local */ }
      return null;
    },
    saveState(s: SaveState, urgent = false) {
      s.savedAt = Date.now();
      lastLocal = s;
      if (!SERVER) return;
      store.set(LOCAL_STATE_AT, s.savedAt);
      const flush = (keepalive: boolean) => {
        clearTimeout(saveTimer);
        firstDirtyAt = 0;
        if (!serverLoaded) return; // never overwrite before the server state was read (another device's progress)
        const snap = JSON.parse(JSON.stringify(s)) as SaveState;
        const key = JSON.stringify({ ...snap, savedAt: 0 });
        if (lastKey === key) return;
        lastKey = key;
        stateCall('/state/save', { level: snap.level, state: snap }, keepalive).catch(() => { lastKey = ''; });
      };
      // debounce 2 s, at most 10 s, at once (keepalive) when the page goes to the background
      if (urgent) { flush(true); return; }
      if (!firstDirtyAt) firstDirtyAt = Date.now();
      clearTimeout(saveTimer);
      if (Date.now() - firstDirtyAt >= 10000) { flush(false); return; }
      saveTimer = setTimeout(() => flush(false), 2000);
    },
    showRewarded: (slot: RvSlot) => tossAd('rv', cfg.ads.rv[slot], initDone),
    roundStart(level) {
      w.__gfRoundActive = true;
      gfLog('game-start', { stage: level });
      if (!SERVER) return;
      const r = sdk()?.reward;
      try { r?.beginRound?.(); r?.setRoundActive?.(true); } catch { /* no reward config */ }
    },
    roundEnd(level, durationMs) {
      w.__gfRoundActive = false;
      gfLog('game-end', { stage: level, durationMs });
      if (!SERVER) return;
      const g = sdk();
      try { g?.reward?.setRoundActive?.(false); } catch { /* no reward config */ }
      const sessionAtEnd = g?.getSession?.();
      // v2 counts guest rounds too (server capability), so it is sent without a session (§8.9); exactly once, no retry
      if (cfg.promotionCode && (sessionAtEnd || g?.reward?.isV2?.()) && typeof g?.reward?.gameEnd === 'function') {
        Promise.resolve(g.reward.gameEnd()).catch(() => gfLog('promo-error', { source: 'game', where: 'gameEnd', reason: 'report_failed' }));
      }
      if (cfg.leaderboardEntryUrl && level > 0 && g?.leaderboard?.submit) Promise.resolve(g.leaderboard.submit(level)).catch(() => {});
    },
    setIdle(v: boolean) { idle = v; if (v) w.__gfRoundActive = false; },
    shop: {
      async products(): Promise<ShopProduct[]> {
        let list = CATALOG.slice();
        const owned: string[] = econ?.getSnapshot()?.skus ?? [];
        list = list.filter((p) => !(p.once && owned.includes(p.sku)));
        try {
          const items = await w.AppsInToss?.IAP?.getProductItemList?.();
          const arr = Array.isArray(items) ? items : items?.products;
          if (Array.isArray(arr) && arr.length) {
            const bySku = new Map(arr.map((p: any) => [p.sku, p]));
            list = list.filter((p) => bySku.has(p.sku)).map((p) => ({ ...p, price: (bySku.get(p.sku) as any)?.displayAmount ?? p.price }));
            productsLoaded = list.length > 0;
          }
        } catch { productsLoaded = false; }
        return list;
      },
      ready: () => SERVER && cfg.consoleRegistered === true && productsLoaded && econ?.getSnapshot()?.shopReady === true,
      notReadyReason: () => (!SERVER || !cfg.consoleRegistered ? '상점 준비 중이에요. 곧 열릴 예정이에요!' : '상점 연결을 확인하고 있어요. 잠시 후 다시 시도해 주세요.'),
      async buy(sku: string) {
        if (!econ) return false;
        try {
          const r = await econ.buy({ sku, quantity: 1, currency: 'coin' });
          serverWallet?.refresh();
          if (r?.success !== true) { await econ.recover().catch(() => {}); serverWallet?.refresh(); }
          return r?.success === true;
        } catch {
          await econ.recover().catch(() => {});
          serverWallet?.refresh();
          return false;
        }
      },
      async restore() {
        if (!econ) return false;
        try { await econ.recover(); serverWallet?.refresh(); return true; } catch { serverWallet?.refresh(); return false; }
      },
    },
    log: gfLog,
  };
  return platform;
}
