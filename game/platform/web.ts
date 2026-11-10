import { CATALOG } from './catalog';
import { LocalWallet } from './local';
import type { AdResult, Platform, ShopProduct } from './types';

/** Mock rewarded ad (web preview, 사천팝 web.ts); ?nofill=1 makes it fail to fill. */
function mockAd(): Promise<AdResult> {
  if (/[?&]nofill=1\b/.test(location.search)) return Promise.resolve({ rewarded: false, noFill: true });
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'mockAd';
    el.innerHTML = '<div class="mockAd__box"><b>보상형 광고</b><i class="mockAd__bar"></i></div>';
    document.body.appendChild(el);
    window.setTimeout(() => { el.remove(); resolve({ rewarded: true }); }, 2200);
  });
}

/** The web build (npm run dev:game / build:game): local wallet, mock ad, a shop that cannot take payments. */
export function createWebPlatform(): Platform {
  return {
    channel: 'web',
    navInset: 0,
    wallet: new LocalWallet(),
    async init() {},
    async loadState() { return null; },
    saveState() {},
    showRewarded: () => mockAd(),
    roundStart() {},
    roundEnd() {},
    setIdle() {},
    shop: {
      async products(): Promise<ShopProduct[]> { return CATALOG; },
      ready: () => false,
      notReadyReason: () => '지금은 구매할 수 없어요.',
      async buy() { return false; },
    },
    log() {},
  };
}
