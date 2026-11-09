import type { ShopProduct } from './types';

/**
 * Coin products (provisional SKUs — not registered in the Apps in Toss console or the server catalog yet; the 사천팝
 * line-up, ~/sachunpop src/platform/catalog.ts). The prices are for the preview: the Toss build shows the
 * displayAmount from AppsInToss.IAP.getProductItemList.
 */
export const CATALOG: ShopProduct[] = [
  { sku: 'animalrescue_starter', title: '스타터 팩', coins: 25, adFreeDays: 1, price: '1,100원', once: true },
  { sku: 'animalrescue_coin_10', title: '코인 10', coins: 10, adFreeDays: 0, price: '1,100원' },
  { sku: 'animalrescue_coin_55', title: '코인 55', coins: 55, adFreeDays: 0, price: '5,500원' },
  { sku: 'animalrescue_coin_120', title: '코인 120', coins: 120, adFreeDays: 7, price: '11,000원' },
  { sku: 'animalrescue_coin_280', title: '코인 280', coins: 280, adFreeDays: 15, price: '22,000원' },
  { sku: 'animalrescue_coin_800', title: '코인 800', coins: 800, adFreeDays: 30, price: '55,000원' },
];
