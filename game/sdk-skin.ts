/**
 * SDK 화면(랭킹 · 일일 미션 · 웰컴 기프트 · 첫 방문 온보딩 · 0.35+ 보상 창)을 공통 팝업 디자인(Figma Theme Dialog)으로 다시 짠다.
 * 탈출해 친구들: 사천팝 src/ui/sdk-skin.ts 를 옮긴 것(배치 그대로) — 색은 game/sdk-skin.css 가 크림 팔레트로.
 * 배치는 버스팝 appintoss/normal-skin/sdk-skin.js(UIUX 수정사항 2026-10-27)와 같다 — 모양은 src/ui/sdk-skin.css.
 * 싣는 SDK 는 0.37.1 — 미션·출석은 공통 보상 창(.gf-rx-*, reward.createView · uxVersion 2), 랭킹은 0.34+ 마크업(시상대 .gf-lb-podium).
 * 예전 마크업(0.30: 상위 3명이 목록 안 · 미션 한 목록 .gf-hub-card)도 그대로 알아본다.
 *
 * SDK(vendor/gf-sdk, 해시 고정)는 카드를 innerHTML 로 통째 다시 그린다. 그때마다 새 카드를 받아 배치만 바꾼다.
 * SDK 의 버튼은 지우지 않고 옮기기만 한다 — 클릭은 SDK 가 data-* 속성으로 위임 처리하므로(탭·닫기·초대·친구 삭제·
 * 닉네임 수정/저장/취소·다시 시도) 동작·서버 호출·토스트는 그대로 SDK 몫이다.
 */
import { sound } from './sound';

/** The SDK skin pictures (copied from 사천팝 public/assets/sk-*.webp — the same icon pack in every pop game). */
const asset = (name: string): string => `/assets/ui/sdk/${name}`;
/** A popup opening: 탈출해 친구들 has no popup sound, so the soft select tap. */
const play = (_name: 'popup'): void => { sound.play('select'); };

const SKIN = 'data-skin';
/** 랭킹 산정 기준 — 판을 깰 때마다 깬 레벨 번호를 제출하고(game/platform/toss.ts roundEnd), 서버는 최고 기록 순으로 줄 세운다. */
const RANK_NOTE = '랭킹산정 기준: 클리어한 최고 레벨 순';

/** 글자 앞 아이콘 = Figma 아이콘팩 그림(public/assets/sk-ic-*.webp) — 형제 게임과 같은 그림(테마만 다르고 아이콘은 통일). */
type IcKind = 'point' | 'coin' | 'heart' | 'booster' | 'repeat' | 'remaining' | 'completed' | 'gift' | 'mission' | 'trophy';
const icSrc = (kind: IcKind) => asset(kind === 'gift' ? 'sk-gift.webp' : `sk-ic-${kind}.webp`);
function icon(kind: IcKind, cls = 'sk-ic'): HTMLImageElement {
  const img = document.createElement('img');
  img.className = cls;
  img.src = icSrc(kind);
  img.alt = '';
  return img;
}
// 0.35+ 보상 창(reward.createView)은 이 그림을 직접 쓴다
if (typeof window !== 'undefined') {
  const kinds: IcKind[] = ['point', 'coin', 'heart', 'booster', 'repeat', 'remaining', 'completed', 'gift', 'mission', 'trophy'];
  // bell = 알림 시트 종(회사 표준 그림, 버스팝 ic_bell 과 같은 그림)
  (window as any).__gfRewardIcons = Object.assign(Object.fromEntries(kinds.map(k => [k, icSrc(k)])), { hearts: icSrc('heart'), check: icSrc('completed'), bell: asset('sk-ic-bell.webp') });
}
/** SDK 인라인 SVG 아이콘(hubIcons)을 고유 색으로 알아보고 아이콘팩 그림으로 바꾼다 — 모르는 그림은 그대로 둔다. */
function kindOf(svg: Element): IcKind | null {
  const h = svg.outerHTML;
  // SDK 0.34 미션 칩(멀티 보상)은 색이 다른 새 아이콘을 쓴다 — 둘 다 알아본다
  if (h.includes('#3182f6') || h.includes('#69b5ff')) return 'point';
  if (h.includes('#f5b400') || h.includes('#ffd46b')) return 'coin';
  if (h.includes('#ff5a6e') || h.includes('#ff8daf')) return 'heart';
  if (h.includes('#3cc35a')) return 'completed';
  if (h.includes('#ff8a3d')) return 'gift';
  if (h.includes('width="18" height="12"')) return 'booster';
  return null;
}
function swapIcons(root: Element) {
  for (const svg of root.querySelectorAll('.gf-wel-ico svg, .gf-onb-ico svg, .gf-hub-chip svg')) {
    const k = kindOf(svg);
    if (k) svg.replaceWith(icon(k));
  }
}

