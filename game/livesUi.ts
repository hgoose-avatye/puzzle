/**
 * The lives and coins on screen (as 사천팝): two pills in the top row (하트 n/5 with the time to the next one, 코인),
 * the 하트 충전 popup and the 상점 popup, both in the shared theme popup (modal.ts).
 */
import { CATALOG, CHEST_SECONDS, chest, HEART_MAX, IDLE_CUTOFF_MS, items, lives, mmss, msUntilNextHeart, onEconomyChange, showRewarded, uuid, wallet, type Item, type ShopProduct } from './economy';
import type { Modal } from './modal';
import { platform } from './platform';

const ICON = '/assets/ui/theme/';
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const icon = (file: string, cls = 'resIcon'): HTMLImageElement => { const i = el('img', cls); i.src = ICON + file; i.alt = ''; return i; };

let toastTimer: number | undefined;
/** A short line over everything, for a moment. */
export function toast(text: string): void {
  let t = document.getElementById('toast');
  if (!t) { t = el('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = text;
  t.classList.add('on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('on'), 1600);
}

function button(label: string, role: 'primary' | 'secondary', onClick: () => void, iconFile?: string): HTMLButtonElement {
  const b = el('button', `gb gb-l gb-${role}`);
  if (iconFile) b.append(icon(iconFile, 'ic'));
  b.append(el('span', '', label));
  b.onclick = onClick;
  return b;
}

export class LivesUi {
  private heartsLive: { n: HTMLElement; line: HTMLElement } | null = null;
  private shopBalance: HTMLElement | null = null;
  private lastInputAt = Date.now();
  private owned = new Map<Item, HTMLElement>();

  constructor(private readonly modal: Modal) {
    const bar = $('res');
    const heart = el('button', 'res gp gp-hud');
    heart.id = 'lives';
    heart.setAttribute('aria-label', '하트 충전');
    // the count with the time to the next heart right under it
    const col = el('span', 'resCol');
    col.append(el('b', 'resN'), el('small', 'resT'));
    heart.append(icon('st-heart.webp'), col);
    heart.onclick = () => this.openHearts();
    const coin = el('button', 'res gp gp-hud');
    coin.id = 'coins';
    coin.setAttribute('aria-label', '상점');
    const coinCol = el('span', 'resCol');
    coinCol.append(el('b', 'resN'));
    coin.append(icon('st-coin-star.webp'), coinCol);
    coin.onclick = () => this.openShop();
    bar.append(heart, coin);
    // 선물 상자 (in play, right side above the bottom bar): ready = gift and "광고보고 아이템 받기", else grey with the time left
    const gift = el('button', 'gift');
    gift.id = 'gift';
    gift.append(icon('ic-gift.webp', 'giftIcon'), el('span', 'giftText'));
    gift.onclick = () => this.openChest();
    document.body.append(gift);
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { this.lastInputAt = Date.now(); }, { capture: true, passive: true });
    onEconomyChange(() => this.render());
    window.setInterval(() => {
      // a second of play counts toward the box only on a level, page visible, no popup or ad, a touch within a minute
      const inGame = !document.body.classList.contains('on-title') && $('loading').hidden;
      const popup = !$('modal').hidden || !$('popup').hidden || !!document.querySelector('.mockAd') || document.body.classList.contains('sdk-paused') || !$('interlude').hidden;
      chest.tick(inGame && document.visibilityState === 'visible' && !popup && Date.now() - this.lastInputAt <= IDLE_CUTOFF_MS);
      this.render();
    }, 1000);
    this.render();
  }

  render(): void {
    const h = lives.get();
    const ms = msUntilNextHeart(h, Date.now());
    $('lives').querySelector('.resN')!.textContent = String(h.hearts);
    $('lives').querySelector('.resT')!.textContent = ms === null ? '' : mmss(ms);
    // null = the server wallet is still connecting: '…', and the picture stays as it is
    const c = wallet.balance();
    $('coins').querySelector('.resN')!.textContent = c === null ? '…' : c.toLocaleString('ko-KR');
    // the coin picture grows with the balance, the same steps as the shop's coin products
    if (c !== null) {
      const pic = c <= 10 ? 'st-coin-star.webp' : c <= 55 ? 'st-coins-small.webp' : c <= 120 ? 'st-coins-stack.webp' : c <= 280 ? 'st-coins-tall.webp' : 'st-chest-coins.webp';
      const coinImg = $('coins').querySelector('.resIcon') as HTMLImageElement;
      if (!coinImg.src.endsWith(pic)) coinImg.src = ICON + pic;
    }
    if (this.heartsLive && this.modal.kind === 'hearts') {
      this.heartsLive.n.textContent = `${h.hearts} / ${HEART_MAX}`;
      this.heartsLive.line.textContent = ms === null ? '하트 가득!' : `다음 하트까지 ${mmss(ms)}`;
    }
    const ready = chest.ready();
    const gift = $('gift');
    gift.classList.toggle('ready', ready);
    (gift.querySelector('.giftIcon') as HTMLImageElement).src = ICON + (ready ? 'ic-gift.webp' : 'ic-gift-gray.webp');
    gift.querySelector('.giftText')!.textContent = ready ? '광고보고\n아이템 받기' : `${mmss((CHEST_SECONDS - chest.sec()) * 1000)} 후\n아이템 도착`;
    for (const k of ['hint', 'undo'] as Item[]) { const o = this.owned.get(k); if (o) o.textContent = `보유 ${items.known(k) ?? '…'}개`; }
    if (this.shopBalance && this.modal.kind === 'shop') this.shopBalance.textContent = c === null ? '…' : c.toLocaleString('ko-KR');
  }

  /** True when a level may start; otherwise the hearts popup opens. */
  canPlay(): boolean {
    if (lives.get().hearts > 0) return true;
    this.openHearts();
    return false;
  }

  openHearts(): void {
    const n = el('p', 'livesBig');
    const line = el('p', 'livesLine');
    const card = el('div', 'tpCard livesCard');
    card.append(icon('st-heart.webp', 'livesHero'), n, line, el('p', 'modalNote livesNote', '20분마다 하트가 1개 회복돼요.'));
    const full = (): boolean => { if (lives.get().hearts < HEART_MAX) return false; toast('하트가 이미 가득해요'); return true; };
    let watching = false;
    const watch = button('광고 보고 하트 1개 받기', 'primary', async () => {
      if (full() || watching) return;
      watching = true;
      const ok = await showRewarded('heart');
      watching = false;
      if (!ok) { toast('지금은 광고를 볼 수 없어요. 잠시 후 다시 해 주세요'); return; }
      lives.add(1);
      toast('하트 +1');
    }, 'ic-ad.webp');
    const pack = button('코인 1개로 가득 채우기', 'secondary', async () => {
      if (await this.buyHeartPack() === 'insufficient') this.openShop();
    }, 'st-coin-star.webp');
    const btns = el('div', 'popBtns col');
    btns.append(watch, pack);
    this.modal.open('hearts', '하트 충전', [card, btns], []);
    this.heartsLive = { n, line };
    this.render();
  }

  /** 1 coin -> full hearts (하트 팩). */
  async buyHeartPack(): Promise<'ok' | 'full' | 'insufficient' | 'error'> {
    if (lives.get().hearts >= HEART_MAX) { toast('하트가 이미 가득해요'); return 'full'; }
    const r = await wallet.apply(uuid(), -1, 'buy:hearts');
    if (r === 'insufficient') { toast('코인이 부족해요'); return 'insufficient'; }
    if (r === 'error') { toast('지금은 구매할 수 없어요. 잠시 후 다시 해 주세요'); return 'error'; }
    lives.add(HEART_MAX);
    toast('하트 가득!');
    return 'ok';
  }

  /** 상점 (Figma P08): the coin balance, then 하트 팩 and the coin products. */
  openShop(): void {
    const balance = el('b', '', wallet.coins().toLocaleString('ko-KR'));
    const pill = el('div', 'shopPill');
    pill.setAttribute('aria-label', '보유 코인');
    pill.append(icon('st-coin-star.webp'), balance);
    const list = el('div', 'shop');
    const item = (art: string, title: string, desc: string, price: Node, onBuy: () => void, badge?: string, main = false): HTMLElement => {
      const card = el('div', 'shopItem tpCard');
      const top = el('div', 'shopTop');
      const info = el('div', 'shopInfo');
      info.append(el('b', '', title));
      if (desc) info.append(el('span', '', desc));
      const pr = el('div', 'shopPrice');
      if (badge) pr.append(el('span', 'shopBadge', badge));
      pr.append(price);
      top.append(icon(art, 'shopIcon'), info, pr);
      const buy = el('button', `gb gb-m gb-${main ? 'primary' : 'secondary'} shopBuy`, '구매');
      buy.setAttribute('aria-label', `${title} 사기`);
      buy.onclick = onBuy;
      card.append(top, buy);
      return card;
    };
    const coinPrice = (n: number): HTMLElement => { const s = el('span', 'shopCoin'); s.append(icon('st-coin-star.webp'), el('span', '', String(n))); return s; };
    list.append(item('st-heart.webp', '하트 팩', '하트 가득 충전', coinPrice(1), () => { void this.buyHeartPack(); }));
    // item packs: 3 for 1 coin (사천팝 힌트·섞기 3개), with the count owned under the line
    this.owned.clear();
    for (const [k, name, desc, art] of [['hint', '힌트', '나갈 수 있는 친구를 알려 줘요', 'ic-hint.webp'], ['undo', '되돌리기', '마지막 밀기를 무를 수 있어요', 'ic-undo.webp']] as const) {
      const card = item(art, `${name} 3개`, desc, coinPrice(1), () => void this.buyItemPack(k));
      const own = el('small', 'shopOwn', `보유 ${items.known(k) ?? '…'}개`);
      card.querySelector('.shopInfo')!.append(own);
      this.owned.set(k, own);
      list.append(card);
    }
    const art = (p: (typeof CATALOG)[number]): string => p.once ? 'st-backpack.webp'
      : p.coins <= 10 ? 'st-coin-star.webp' : p.coins <= 55 ? 'st-coins-small.webp' : p.coins <= 120 ? 'st-coins-stack.webp' : p.coins <= 280 ? 'st-coins-tall.webp' : 'st-chest-coins.webp';
    const adFree = (d: number): string => `전면 광고 제거 ${d === 1 ? '24시간' : `${d}일`}`;
    // coin products from the platform shop (web: CATALOG, no payments — the button says why; Toss: Apps in Toss IAP
    // with the console prices, bought through the SDK when the server wallet and the console products are ready)
    const shop = platform.shop;
    const addProducts = (products: ShopProduct[]): void => {
      const ready = shop.ready();
      for (const p of products) {
        const desc = [`코인 ${p.coins}개`, p.adFreeDays ? adFree(p.adFreeDays) : ''].filter(Boolean).join(' + ');
        let buying = false;
        const card = item(art(p), p.title, desc, el('b', 'shopWon', p.price), async () => {
          if (!ready) { toast(shop.notReadyReason()); return; }
          if (buying) return;
          buying = true;
          const ok = await shop.buy(p.sku).catch(() => false);
          buying = false;
          toast(ok ? '구매가 완료되었어요!' : '구매가 완료되지 않았어요');
        }, p.once ? '1회 한정' : undefined, !!p.once);
        if (p.once) list.insertBefore(card, list.firstChild); else list.append(card);
      }
    };
    void shop.products().then(addProducts, () => addProducts([]));
    this.modal.open('shop', '상점', [list], [], pill);
    this.shopBalance = balance;
  }

  /** 1 coin -> 3 of an item (상점 아이템 팩). */
  async buyItemPack(k: Item): Promise<void> {
    // one purchase = one id for both legs (사천팝): the coin, then the 3 items
    const id = uuid();
    const r = await wallet.apply(id, -1, `buy:${k}`);
    if (r === 'insufficient') { toast('코인이 부족해요'); return; }
    if (r === 'error') { toast('지금은 구매할 수 없어요. 잠시 후 다시 해 주세요'); return; }
    await items.grant(k, 3, 'shop', id, `buy:${k}`);
    toast(`${k === 'hint' ? '힌트' : '되돌리기'} +3`);
  }

  /** None of an item left: the box when it is ready, otherwise the shop. */
  outOf(k: Item): void {
    toast(`${k === 'hint' ? '힌트' : '되돌리기'}가 없어요`);
    if (chest.ready()) this.openChest(); else this.openShop();
  }

  /** 선물 상자 (Figma P12 보상 받기): the box and what is in it, opened with a rewarded ad. */
  openChest(): void {
    if (!chest.ready()) {
      const left = CHEST_SECONDS - chest.sec();
      toast(`${Math.floor(left / 60)}분 ${left % 60}초 더 플레이하면 열려요`);
      return;
    }
    if (items.known('hint') === null) { toast('서버에 연결하는 중이에요. 잠시 후 다시 눌러 주세요'); return; }
    const card = el('div', 'tpCard livesCard');
    const row = el('div', 'rewardRow');
    for (const [art, text] of [['ic-hint.webp', '힌트 ×1'], ['ic-undo.webp', '되돌리기 ×2']]) {
      const r = el('div', 'reward');
      r.append(icon(art, 'rewardIcon'), el('b', '', text));
      row.append(r);
    }
    card.append(icon('ic-gift-open.webp', 'livesHero'), row);
    let watching = false;
    const watch = button('광고 보고 받기', 'primary', async () => {
      if (watching) return;
      watching = true;
      this.modal.close();
      const ok = await showRewarded('chest');
      watching = false;
      if (!ok) { toast('지금은 광고를 볼 수 없어요. 상자는 그대로 남아 있어요'); return; }
      // one watch = one id, a leg per item (사천팝); a failed grant keeps the box
      const id = uuid();
      const [a, b] = await Promise.all([items.grant('hint', 1, 'ad', id, 'rv:chest'), items.grant('undo', 2, 'ad', id, 'rv:chest')]);
      if (a !== 'ok' || b !== 'ok') { toast('지급에 실패했어요. 상자는 그대로 남아 있어요'); return; }
      chest.reset();
      toast('힌트 +1, 되돌리기 +2 획득!');
    }, 'ic-ad.webp');
    const btns = el('div', 'popBtns col');
    btns.append(watch);
    this.modal.open('chest', '선물 상자', [card, btns], []);
  }
}
