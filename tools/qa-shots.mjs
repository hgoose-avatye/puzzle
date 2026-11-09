// QA screenshots of every screen (title, play, popups, cards) at phone size, into one folder plus one contact sheet.
// Usage: npm run dev:game (port 5420) running, then `node tools/qa-shots.mjs <outDir>`.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] ?? 'qa-shots';
fs.mkdirSync(out, { recursive: true });
const base = 'http://localhost:5420/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const shots = [];

async function page(query = '', setup = null) {
  const p = await browser.newPage();
  await p.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument((s) => {
    if (sessionStorage.getItem('qa')) return;
    localStorage.clear();
    localStorage.setItem('animal-rescue-progress', '7');
    localStorage.setItem('animal-rescue-seen', JSON.stringify(['basic', 'blocked', 'arrow', 'bump', 'crate', 'bomb']));
    if (s) for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    sessionStorage.setItem('qa', '1');
  }, setup);
  await p.goto(base + query, { waitUntil: 'networkidle0' });
  await sleep(1500);
  return p;
}
async function shot(p, name, label) {
  const file = path.join(out, `${String(shots.length + 1).padStart(2, '0')}-${name}.png`);
  await p.screenshot({ path: file });
  shots.push({ file, label });
}
const js = (p, f, ...a) => p.evaluate(f, ...a);

// 1 title (skip the intro clip)
let p = await page();
await js(p, () => { const s = document.getElementById('tSkip'); if (s && !s.hidden) s.click(); });
await sleep(2500);
await shot(p, 'title', '타이틀');
await p.close();

// play, popups
p = await page('?level=5', { 'animal-rescue-lives': JSON.stringify({ hearts: 3, heartAt: Date.now() - 4 * 60000 }), 'animal-rescue-wallet': JSON.stringify({ coin: 40, seen: [] }) });
await sleep(2500);
await shot(p, 'play', '플레이');
const open = async (id, name, label) => { await js(p, (i) => document.getElementById(i).click(), id); await sleep(600); await shot(p, name, label); await js(p, () => { document.getElementById('modal').hidden = true; }); };
await open('settings', 'settings', '설정');
await js(p, () => document.getElementById('settings').click()); await sleep(400);
await js(p, () => document.querySelectorAll('.linkRow')[0].click()); await sleep(600);
await shot(p, 'terms', '이용약관');
await js(p, () => { document.getElementById('modal').hidden = true; });
await open('lives', 'hearts', '하트 충전');
await open('coins', 'shop', '상점');
await js(p, () => localStorage.setItem('animal-rescue-chest', '600')); await sleep(1200);
await open('gift', 'gift', '선물 상자');
await js(p, () => { const g = window.__game; g.tap(g.free()[0]); }); await sleep(1500);
await js(p, () => document.getElementById('retry').click()); await sleep(600);
await shot(p, 'retry', '다시 하기 확인');
await js(p, () => { document.getElementById('modal').hidden = true; });
await js(p, async () => { const g = window.__game; for (let i = 0; i < 60 && g.ids().length; i++) { const f = g.free(); if (f.length) g.tap(f[0]); await new Promise((r) => setTimeout(r, 450)); } });
await sleep(2800);
await shot(p, 'win', '구출 성공');
await p.close();

// a lost level (hearts out): tap blocked animals on a level with hearts
p = await page('?level=8');
await sleep(2000);
await js(p, async () => {
  const g = window.__game;
  for (let k = 0; k < 12 && document.getElementById('popup').hidden; k++) {
    const free = new Set(g.free()); const b = g.ids().filter((i) => !free.has(i));
    if (!b.length) break;
    g.tap(b[k % b.length]); await new Promise((r) => setTimeout(r, 700));
  }
});
await sleep(1800);
await shot(p, 'lost', '실패');
await p.close();

// stage banner + the four cards
p = await page('?level=11');
await sleep(500);
await shot(p, 'banner', '스테이지 시작');
const card = async (icon, kicker, title, sub, stat, btn, name, label) => {
  await js(p, (a) => {
    const $ = (id) => document.getElementById(id);
    const i = document.createElement('img'); i.src = '/assets/ui/theme/' + a.icon;
    $('ilIcon').replaceChildren(i); $('ilKicker').textContent = a.kicker; $('ilTitle').textContent = a.title; $('ilSub').textContent = a.sub; $('ilStat').textContent = a.stat; $('ilBtn').textContent = a.btn;
    $('interlude').style.background = 'linear-gradient(180deg,#bfe3f5,#9fd07a)'; $('interlude').hidden = false;
  }, { icon, kicker, title, sub, stat, btn });
  await sleep(700);
  await shot(p, name, label);
};
await card('ic-star.webp', '동물 마을', '농장 완료!', '다음은 마을 광장', '구한 친구 84마리', '다음 스테이지', 'stage-done', '스테이지 완료');
await card('ic-medal.webp', '여행 기록', '동물 마을\n여행 완료!', '이 지역 친구들을 모두 구했어요', '구한 친구 260마리', '계속', 'chapter-done', '챕터 완료');
await card('ic-map.webp', '챕터 2', '숲속에 도착!', '첫 장소는 캠핑장', '', '출발!', 'chapter-intro', '새 챕터');
await card('ic-trophy.webp', '세계 일주 완료', '모든 친구를\n구했어요!', '함께해 주셔서 고마워요', '구한 친구 1,620마리', '처음부터 다시', 'journey-done', '전체 완료');
await p.close();
await browser.close();
fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify(shots, null, 1));
console.log(shots.length, 'shots in', out);