/**
 * 게임 화면 상단 랭킹·미션 배지 = Figma "Theme Title Plank"(Normal, 37:20414) — 글자만("랭킹" · "미션"),
 * 미션 진행 수(n/m)는 오른쪽 위 빨간 작은 배지. 순서는 랭킹 → 미션: 랭킹 배지 폭을 --sk-lb-w 로 남기면 CSS 가 미션 배지를 그 오른쪽에 둔다.
 */
function skinPill(btn: HTMLElement, hub: boolean) {
  const rest = (btn.textContent || '').replace(/^\S+\s*/, '').trim();
  const label = document.createElement('span');
  label.className = 'sk-pill__t';
  const parts: HTMLElement[] = [label];
  if (!hub) label.textContent = '랭킹';
  else if (/^\d+\/\d+$/.test(rest)) {
    label.textContent = '미션';
    const n = document.createElement('span');
    n.className = 'sk-pill__n';
    n.textContent = rest;
    parts.push(n);
  } else label.textContent = rest || '미션';
  btn.replaceChildren(...parts);
  btn.classList.add('sk-pill');
  const portal = document.getElementById('__gf-portal');
  const badge = btn.closest<HTMLElement>(hub ? '.gf-hub-badge' : '.gf-lb-badge');
  if (!hub && portal && badge && badge.offsetWidth > 0) portal.style.setProperty('--sk-lb-w', `${Math.ceil(badge.offsetWidth)}px`);
}

/** 왕관(1·2·3위) — Figma 아이콘팩 그림(public/assets/sk-crown-1~3.webp). */
export function crown(rank: number, cls = 'sk-crown'): HTMLElement {
  const el = document.createElement('span');
  el.className = cls;
  el.setAttribute('aria-label', `${rank}위`);
  const img = document.createElement('img');
  img.src = asset(`sk-crown-${rank <= 3 ? rank : 3}.webp`);
  img.alt = '';
  el.append(img);
  return el;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, kids: (Node | string | null | undefined | false)[] = []) => {
  const e = document.createElement(tag);
  e.className = cls;
  for (const k of kids) if (k) e.append(k);
  return e;
};
const txt = (node: Element | null | undefined) => (node?.textContent ?? '').trim();
/** "12480스테이지" → "12,480" */
const num = (s: string) => { const m = s.replace(/,/g, '').match(/-?\d+/); return m ? Number(m[0]).toLocaleString('ko-KR') : s; };

/* ───────────────────────── 랭킹 ───────────────────────── */

function rankOf(row: Element, i: number): number {
  const r = Number(row.getAttribute('data-rank'));
  if (r) return r;
  const b = row.querySelector('.gf-lb-rank b');
  if (b) return Number(txt(b)) || i + 1;
  return /rank1/.test(row.className) ? 1 : /rank2/.test(row.className) ? 2 : /rank3/.test(row.className) ? 3 : i + 1;
}
/** 이름: 0.34 는 .gf-lb-name-text, 0.30 은 .gf-lb-name 의 첫 글자 마디(뒤에 "나" · 상승 표식) */
function nameOf(row: Element): string {
  const t = txt(row.querySelector('.gf-lb-name-text'));
  if (t) return t;
  const n = row.querySelector('.gf-lb-name');
  return (n?.firstChild?.textContent ?? txt(n)).trim();
}

/** 한 줄: [순위 동그라미] [이름(+나)] [점수] [친구 삭제] */
function skinRow(row: HTMLElement, rank: number) {
  const score = row.querySelector('.gf-lb-score');
  const remove = row.querySelector('.gf-lb-remove');
  row.querySelector('.gf-lb-rank')?.remove();
  row.querySelector('.gf-lb-avatar')?.remove();
  row.querySelector('.gf-lb-crown')?.remove();
  if (score) {
    const n = num(txt(score));
    score.textContent = n === '0' ? '기록 없음' : n;
    score.classList.toggle('sk-none', n === '0');
  }
  row.prepend(el('span', 'sk-rank', [String(rank)]));
  // 친구 삭제 = Figma Delete Friend 24(Normal)
  if (remove) { remove.classList.add('sk-del'); row.append(remove); }
}

/** 시상대 카드(2 · 1 · 3 순서): 왕관 · 얼굴(프로필 또는 첫 글자) · 이름 · 점수 알약 */
function podium(rows: HTMLElement[]): HTMLElement {
  const order = [2, 1, 3];
  const byRank = new Map(rows.map((r, i) => [rankOf(r, i), r]));
  const cards = order.filter(r => byRank.has(r)).map(r => {
    const row = byRank.get(r)!;
    const me = row.classList.contains('me');
    const avatar = row.querySelector('.gf-lb-avatar') ?? el('span', 'gf-lb-avatar', [el('i', '', ['?'])]);
    const name = el('span', 'sk-pod__name', [nameOf(row)]);
    const you = row.querySelector('.gf-lb-you');
    if (you) name.append(el('i', 'sk-pod__you', [txt(you)]));
    // 깃발 모양(채움 + 안쪽 테두리 + 그림자)은 따로 한 겹 — 그림자가 글자·아바타에 번지지 않게
    const shape = el('span', 'sk-pod__shape', [el('i', 'sk-pod__fill'), el('i', 'sk-pod__line')]);
    return el('div', `sk-pod sk-pod--${r}${me ? ' sk-pod--me' : ''}`, [
      shape,
      el('span', 'sk-pod__face', [avatar, crown(r, 'sk-crown sk-crown--pod')]),
      name,
      el('span', 'sk-pod__score', [num(txt(row.querySelector('.gf-lb-score')))]),
    ]);
  });
  return el('div', 'sk-podium', cards);
}

/** 맨 아래 "내 순위" 바: [순위] [내 순위 / 닉네임] [점수 알약] [닉네임 변경] */
function myBar(card: HTMLElement, meRow: HTMLElement | null): HTMLElement {
  const mine = txt(card.querySelector('.gf-lb-mine'));
  const nickRank = txt(card.querySelector('.gf-lb-nickrank'));
  const rank = (meRow ? Number(meRow.dataset.skRank) || rankOf(meRow, 0) : 0) || Number((nickRank || mine).match(/(\d+)\s*위/)?.[1]) || null;
  const scoreTxt = meRow ? txt(meRow.querySelector('.gf-lb-score')) : (mine.match(/·\s*([\d,]+)/)?.[1] ?? '');
  const nickEl = card.querySelector('.gf-lb-nickval');
  const nick = nickEl && !nickEl.classList.contains('unset') ? txt(nickEl) : meRow ? nameOf(meRow) : '';
  const pencil = el('button', 'sk-mine__edit sk-edit');
  pencil.setAttribute('data-nick-edit', '');
  pencil.setAttribute('aria-label', '닉네임 변경');
  card.querySelector('[data-nick-edit]')?.remove();
  return el('div', 'sk-mine', [
    el('b', 'sk-mine__rank', [rank ? String(rank) : '-']),
    el('span', 'sk-mine__who', [el('small', '', ['내 순위']), el('span', '', [nick || '미설정'])]),
    scoreTxt && /[1-9]/.test(scoreTxt) ? el('span', 'sk-mine__score', [num(scoreTxt)]) : null,
    pencil,
  ]);
}

/** 닉네임 변경(Figma P11): SDK 의 입력칸·저장·취소를 그대로 옮겨 카드 전체를 입력 화면으로 */
function skinNickEdit(card: HTMLElement, head: Element | null) {
  const input = card.querySelector<HTMLInputElement>('[data-nick-input]');
  const save = card.querySelector('[data-nick-save]');
  const cancel = card.querySelector('[data-nick-cancel]');
  const hint = txt(card.querySelector('.gf-lb-nickhint'));
  if (!input || !save || !cancel) return;
  head?.querySelector('.gf-lb-title')?.replaceChildren('닉네임 변경');
  input.maxLength = 12;
  if (input.value.length > 12) input.value = input.value.slice(0, 12);
  input.placeholder = '닉네임을 입력하세요';
  const count = el('span', 'sk-nick__count', [`${input.value.length}/12`]);
  input.addEventListener('input', () => { count.textContent = `${input.value.length}/12`; });
  save.textContent = '변경하기';
  cancel.textContent = '취소';
  const well = el('div', 'sk-well', [
    el('div', 'sk-nick', [el('label', 'sk-nick__box', [input, count]), el('p', 'sk-nick__hint', [hint || '최대 12자까지 쓸 수 있어요'])]),
    el('div', 'sk-two', [cancel, save]),
  ]);
  for (const c of [...card.children]) if (c !== head) c.remove();
  card.append(well);
  card.classList.add('sk-lb--nick');
  try { input.focus(); } catch { /* noop */ }
}

/**
 * Figma P10-1 · P10-2 · P10-3(Normal): 머리줄 · 탭 · (전체) 시상대는 고정, 목록 카드(친구 추가하기 + 목록 | 빈 안내)만 스크롤,
 * 아래 내 순위 + 랭킹산정 기준 고정. 창 높이는 탭과 무관하게 같다(CSS .sk-lb height).
 */
function skinLeaderboard(card: HTMLElement) {
  const head = card.querySelector('.gf-lb-head');
  const title = head?.querySelector('.gf-lb-title');
  if (title) title.textContent = '랭킹';
  if (card.querySelector('.gf-lb-nickbar.editing')) { skinNickEdit(card, head); return; }

  const tabs = card.querySelector('.gf-lb-tabs');
  const friends = !!card.querySelector('[data-tab="friends"].active');
  const banner = card.querySelector('.gf-lb-rankup');
  const pod = card.querySelector('.gf-lb-podium');
  const list = card.querySelector<HTMLElement>('.gf-lb-list');
  const empty = card.querySelector<HTMLElement>('.gf-lb-empty');
  const invite = card.querySelector('[data-invite]');
  const retry = card.querySelector('[data-retry]');
  const well = el('div', 'sk-well', [banner, tabs]);
  const scroll = el('div', 'sk-scroll');
  if (invite) {
    invite.className = 'sk-invite';
    invite.textContent = '+ 친구 추가하기'; // Figma: 아이콘 없이 글자만
  }
  const panel = el('div', 'sk-panel', [friends && invite ? el('div', 'sk-panel__add', [invite]) : null]);
  const note = () => el('p', 'sk-lb-note', [RANK_NOTE]);

  if (pod || list) {
    const rows = list ? [...list.querySelectorAll<HTMLElement>('.gf-lb-row')] : [];
    rows.forEach((r, i) => { r.dataset.skRank = String(rankOf(r, i)); });
    const meRow = (card.querySelector<HTMLElement>('.gf-lb-row.me'));
    // 0.34+: 시상대가 따로 온다 · 0.30: 전체 탭이면 목록 위 3명을 시상대로 올린다
    const top = pod ? [...pod.querySelectorAll<HTMLElement>('.gf-lb-row')] : !friends ? rows.slice(0, 3) : [];
    if (top.length) well.append(podium(top));
    const meData = meRow ? { rank: meRow.dataset.skRank, score: txt(meRow.querySelector('.gf-lb-score')), name: nameOf(meRow) } : null;
    if (!pod) top.forEach(r => r.remove());
    for (const r of list ? [...list.querySelectorAll<HTMLElement>('.gf-lb-row')] : []) skinRow(r, Number(r.dataset.skRank) || 0);
    if (list) panel.append(list);
    scroll.append(panel);
    // 내 행이 시상대로 올라가 목록에서 빠져도 내 순위 바는 그 값으로
    let me = meRow;
    if (meRow && !meRow.isConnected && meData) {
      me = el('li', 'gf-lb-row me', [el('span', 'gf-lb-name', [meData.name]), el('span', 'gf-lb-score', [meData.score])]);
      me.dataset.skRank = meData.rank;
    }
    well.append(scroll, myBar(card, me), note());
  } else if (empty) {
    const msg = retry ? [...empty.querySelectorAll('p')].map(p => p.cloneNode(true)) : [el('p', '', ['친구를 초대하면', el('br', ''), '여기서 함께 순위를 볼 수 있어요'])];
    if (retry) retry.className = 'sk-invite';
    panel.append(el('div', 'sk-empty', [...msg, retry]));
    scroll.append(panel);
    well.append(scroll);
    if (!retry) well.append(myBar(card, null), note());
  }

  for (const c of [...card.children]) if (c !== head) c.remove();
  card.append(well);
  card.classList.add('sk-lb');
}

/* ───────────────────────── 일일 미션 ───────────────────────── */

const STATUS: [string, string, string][] = [
  ['done', '완료', 'sk-st--done'],
  ['checking', '확인 중', 'sk-st--wait'],
  ['failed', '확인 중', 'sk-st--wait'],
  ['auto', '자동 지급', 'sk-st--wait'],
  ['progress', '진행 중', 'sk-st--go'],
];

function skinMissionRow(row: HTMLElement) {
  const name = row.querySelector<HTMLElement>('.gf-hub-name');
  const bar = row.querySelector<HTMLElement>('.gf-hub-bar');
  const count = row.querySelector('.gf-hub-count');
  const note = row.querySelector('.gf-hub-note');
  const chip = row.querySelector<HTMLElement>('.gf-hub-chip');
  row.querySelector('.gf-hub-ico')?.remove();
  row.querySelector('.gf-hub-ribbon')?.remove();
  const st = STATUS.find(([k]) => row.classList.contains(k)) ?? STATUS[STATUS.length - 1];
  if (chip) { const b = chip.querySelector('b'); if (b) b.textContent = txt(b).replace(/받음\s*✓?/, '받음'); }
  const sub = el('div', 'sk-ms__sub', [[txt(count), txt(note)].filter(Boolean).join(' · ')]);
  count?.remove(); note?.remove();
  // 줄 안의 SDK 버튼(예: 알림 받기 동의)은 지우지 않고 상태 자리에 둔다 — 클릭은 SDK 가 처리
  const actions = [...row.querySelectorAll('button')];
  actions.forEach(b => b.classList.add('sk-st', 'sk-st--act'));
  const body = el('div', 'sk-ms__body', [el('div', 'sk-ms__title', [name, chip]), bar, sub]);
  row.replaceChildren(body, ...(actions.length ? actions : [el('span', `sk-st ${st[2]}`, [st[1]])]));
}

/** 맨 위 달성 요약 카드 */
function skinSummary(summary: Element): HTMLElement {
  summary.querySelector('.gf-hub-gift')?.remove();
  const t = summary.querySelector('.gf-hub-summary-t');
  const bar = summary.querySelector('.gf-hub-bar');
  const total = summary.querySelector('.gf-hub-total');
  const prize = summary.querySelector('.gf-hub-bonus-prize');
  const chip = prize?.querySelector('.gf-hub-chip');
  const label = prize?.querySelector(':scope > span:not(.gf-hub-chip)');
  const reward = chip ? el('span', 'sk-sum__prize', [txt(label), chip]) : null;
  return el('div', 'sk-sum', [t, bar, total || reward ? el('div', 'sk-sum__row', [total, reward]) : null]);
}

/** Figma P07-1(Normal): 머리줄 · 아래(안내 · 그만보기 · 확인) 고정, 가운데(요약 + 미션 목록)만 스크롤 */
function skinHub(card: HTMLElement) {
  const head = card.querySelector('.gf-hub-head');
  // 게스트 카드(온보딩)는 머리줄이 .gf-title + .gf-close-x 다
  const title = head?.querySelector('.gf-hub-title, .gf-title');
  if (title) { title.textContent = '오늘의 미션'; title.classList.add('gf-hub-title'); }
  head?.querySelector('.gf-close-x')?.classList.add('gf-hub-x');
  card.querySelector('.gf-hub-banner')?.remove();
  const summary = card.querySelector('.gf-hub-summary');
  const sections = [...card.querySelectorAll('.gf-hub-section')];
  const foots = [...card.querySelectorAll('.gf-hub-foot')];
  const scroll = el('div', 'sk-scroll', [summary ? skinSummary(summary) : null]);
  if (sections.length) {
    // 0.34+: 묶음별(무한 반복 / 남은 미션 / 오늘 완료 / 웰컴)
    for (const sec of sections) {
      const list = sec.querySelector('.gf-hub-list');
      const label = sec.querySelector('.gf-hub-section-label');
      const h = sec.querySelector('h3');
      const countEl = h ? [...h.children].find(c => c !== label) : null;
      const cls = ['repeat', 'remaining', 'completed', 'welcome'].find(k => sec.classList.contains(k)) || '';
      const secIc = ({ repeat: 'repeat', remaining: 'remaining', completed: 'completed', welcome: 'gift' } as Record<string, IcKind>)[cls];
      scroll.append(el('div', `sk-sec sk-sec--${cls}`, [el('b', '', [secIc ? icon(secIc, 'sk-ic sk-ic--sec') : null, txt(label) || txt(h)]), countEl ? el('span', '', [txt(countEl)]) : null]));
      if (list) { list.querySelectorAll<HTMLElement>('.gf-hub-row').forEach(skinMissionRow); scroll.append(list); continue; }
      for (const art of sec.querySelectorAll<HTMLImageElement>('.gf-onb-hubart')) art.src = icSrc('gift');
      for (const c of [...sec.children]) if (c !== h) scroll.append(c);
    }
  } else {
    // 0.30: 한 목록
    const list = card.querySelector<HTMLElement>('.gf-hub-list');
    if (list) {
      const rows = [...list.querySelectorAll<HTMLElement>('.gf-hub-row')];
      const left = rows.filter(r => !r.classList.contains('done')).length;
      rows.forEach(skinMissionRow);
      scroll.append(el('div', 'sk-sec', [el('b', '', [icon('remaining', 'sk-ic sk-ic--sec'), '일일 미션']), el('span', '', [left ? `남은 ${left}개` : '모두 완료'])]), list);
    }
  }
  const well = el('div', 'sk-well', [scroll]);
  if (foots.length) well.append(el('div', 'sk-foot', foots));
  for (const c of [...card.children]) if (c !== head) c.remove();
  card.append(well);
  card.classList.add('sk-hub');
}

/* ───────────────────────── 웰컴 기프트 · 온보딩 → 보상 받기(Figma P12) ───────────────────────── */

/** 머리줄(제목 · 빨간 X) + 안내 카드(선물 · 환영 문구 · 받은 것) + 아래 확인 버튼. 지급은 SDK 가 카드 전에 끝낸다. */
function skinWelcome(card: HTMLElement) {
  const x = card.querySelector('.gf-wel-x');
  const gift = card.querySelector('.gf-wel-gift');
  const title = card.querySelector('.gf-wel-title');
  const sub = card.querySelector('.gf-wel-sub');
  const chips = card.querySelector('.gf-wel-chips');
  const cta = card.querySelector('.gf-wel-cta');
  if (gift) {
    const img = document.createElement('img');
    img.src = icSrc('gift');
    img.alt = '';
    gift.replaceChildren(img);
  }
  const head = el('div', 'sk-wel-head', [el('h2', 'sk-wel-title', ['보상 받기']), x]);
  const info = el('div', 'info-card sk-wel-info', [gift, title, sub, chips]);
  card.replaceChildren(head, el('div', 'sk-well', [info, cta]));
  card.classList.add('sk-wel');
}

function skinOnboarding(card: HTMLElement) {
  const label = card.getAttribute('aria-label') || '';
  const x = card.querySelector('.gf-onb-x');
  const art = card.querySelector<HTMLImageElement>('.gf-onb-mascot');
  const title = card.querySelector('.gf-onb-title');
  const chips = card.querySelector('.gf-onb-chips');
  const sub = card.querySelector('.gf-onb-sub');
  const spin = card.querySelector('.gf-onb-spin');
  const cta = card.querySelector('.gf-onb-cta');
  if (art) { art.src = icSrc('gift'); art.className = 'sk-onb-art'; }
  const head = el('div', 'sk-wel-head', [el('h2', 'sk-wel-title', [/로그인/.test(label) ? '토스 로그인' : '웰컴 기프트']), x]);
  const info = el('div', 'info-card sk-onb-info', [art, title, chips, sub, spin]);
  card.replaceChildren(head, el('div', 'sk-well', [info, cta]));
  card.classList.add('sk-wel', 'sk-onb');
}

/*
 * SDK 0.35+ 공통 보상 창(.gf-rx-*, reward.createView) — UI/UX 수정안(2026-10-27) Normal 배치(버스팝 normal-skin 과 같음).
 * SDK 는 창을 열 때·갱신할 때마다 .gf-rx-back 안을 innerHTML 로 통째 다시 그린다 → 새 .gf-rx-dialog 마다 한 번 손본다.
 * 버튼(data-rx)·줄(data-row)·순서는 그대로 두고 표시(문구 꼬리·묶음 제목·칩)만 더한다 — 클릭은 SDK 위임 처리.
 */
const RX_DAILY_SKIP = /^(all_clear|notify|notify_resume|welcome|attendance|makeup)/;
const rxSec = (title: string, meta?: string) => el('div', 'sk-rx-sec', [el('b', '', [title]), meta ? el('span', '', [meta]) : null]);
const rxChip = (text: string) => el('b', 'sk-rx-chip', [text.replace(/^\+\s*/, '')]);

function skinRewardMissions(dialog: HTMLElement) {
  dialog.classList.add('sk-rx--missions');
  const body = dialog.querySelector('.gf-rx-body');
  if (!body) return;
  let repeatAt: Element | null = null, dailyAt: Element | null = null, dailyLeft = 0;
  let dailyOpen: Element | null = null;
  const doneRows: Element[] = [];
  for (const row of body.querySelectorAll('.gf-rx-row')) {
    const key = row.getAttribute('data-row') || (row.classList.contains('attendance') ? 'attendance' : '');
    const copy = row.querySelector('.gf-rx-copy');
    const small = copy?.querySelector('small');
    const reward = copy?.querySelector(':scope > b');
    if (reward) { reward.textContent = txt(reward).replace(/^\+\s*/, ''); reward.classList.add('sk-rx-chip'); }
    const strong = copy?.querySelector('strong');
    if (key === 'attendance') {
      // 출석 선물 = 노란 테두리 카드 + 아래 전체 폭 버튼. "오늘 받을 선물 · 5P" 의 보상은 제목 옆 칩으로
      row.classList.add('sk-rx-card', 'sk-rx-card--gift');
      const m = small && txt(small).match(/^(.*?)\s*·\s*(.+)$/);
      if (m && small && strong) { small.textContent = m[1]; strong.after(rxChip(m[2])); }
      const btn = row.querySelector('.gf-rx-btn.login');
      if (btn && txt(btn) === '로그인') btn.textContent = '로그인하고 받기';
    } else if (key === 'all_clear') {
      row.classList.add('sk-rx-card');
      if (strong && txt(strong) === '오늘의 미션 보너스') strong.textContent = '오늘 달성 보너스'; // Figma P07-1 문구
      const total = small && txt(small).match(/\/(\d+)/);
      if (small && total && reward) small.textContent = `${txt(small)} · ${total[1]}개 모두 달성 시 ${txt(reward)} 지급!`;
    } else if (key.startsWith('play_every')) {
      if (row.classList.contains('done')) {
        // 하루 받을 수를 다 채운 반복 미션(SDK 0.36.5+ "오늘 N번 다 받았어요")도 완료 디자인으로 맨 아래 — SDK 문구는 그대로
        if (strong) strong.textContent = `${txt(strong)} 미션완료!`;
        reward?.remove();
        doneRows.push(row);
      } else {
        repeatAt ??= row;
        if (small) small.textContent = `${txt(small)} · 계속 반복`;
      }
    } else if (key && !RX_DAILY_SKIP.test(key)) {
      if (!dailyAt) dailyAt = row;
      if (!row.classList.contains('done')) dailyLeft++;
      // 20판은 제목 꼬리 "(14시 초기화)" 를 진행 문구로 옮긴다(Figma: "20판 플레이" · "8/20 · 14시 초기화")
      const reset = strong && txt(strong).match(/^(.*?)\s*\((\d+시) 초기화\)$/);
      if (reset && strong) strong.textContent = reset[1];
      const at = reset ? reset[2] : '0시';
      if (row.classList.contains('done')) {
        // 완료 미션(Figma "완료 미션 상태"): "제목 미션완료!" · 보상 칩 대신 초기화 안내, 목록 맨 아래로 내린다
        if (strong) strong.textContent = `${txt(strong)} 미션완료!`;
        reward?.remove();
        if (small) small.textContent = `미션은 ${at} 초기화돼요`;
        else copy?.append(el('small', '', [`미션은 ${at} 초기화돼요`]));
        doneRows.push(row);
      } else {
        dailyOpen ??= row;
        if (small) small.textContent = `${txt(small)} · ${at} 초기화`;
      }
    }
  }
  const rows = body.querySelectorAll('.gf-rx-row');
  if (doneRows.length) rows[rows.length - 1].after(...doneRows);
  repeatAt?.before(rxSec('반복 미션', '하루 동안 계속'));
  (dailyOpen ?? dailyAt)?.before(rxSec('일일 미션', dailyLeft ? `남은 ${dailyLeft}개` : '모두 완료'));
}

function skinRewardDays(dialog: HTMLElement) {
  for (const d of dialog.querySelectorAll('.gf-rx-day')) {
    const b = d.querySelector(':scope > b');
    if (b && /^\d/.test(txt(b))) b.textContent = `+${txt(b)}`;
    // Figma P12 날짜 칸: 받은 날 = System/check, 기간 만료 = System/warning
    const img = d.querySelector<HTMLImageElement>('.gf-rx-icon img');
    if (img && d.classList.contains('claimed')) img.src = icSrc('completed');
    else if (img && d.classList.contains('expired')) img.src = asset('sk-ic-warning.webp');
  }
}

function skinReward(dialog: HTMLElement) {
  // 큰 토스포인트(80px)는 고해상도 그림(Figma Game/coin_blue)으로
  for (const img of dialog.querySelectorAll<HTMLImageElement>('.gf-rx-gift > .gf-rx-icon > img')) if (img.getAttribute('src') === icSrc('point')) img.src = asset('sk-ic-point-l.webp');
  const foot = dialog.querySelector('.gf-rx-foot');
  if (!foot || !foot.children.length) dialog.classList.add('sk-rx--nofoot');
  if (dialog.querySelector('.gf-rx-body.missions')) skinRewardMissions(dialog);
  if (dialog.querySelector('.gf-rx-calendar')) skinRewardDays(dialog);
}

/* ───────────────────────── 설치 ───────────────────────── */

function each(root: ParentNode, sel: string, name: string, fn: (c: HTMLElement) => void) {
  // 선택자마다 :not 을 붙인다(쉼표로 묶인 선택자 뒤에 한 번만 붙이면 앞쪽은 매번 다시 잡혀 끝없이 돈다)
  const q = sel.split(',').map(x => `${x.trim()}:not([${SKIN}])`).join(', ');
  for (const c of root.querySelectorAll<HTMLElement>(q)) {
    c.setAttribute(SKIN, '');
    try { fn(c); } catch (e) { console.warn('[sdk-skin]', name, e); }
  }
}
function sweep(root: ParentNode) {
  each(root, '.gf-onb-card', 'onboarding', c => { skinOnboarding(c); swapIcons(c); });
  each(root, '.gf-lb-card', 'lb', c => { skinLeaderboard(c); swapIcons(c); });
  each(root, '.gf-hub-card', 'hub', c => { skinHub(c); swapIcons(c); });
  each(root, '.gf-rx-dialog', 'reward', skinReward);
  each(root, '.gf-hub-pill, .gf-lb-pill', 'pill', b => skinPill(b, b.classList.contains('gf-hub-pill')));
  each(root, '.gf-wel-card', 'welcome', c => { skinWelcome(c); swapIcons(c); });
}

/**
 * SDK 카드가 그려질 때마다(innerHTML 교체 포함) 다시 짠다. 한 번만 설치.
 * 게임 화면 전체를 지켜보면 타일 연출마다 깨어나므로, body 직속 자식만 보다가 SDK 포털이 생기면 그 안만 본다.
 */
let installed = false;
export function installSdkSkin() {
  if (installed || typeof MutationObserver === 'undefined' || !document.body) return;
  installed = true;
  let portal: HTMLElement | null = null;
  let shownPopups = new Set<HTMLElement>();
  const refresh = () => {
    if (!portal) return;
    sweep(portal);
    // SDK cards are replaced when tabs/data refresh; their backdrop is stable.
    // Track visible backdrops so opening/reopening sounds once, redraws stay quiet.
    const shown = new Set([...portal.querySelectorAll<HTMLElement>('.gf-back, .gf-lb-back, .gf-hub-back, .gf-rx-back, .gf-onb-back, .gf-wel-back')]
      .filter(back => !back.hidden && back.getClientRects().length > 0 && getComputedStyle(back).visibility !== 'hidden'));
    if ([...shown].some(back => !shownPopups.has(back))) play('popup');
    shownPopups = shown;
  };
  const inner = new MutationObserver(refresh);
  const attach = () => {
    const p = document.getElementById('__gf-portal');
    if (!p || p === portal) return;
    inner.disconnect();
    portal = p;
    inner.observe(p, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    refresh();
  };
  new MutationObserver(attach).observe(document.body, { childList: true });
  attach();
}
